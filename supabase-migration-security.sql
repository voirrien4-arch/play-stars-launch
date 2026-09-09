-- ============================================================
-- Migration sécurité — anti-multi-comptes / quarantaine
-- À exécuter dans le SQL Editor Supabase (une seule fois)
-- ============================================================

-- 1. Étendre les statuts de compte possibles
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'suspended', 'quarantined', 'banned'));

alter table public.profiles add column if not exists quarantine_reason text;
alter table public.profiles add column if not exists verification_requested boolean not null default false;
alter table public.profiles add column if not exists verification_note text;

-- 2. Empreintes appareil (une ligne par connexion/inscription)
create table if not exists public.device_fingerprints (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  fingerprint_hash text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_fingerprints_hash on public.device_fingerprints(fingerprint_hash);
create index if not exists idx_device_fingerprints_ip on public.device_fingerprints(ip_address);
create index if not exists idx_device_fingerprints_profile on public.device_fingerprints(profile_id);

alter table public.device_fingerprints enable row level security;

-- Seuls les admins peuvent lire (les écritures passent par l'Edge Function avec la clé service_role, qui ignore RLS)
drop policy if exists "device_fingerprints_admin_read" on public.device_fingerprints;
create policy "device_fingerprints_admin_read" on public.device_fingerprints
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 3. Alertes de sécurité (multi-comptes détectés, etc.)
create table if not exists public.security_alerts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null default 'multi_account',
  details jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists idx_security_alerts_status on public.security_alerts(status);

alter table public.security_alerts enable row level security;

drop policy if exists "security_alerts_admin_all" on public.security_alerts;
create policy "security_alerts_admin_all" on public.security_alerts
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 4. Permettre à l'utilisateur concerné de demander sa propre vérification
-- (la policy de mise à jour existante sur profiles doit déjà permettre à un utilisateur
--  de modifier sa propre ligne ; on ne touche pas aux policies profiles existantes ici)

-- ============================================================
-- 5. CORRECTIF CRITIQUE — verrouillage des colonnes sensibles
-- La policy "profiles_update_own" autorise un utilisateur à modifier
-- N'IMPORTE QUELLE colonne de sa propre ligne (RLS ne filtre pas par
-- colonne). Sans ce verrou, un utilisateur pourrait s'auto-promouvoir
-- admin, s'auto-attribuer des parrainages, ou sortir lui-même de
-- quarantaine via un simple appel API. Ce trigger force les colonnes
-- sensibles à rester inchangées, sauf pour les admins.
-- ============================================================
create or replace function public.protect_profile_privileged_fields()
returns trigger as $$
declare
  is_admin boolean;
  bypass boolean;
begin
  -- Les appels serveur (Edge Functions avec la clé service_role) sont déjà
  -- validés côté fonction avant d'atteindre la base : on les laisse passer.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Les fonctions RPC dédiées (confirm_referral, request_developer_badge)
  -- posent ce drapeau localement le temps de la transaction pour effectuer
  -- une action précise et contrôlée, sans ouvrir toutes les colonnes.
  bypass := coalesce(current_setting('playstars.bypass_protect', true), '') = 'on';
  if bypass then
    return new;
  end if;

  -- Un appel exécuté hors contexte utilisateur authentifié (ex: SQL Editor
  -- Supabase, requête lancée directement par le propriétaire du projet)
  -- n'a pas de auth.uid(). Cet accès est déjà de confiance (il faut les
  -- identifiants du projet Supabase pour l'obtenir) : on le laisse passer,
  -- sans quoi ce trigger annule silencieusement les corrections manuelles
  -- faites par le propriétaire lui-même (ex: promouvoir un premier admin).
  if auth.uid() is null then
    return new;
  end if;

  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then
    new.role := old.role;
    new.status := old.status;
    new.developer_status := old.developer_status;
    new.developer_note := old.developer_note;
    new.used_slots := old.used_slots;
    new.confirmed_referrals := old.confirmed_referrals;
    new.referred_by := old.referred_by;
    new.referral_confirmed := old.referral_confirmed;
    new.referral_code := old.referral_code;
    new.quarantine_reason := old.quarantine_reason;
    -- verification_requested / verification_note restent modifiables :
    -- un utilisateur en quarantaine doit pouvoir demander une vérification.
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_profile_privileged_fields on public.profiles;
create trigger trg_protect_profile_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- ============================================================
-- 6. RPC — confirmer un parrainage (remplace les deux updates
-- séparés côté client, qui échouaient silencieusement sous RLS
-- puisqu'un utilisateur normal ne peut pas modifier la ligne
-- d'un AUTRE utilisateur — même pour incrémenter ses parrainages).
-- ============================================================
create or replace function public.confirm_referral(target_user_id uuid, code text)
returns void as $$
declare
  normalized_code text := upper(trim(code));
  referrer_id uuid;
  referrer_status text;
  rows_updated int;
begin
  if auth.uid() is null or auth.uid() <> target_user_id then
    raise exception 'not_allowed';
  end if;

  select id, status into referrer_id, referrer_status
  from public.profiles where referral_code = normalized_code;

  if referrer_id is null or referrer_status <> 'active' or referrer_id = target_user_id then
    raise exception 'invalid_referral';
  end if;

  perform set_config('playstars.bypass_protect', 'on', true);

  update public.profiles
    set referred_by = referrer_id, referral_confirmed = true
    where id = target_user_id and referred_by is null;

  get diagnostics rows_updated = row_count;
  if rows_updated = 0 then
    raise exception 'referral_already_used';
  end if;

  update public.profiles
    set confirmed_referrals = confirmed_referrals + 1
    where id = referrer_id;
end;
$$ language plpgsql security definer;

grant execute on function public.confirm_referral(uuid, text) to authenticated;

-- ============================================================
-- 7. RPC — demander le badge développeur (transition contrôlée
-- vers 'pending' uniquement ; approbation/rejet restent admin-only
-- via la policy profiles_update_admin déjà en place).
-- ============================================================
create or replace function public.request_developer_badge(note text default '')
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'not_allowed';
  end if;

  perform set_config('playstars.bypass_protect', 'on', true);

  update public.profiles
    set developer_status = 'pending', developer_note = coalesce(trim(note), '')
    where id = auth.uid() and developer_status <> 'approved';
end;
$$ language plpgsql security definer;

grant execute on function public.request_developer_badge(text) to authenticated;
