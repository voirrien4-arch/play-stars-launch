import { supabase, STORAGE_BUCKET } from '../services/supabase-client.js';
import { getCurrentUser } from '../services/auth-service.js';
import { withTimeout } from '../services/with-timeout.js';

const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function escapeText(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function line(ok, label, detail = '') {
  const icon = ok === true ? '✅' : ok === false ? '❌' : 'ℹ️';
  return `<div class="debug-line"><span>${icon} ${escapeText(label)}</span>${detail ? `<code>${escapeText(detail)}</code>` : ''}</div>`;
}

async function timeIt(fn) {
  const start = performance.now();
  try {
    const result = await fn();
    return { ok: true, ms: Math.round(performance.now() - start), result };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - start), error: error?.message || String(error) };
  }
}

async function runFullDiagnostic(reportEl) {
  reportEl.innerHTML = '<div class="debug-line">⏳ Diagnostic en cours…</div>';
  const rows = [];

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  rows.push(line(Boolean(session), 'Session active', session?.user?.email || 'aucune'));
  if (session?.expires_at) {
    const secondsLeft = Math.round(session.expires_at - Date.now() / 1000);
    rows.push(line(secondsLeft > 60, `Token expire dans ${secondsLeft}s`, secondsLeft <= 60 ? 'Proche de l\'expiration — cause probable des échecs RLS intermittents' : ''));
  }

  let profile = null;
  if (session?.user?.id) {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    profile = data;
  }
  rows.push(line(Boolean(profile), 'Profil trouvé', profile?.username || '—'));
  rows.push(line(profile?.role === 'admin', 'Rôle admin', profile?.role || '—'));
  rows.push(line(profile?.developer_status === 'approved', 'Badge développeur', profile?.developer_status || '—'));

  const ping = await timeIt(() => withTimeout(
    fetch(`${window.PLAYSTARS_SUPABASE_URL}/auth/v1/health`),
    8000,
    'ping'
  ));
  rows.push(line(ping.ok && ping.ms < 3000, `Ping serveur Supabase (${ping.ms} ms)`, ping.ok ? '' : ping.error));

  const apkTest = await timeIt(() => withTimeout(
    supabase.storage.from(STORAGE_BUCKET).upload(`apk/debug-${Date.now()}.txt`, new Blob(['x']), { contentType: 'text/plain' })
      .then(({ data, error }) => { if (error) throw error; return data; }),
    20000,
    'apk-upload'
  ));
  if (apkTest.ok && apkTest.result?.path) await supabase.storage.from(STORAGE_BUCKET).remove([apkTest.result.path]);
  rows.push(line(apkTest.ok, `Upload test apk/ (${apkTest.ms} ms)`, apkTest.ok ? '' : apkTest.error));

  const pngBytes = Uint8Array.from(atob(TEST_PNG_BASE64), (c) => c.charCodeAt(0));
  const imgTest = await timeIt(() => withTimeout(
    supabase.storage.from(STORAGE_BUCKET).upload(`images/debug-${Date.now()}.png`, new Blob([pngBytes], { type: 'image/png' }), { contentType: 'image/png' })
      .then(({ data, error }) => { if (error) throw error; return data; }),
    20000,
    'image-upload'
  ));
  if (imgTest.ok && imgTest.result?.path) await supabase.storage.from(STORAGE_BUCKET).remove([imgTest.result.path]);
  rows.push(line(imgTest.ok, `Upload test images/ (${imgTest.ms} ms)`, imgTest.ok ? '' : imgTest.error));

  let verdict;
  if (!session) verdict = '❌ Pas connecté — reconnecte-toi.';
  else if (!apkTest.ok) verdict = `❌ L'upload échoue même pour un petit fichier texte dans apk/ : ${apkTest.error}. Problème réseau ou serveur, pas un souci de code.`;
  else if (!imgTest.ok) {
    verdict = imgTest.error?.includes('row-level security') || imgTest.error?.includes('policy')
      ? `❌ apk/ fonctionne mais images/ est bloqué par une règle de sécurité (RLS) côté Supabase : ${imgTest.error}. Ce n'est pas un problème réseau — une policy sur storage.objects traite images/ différemment de apk/. Vérifie les policies dans Supabase (Storage → Policies).`
      : `❌ apk/ fonctionne mais images/ échoue : ${imgTest.error}.`;
  }
  else if (profile?.developer_status !== 'approved') verdict = `❌ Ton badge développeur n'est pas "approved" (actuel: ${profile?.developer_status || 'non défini'}) — la publication sera bloquée par les règles de sécurité.`;
  else if (!ping.ok || ping.ms >= 6000) verdict = `⚠️ Les uploads réels fonctionnent bien (apk/ ${apkTest.ms} ms, images/ ${imgTest.ms} ms) — le ping lent (${ping.ok ? ping.ms + ' ms' : 'timeout'}) semble être un ralentissement ponctuel sur cet endpoint précis, pas un vrai problème de connexion.`;
  else verdict = '✅ Tout fonctionne. Si la publication échoue quand même, réessaie maintenant.';

  reportEl.innerHTML = `<div class="debug-verdict">${escapeText(verdict)}</div>${rows.join('')}`;
}

