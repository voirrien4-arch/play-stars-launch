import { supabase, STORAGE_BUCKET } from './supabase-client.js';
import { withTimeout } from './with-timeout.js';

// PNG 1x1 transparent minimal, valide, pour un test d'upload réaliste
// sans dépendre d'un vrai fichier utilisateur.
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function base64ToBlob(base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function testUploadIn(folder) {
  const path = `${folder}/diagnostic-${Date.now()}.png`;
  const blob = base64ToBlob(TEST_PNG_BASE64, 'image/png');
  const started = performance.now();
  try {
    const { error } = await withTimeout(
      supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: 'image/png' }),
      10_000,
      `diagnostic-${folder}`
    );
    const durationMs = Math.round(performance.now() - started);
    if (error) return { ok: false, folder, error: error.message, durationMs };
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return { ok: true, folder, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return { ok: false, folder, error: error?.message || 'Erreur réseau inconnue', durationMs };
  }
}

/**
 * Teste réellement la connectivité storage pour apk/ et images/,
 * en lecture seule côté base (aucune ligne créée dans publications).
 * Utilisé côté app (avant de remplir le formulaire) et côté panel admin.
 */
export async function runStorageConnectivityDiagnostic() {
  const [apk, images] = await Promise.all([testUploadIn('apk'), testUploadIn('images')]);
  return { apk, images, allOk: apk.ok && images.ok };
}
