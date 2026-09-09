-- Aucune policy "delete" n'existait sur publications, ni pour le
-- propriétaire ni pour un admin — un DELETE échouait silencieusement
-- (RLS bloque par défaut tout ce qui n'a pas de policy explicite).
-- Nécessaire pour que le panel admin puisse retirer une app du catalogue.

drop policy if exists "publications_delete_admin" on public.publications;
create policy "publications_delete_admin" on public.publications
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Un développeur peut aussi supprimer sa propre publication s'il le
-- souhaite (utile si tu ajoutes ce bouton côté espace développeur plus
-- tard) :
drop policy if exists "publications_delete_own" on public.publications;
create policy "publications_delete_own" on public.publications
  for delete using (auth.uid() = owner_id);
