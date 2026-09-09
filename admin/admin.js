import { loadAuth, signIn, signOut, getCurrentUser, listDeveloperRequests, reviewDeveloperBadge } from '../services/auth-service.js';
import { listModerationQueue, approvePublication, rejectPublication } from '../services/moderation-service.js';
import { listAllPublications, formatFileSize } from '../services/publication-service.js';
import {
  listQuarantinedAccounts, unlockAccount, banAccount, deleteAccount,
  listOpenSecurityAlerts, resolveSecurityAlert, listAllUsers, setUserRole
} from '../services/account-security-service.js';
import { listAppReports, resolveAppReport } from '../services/report-service.js';
import { listAdminFeedback, markAdminFeedbackRead } from '../services/admin-feedback-service.js';
import { loadPublishedPlatformUpdate, publishPlatformUpdate } from '../services/platform-update-service.js';
import { supabase } from '../services/supabase-client.js';
import { runStorageConnectivityDiagnostic } from '../services/connectivity-diagnostic.js';

const MAX_APK_SIZE_MB = 70;

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

const formatDate = (value) => (value ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—');

const TABS = ['dashboard', 'publications', 'developers', 'users', 'security', 'reports', 'feedback', 'platform', 'uploadlogs', 'diagnostic'];
const TAB_TITLES = {
  dashboard: 'Tableau de bord',
  publications: 'Publications',
  developers: 'Badges développeur',
  users: 'Utilisateurs',
  security: 'Sécurité',
  reports: 'Signalements',
  feedback: 'Feedback',
  platform: 'Mise à jour de l\'application',
  uploadlogs: 'Logs d\'upload',
  diagnostic: 'Diagnostic'
};

let activeTab = 'dashboard';

const loginScreen = document.getElementById('loginScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const adminApp = document.getElementById('adminApp');
const adminNav = document.getElementById('adminNav');
const tabTitle = document.getElementById('tabTitle');
const tabContent = document.getElementById('tabContent');
const adminUserBadge = document.getElementById('adminUserBadge');
const toast = document.getElementById('toast');
const logoutButton = document.getElementById('logoutButton');
const refreshButton = document.getElementById('refreshButton');

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.background = isError ? '#8f1d3a' : '#191233';
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 3200);
}

function setBusy(busy) {
  tabContent.setAttribute('aria-busy', String(busy));
}

async function boot() {
  const user = await loadAuth().catch(() => null);
  if (user && user.role === 'admin') {
    enterApp(user);
  } else {
    if (user) await signOut().catch(() => {});
    loginScreen.hidden = false;
    adminApp.hidden = true;
  }
}

function enterApp(user) {
  loginError.hidden = true;
  loginScreen.hidden = true;
  adminApp.hidden = false;
  adminUserBadge.innerHTML = `<strong>${escapeHtml(user.username)}</strong><span>${escapeHtml(user.email || '')}</span>`;
  renderNav();
  goToTab('dashboard');
}

function renderNav() {
  [...adminNav.children].forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === activeTab);
  });
}

async function goToTab(tab) {
  activeTab = tab;
  renderNav();
  tabTitle.textContent = TAB_TITLES[tab] || tab;
  setBusy(true);
  try {
    tabContent.innerHTML = await renderTab(tab);
    wireTabEvents(tab);
  } catch (error) {
    console.error(error);
    tabContent.innerHTML = `<p class="admin-error">Erreur de chargement : ${escapeHtml(error?.message || 'inconnue')}</p>`;
  } finally {
    setBusy(false);
  }
}

async function renderTab(tab) {
  if (tab === 'dashboard') return renderDashboard();
  if (tab === 'publications') return renderPublications();
  if (tab === 'developers') return renderDevelopers();
  if (tab === 'users') return renderUsers();
  if (tab === 'security') return renderSecurity();
  if (tab === 'reports') return renderReports();
  if (tab === 'feedback') return renderFeedback();
  if (tab === 'platform') return renderPlatform();
  if (tab === 'uploadlogs') return renderUploadLogs();
  if (tab === 'diagnostic') return renderDiagnostic();
  return '';
}

