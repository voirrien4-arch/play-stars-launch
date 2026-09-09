-- Vérifie s'il reste des lignes de test issues du diagnostic admin
-- (elles devraient être supprimées automatiquement, mais un échec du
-- delete après un insert réussi pourrait en laisser).
select id, app_name, package_name, status, created_at
from public.publications
where app_name = '__diagnostic_test__' or package_name = 'com.diagnostic.test';

-- Si la requête ci-dessus retourne des lignes, supprime-les avec :
-- delete from public.publications where app_name = '__diagnostic_test__';
