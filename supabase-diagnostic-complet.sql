-- ============================================================
-- DIAGNOSTIC PLAY STARS — à relancer à tout moment, lecture seule
-- (aucune de ces requêtes ne modifie de données)
-- Exécute-les UNE PAR UNE pour voir chaque résultat séparément.
-- ============================================================

-- 1. Comptes ayant le badge développeur approuvé, et donc en théorie
--    le droit de publier (policy "publications_insert_own").
select id, username, developer_status, role, status, created_at
from public.profiles
where developer_status = 'approved'
order by created_at desc;

-- 2. Comptes avec un badge EN ATTENTE ou REJETÉ, pour comparaison
--    (utile si quelqu'un pense avoir le badge alors qu'il ne l'a pas).
select id, username, developer_status, developer_note, created_at
from public.profiles
where developer_status in ('pending', 'rejected')
order by created_at desc;

-- 3. Les 15 derniers fichiers réellement arrivés dans le storage,
--    tous dossiers confondus (apk/, images/, avatars/) — pour voir
--    si un envoi récent a bien abouti côté fichier, même si la
--    publication elle-même n'apparaît pas.
select name, bucket_id, metadata->>'mimetype' as mime_type,
       metadata->>'size' as size_bytes, created_at
from storage.objects
where bucket_id = 'play-stars-files'
order by created_at desc
limit 15;

-- 4. Les 15 dernières publications réellement enregistrées en base
--    (indépendamment de leur statut) — pour voir si un envoi récent
--    a abouti à une ligne, même en attente.
select id, app_name, package_name, owner_id, owner_name, status, created_at
from public.publications
order by created_at desc
limit 15;

-- 5. Incohérence à surveiller : un fichier récent dans storage/apk
--    SANS publication correspondante en base (créée dans la minute
--    qui suit) — signe que l'upload a réussi mais l'insert a échoué.
--    Ajuste l'intervalle si besoin.
select o.name, o.created_at as file_uploaded_at
from storage.objects o
where o.bucket_id = 'play-stars-files'
  and o.name like 'apk/%'
  and o.created_at > now() - interval '2 days'
  and not exists (
    select 1 from public.publications p
    where p.created_at between o.created_at - interval '5 minutes' and o.created_at + interval '5 minutes'
  )
order by o.created_at desc;
