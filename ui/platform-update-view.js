import { formatFileSize } from '../services/publication-service.js';
import { escapeHtml, t } from './common.js';

export function renderPlatformUpdateGate(update, downloading = false) {
  if (!update) return '';
  const message = update.message || t('platformUpdate.defaultMessage');
  return `<div class="platform-update-backdrop" data-platform-update-backdrop>
    <section class="platform-update-dialog" role="alertdialog" aria-modal="true" aria-labelledby="platformUpdateTitle" aria-describedby="platformUpdateMessage" data-platform-update-content>
      <div class="platform-update-icon" aria-hidden="true">↻</div>
      <span class="eyebrow">${t('platformUpdate.eyebrow')}</span>
      <h2 id="platformUpdateTitle">${t('platformUpdate.title')}</h2>
      <p id="platformUpdateMessage">${escapeHtml(message)}</p>
      <div class="platform-update-meta"><span>${t('platformUpdate.version', { version: escapeHtml(update.version) })}</span><span>${formatFileSize(update.file?.sizeBytes)}</span></div>
      ${downloading ? `<div class="platform-update-success" role="status">✓ ${t('platformUpdate.downloadStarted')}</div>` : `<button class="button platform-update-download" type="button" data-action="platform-download">${t('platformUpdate.download')}</button>`}
      <small>${t('platformUpdate.requiredHint')}</small>
    </section>
  </div>`;
}

export function renderPlatformUpdateAdminPanel(update) {
  return `<section class="panel platform-update-admin">
    <div class="section-heading"><div><span class="eyebrow">${t('platformUpdate.adminEyebrow')}</span><h2>${t('platformUpdate.adminTitle')}</h2></div>${update ? `<span class="status-chip status-approved">${t('platformUpdate.published')}</span>` : ''}</div>
    <p class="muted">${t('platformUpdate.adminText')}</p>
    ${update ? `<div class="platform-update-current"><strong>${t('platformUpdate.currentVersion', { version: escapeHtml(update.version) })}</strong><span>${escapeHtml(update.file?.originalName || t('platformUpdate.apkFile'))}</span><time>${escapeHtml(new Date(update.publishedAt).toLocaleDateString('fr-FR'))}</time></div>` : `<div class="notice">${t('platformUpdate.nonePublished')}</div>`}
    <form class="platform-update-form" data-platform-update-form>
      <label class="form-field"><span>${t('platformUpdate.versionLabel')}</span><input name="version" required maxlength="30" placeholder="${t('platformUpdate.versionPlaceholder')}" value="${escapeHtml(update?.version || '')}"></label>
      <label class="form-field"><span>${t('platformUpdate.messageLabel')}</span><textarea name="message" rows="3" maxlength="300" placeholder="${t('platformUpdate.messagePlaceholder')}">${escapeHtml(update?.message || t('platformUpdate.defaultMessage'))}</textarea></label>
      <label class="form-field"><span>${t('platformUpdate.apkLabel')}</span><input name="platformApk" type="file" accept=".apk,application/vnd.android.package-archive" required><small>${t('platformUpdate.apkHint')}</small></label>
      <p class="form-error" data-platform-update-error role="alert"></p>
      <button class="button" type="submit">${t('platformUpdate.publish')}</button>
    </form>
  </section>`;
}
