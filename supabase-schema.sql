-- ============================================================
-- Play Stars — Schéma Supabase (PostgreSQL)
-- Basé sur les structures exactes utilisées par le frontend :
-- auth-service.js, publication-service.js, review-service.js,
-- admin-feedback-service.js, platform-update-service.js
-- ============================================================

-- Extension nécessaire pour crypto.randomUUID() côté SQL
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILS UTILISATEUR
-- Complète auth.users (Supabase Auth gère email/mot de passe).
-- Un trigger crée automatiquement la ligne profile à l'inscription.
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  country text not null default 'FR',
  avatar_initial text not null default 'P',
  avatar_url jsonb,                    -- { publicUrl, fileId, filePath, mimeType, originalName }
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  referral_code text unique not null,
  referred_by uuid references public.profiles(id),
  referral_confirmed boolean not null default false,
  confirmed_referrals integer not null default 0,
  developer_status text not null default 'none'
    check (developer_status in ('none', 'pending', 'approved', 'rejected', 'revoked')),
  developer_note text default '',
  used_slots integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Profil public associé à chaque compte auth.users, remplace ACCOUNTS_KEY.';

-- ------------------------------------------------------------
-- 2. PUBLICATIONS (applications soumises par les développeurs)
-- ------------------------------------------------------------
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_name text default '',          -- dénormalisé depuis profiles.username pour affichage rapide
  app_name text not null,
  package_name text not null,
  version text not null,
  category text not null default 'tools',
  official_url text not null,
  release_notes text default '',
  icon jsonb,                          -- { fileId, filePath, publicUrl, originalName, mimeType, sizeBytes }
  screenshots jsonb not null default '[]'::jsonb,  -- array de descripteurs image
  file jsonb not null,                 -- { fileId, filePath, publicUrl, originalName, mimeType, sizeBytes }
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderation_reason text default '',
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  versions jsonb not null default '[]'::jsonb  -- historique des versions (version, createdAt, releaseNotes, icon, screenshots, file)
);

create index idx_publications_owner on public.publications(owner_id);
create index idx_publications_status on public.publications(status);
create index idx_publications_category on public.publications(category);

comment on table public.publications is 'Remplace PUBLICATIONS_KEY (une app + son historique de versions).';

-- ------------------------------------------------------------
-- 3. AVIS / NOTES SUR LES APPLICATIONS
-- ------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,                -- id de l'app affichée (ex: "publication-<uuid>")
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '',
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, user_id)             -- un seul avis par utilisateur et par app
);

create index idx_reviews_app on public.reviews(app_id);

comment on table public.reviews is 'Remplace REVIEWS_KEY.';

-- ------------------------------------------------------------
-- 4. AVIS / SUGGESTIONS ENVOYÉS À L'ÉQUIPE (admin feedback)
-- ------------------------------------------------------------
create table public.admin_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  username text not null default 'Visiteur',
  account_email text default '',
  contact_email text default '',
  category text not null default 'other'
    check (category in ('suggestion', 'problem', 'catalog', 'developer', 'other')),
  rating integer check (rating between 1 and 5),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'read')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.admin_feedback is 'Remplace STORAGE_KEY (play-stars-phase5-admin-feedback).';

-- ------------------------------------------------------------
-- 5. NOTIFICATIONS LUES (par utilisateur)
-- Les notifications elles-mêmes sont générées dynamiquement côté
-- client (statut développeur) ; on ne stocke que les IDs lus.
-- ------------------------------------------------------------
create table public.notification_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

comment on table public.notification_reads is 'Remplace STORAGE_KEY (play-stars-phase5-notifications).';

