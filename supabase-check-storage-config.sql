-- Vérification en lecture seule de la configuration du bucket
-- "play-stars-files" — n'importe quel résultat ici n'affecte rien,
-- c'est un simple SELECT.

-- 1. Le bucket existe-t-il, et avec quelles limites globales ?
--    file_size_limit est en octets (NULL = pas de limite).
--    allowed_mime_types NULL = tous les types autorisés ;
--    un tableau (ex: {"application/vnd.android.package-archive"})
--    signifie que SEULS ces types sont acceptés — ce qui expliquerait
--    que les PNG/JPG soient rejetés alors que les APK passent.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
from storage.buckets
where id = 'play-stars-files';

-- 2. Les policies actives sur storage.objects pour ce bucket
--    (pour confirmer qu'il y a bien une policy d'insert, et voir
--    si elle contient une condition supplémentaire sur le chemin
--    ou le type de fichier).
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- 3. Les fichiers déjà présents dans le bucket, pour voir si des
--    images ont DÉJÀ réussi à s'uploader par le passé (utile pour
--    savoir si le blocage est récent ou permanent).
select
  name,
  bucket_id,
  metadata->>'mimetype' as mime_type,
  metadata->>'size' as size_bytes,
  created_at
from storage.objects
where bucket_id = 'play-stars-files'
order by created_at desc
limit 20;
