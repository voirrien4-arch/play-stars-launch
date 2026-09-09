-- Supprime définitivement les lignes de test créées par le diagnostic
-- admin, qui ont été traitées par erreur comme de vraies publications
-- (l'une d'elles était même "approved", donc visible côté app publique).

delete from public.publications
where app_name = '__diagnostic_test__' or package_name = 'com.diagnostic.test';

-- Vérification : doit retourner 0 ligne.
select id, app_name, package_name, status
from public.publications
where app_name = '__diagnostic_test__' or package_name = 'com.diagnostic.test';