/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  const [queue, badgeQueue, quarantined, alerts, reports, feedback, approvedDevs] = await Promise.all([
    listModerationQueue(),
    listDeveloperRequests().catch(() => []),
    listQuarantinedAccounts().catch(() => []),
    listOpenSecurityAlerts().catch(() => []),
    listAppReports().catch(() => []),
    listAdminFeedback().catch(() => []),
    listAllUsers({ role: '' }).then((users) => users.filter((u) => u.developer_status === 'approved')).catch(() => [])
  ]);
  const pendingPublications = queue.filter((p) => p.status === 'pending').length;
  const unreadFeedback = feedback.filter((f) => f.status === 'new').length;
  const stats = [
    ['Publications en attente', pendingPublications],
    ['Badges développeur en attente', badgeQueue.length],
    ['Développeurs avec droit de publier', approvedDevs.length],
    ['Comptes en quarantaine', quarantined.length],
    ['Alertes sécurité ouvertes', alerts.length],
    ['Signalements ouverts', reports.length],
    ['Feedback non lu', unreadFeedback]
  ];
  return `<div class="admin-stat-grid">${stats.map(([label, value]) => `
    <div class="admin-stat-card"><span class="admin-stat-value">${value}</span><span class="admin-stat-label">${escapeHtml(label)}</span></div>
  `).join('')}</div>
  <p class="muted">Utilise le menu à gauche pour traiter chaque file d'attente.</p>`;
}

/* ---------------- Publications ---------------- */
async function renderPublications() {
  const all = await listAllPublications();
  const rows = all.map((p) => `
    <tr data-publication-id="${escapeHtml(p.id)}">
      <td><strong>${escapeHtml(p.appName)}</strong><br><span class="muted">${escapeHtml(p.packageName)}</span></td>
      <td>${escapeHtml(p.ownerName || p.ownerId)}</td>
      <td>v${escapeHtml(p.version)}</td>
      <td><span class="status-chip status-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
      <td>${formatFileSize(p.file?.sizeBytes)}</td>
      <td>${formatDate(p.updatedAt || p.createdAt)}</td>
      <td class="admin-row-actions">
        ${p.status === 'pending' ? `
          <button class="button button-small" type="button" data-action="approve-pub" data-id="${escapeHtml(p.id)}">Approuver</button>
          <button class="button button-ghost button-small" type="button" data-action="reject-pub" data-id="${escapeHtml(p.id)}">Rejeter</button>
        ` : ''}
        <button class="button button-ghost button-small" type="button" data-action="delete-pub" data-id="${escapeHtml(p.id)}">Supprimer</button>
      </td>
    </tr>`).join('');
  return `<div class="admin-toolbar">
      <input type="search" id="pubFilter" placeholder="Filtrer par nom d'appli…">
      <select id="pubStatusFilter">
        <option value="">Tous les statuts</option>
        <option value="pending">En attente</option>
        <option value="approved">Approuvées</option>
        <option value="rejected">Rejetées</option>
      </select>
    </div>
    <table class="admin-table" id="pubTable">
      <thead><tr><th>Application</th><th>Propriétaire</th><th>Version</th><th>Statut</th><th>Taille</th><th>Mise à jour</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">Aucune publication.</td></tr>'}</tbody>
    </table>`;
}

/* ---------------- Developer badges ---------------- */
async function renderDevelopers() {
  const requests = await listDeveloperRequests().catch(() => []);
  const rows = requests.map((u) => `
    <tr data-user-id="${escapeHtml(u.id)}">
      <td><strong>${escapeHtml(u.username)}</strong><br><span class="muted">${escapeHtml(u.email || '')}</span></td>
      <td>${escapeHtml(u.country || '')}</td>
      <td>${u.confirmedReferrals ?? 0}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td class="admin-row-actions">
        <button class="button button-small" type="button" data-action="approve-badge" data-id="${escapeHtml(u.id)}">Approuver</button>
        <button class="button button-ghost button-small" type="button" data-action="reject-badge" data-id="${escapeHtml(u.id)}">Rejeter</button>
      </td>
    </tr>`).join('');
  return `<table class="admin-table">
    <thead><tr><th>Compte</th><th>Pays</th><th>Parrainages confirmés</th><th>Demandé le</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">Aucune demande en attente.</td></tr>'}</tbody>
  </table>`;
}

