import { supabase } from './supabase-client.js';
import { getCurrentUser, getDeveloperSummary } from './auth-service.js';
import { uploadApk, uploadImage, uploadImages } from './file-upload-service.js';
import { withTimeout } from './with-timeout.js';
import { createUploadLogger } from './upload-logger.js';

const MAX_APK_SIZE = 70 * 1024 * 1024;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const MAX_SCREENSHOTS = 4;
const MIN_SCREENSHOTS = 1;
const MAX_ICON_SIZE = 2 * 1024 * 1024;
const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
const SAFE_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp)$/i;

function fromRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name || '',
    ownerVerified: row.owner_verified || false,
    appName: row.app_name,
    packageName: row.package_name,
    version: row.version,
    category: row.category,
    officialUrl: row.official_url,
    releaseNotes: row.release_notes,
    icon: row.icon,
    screenshots: row.screenshots || [],
    file: row.file,
    status: row.status,
    moderationReason: row.moderation_reason,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versions: row.versions || [],
    downloadCount: row.download_count || 0
  };
}

export async function listAllPublications() {
  const { data, error } = await supabase.from('publications').select('*').order('updated_at', { ascending: false });
  if (error) return [];
  return data.map(fromRow);
}

function isApk(file) {
  return Boolean(file && file.size > 0 && (file.name?.toLowerCase().endsWith('.apk') || file.type === 'application/vnd.android.package-archive'));
}

async function hasApkSignature(file) {
  if (!file?.slice || typeof file.slice(0, 4).arrayBuffer !== 'function') return false;
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return header.length === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
}

function validateScreenshots(files = [], required = false) {
  const screenshots = Array.from(files || []).filter((file) => file && file.size > 0 && file.name);
  if (required && screenshots.length < MIN_SCREENSHOTS) throw new Error('publication.screenshotsRequired');
  if (screenshots.length > MAX_SCREENSHOTS) throw new Error('publication.screenshotsLimit');
  if (screenshots.some((file) => !SAFE_IMAGE_TYPES.has(file.type) && !SAFE_IMAGE_EXTENSIONS.test(file.name))) throw new Error('publication.screenshotsInvalid');
  if (screenshots.some((file) => file.size > MAX_SCREENSHOT_SIZE)) throw new Error('publication.screenshotTooLarge');
  return screenshots;
}

function isImage(file) {
  return Boolean(file && file.size > 0 && file.name && (SAFE_IMAGE_TYPES.has(file.type) || SAFE_IMAGE_EXTENSIONS.test(file.name)));
}

function normalizeOfficialUrl(value, required = false) {
  const raw = String(value || '').trim();
  if (!raw) {
    if (required) throw new Error('publication.officialUrlRequired');
    return '';
  }
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error('invalid');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error('publication.officialUrlInvalid');
  }
}

function validateIcon(file, required = true) {
  if (!file || !file.size) {
    if (required) throw new Error('publication.iconRequired');
    return null;
  }
  if (!isImage(file)) throw new Error('publication.iconInvalid');
  if (file.size > MAX_ICON_SIZE) throw new Error('publication.iconTooLarge');
  return file;
}

async function validate(input) {
  if (!input.appName?.trim() || !input.packageName?.trim() || !input.version?.trim() || !input.file) {
    throw new Error('publication.missingFields');
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/i.test(input.packageName.trim())) {
    throw new Error('publication.invalidPackage');
  }
  if (!isApk(input.file)) throw new Error('publication.invalidFile');
  if (input.file.size > MAX_APK_SIZE) throw new Error('publication.fileTooLarge');
  if (!(await hasApkSignature(input.file))) throw new Error('publication.invalidFile');
  validateIcon(input.icon, true);
  validateScreenshots(input.screenshots, true);
  normalizeOfficialUrl(input.officialUrl, true);
}

function compareVersionNames(first, second) {
  const parse = (value) => value.split('.').map((part) => Number(part));
  const a = parse(first);
  const b = parse(second);
  if (a.some((part) => !Number.isInteger(part)) || b.some((part) => !Number.isInteger(part))) return null;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export async function listPublications(ownerId) {
  const { data, error } = await supabase.from('publications').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false });
  if (error) return [];
  return data.map(fromRow);
}

