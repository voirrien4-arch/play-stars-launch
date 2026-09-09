create table if not exists public.publication_downloads (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.publications(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_publication_downloads_publication on public.publication_downloads(publication_id);

alter table public.publication_downloads enable row level security;

drop policy if exists "publication_downloads_insert_authenticated" on public.publication_downloads;
create policy "publication_downloads_insert_authenticated" on public.publication_downloads
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "publication_downloads_owner_read" on public.publication_downloads;
create policy "publication_downloads_owner_read" on public.publication_downloads
  for select using (
    exists (select 1 from public.publications pub where pub.id = publication_id and pub.owner_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
