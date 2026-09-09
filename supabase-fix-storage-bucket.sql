-- Correctif : l'upload de fichiers (APK, icônes, captures) échoue
-- silencieusement si le bucket "play-stars-files" et ses policies
-- storage n'ont jamais été créés — ces lignes étaient présentes en
-- commentaire dans supabase-schema.sql (bloc "à exécuter une fois"),
-- jamais appliquées automatiquement.
--
-- Sans risque de doublon : chaque étape vérifie si elle existe déjà.

-- 1. Créer le bucket public (si absent)
insert into storage.buckets (id, name, public)
values ('play-stars-files', 'play-stars-files', true)
on conflict (id) do nothing;

-- 2. Lecture publique des fichiers du bucket
drop policy if exists "storage_read_all" on storage.objects;
create policy "storage_read_all" on storage.objects
  for select using (bucket_id = 'play-stars-files');

-- 3. Écriture réservée aux utilisateurs connectés (upload APK, icônes...)
drop policy if exists "storage_insert_authenticated" on storage.objects;
create policy "storage_insert_authenticated" on storage.objects
  for insert with check (bucket_id = 'play-stars-files' and auth.role() = 'authenticated');

-- Vérification : le bucket doit apparaître ici
select id, name, public from storage.buckets where id = 'play-stars-files';