/* ---------------- Users ---------------- */
async function renderUsers(filters = {}) {
  const users = await listAllUsers(filters).catch(() => []);
  const rows = users.map((u) => `
    <tr data-user-id="${escapeHtml(u.id)}">
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.status)}</td>
      <td>${escapeHtml(u.developer_status || 'none')}</td>
      <td>${formatDate(u.created_at)}</td>
      <td class="admin-row-actions">
        ${u.role === 'admin'
          ? `<button class="button button-ghost button-small" type="button" data-action="demote-user" data-id="${escapeHtml(u.id)}">Retirer admin</button>`
          : `<button class="button button-small" type="button" data-action="promote-user" data-id="${escapeHtml(u.id)}">Passer admin</button>`}
      </td>
    </tr>`).join('');
  return `<div class="admin-toolbar">
      <input type="search" id="userSearch" placeholder="Rechercher un pseudo…" value="${escapeHtml(filters.search || '')}">
      <select id="userRoleFilter">
        <option value="">Tous les rôles</option>
        <option value="admin" ${filters.role === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="user" ${filters.role === 'user' ? 'selected' : ''}>Utilisateur</option>
      </select>
      <button class="button button-small" type="button" id="userSearchButton">Rechercher</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Pseudo</th><th>Rôle</th><th>Statut</th><th>Dév.</th><th>Inscrit le</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">Aucun utilisateur trouvé.</td></tr>'}</tbody>
    </table>`;
}

/* ---------------- Security ---------------- */
async function renderSecurity() {
  const [quarantined, alerts] = await Promise.all([
    listQuarantinedAccounts().catch(() => []),
    listOpenSecurityAlerts().catch(() => [])
  ]);
  const quarantineRows = quarantined.map((a) => `
    <tr data-user-id="${escapeHtml(a.id)}">
      <td><strong>${escapeHtml(a.username)}</strong></td>
      <td>${escapeHtml(a.quarantineReason || '—')}</td>
      <td>${a.verificationRequested ? escapeHtml(a.verificationNote || 'Demandé') : 'Non demandé'}</td>
      <td>${formatDate(a.createdAt)}</td>
      <td class="admin-row-actions">
        <button class="button button-small" type="button" data-action="unlock-account" data-id="${escapeHtml(a.id)}">Débloquer</button>
        <button class="button button-ghost button-small" type="button" data-action="ban-account" data-id="${escapeHtml(a.id)}">Bannir</button>
        <button class="button button-ghost button-small" type="button" data-action="delete-account" data-id="${escapeHtml(a.id)}">Supprimer</button>
      </td>
    </tr>`).join('');
  const alertRows = alerts.map((al) => `
    <tr data-alert-id="${escapeHtml(String(al.id))}">
      <td>${escapeHtml(al.username || al.profileId)}</td>
      <td>${escapeHtml(JSON.stringify(al.details || {}))}</td>
      <td>${formatDate(al.createdAt)}</td>
      <td class="admin-row-actions"><button class="button button-small" type="button" data-action="resolve-alert" data-id="${escapeHtml(String(al.id))}">Résoudre</button></td>
    </tr>`).join('');
  return `<h2>Comptes en quarantaine</h2>
    <table class="admin-table">
      <thead><tr><th>Compte</th><th>Raison</th><th>Vérification</th><th>Depuis</th><th>Actions</th></tr></thead>
      <tbody>${quarantineRows || '<tr><td colspan="5" class="muted">Aucun compte en quarantaine.</td></tr>'}</tbody>
    </table>
    <h2 style="margin-top:24px;">Alertes de sécurité ouvertes</h2>
    <table class="admin-table">
      <thead><tr><th>Compte</th><th>Détails</th><th>Créée le</th><th>Actions</th></tr></thead>
      <tbody>${alertRows || '<tr><td colspan="4" class="muted">Aucune alerte ouverte.</td></tr>'}</tbody>
    </table>`;
}

/* ---------------- Reports ---------------- */
async function renderReports() {
  const reports = await listAppReports().catch(() => []);
  const rows = reports.map((r) => `
    <tr data-report-id="${escapeHtml(String(r.id))}">
      <td>${escapeHtml(r.appName || r.appId)}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td>${formatDate(r.createdAt)}</td>
      <td class="admin-row-actions"><button class="button button-small" type="button" data-action="resolve-report" data-id="${escapeHtml(String(r.id))}">Marquer résolu</button></td>
    </tr>`).join('');
  return `<table class="admin-table">
    <thead><tr><th>Application</th><th>Raison</th><th>Signalé le</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="muted">Aucun signalement ouvert.</td></tr>'}</tbody>
  </table>`;
}