async function runPublishTest(reportEl) {
  reportEl.innerHTML = '<div class="debug-line">⏳ Test de publication complet en cours (peut prendre jusqu\'à 30s)…</div>';
  const user = getCurrentUser();
  if (!user) { reportEl.innerHTML = line(false, 'Pas connecté'); return; }

  // Nettoyage préventif : supprime tout résidu laissé par un test
  // précédent qui aurait échoué avant son propre nettoyage, pour ne
  // jamais laisser ça traîner visible dans "Mes applications".
  await supabase.from('publications').delete().eq('app_name', '__bouton_debug_test__');

  const rows = [];
  const pngBytes = Uint8Array.from(atob(TEST_PNG_BASE64), (c) => c.charCodeAt(0));
  const filesToClean = [];
  let insertedIdToClean = null;

  try {
    const apkStep = await timeIt(() => withTimeout(
      supabase.storage.from(STORAGE_BUCKET).upload(`apk/debug-full-${Date.now()}.txt`, new Blob(['fake-apk-content']), { contentType: 'application/vnd.android.package-archive' })
        .then(({ data, error }) => { if (error) throw error; return data; }),
      45000,
      'full-apk'
    ));
    rows.push(line(apkStep.ok, `Étape 1/3 — Upload APK (${apkStep.ms} ms)`, apkStep.ok ? '' : apkStep.error));
    reportEl.innerHTML = rows.join('');
    if (!apkStep.ok) { reportEl.innerHTML += `<div class="debug-verdict">❌ Échec dès l'étape 1. C'est exactement ce qui bloque ta vraie publication.</div>`; return; }
    filesToClean.push(apkStep.result.path);

    const iconStep = await timeIt(() => withTimeout(
      supabase.storage.from(STORAGE_BUCKET).upload(`images/debug-full-${Date.now()}.png`, new Blob([pngBytes], { type: 'image/png' }), { contentType: 'image/png' })
        .then(({ data, error }) => { if (error) throw error; return data; }),
      45000,
      'full-icon'
    ));
    rows.push(line(iconStep.ok, `Étape 2/3 — Upload icône (${iconStep.ms} ms)`, iconStep.ok ? '' : iconStep.error));
    reportEl.innerHTML = rows.join('');
    if (!iconStep.ok) {
      reportEl.innerHTML += `<div class="debug-verdict">❌ Échec à l'étape 2 (icône) — c'est très probablement exactement ce qui bloque ta vraie publication.</div>`;
      return;
    }
    filesToClean.push(iconStep.result.path);

    const insertStep = await timeIt(() => withTimeout(
      supabase.from('publications').insert({
        owner_id: user.id,
        owner_name: user.username,
        app_name: '__bouton_debug_test__',
        package_name: 'com.debug.test',
        version: '0.0.0',
        category: 'tools',
        official_url: 'https://example.com',
        icon: { fileId: iconStep.result.path, filePath: iconStep.result.path, publicUrl: '', originalName: 'test.png', mimeType: 'image/png', sizeBytes: 1 },
        screenshots: [],
        file: { fileId: apkStep.result.path, filePath: apkStep.result.path, publicUrl: '', originalName: 'test.apk', mimeType: 'application/vnd.android.package-archive', sizeBytes: 1 },
        status: 'pending',
        versions: []
      }).select().single().then(({ data, error }) => { if (error) throw error; return data; }),
      30000,
      'full-insert'
    ));
    rows.push(line(insertStep.ok, `Étape 3/3 — Enregistrement en base (${insertStep.ms} ms)`, insertStep.ok ? '' : insertStep.error));
    if (insertStep.ok && insertStep.result?.id) insertedIdToClean = insertStep.result.id;

    const verdict = insertStep.ok
      ? '✅ Le cycle complet (APK → icône → enregistrement) fonctionne parfaitement. Si ta vraie publication échoue, réessaie maintenant — c\'était peut-être un incident réseau ponctuel.'
      : `❌ Échec à l'étape 3 (enregistrement) : ${insertStep.error}. Les fichiers s'uploadent mais l'enregistrement final échoue.`;
    reportEl.innerHTML = rows.join('') + `<div class="debug-verdict">${escapeText(verdict)}</div>`;
  } finally {
    // Nettoyage garanti, même si une exception inattendue survient
    // au-dessus (pas seulement les échecs déjà gérés par un return).
    if (filesToClean.length) await supabase.storage.from(STORAGE_BUCKET).remove(filesToClean).catch(() => {});
    if (insertedIdToClean) await supabase.from('publications').delete().eq('id', insertedIdToClean).catch(() => {});
    // Filet de sécurité final, par nom, au cas où l'id n'aurait pas
    // été capturé (ex: timeout après un insert qui a en fait réussi
    // côté serveur).
    await supabase.from('publications').delete().eq('app_name', '__bouton_debug_test__').catch(() => {});
  }
}

