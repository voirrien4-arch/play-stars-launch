-- Reproduit exactement un insert "Xender" comme le ferait createPublication(),
-- pour voir l'erreur PostgreSQL brute (contrairement au JS qui l'avale).
-- Remplace l'UUID ci-dessous par le tien si besoin (celui utilisé partout
-- dans cette conversation : b880b85d-b4d3-4cf3-acde-70fc87150928).

insert into public.publications (
  owner_id, owner_name, app_name, package_name, version, category,
  official_url, release_notes, icon, screenshots, file, status
) values (
  'b880b85d-b4d3-4cf3-acde-70fc87150928',
  'Administrateur système',
  'xender',
  'com.xender.game',
  '1.1.1',
  'multimedia',
  'https://xender.com',
  'xender application cool',
  '{"fileId":"test","filePath":"images/test.jpg","publicUrl":"https://example.com/test.jpg","originalName":"1000134374.jpg","mimeType":"image/jpeg","sizeBytes":1500000}'::jsonb,
  '[]'::jsonb,
  '{"fileId":"test","filePath":"apk/test.apk","publicUrl":"https://example.com/test.apk","originalName":"Xender.apk","mimeType":"application/vnd.android.package-archive","sizeBytes":29337500}'::jsonb,
  'pending'
)
returning id, app_name, status, created_at;

-- Si cet insert réussit ici (en SQL direct, donc en tant que propriétaire
-- du projet, hors RLS), le problème vient bien de RLS côté application
-- (JS avec la clé anon). Si CET insert échoue aussi, l'erreur affichée
-- ci-dessous sera la vraie cause exacte (contrainte, type de colonne...).

-- Nettoyage : supprime la ligne de test qu'on vient de créer.
delete from public.publications where app_name = 'xender' and package_name = 'com.xender.game' and version = '1.1.1';
