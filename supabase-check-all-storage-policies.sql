-- Liste TOUTES les policies sur storage.objects, avec leur définition
-- complète — pour repérer une policy plus restrictive que celle qu'on
-- avait vérifiée, qui pourrait cibler spécifiquement le dossier images/
-- (par exemple une condition sur le nom du fichier ou owner).
select
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