export async function updatePublication(publicationId, input, { onProgress } = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error('auth.loginRequired');
  if (user.developerStatus !== 'approved') throw new Error('publication.badgeRequired');
  if (!input.version?.trim() || !input.file) throw new Error('publication.updateMissingFields');
  if (!isApk(input.file)) throw new Error('publication.invalidFile');
  if (input.file.size > MAX_APK_SIZE) throw new Error('publication.fileTooLarge');
  const iconFile = validateIcon(input.icon, false);
  const screenshotFiles = validateScreenshots(input.screenshots);

  const { data: existingRow, error: fetchError } = await supabase.from('publications').select('*').eq('id', publicationId).eq('owner_id', user.id).single();
  if (fetchError || !existingRow) throw new Error('publication.notFound');
  const publication = fromRow(existingRow);

  const officialUrl = input.officialUrl?.trim() ? normalizeOfficialUrl(input.officialUrl) : (publication.officialUrl || '');
  const version = input.version.trim();
  if (publication.version === version || publication.versions?.some((item) => item.version === version)) {
    throw new Error('publication.versionAlreadyUsed');
  }
  const versionOrder = compareVersionNames(version, publication.version);
  if (versionOrder !== null && versionOrder < 1) throw new Error('publication.versionMustIncrease');
  if (!(await hasApkSignature(input.file))) throw new Error('publication.invalidFile');

  const logger = createUploadLogger();
  await logger.log('update_start', { detail: `${publicationId} → v${version}` });

  const weights = { apk: iconFile || screenshotFiles.length ? 0.55 : 0.9, icon: 0.15, screenshots: 0.2, save: 0.1 };
  const before = { apk: 0, icon: weights.apk, screenshots: weights.apk + weights.icon, save: weights.apk + weights.icon + weights.screenshots };
  const report = (stage, stagePercent) => {
    onProgress?.(Math.round(before[stage] * 100 + (stagePercent / 100) * weights[stage] * 100));
  };

  let uploaded;
  try {
    uploaded = await uploadApk(input.file, { logger, onProgress: (p) => report('apk', p) });
  } catch (error) {
    await logger.log('update_failed', { detail: `apk: ${error?.message}` });
    throw error?.message?.startsWith('publication.') ? error : new Error('publication.uploadFailed');
  }
  let icon = publication.icon || null;
  if (iconFile) {
    try {
      const uploadedIcon = await uploadImage(iconFile, { logger, onProgress: (p) => report('icon', p) });
      icon = { fileId: uploadedIcon.fileId, filePath: uploadedIcon.filePath, publicUrl: uploadedIcon.publicUrl, originalName: iconFile.name, mimeType: iconFile.type || 'image/png', sizeBytes: uploadedIcon.sizeBytes || iconFile.size };
    } catch (error) {
      await logger.log('update_failed', { detail: `icon: ${error?.message}` });
      throw error?.message?.startsWith('publication.') ? error : new Error('publication.iconUploadFailed');
    }
  } else {
    report('icon', 100);
  }
  let screenshots = publication.screenshots || [];
  if (screenshotFiles.length) {
    try {
      screenshots = await uploadImages(screenshotFiles, {
        logger,
        onProgress: (index, total, p) => report('screenshots', ((index + p / 100) / total) * 100)
      });
    } catch (error) {
      await logger.log('update_failed', { detail: `screenshots: ${error?.message}` });
      throw error?.message?.startsWith('publication.') ? error : new Error('publication.imagesUploadFailed');
    }
  } else {
    report('screenshots', 100);
  }
  const now = new Date().toISOString();
  const releaseNotes = input.releaseNotes?.trim() || '';
  const file = { fileId: uploaded.fileId, filePath: uploaded.filePath, publicUrl: uploaded.publicUrl, originalName: input.file.name, mimeType: input.file.type || 'application/vnd.android.package-archive', sizeBytes: uploaded.sizeBytes || input.file.size };
  const nextVersion = { version, createdAt: now, releaseNotes, file, icon, screenshots };
  const versions = [...(publication.versions ?? []), nextVersion];

  await logger.log('update_db_start');
  const { data: updatedRow, error: updateError } = await supabase.from('publications').update({
    version, release_notes: releaseNotes, status: 'pending', moderation_reason: '',
    file, icon, screenshots, official_url: officialUrl, versions
  }).eq('id', publicationId).select().single();
  if (updateError) {
    await logger.log('update_failed', { detail: `db_update: ${updateError.message}` });
    throw new Error('publication.saveFailed');
  }
  report('save', 100);
  await logger.log('update_success', { detail: publicationId });
  return fromRow(updatedRow);
}

export async function reviewPublication(publicationId, status, reason = '') {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  if (!['approved', 'rejected'].includes(status)) throw new Error('moderation.invalidDecision');
  const { data, error } = await supabase.from('publications').update({
    status, moderation_reason: reason.trim(), moderated_at: new Date().toISOString()
  }).eq('id', publicationId).select().single();
  if (error) throw new Error('publication.notFound');
  return fromRow(data);
}

