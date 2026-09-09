create or replace function public.protect_publication_privileged_fields()
returns trigger as $$
declare
  is_admin boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then
    if new.status is distinct from old.status and new.status <> 'pending' then
      new.status := old.status;
    end if;
    new.moderation_reason := old.moderation_reason;
    new.moderated_at := old.moderated_at;
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_publication_privileged_fields on public.publications;
create trigger trg_protect_publication_privileged_fields
  before update on public.publications
  for each row execute function public.protect_publication_privileged_fields();

create or replace function public.protect_review_privileged_fields()
returns trigger as $$
declare
  bypass boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  bypass := coalesce(current_setting('playstars.bypass_protect', true), '') = 'on';
  if bypass then
    return new;
  end if;
  new.developer_reply := old.developer_reply;
  new.developer_reply_at := old.developer_reply_at;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_review_privileged_fields on public.reviews;
create trigger trg_protect_review_privileged_fields
  before update on public.reviews
  for each row execute function public.protect_review_privileged_fields();

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

  perform set_config('playstars.bypass_protect', 'on', true);
  update public.reviews set developer_reply = clean_reply, developer_reply_at = now() where id = target_review_id;
end;
$$ language plpgsql security definer;

grant execute on function public.reply_to_review(uuid, text) to authenticated;

drop policy if exists "app_reports_insert_authenticated" on public.app_reports;
create policy "app_reports_insert_authenticated" on public.app_reports
  for insert with check (auth.role() = 'authenticated' and (reporter_id = auth.uid() or reporter_id is null));

drop policy if exists "publication_downloads_insert_authenticated" on public.publication_downloads;
create policy "publication_downloads_insert_authenticated" on public.publication_downloads
  for insert with check (auth.role() = 'authenticated' and (user_id = auth.uid() or user_id is null));
