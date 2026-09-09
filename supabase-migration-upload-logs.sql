-- Table de logs pour tracer précisément le parcours de chaque tentative
-- de publication (APK, icône, captures), consultable depuis le panel
-- admin — utile pour diagnostiquer un échec sans avoir besoin d'accès
-- à la console du téléphone de la personne qui publie.

create table if not exists public.upload_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  username text default '',
  session_id text not null,          -- regroupe toutes les étapes d'une même tentative
  step text not null,                -- ex: 'apk_start', 'apk_progress', 'apk_success', 'icon_start', ...
  detail text default '',
  progress_percent int,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_upload_logs_session on public.upload_logs(session_id);
create index if not exists idx_upload_logs_created on public.upload_logs(created_at desc);

alter table public.upload_logs enable row level security;

-- Un utilisateur peut écrire ses propres logs
drop policy if exists "upload_logs_insert_own" on public.upload_logs;
create policy "upload_logs_insert_own" on public.upload_logs
  for insert with check (auth.uid() = user_id);

-- Un utilisateur peut lire ses propres logs récents (pratique pour le
-- bouton de diagnostic lui-même)
drop policy if exists "upload_logs_select_own" on public.upload_logs;
create policy "upload_logs_select_own" on public.upload_logs
  for select using (auth.uid() = user_id);

-- Un admin peut tout lire
drop policy if exists "upload_logs_select_admin" on public.upload_logs;
create policy "upload_logs_select_admin" on public.upload_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Nettoyage automatique : garde seulement les 30 derniers jours pour ne
-- pas faire grossir la table indéfiniment (à exécuter manuellement ou
-- via une tâche planifiée Supabase si tu en configures une).
-- delete from public.upload_logs where created_at < now() - interval '30 days';