export async function createPublication(input, { onProgress } = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error('auth.loginRequired');
  const summary = getDeveloperSummary(user);
  if (user.developerStatus !== 'approved') throw new Error('publication.badgeRequired');
  if (summary.availableSlots < 1) throw new Error('publication.noSlot');
  await validate(input);
  const screenshotFiles = validateScreenshots(input.screenshots);

  const logger = createUploadLogger();
  await logger.log('publication_start', { detail: `${input.appName?.trim() || ''} / ${input.packageName?.trim() || ''}` });

  // Pondération du parcours complet pour une barre de progression globale
  // cohérente : l'APK pèse généralement bien plus lourd que les images,
  // donc on lui alloue la plus grosse part de la barre plutôt que de
  // diviser en tranches égales par nombre d'étapes.
  const weights = { apk: 0.6, icon: 0.15, screenshots: 0.2, save: 0.05 };
  const report = (stage, stagePercent) => {
    const before = { apk: 0, icon: weights.apk, screenshots: weights.apk + weights.icon, save: weights.apk + weights.icon + weights.screenshots }[stage] * 100;
    onProgress?.(Math.round(before + (stagePercent / 100) * weights[stage] * 100));
  };

  let uploaded;
  try {
    uploaded = await uploadApk(input.file, { logger, onProgress: (p) => report('apk', p) });
  } catch (error) {
    await logger.log('publication_failed', { detail: `apk: ${error?.message}` });
    throw error?.message?.startsWith('publication.') ? error : new Error('publication.uploadFailed');
  }
  let uploadedIcon;
  try {
    uploadedIcon = await uploadImage(input.icon, { logger, onProgress: (p) => report('icon', p) });
  } catch (error) {
    await logger.log('publication_failed', { detail: `icon: ${error?.message}` });
    throw error?.message?.startsWith('publication.') ? error : new Error('publication.iconUploadFailed');
  }
  let screenshots = [];
  if (screenshotFiles.length) {
    try {
      screenshots = await uploadImages(screenshotFiles, {
        logger,
        onProgress: (index, total, p) => report('screenshots', ((index + p / 100) / total) * 100)
      });
    } catch (error) {
      await logger.log('publication_failed', { detail: `screenshots: ${error?.message}` });
      throw error?.message?.startsWith('publication.') ? error : new Error('publication.imagesUploadFailed');
    }
  }
  report('screenshots', 100);
  const icon = { fileId: uploadedIcon.fileId, filePath: uploadedIcon.filePath, publicUrl: uploadedIcon.publicUrl, originalName: input.icon.name, mimeType: input.icon.type || 'image/png', sizeBytes: uploadedIcon.sizeBytes || input.icon.size };
  const file = { fileId: uploaded.fileId, filePath: uploaded.filePath, publicUrl: uploaded.publicUrl, originalName: input.file.name, mimeType: input.file.type || 'application/vnd.android.package-archive', sizeBytes: uploaded.sizeBytes || input.file.size };
  const version = input.version.trim();
  const releaseNotes = input.releaseNotes?.trim() || '';

  await logger.log('db_insert_start');
  const { data, error } = await withTimeout(
    supabase.from('publications').insert({
      owner_id: user.id,
      owner_name: user.username,
      app_name: input.appName.trim(),
      package_name: input.packageName.trim(),
      version,
      category: input.category || 'tools',
      official_url: normalizeOfficialUrl(input.officialUrl, true),
      release_notes: releaseNotes,
      icon,
      screenshots,
      file,
      status: 'pending',
      versions: [{ version, createdAt: new Date().toISOString(), releaseNotes, icon, screenshots, file }]
    }).select().single(),
    30_000,
    'insert'
  );
  if (error) {
    await logger.log('publication_failed', { detail: `db_insert: ${error.message}` });
    throw new Error('publication.saveFailed');
  }
  report('save', 100);
  await logger.log('publication_success', { detail: data?.id });
  return fromRow(data);
}

// Enregistre un téléchargement (best-effort : une panne ici ne doit jamais
// empêcher l'utilisateur de télécharger l'APK).
export async function recordDownload(publicationId) {
  try {
    const user = getCurrentUser();
    await supabase.from('publication_downloads').insert({
      publication_id: publicationId,
      user_id: user?.id || null
    });
  } catch (error) {
    console.warn('Play Stars: enregistrement du téléchargement impossible', error);
  }
}

// Compte les téléchargements par application pour un développeur donné
// (uniquement ses propres publications, la policy RLS le garantit aussi).
export async function getDownloadCountsByOwner(ownerId) {
  try {
    const { data: pubs } = await supabase.from('publications').select('id').eq('owner_id', ownerId);
    const ids = (pubs || []).map((row) => row.id);
    if (!ids.length) return {};
    const { data: downloads } = await supabase.from('publication_downloads').select('publication_id').in('publication_id', ids);
    const counts = {};
    ids.forEach((id) => { counts[id] = 0; });
    (downloads || []).forEach((row) => { counts[row.publication_id] = (counts[row.publication_id] || 0) + 1; });
    return counts;
  } catch (error) {
    console.warn('Play Stars: statistiques de téléchargement indisponibles', error);
    return {};
  }
}

export function formatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}
