import { safeDownloadUrl } from './security-service.js';
import { withTimeout } from './with-timeout.js';

function downloadName(app) {
  const base = String(app?.downloadName || app?.name || 'application')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim() || 'application';
  return `${base}.apk`;
}

function triggerBlobDownload(blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

const MIN_TIMEOUT_MS = 20_000;
const ASSUMED_MIN_THROUGHPUT_BYTES_PER_SEC = 256 * 1024;
const CONNECTION_OVERHEAD_MS = 10_000;

function computeTimeoutMs(fileSizeBytes = 0) {
  const transferMs = (fileSizeBytes / ASSUMED_MIN_THROUGHPUT_BYTES_PER_SEC) * 1000;
  return Math.max(MIN_TIMEOUT_MS, Math.round(transferMs + CONNECTION_OVERHEAD_MS));
}

/**
 * Télécharge le fichier en mémoire (XHR, avec progression) puis le
 * propose via une URL blob:// — de même origine que le site, donc le
 * navigateur l'enregistre directement sans jamais naviguer vers
 * Supabase ni ouvrir un nouvel onglet. L'utilisateur reste sur la
 * fiche de l'application pendant toute l'opération.
 *
 * onProgress(percent) est appelé pendant le téléchargement.
 */
export async function downloadApk(app, { onProgress } = {}) {
  const downloadUrl = safeDownloadUrl(app?.downloadUrl);
  if (!downloadUrl) throw new Error('download.unavailable');
  const name = downloadName(app);
  const estimatedSize = Number(app?.file?.sizeBytes || app?.sizeBytes || 0);

  const blobPromise = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', downloadUrl, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error(`download.httpError:${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('download.networkError'));
    xhr.send();
  });

  const blob = await withTimeout(blobPromise, computeTimeoutMs(estimatedSize), 'download');
  onProgress?.(100);
  triggerBlobDownload(blob, name);
}