/* ---------------- Feedback ---------------- */
async function renderFeedback() {
  const feedback = await listAdminFeedback().catch(() => []);
  const rows = feedback.map((f) => `
    <tr data-feedback-id="${escapeHtml(String(f.id))}">
      <td>${escapeHtml(f.username)}<br><span class="muted">${escapeHtml(f.contactEmail || f.accountEmail || '')}</span></td>
      <td>${escapeHtml(f.category)}</td>
      <td>${f.rating ? '★'.repeat(f.rating) : '—'}</td>
      <td style="max-width:320px;">${escapeHtml(f.message)}</td>
      <td><span class="status-chip ${f.status === 'new' ? 'status-pending' : 'status-approved'}">${escapeHtml(f.status)}</span></td>
      <td>${formatDate(f.createdAt)}</td>
      <td class="admin-row-actions">${f.status === 'new' ? `<button class="button button-small" type="button" data-action="mark-feedback-read" data-id="${escapeHtml(String(f.id))}">Marquer lu</button>` : '—'}</td>
    </tr>`).join('');
  return `<table class="admin-table">
    <thead><tr><th>Auteur</th><th>Catégorie</th><th>Note</th><th>Message</th><th>Statut</th><th>Reçu le</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted">Aucun feedback.</td></tr>'}</tbody>
  </table>`;
}

/* ---------------- Platform update ---------------- */
async function renderPlatform() {
  const current = await loadPublishedPlatformUpdate().catch(() => null);
  return `<div class="panel" style="padding:16px 18px;border-radius:14px;background:#fff;margin-bottom:20px;">
      <h2>Dernière mise à jour publiée</h2>
      ${current
        ? `<p><strong>v${escapeHtml(current.version)}</strong> — ${escapeHtml(current.message || '')}</p><p class="muted">Publiée le ${formatDate(current.publishedAt)}</p>`
        : '<p class="muted">Aucune mise à jour publiée pour le moment.</p>'}
    </div>
    <form id="platformForm" class="admin-login-card" style="max-width:420px;">
      <label class="admin-field"><span>Version</span><input type="text" name="version" placeholder="ex: 2.4.0" required></label>
      <label class="admin-field"><span>Message</span><input type="text" name="message" placeholder="Notes de version (optionnel)"></label>
      <label class="admin-field"><span>Fichier APK</span><input type="file" name="file" accept=".apk" required></label>
      <button class="button" type="submit">Publier la mise à jour</button>
    </form>`;
}

/* ---------------- Diagnostic ---------------- */
function diagRow(label, value, ok = null) {
  const badge = ok === true ? '✅' : ok === false ? '❌' : 'ℹ️';
  return `<tr><td>${badge} ${escapeHtml(label)}</td><td><code>${escapeHtml(String(value ?? '—'))}</code></td></tr>`;
}

