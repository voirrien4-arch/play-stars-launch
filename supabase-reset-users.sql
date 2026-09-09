-- ============================================================
-- Réinitialisation complète des utilisateurs et de leur contenu
-- Conserve UNIQUEMENT les comptes ayant role = 'admin'.
-- Tout le reste est supprimé en cascade : profils, publications,
-- avis, signalements, téléchargements, feedback, notifications,
-- empreintes appareil, alertes sécurité.
--
-- ATTENTION : action irréversible. Vérifie d'abord que ton propre
-- compte a bien role = 'admin' dans la table profiles avant de
-- lancer ce script (sinon il sera supprimé aussi).
-- ============================================================

-- 1. Neutraliser les liens de parrainage entre comptes non-admin
-- (évite un blocage de contrainte si deux comptes supprimés se
-- sont parrainés mutuellement).
update public.profiles set referred_by = null where role <> 'admin';

-- 2. Supprimer tous les comptes non-admin (cascade automatique vers
-- profiles, publications, reviews, app_reports, publication_downloads,
-- device_fingerprints, security_alerts, notification_reads,
-- platform_update_downloads ; admin_feedback conserve ses lignes
-- avec user_id mis à NULL).
delete from auth.users
where id not in (select id from public.profiles where role = 'admin');

-- 3. Vérification : doit ne montrer que ton compte admin
select id, username, role, status from public.profiles;
