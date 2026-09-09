-- Correctif : le code applicatif (services/publication-service.js) lit et
-- écrit une colonne "owner_name" sur la table "publications" qui n'a en
-- fait jamais été créée dans le schéma SQL — ni dans supabase-schema.sql,
-- ni dans aucune migration. Résultat : tout INSERT dans "publications"
-- échouait avec "Could not find the 'owner_name' column..." (les fichiers
-- s'uploadaient dans Storage, mais la ligne n'était jamais créée en base,
-- donc rien ne s'affichait ni côté app ni côté panel admin).
--
-- Sans risque : "if not exists" évite tout doublon si tu relances ce script.

alter table public.publications add column if not exists owner_name text default '';

-- Remplit rétroactivement owner_name pour d'éventuelles lignes déjà
-- présentes (créées avant ce correctif, sans cette colonne).
update public.publications p
set owner_name = pr.username
from public.profiles pr
where pr.id = p.owner_id and (p.owner_name is null or p.owner_name = '');

-- Vérification :
select id, app_name, owner_id, owner_name, status from public.publications order by created_at desc limit 20;
