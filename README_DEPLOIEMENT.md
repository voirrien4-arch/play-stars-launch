# Play Stars — déploiement

Frontend statique (HTML/CSS/JS, modules ES) connecté à Supabase (authentification, base de données, stockage de fichiers).

## Publier le frontend

1. Décompresse l'archive sans modifier les dossiers.
2. Héberge le contenu via un serveur HTTP servant `index.html` comme entrée (ex. `python -m http.server 8080`, Nginx, Netlify, Vercel...).
3. Conserve les dossiers `data`, `locales`, `services`, `state` et `ui`.
4. Dans `index.html`, renseigne tes clés Supabase :
   ```html
   window.PLAYSTARS_SUPABASE_URL = 'https://TON-PROJET.supabase.co';
   window.PLAYSTARS_SUPABASE_ANON_KEY = 'TA_CLE_ANON_PUBLIC';
   ```
5. Exécute `play-stars-supabase-schema.sql` dans le SQL Editor de ton projet Supabase (tables, RLS, triggers) et crée un bucket Storage public nommé `play-stars-files`.

## Assistant IA (Gemini)

La clé API Gemini ne doit JAMAIS apparaître dans ce frontend. Elle reste côté serveur, dans les secrets de l'Edge Function Supabase (dossier `supabase/functions/ai-assistant`) :
```
supabase functions deploy ai-assistant
supabase secrets set GEMINI_API_KEY=xxxxx
```

## Panel de modération

Le panel de modération est protégé par Row Level Security côté Supabase : seuls les comptes avec `role = 'admin'` dans la table `profiles` peuvent modérer les publications, valider les badges développeur et publier des mises à jour plateforme. Pour créer un premier admin :
```sql
update public.profiles set role = 'admin' where id = '<uuid-du-compte>';
```

## Important

Le navigateur reçoit les fichiers frontend pour afficher le site : ils ne peuvent donc pas être rendus secrets. Seule la clé publique "anon" de Supabase (protégée par RLS) doit apparaître dans ce frontend — ne place jamais de clé secrète (service role) côté client.