/* ---------------- Upload logs ---------------- */
async function renderUploadLogs() {
  const { data: logs, error } = await supabase
    .from('upload_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return `<p class="admin-error">Impossible de charger les logs : ${escapeHtml(error.message)}. As-tu exécuté supabase-migration-upload-logs.sql ?</p>`;
  }

  // Regroupe par session_id pour reconstituer le parcours complet d'une
  // tentative de publication (start → progress → success/error).
  const sessions = new Map();
  for (const l of logs || []) {
    if (!sessions.has(l.session_id)) sessions.set(l.session_id, []);
    sessions.get(l.session_id).push(l);
  }

  const stepIcon = (step) => {
    if (step.endsWith('_success') || step === 'publication_success') return '✅';
    if (step.endsWith('_error') || step === 'publication_failed') return '❌';
    if (step.endsWith('_progress')) return '⏳';
    return 'ℹ️';
  };

  const sessionBlocks = [...sessions.entries()].map(([sessionId, entries]) => {
    entries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const first = entries[0];
    const hasError = entries.some((e) => e.step.endsWith('_error') || e.step === 'publication_failed');
    const hasSuccess = entries.some((e) => e.step === 'publication_success');
    const badge = hasError ? '<span class="status-chip status-rejected">échec</span>' : hasSuccess ? '<span class="status-chip status-approved">réussi</span>' : '<span class="status-chip status-pending">en cours</span>';
    const rows = entries.map((e) => `
      <tr>
        <td>${stepIcon(e.step)} ${escapeHtml(e.step)}</td>
        <td>${escapeHtml(e.detail || '')}</td>
        <td>${e.progress_percent != null ? e.progress_percent + '%' : ''}</td>
        <td>${e.duration_ms != null ? e.duration_ms + ' ms' : ''}</td>
        <td>${formatDate(e.created_at)}</td>
      </tr>`).join('');
    return `<details class="admin-log-session">
      <summary>${badge} <strong>${escapeHtml(first.username || first.user_id || 'inconnu')}</strong> — ${formatDate(first.created_at)} <span class="muted">(${entries.length} étapes)</span></summary>
      <table class="admin-table">
        <thead><tr><th>Étape</th><th>Détail</th><th>%</th><th>Durée</th><th>Heure</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
  });

  return `<div class="admin-toolbar"><span class="muted">${sessions.size} tentative(s) de publication récente(s), 200 dernières lignes de log</span></div>
    ${sessionBlocks.join('') || '<p class="muted">Aucun log pour le moment.</p>'}`;
}


async function renderDiagnostic() {
  const rows = [];

  // 1. Config Supabase chargée dans la page
  rows.push(diagRow('URL Supabase', window.PLAYSTARS_SUPABASE_URL || '(vide)', Boolean(window.PLAYSTARS_SUPABASE_URL)));
  rows.push(diagRow('Clé anon présente', Boolean(window.PLAYSTARS_SUPABASE_ANON_KEY), Boolean(window.PLAYSTARS_SUPABASE_ANON_KEY)));

  // 2. Session auth
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  rows.push(diagRow('Session active', Boolean(session), Boolean(session)));
  if (sessionError) rows.push(diagRow('Erreur session', sessionError.message, false));
  rows.push(diagRow('User ID (auth)', session?.user?.id || '—'));
  rows.push(diagRow('Email (auth)', session?.user?.email || '—'));

  // 3. Ligne profiles réelle pour cet utilisateur (lecture directe, sans passer par auth-service)
  let profileRow = null, profileError = null;
  if (session?.user?.id) {
    const res = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    profileRow = res.data;
    profileError = res.error;
  }
  rows.push(diagRow('Profil trouvé dans "profiles"', Boolean(profileRow), Boolean(profileRow)));
  if (profileError) rows.push(diagRow('Erreur lecture profil', `${profileError.code || ''} ${profileError.message}`, false));
  rows.push(diagRow('role (colonne profiles)', profileRow?.role ?? '—', profileRow?.role === 'admin'));
  rows.push(diagRow('status (colonne profiles)', profileRow?.status ?? '—', profileRow?.status === 'active'));
  rows.push(diagRow('developer_status (colonne profiles)', profileRow?.developer_status ?? '—', profileRow?.developer_status === 'approved'));
  rows.push(diagRow('username', profileRow?.username ?? '—'));

  // 4. Test direct de la requête publications (celle qui affiche "Aucune publication")
  const { data: pubData, error: pubError, count } = await supabase.from('publications').select('*', { count: 'exact' });
  rows.push(diagRow('Requête "publications" — erreur', pubError ? `${pubError.code || ''} ${pubError.message}` : 'aucune', !pubError));
  rows.push(diagRow('Requête "publications" — lignes reçues', pubData?.length ?? 0, (pubData?.length ?? 0) > 0));
  rows.push(diagRow('Requête "publications" — count total (RLS incluse)', count ?? '—'));

  // 5. Test réel de connectivité storage — module partagé avec le site
  // principal (services/connectivity-diagnostic.js), pour tester les
  // mêmes conditions exactement de la même façon des deux côtés.
  const connectivity = await runStorageConnectivityDiagnostic();
  const storageWorks = connectivity.apk.ok;
  const imagesStorageWorks = connectivity.images.ok;
  rows.push(diagRow('Test d\'upload dans "apk/"', connectivity.apk.ok ? `réussi (${connectivity.apk.durationMs} ms)` : connectivity.apk.error, storageWorks));
  rows.push(diagRow('Test d\'upload dans "images/"', connectivity.images.ok ? `réussi (${connectivity.images.durationMs} ms)` : connectivity.images.error, imagesStorageWorks));
  const uploadTestError = connectivity.apk.ok ? null : { message: connectivity.apk.error };
  const imgTestError = connectivity.images.ok ? null : { message: connectivity.images.error };

  // 6. Vérification des conditions requises par la policy RLS
  // "publications_insert_own" (owner_id = auth.uid() ET developer_status
  // = 'approved'). Volontairement PAS de vrai INSERT de test ici : une
  // version précédente créait une ligne __diagnostic_test__ dans la table
  // réelle, qui a été traitée par erreur comme une vraie publication
  // (approuvée/rejetée par un admin) avant sa suppression automatique.
  // On déduit le résultat sans jamais écrire dans "publications".
  const insertWorks = profileRow?.developer_status === 'approved';
  rows.push(diagRow(
    'Condition RLS "developer_status = approved" pour publier',
    profileRow?.developer_status ?? 'non défini',
    insertWorks
  ));

  const verdict = !session
    ? '❌ Pas de session : la connexion a échoué ou a expiré.'
    : !profileRow
      ? '❌ Aucune ligne dans "profiles" pour cet utilisateur — le compte auth existe mais pas son profil.'
      : profileRow.role !== 'admin'
        ? `❌ Ce compte a role="${profileRow.role}", pas "admin" — c'est pourquoi les listes admin (publications, etc.) reviennent vides : RLS bloque silencieusement.`
        : !storageWorks
          ? `❌ L'upload de test échoue même dans apk/ : ${uploadTestError.message}. Si le bucket existe déjà côté Supabase, c'est une policy storage manquante (exécute supabase-fix-storage-bucket.sql) plutôt qu'un bucket absent.`
          : !imagesStorageWorks
            ? `❌ L'upload fonctionne dans apk/ mais échoue dans images/ : ${imgTestError.message}. Cause probable : une restriction de type MIME ou de taille configurée sur le bucket lui-même (Supabase Dashboard → Storage → play-stars-files → Configuration), qui n'autorise pas les images (PNG/JPG) alors qu'elle autorise les APK.`
            : !insertWorks
              ? `❌ developer_status = "${profileRow?.developer_status ?? 'non défini'}" au lieu de "approved" — la policy "publications_insert_own" bloquera toute publication tant que ce champ n'est pas approuvé.`
              : pubError
                ? `❌ Le rôle est admin mais la requête publications échoue : ${pubError.message}`
                : (pubData?.length ?? 0) === 0
                  ? 'ℹ️ Le rôle est admin, le storage et l\'insertion fonctionnent : la table "publications" est réellement vide dans cette base.'
                  : '✅ Tout est correct.';

  return `<div class="panel" style="padding:16px 18px;border-radius:14px;background:#fff;margin-bottom:16px;">
      <h2 style="margin-top:0;">Verdict</h2>
      <p>${escapeHtml(verdict)}</p>
    </div>
    <table class="admin-table">
      <thead><tr><th>Vérification</th><th>Valeur</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <p class="muted" style="margin-top:12px;">Astuce : si le rôle n'est pas "admin", lance dans le SQL Editor Supabase :<br>
    <code>update public.profiles set role = 'admin' where id = '${escapeHtml(session?.user?.id || '<uuid>')}';</code></p>`;
}

/* ---------------- Event wiring ---------------- */
function wireTabEvents(tab) {
  if (tab === 'publications') {
    tabContent.querySelector('#pubFilter')?.addEventListener('input', filterPublicationsTable);
    tabContent.querySelector('#pubStatusFilter')?.addEventListener('change', filterPublicationsTable);
  }
  if (tab === 'users') {
    const runSearch = () => goToTab.call(null, 'users');
    tabContent.querySelector('#userSearchButton')?.addEventListener('click', async () => {
      const search = tabContent.querySelector('#userSearch').value;
      const role = tabContent.querySelector('#userRoleFilter').value;
      setBusy(true);
      try {
        tabContent.innerHTML = await renderUsers({ search, role });
        wireTabEvents('users');
      } finally { setBusy(false); }
    });
  }
  if (tab === 'platform') {
    tabContent.querySelector('#platformForm')?.addEventListener('submit', handlePlatformSubmit);
  }
}

function filterPublicationsTable() {
  const nameFilter = tabContent.querySelector('#pubFilter').value.trim().toLowerCase();
  const statusFilter = tabContent.querySelector('#pubStatusFilter').value;
  tabContent.querySelectorAll('#pubTable tbody tr[data-publication-id]').forEach((row) => {
    const name = row.children[0]?.textContent.toLowerCase() || '';
    const status = row.children[3]?.textContent.trim().toLowerCase() || '';
    const matchesName = !nameFilter || name.includes(nameFilter);
    const matchesStatus = !statusFilter || status.includes(statusFilter);
    row.style.display = matchesName && matchesStatus ? '' : 'none';
  });
}

const PLATFORM_UPDATE_ERROR_MESSAGES = {
  'moderation.adminRequired': 'Ton compte n\'a pas les droits admin.',
  'platformUpdate.missingFields': 'Numéro de version manquant, ou fichier absent/vide.',
  'platformUpdate.invalidFile': 'Le fichier doit être un vrai .apk valide (vérifie l\'extension et le contenu réel du fichier).',
  'platformUpdate.fileTooLarge': `Le fichier dépasse la limite de ${MAX_APK_SIZE_MB} Mo.`,
  'platformUpdate.uploadFailed': 'L\'envoi du fichier a échoué (problème réseau ou stockage). Réessaie.'
};

function readablePlatformError(error) {
  return PLATFORM_UPDATE_ERROR_MESSAGES[error?.message] || error?.message || 'Échec de la publication';
}

async function handlePlatformSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const file = formData.get('file');
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton?.textContent;
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Envoi en cours…'; }
  try {
    await publishPlatformUpdate({ version: formData.get('version'), message: formData.get('message'), file });
    showToast('Mise à jour publiée.');
    goToTab('platform');
  } catch (error) {
    showToast(readablePlatformError(error), true);
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel; }
  }
}

