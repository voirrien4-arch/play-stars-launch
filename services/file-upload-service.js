import { supabase, STORAGE_BUCKET } from './supabase-client.js';
import { withTimeout } from './with-timeout.js';

function safeFileName(file) {
  const base = String(file?.name || 'fichier').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const random = crypto.randomUUID().slice(0, 8);
  return `${Date.now()}-${random}-${base}`;
}

// Le timeout est calculé selon la taille du fichier plutôt que fixé à
// une valeur unique : un délai fixe coupait à tort l'upload de gros APK
// sur une connexion pourtant correcte. On part d'un débit plancher
// réaliste pour du mobile (256 Ko/s, volontairement pessimiste) et on
// ajoute une marge fixe pour la latence de connexion initiale.
const MIN_TIMEOUT_MS = 20_000;
const ASSUMED_MIN_THROUGHPUT_BYTES_PER_SEC = 256 * 1024;
const CONNECTION_OVERHEAD_MS = 10_000;

function computeTimeoutMs(fileSizeBytes = 0) {
  const transferMs = (fileSizeBytes / ASSUMED_MIN_THROUGHPUT_BYTES_PER_SEC) * 1000;
  return Math.max(MIN_TIMEOUT_MS, Math.round(transferMs + CONNECTION_OVERHEAD_MS));
}

// Avant chaque upload, on s'assure d'avoir un token valide. Une séquence
// apk/ puis images/ (et plusieurs images) peut s'étaler sur plusieurs
// dizaines de secondes ; si le token expire pile entre deux appels,
// auth.role() peut retourner "anon" au lieu de "authenticated" côté
// serveur et la policy RLS "storage_insert_authenticated" rejette
// l'insert avec "new row violates row-level security policy" — un
// comportement intermittent qui n'a rien à voir avec la vitesse réseau.
async function ensureFreshSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return data?.session || null;
  const expiresAt = data.session.expires_at; // secondes epoch
  const nowSec = Date.now() / 1000;
  if (expiresAt && expiresAt - nowSec < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: null }));
    return refreshed?.session || data.session;
  }
  return data.session;
}

/**
 * Upload avec suivi de progression réel (XMLHttpRequest, car le SDK
 * Supabase utilise fetch qui ne remonte pas la progression d'upload) et
 * logging optionnel de chaque étape (voir services/upload-logger.js).
 *
 * onProgress(percent: number) est appelé pendant l'envoi.
 * logger, si fourni, reçoit un log à chaque étape clé (start, progress
 * à intervalles, success, error) — visible ensuite dans le panel admin.
 */
async function uploadOne(file, folder, { onProgress, logger, stepPrefix = folder } = {}) {
  const session = await ensureFreshSession();
  const path = `${folder}/${safeFileName(file)}`;
  const startedAt = performance.now();

  await logger?.log(`${stepPrefix}_start`, { detail: `${file?.name || ''} (${file?.size || 0} octets)` });

  const url = `${window.PLAYSTARS_SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
  const token = session?.access_token;

  const uploadPromise = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', window.PLAYSTARS_SUPABASE_ANON_KEY || '');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');

    let lastLoggedPercent = -1;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress?.(percent);
      // Log par palier de 20% pour ne pas saturer la table de logs.
      if (percent - lastLoggedPercent >= 20 || percent === 100) {
        lastLoggedPercent = percent;
        logger?.log(`${stepPrefix}_progress`, { progressPercent: percent, detail: `${event.loaded}/${event.total} octets` });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = `HTTP ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          message = parsed.message || parsed.error || message;
        } catch { /* réponse non-JSON, on garde le status brut */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Failed to fetch (réseau)'));
    xhr.onabort = () => reject(new Error('Envoi annulé'));
    xhr.send(file);
  });

  try {
    await withTimeout(uploadPromise, computeTimeoutMs(file?.size), 'upload');
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    await logger?.log(`${stepPrefix}_error`, { detail: error?.message || String(error), durationMs });
    throw error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  await logger?.log(`${stepPrefix}_success`, { detail: path, durationMs, progressPercent: 100 });

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return {
    fileId: path,
    filePath: path,
    publicUrl: data.publicUrl,
    sizeBytes: file.size
  };
}

export async function uploadApk(file, { onProgress, logger } = {}) {
  try {
    return await uploadOne(file, 'apk', { onProgress, logger, stepPrefix: 'apk' });
  } catch (error) {
    console.error('Play Stars: transfert APK échoué —', error?.message || error);
    const failure = new Error('publication.uploadFailed');
    failure.cause = error;
    throw failure;
  }
}

export async function uploadImage(file, { onProgress, logger, stepPrefix = 'icon' } = {}) {
  try {
    return await uploadOne(file, 'images', { onProgress, logger, stepPrefix });
  } catch (error) {
    console.error('Play Stars: transfert image échoué —', error?.message || error);
    const failure = new Error('publication.iconUploadFailed');
    failure.cause = error;
    throw failure;
  }
}

export async function uploadImages(files = [], { onProgress, logger } = {}) {
  const descriptors = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const descriptor = await uploadOne(files[i], 'images', {
        stepPrefix: `screenshot_${i + 1}`,
        logger,
        onProgress: (percent) => onProgress?.(i, files.length, percent)
      });
      descriptors.push(descriptor);
    }
    return descriptors;
  } catch (error) {
    console.error('Play Stars: transfert images échoué —', error?.message || error);
    const failure = new Error('publication.imagesUploadFailed');
    failure.cause = error;
    throw failure;
  }
}
