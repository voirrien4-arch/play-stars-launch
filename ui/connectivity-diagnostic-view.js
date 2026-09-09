import { runStorageConnectivityDiagnostic } from '../services/connectivity-diagnostic.js';

/**
 * Cherche le conteneur [data-connectivity-diagnostic] déjà rendu dans le
 * DOM (voir ui/publication-view.js), lance un vrai test d'upload dans
 * apk/ et images/, puis affiche le résultat. Silencieux si le conteneur
 * n'existe pas (vue différente, ou pas de badge développeur).
 */
export async function syncConnectivityDiagnostic() {
  const container = document.querySelector('[data-connectivity-diagnostic]');
  if (!container) return;

  let result;
  try {
    result = await runStorageConnectivityDiagnostic();
  } catch (error) {
    container.innerHTML = `<div class="connectivity-diagnostic-banner connectivity-diagnostic-error">
      ⚠️ Impossible de vérifier la connexion au stockage (${escapeText(error?.message || 'erreur inconnue')}). Tu peux quand même essayer de publier.
    </div>`;
    return;
  }

  // Re-vérifie que le conteneur est toujours dans le DOM (l'utilisateur a
  // pu changer de page pendant le test, qui prend une fraction de seconde).
  if (!document.body.contains(container)) return;

  if (result.allOk) {
    container.innerHTML = `<div class="connectivity-diagnostic-banner connectivity-diagnostic-ok">
      ✅ Connexion au stockage vérifiée — tu peux publier normalement.
    </div>`;
    // Le bandeau de succès n'a pas besoin de rester affiché en permanence.
    setTimeout(() => { if (document.body.contains(container)) container.remove(); }, 4000);
    return;
  }

  const failing = [];
  if (!result.apk.ok) failing.push(`APK (${escapeText(result.apk.error)})`);
  if (!result.images.ok) failing.push(`Images (${escapeText(result.images.error)})`);

  container.innerHTML = `<div class="connectivity-diagnostic-banner connectivity-diagnostic-error" role="alert">
    ⚠️ Problème de connexion détecté avant même d'envoyer ton application : ${failing.join(' · ')}.<br>
    <span class="muted">Vérifie ta connexion internet (Wi-Fi ou données mobiles) et réessaie. Si le problème persiste, contacte le support Play Stars.</span>
  </div>`;
}

function escapeText(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
