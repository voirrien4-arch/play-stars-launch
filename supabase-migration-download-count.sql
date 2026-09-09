-- Ajoute un compteur de téléchargements directement sur "publications",
-- lisible publiquement (comme le reste de la fiche d'une app), maintenu
-- automatiquement par trigger à chaque nouvelle ligne dans
-- publication_downloads. Sans ça, le classement "Les plus téléchargées"
-- affichait toujours 0 : la seule donnée réelle (table
-- publication_downloads) n'est lisible que par le propriétaire de l'app
-- ou un admin, pas par les visiteurs qui consultent le classement public.

alter table public.publications add column if not exists download_count integer not null default 0;

create or replace function public.increment_publication_download_count()
returns trigger as $$
begin
  update public.publications
  set download_count = download_count + 1
  where id = new.publication_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_increment_download_count on public.publication_downloads;
create trigger trg_increment_download_count
  after insert on public.publication_downloads
  for each row execute function public.increment_publication_download_count();

-- Rattrape les compteurs pour les téléchargements déjà enregistrés avant
-- l'ajout de cette colonne (sans ça, ils resteraient à 0 même si la
-- table publication_downloads contient déjà des lignes).
update public.publications p
set download_count = coalesce((
  select count(*) from public.publication_downloads d where d.publication_id = p.id
), 0);

-- Vérification :
select id, app_name, download_count from public.publications order by download_count desc limit 20;