tabContent.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  button.disabled = true;
  try {
    if (action === 'approve-pub') { await approvePublication(id); showToast('Publication approuvée.'); }
    else if (action === 'reject-pub') {
      const reason = window.prompt('Raison du rejet :', 'Contenu non conforme');
      if (reason === null) { button.disabled = false; return; }
      await rejectPublication(id, reason); showToast('Publication rejetée.');
    }
    else if (action === 'delete-pub') {
      if (!window.confirm('Supprimer définitivement cette publication ? Cette action est irréversible.')) { button.disabled = false; return; }
      const { error } = await supabase.from('publications').delete().eq('id', id);
      if (error) throw new Error(error.message);
      showToast('Publication supprimée.');
    }
    else if (action === 'approve-badge') { await reviewDeveloperBadge(id, 'approved'); showToast('Badge approuvé.'); }
    else if (action === 'reject-badge') {
      const reason = window.prompt('Raison du rejet :', 'Profil incomplet');
      if (reason === null) { button.disabled = false; return; }
      await reviewDeveloperBadge(id, 'rejected', reason); showToast('Badge rejeté.');
    }
    else if (action === 'unlock-account') { await unlockAccount(id); showToast('Compte débloqué.'); }
    else if (action === 'ban-account') {
      if (!window.confirm('Bannir ce compte ?')) { button.disabled = false; return; }
      await banAccount(id); showToast('Compte banni.');
    }
    else if (action === 'delete-account') {
      if (!window.confirm('Supprimer définitivement ce compte ?')) { button.disabled = false; return; }
      await deleteAccount(id); showToast('Compte supprimé.');
    }
    else if (action === 'resolve-alert') { await resolveSecurityAlert(Number(id)); showToast('Alerte résolue.'); }
    else if (action === 'resolve-report') { await resolveAppReport(Number(id)); showToast('Signalement résolu.'); }
    else if (action === 'mark-feedback-read') { await markAdminFeedbackRead(Number(id)); showToast('Feedback marqué comme lu.'); }
    else if (action === 'promote-user') {
      if (!window.confirm('Donner le rôle admin à cet utilisateur ?')) { button.disabled = false; return; }
      await setUserRole(id, 'admin'); showToast('Utilisateur promu admin.');
    }
    else if (action === 'demote-user') {
      if (!window.confirm('Retirer le rôle admin ?')) { button.disabled = false; return; }
      await setUserRole(id, 'user'); showToast('Rôle admin retiré.');
    }
    await goToTab(activeTab);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Une erreur est survenue', true);
    button.disabled = false;
  }
});

adminNav.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;
  goToTab(button.dataset.tab);
});

refreshButton.addEventListener('click', () => goToTab(activeTab));

logoutButton.addEventListener('click', async () => {
  await signOut();
  window.location.reload();
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const formData = new FormData(loginForm);
  try {
    const user = await signIn({ email: formData.get('email'), password: formData.get('password') });
    if (user.role !== 'admin') {
      await signOut();
      throw new Error('Ce compte n\'a pas les droits administrateur.');
    }
    enterApp(user);
  } catch (error) {
    loginError.textContent = error?.message || 'Connexion impossible.';
    loginError.hidden = false;
  }
});

boot();