async function runDownloadTest(reportEl) {
  reportEl.innerHTML = '<div class="debug-line">⏳ Recherche d\'une publication approuvée pour tester le téléchargement…</div>';
  const rows = [];

  const { data: approved, error: fetchError } = await supabase
    .from('publications')
    .select('id, app_name, file')
    .eq('status', 'approved')
    .not('file', 'is', null)
    .not('app_name', 'in', '("__bouton_debug_test__","__diagnostic_test__")')
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    reportEl.innerHTML = `<div class="debug-verdict">❌ Impossible de lire les publications : ${escapeText(fetchError.message)}</div>`;
    return;
  }
  if (!approved) {
    reportEl.innerHTML = `<div class="debug-verdict">ℹ️ Aucune publication "approved" trouvée pour tester le téléchargement. Approuve d'abord une app dans l'onglet Publications.</div>`;
    return;
  }
  rows.push(line(true, 'Publication de test trouvée', `${approved.app_name} (${approved.id})`));

  const downloadUrl = approved.file?.publicUrl;
  rows.push(line(Boolean(downloadUrl), 'URL de téléchargement présente', downloadUrl || 'manquante (champ file.publicUrl vide)'));
  reportEl.innerHTML = rows.join('');
  if (!downloadUrl) {
    reportEl.innerHTML += `<div class="debug-verdict">❌ Cette publication n'a pas d'URL de fichier enregistrée — le bouton Télécharger ne peut pas fonctionner pour elle.</div>`;
    return;
  }

  // Test 1 : la ressource est-elle accessible en HTTP (CORS/existence) ?
  // GET avec Range plutôt que HEAD : certains CDN/storage supportent mal
  // ou lentement les requêtes HEAD, ce qui donne un faux négatif alors
  // que le fichier est parfaitement accessible en téléchargement réel.
  // GET simple, identique à ce que fait un vrai téléchargement — testé
  // et confirmé fonctionnel en navigation directe, donc pas d'en-tête
  // Range ici (qui semblait causer un blocage silencieux côté Supabase).
  const fetchTest = await timeIt(() => withTimeout(
    fetch(downloadUrl),
    15000,
    'download-get'
  ));
  rows.push(line(fetchTest.ok && fetchTest.result?.ok, `Requête GET sur le fichier (${fetchTest.ms} ms)`, fetchTest.ok ? `status ${fetchTest.result?.status}` : fetchTest.error));
  reportEl.innerHTML = rows.join('');

  let verdict;
  if (!fetchTest.ok) {
    verdict = `❌ La requête échoue complètement : ${fetchTest.error}. Cause probable : CORS non configuré sur le bucket, ou fichier supprimé du storage alors que la ligne existe encore en base.`;
  } else if (!fetchTest.result.ok) {
    verdict = `❌ Le serveur répond avec le statut ${fetchTest.result.status} — le fichier n'existe probablement plus dans le storage à ce chemin, alors que la publication l'référence toujours.`;
  } else {
    verdict = '✅ Le fichier est bien accessible. Si le bouton Télécharger ne fonctionne toujours pas pour l\'utilisateur, le souci est probablement côté navigateur (bloqueur de popup/téléchargement) plutôt que côté serveur.';
  }
  reportEl.innerHTML = rows.join('') + `<div class="debug-verdict">${escapeText(verdict)}</div>`;
}

export function mountDebugPanel() {
  if (document.getElementById('psDebugRoot')) return;

  const root = document.createElement('div');
  root.id = 'psDebugRoot';
  root.innerHTML = `
    <button id="psDebugToggle" type="button" aria-label="Diagnostic Play Stars">🛠️</button>
    <div id="psDebugPanel" hidden>
      <div id="psDebugHeader">
        <strong>Diagnostic Play Stars</strong>
        <button id="psDebugClose" type="button" aria-label="Fermer">×</button>
      </div>
      <div id="psDebugActions">
        <button id="psDebugRunDiag" type="button" class="button button-small">Analyser l'état</button>
        <button id="psDebugRunPublish" type="button" class="button button-small">Tester une publication</button>
        <button id="psDebugRunDownload" type="button" class="button button-small">Tester le téléchargement</button>
      </div>
      <div id="psDebugReport"></div>
    </div>
  `;
  document.body.appendChild(root);

  const panel = document.getElementById('psDebugPanel');
  const toggle = document.getElementById('psDebugToggle');
  const closeBtn = document.getElementById('psDebugClose');
  const report = document.getElementById('psDebugReport');

  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  closeBtn.addEventListener('click', () => { panel.hidden = true; });
  document.getElementById('psDebugRunDiag').addEventListener('click', () => runFullDiagnostic(report));
  document.getElementById('psDebugRunPublish').addEventListener('click', () => runPublishTest(report));
  document.getElementById('psDebugRunDownload').addEventListener('click', () => runDownloadTest(report));
}
