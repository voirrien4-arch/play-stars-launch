-- ============================================================
-- Signalement d'applications par les utilisateurs
-- ============================================================
create table if not exists public.app_reports (
  id bigint generated always as identity primary key,
  app_id text not null,
  publication_id uuid references public.publications(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_reports_status on public.app_reports(status);
create index if not exists idx_app_reports_publication on public.app_reports(publication_id);

alter table public.app_reports enable row level security;

drop policy if exists "app_reports_insert_authenticated" on public.app_reports;
create policy "app_reports_insert_authenticated" on public.app_reports
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "app_reports_admin_all" on public.app_reports;
create policy "app_reports_admin_all" on public.app_reports
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- Réponses du développeur aux avis sur ses applications
-- ============================================================
alter table public.reviews add column if not exists developer_reply text;
alter table public.reviews add column if not exists developer_reply_at timestamptz;

create or replace function public.reply_to_review(target_review_id uuid, reply text)
returns void as $$
declare
  matched boolean;
  clean_reply text := trim(reply);
begin
  if clean_reply = '' or char_length(clean_reply) > 1000 then
    raise exception 'invalid_reply';
  end if;

  select exists (
    select 1 from public.reviews r
    join public.publications pub on ('publication-' || pub.id::text) = r.app_id
    where r.id = target_review_id and pub.owner_id = auth.uid()
  ) into matched;

  if not matched then
    raise exception 'not_allowed';
  end if;

  update public.reviews set developer_reply = clean_reply, developer_reply_at = now() where id = target_review_id;
end;
$$ language plpgsql security definer;

grant execute on function public.reply_to_review(uuid, text) to authenticated;
