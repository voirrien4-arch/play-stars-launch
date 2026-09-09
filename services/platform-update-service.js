import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';
import { uploadApk } from './file-upload-service.js';
import { safeString } from './security-service.js';

const MAX_APK_SIZE = 70 * 1024 * 1024;

async function hasApkSignature(file) {
  if (!file?.slice || typeof file.slice(0, 4).arrayBuffer !== 'function') return false;
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return header.length === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
}

function fromRow(row) {
  if (!row) return null;
  return { id: row.id, version: row.version, message: row.message, publishedAt: row.published_at, file: row.file };
}

export async function loadPublishedPlatformUpdate() {
  const { data, error } = await supabase.from('platform_updates').select('*').order('published_at', { ascending: false }).limit(1).single();
  if (error || !data) return null;
  return fromRow(data);
}

export async function loadPlatformUpdate() {
  const update = await loadPublishedPlatformUpdate();
  if (!update) return null;
  const user = getCurrentUser();
  if (!user) return update;
  const { data } = await supabase.from('platform_update_downloads').select('update_id').eq('user_id', user.id).eq('update_id', update.id).single();
  return data ? null : update;
}

export async function publishPlatformUpdate({ version, message, file }) {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  const cleanVersion = String(version || '').trim();
  if (!cleanVersion || cleanVersion.length > 30 || !file || file.size <= 0) throw new Error('platformUpdate.missingFields');
  if (!file.name?.toLowerCase().endsWith('.apk') || (file.type && file.type !== 'application/vnd.android.package-archive')) throw new Error('platformUpdate.invalidFile');
  if (file.size > MAX_APK_SIZE) throw new Error('platformUpdate.fileTooLarge');
  if (!(await hasApkSignature(file))) throw new Error('platformUpdate.invalidFile');

  let uploaded;
  try {
    uploaded = await uploadApk(file);
  } catch (error) {
    throw error?.message?.startsWith('platformUpdate.') ? error : new Error('platformUpdate.uploadFailed');
  }
  const fileDescriptor = { fileId: uploaded.fileId, filePath: uploaded.filePath, publicUrl: uploaded.publicUrl, originalName: file.name, mimeType: 'application/vnd.android.package-archive', sizeBytes: uploaded.sizeBytes || file.size };

  const { data, error } = await supabase.from('platform_updates').insert({
    version: cleanVersion, message: safeString(message, 300), file: fileDescriptor
  }).select().single();
  if (error) throw new Error('platformUpdate.uploadFailed');
  return fromRow(data);
}

export async function markPlatformUpdateDownloaded(updateId) {
  if (!updateId) return;
  const user = getCurrentUser();
  if (!user) return;
  try {
    await supabase.from('platform_update_downloads').upsert({ user_id: user.id, update_id: updateId }, { onConflict: 'user_id,update_id' });
  } catch (error) {
    console.warn('Play Stars: statut de téléchargement non enregistré', error);
  }
}

export function updateDownloadTarget(update) {
  return {
    name: 'Play Stars — mise à jour',
    downloadName: `play-stars-${update?.version || 'update'}`,
    downloadUrl: update?.file?.publicUrl || ''
  };
}