-- ------------------------------------------------------------
-- 6. MISE À JOUR DE LA PLATEFORME (APK global publié par l'admin)
-- ------------------------------------------------------------
create table public.platform_updates (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  message text default '',
  file jsonb not null,                 -- { fileId, filePath, publicUrl, originalName, mimeType, sizeBytes }
  published_at timestamptz not null default now()
);

comment on table public.platform_updates is 'Remplace UPDATE_KEY. On garde un historique ; le frontend prend la plus récente.';

create table public.platform_update_downloads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  update_id uuid not null references public.platform_updates(id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

comment on table public.platform_update_downloads is 'Remplace DOWNLOADED_KEY.';

-- ============================================================
-- FONCTIONS UTILITAIRES
-- ============================================================

-- Génère un code de parrainage unique du type STARS-XXXXXXX
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := 'STARS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
    select exists(select 1 from public.profiles where referral_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

-- Crée automatiquement un profil à l'inscription (auth.users -> profiles)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_initial, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'username', new.email), 1)),
    public.generate_referral_code()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Maintient updated_at à jour sur les publications
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_publications_updated_at
  before update on public.publications
  for each row execute function public.set_updated_at();

create trigger trg_reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.publications enable row level security;
alter table public.reviews enable row level security;
alter table public.admin_feedback enable row level security;
alter table public.notification_reads enable row level security;
alter table public.platform_updates enable row level security;
alter table public.platform_update_downloads enable row level security;

-- --- profiles ---
-- Lecture publique (nécessaire pour afficher developer name, avatar, etc.)
create policy "profiles_select_all" on public.profiles
  for select using (true);

-- Un utilisateur ne modifie que son propre profil
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Un admin peut modifier n'importe quel profil (validation badge développeur)
create policy "profiles_update_admin" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- --- publications ---
-- Lecture publique des publications approuvées (catalogue)
create policy "publications_select_approved" on public.publications
  for select using (status = 'approved');

-- Le propriétaire voit toutes ses publications (y compris pending/rejected)
create policy "publications_select_own" on public.publications
  for select using (auth.uid() = owner_id);

-- Un admin voit tout (file d'attente de modération)
create policy "publications_select_admin" on public.publications
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Seul un développeur approuvé peut créer une publication en son nom
create policy "publications_insert_own" on public.publications
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.developer_status = 'approved'
    )
  );

-- Le propriétaire peut mettre à jour sa propre publication (nouvelle version)
create policy "publications_update_own" on public.publications
  for update using (auth.uid() = owner_id);

-- Un admin peut mettre à jour le statut de n'importe quelle publication (modération)
create policy "publications_update_admin" on public.publications
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- --- reviews ---
create policy "reviews_select_all" on public.reviews
  for select using (true);

create policy "reviews_insert_own" on public.reviews
  for insert with check (auth.uid() = user_id);

create policy "reviews_update_own" on public.reviews
  for update using (auth.uid() = user_id);

create policy "reviews_delete_own" on public.reviews
  for delete using (auth.uid() = user_id);

-- --- admin_feedback ---
-- N'importe qui connecté peut envoyer un avis
create policy "feedback_insert_any" on public.admin_feedback
  for insert with check (true);

-- Seul un admin peut lire / marquer comme lu
create policy "feedback_select_admin" on public.admin_feedback
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "feedback_update_admin" on public.admin_feedback
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- --- notification_reads ---
create policy "notif_reads_own" on public.notification_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- platform_updates ---
-- Lecture publique (tous les utilisateurs doivent voir la mise à jour obligatoire)
create policy "platform_updates_select_all" on public.platform_updates
  for select using (true);

-- Seul un admin peut publier une mise à jour plateforme
create policy "platform_updates_insert_admin" on public.platform_updates
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- --- platform_update_downloads ---
create policy "platform_downloads_own" on public.platform_update_downloads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- STORAGE (fichiers APK, icônes, captures d'écran, avatars)
-- ============================================================
-- À exécuter une fois (ou via l'interface Supabase Storage) :
--
-- insert into storage.buckets (id, name, public)
-- values ('play-stars-files', 'play-stars-files', true);
--
-- Politique : lecture publique, écriture réservée aux utilisateurs connectés
-- create policy "storage_read_all" on storage.objects
--   for select using (bucket_id = 'play-stars-files');
-- create policy "storage_insert_authenticated" on storage.objects
--   for insert with check (bucket_id = 'play-stars-files' and auth.role() = 'authenticated');
