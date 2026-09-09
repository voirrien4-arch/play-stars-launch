import { categories } from '../data/catalog.js';
import { getCurrentUser, getDeveloperSummary } from '../services/auth-service.js';
import { listPublications, formatFileSize } from '../services/publication-service.js';
import { escapeHtml, formatDate, t } from './common.js';
import { renderAuthGate } from './auth-view.js';
import { safeMediaUrl } from '../services/security-service.js';
import { runStorageConnectivityDiagnostic } from '../services/connectivity-diagnostic.js';

function statusLabel(status) {
  return t(`publication.status.${status}`);
}

function renderPublicationIcon(publication) {
  const url = publication.icon?.publicUrl;
  const safeUrl = safeMediaUrl(url);
  if (safeUrl) {
    return `<img class="publication-icon-image" src="${escapeHtml(safeUrl)}" alt="${escapeHtml(publication.appName)}">`;
  }
  return '<span class="publication-icon-fallback" aria-hidden="true">✦</span>';
}

function renderPublicationCard(publication, canUpdate) {
  return `<article class="publication-card">
    <div class="publication-card-head"><div class="publication-icon">${renderPublicationIcon(publication)}</div><div><h3>${escapeHtml(publication.appName)}</h3><p>${escapeHtml(publication.packageName)}</p></div><span class="status-chip status-${escapeHtml(publication.status)}">${statusLabel(publication.status)}</span></div>
    <div class="publication-meta"><span>v${escapeHtml(publication.version)}</span><span>${publication.versions?.length ?? 1} ${t('publication.versions')}</span><span>${formatFileSize(publication.file?.sizeBytes)}</span><span>${formatDate(publication.updatedAt || publication.createdAt)}</span></div>
    ${publication.releaseNotes ? `<p class="publication-notes">${escapeHtml(publication.releaseNotes)}</p>` : ''}
    ${canUpdate ? `<div class="publication-card-actions"><button class="button button-small" type="button" data-action="update-publication" data-publication-id="${escapeHtml(publication.id)}">${t('publication.updateButton')}</button><span class="publication-update-hint">${t('publication.updateCardHint')}</span></div>` : ''}
  </article>`;
}

function renderConnectivityDiagnostic() {
  return `<div class="connectivity-diagnostic" data-connectivity-diagnostic aria-live="polite">
    <span class="muted">Vérification de la connexion au stockage…</span>
  </div>`;
}

function renderForm() {
  return `<section class="panel publication-form-panel"><div class="section-heading"><div><span class="eyebrow">${t('publication.eyebrow')}</span><h2>${t('publication.formTitle')}</h2></div></div><p class="muted publication-intro">${t('publication.reviewNotice')}</p><form class="publication-form" data-publication-form>
    <label class="form-field"><span>${t('publication.appName')}</span><input name="appName" required maxlength="80" placeholder="${t('publication.appNamePlaceholder')}"></label>
    <div class="form-grid"><label class="form-field"><span>${t('publication.packageName')}</span><input name="packageName" required maxlength="120" spellcheck="false" placeholder="${t('publication.packageNamePlaceholder')}"></label><label class="form-field"><span>${t('publication.version')}</span><input name="version" required maxlength="24" placeholder="${t('publication.versionPlaceholder')}"></label></div>
    <div class="form-grid"><label class="form-field"><span>${t('publication.category')}</span><select name="category">${categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join('')}</select></label><label class="form-field"><span>${t('publication.apkFile')}</span><input name="apk" type="file" accept=".apk,application/vnd.android.package-archive" required></label></div>
    <p class="file-hint">${t('publication.apkHint')}</p>
    <label class="form-field"><span>${t('publication.officialUrl')}</span><input name="officialUrl" type="url" required maxlength="300" placeholder="${t('publication.officialUrlPlaceholder')}" inputmode="url"><span class="file-hint">${t('publication.officialUrlHint')}</span></label>
    <label class="form-field"><span>${t('publication.appIcon')}</span><input name="icon" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" required data-icon-input><span class="file-hint">${t('publication.appIconHint')}</span><div class="icon-upload-preview" data-icon-preview aria-live="polite"></div></label>
    <label class="form-field"><span>${t('publication.screenshots')}</span><input name="screenshots" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple required data-screenshot-input><span class="file-hint">${t('publication.screenshotsHint')}</span><div class="screenshot-upload-preview" data-screenshot-preview aria-live="polite"></div></label>
    <label class="form-field"><span>${t('publication.releaseNotes')}</span><textarea name="releaseNotes" rows="4" maxlength="800" placeholder="${t('publication.releaseNotesPlaceholder')}"></textarea></label>
    <div class="upload-progress" data-upload-progress hidden><div class="upload-progress-track"><div class="upload-progress-bar" data-upload-progress-bar></div></div><span class="upload-progress-label" data-upload-progress-label>0%</span></div>
    <p class="form-error" data-publication-error role="alert"></p><div class="publication-form-actions"><button class="button button-ghost" type="button" data-action="developer">${t('publication.cancel')}</button><button class="button" type="submit">${t('publication.submit')}</button></div>
  </form></section>`;
}

export function renderUpdatePublicationModal(publication) {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal update-publication-modal" role="dialog" aria-modal="true" aria-labelledby="updatePublicationTitle" data-modal-content><div class="modal-header"><div><span class="eyebrow">${t('publication.updateEyebrow')}</span><h2 id="updatePublicationTitle">${t('publication.updateTitle', { name: escapeHtml(publication.appName) })}</h2></div><button class="modal-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button></div><p class="auth-intro">${t('publication.updateIntro', { version: escapeHtml(publication.version) })}</p><form data-publication-update-form data-publication-id="${escapeHtml(publication.id)}">
    <label class="form-field"><span>${t('publication.updateVersion')}</span><input name="version" required maxlength="24" placeholder="${t('publication.updateVersionPlaceholder')}" autocomplete="off"></label>
    <label class="form-field"><span>${t('publication.updateApk')}</span><input name="apk" type="file" accept=".apk,application/vnd.android.package-archive" required></label>
    <p class="file-hint">${t('publication.updateApkHint')}</p>
    <label class="form-field"><span>${t('publication.officialUrl')}</span><input name="officialUrl" type="url" maxlength="300" value="${escapeHtml(publication.officialUrl || '')}" placeholder="${t('publication.officialUrlPlaceholder')}" inputmode="url"><span class="file-hint">${t('publication.officialUrlUpdateHint')}</span></label>
    <label class="form-field"><span>${t('publication.appIcon')}</span><input name="icon" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" data-icon-input><span class="file-hint">${t('publication.appIconUpdateHint')}</span><div class="icon-upload-preview" data-icon-preview aria-live="polite"></div></label>
    <label class="form-field"><span>${t('publication.screenshots')}</span><input name="screenshots" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple data-screenshot-input><span class="file-hint">${t('publication.screenshotsUpdateHint')}</span><div class="screenshot-upload-preview" data-screenshot-preview aria-live="polite"></div></label>
    <label class="form-field"><span>${t('publication.releaseNotes')}</span><textarea name="releaseNotes" rows="4" maxlength="800" placeholder="${t('publication.updateNotesPlaceholder')}">${escapeHtml(publication.releaseNotes || '')}</textarea></label>
    <div class="upload-progress" data-upload-progress hidden><div class="upload-progress-track"><div class="upload-progress-bar" data-upload-progress-bar></div></div><span class="upload-progress-label" data-upload-progress-label>0%</span></div>
    <p class="form-error" data-publication-error role="alert"></p><div class="publication-form-actions"><button class="button button-ghost" type="button" data-action="close-modal">${t('publication.updateCancel')}</button><button class="button" type="submit">${t('publication.updateSubmit')}</button></div>
  </form></section></div>`;
}

function renderPublicationHelp() {
  return `<section class="publication-help panel"><div class="section-heading"><div><span class="eyebrow">${t('publication.helpEyebrow')}</span><h2>${t('publication.helpTitle')}</h2></div></div><p class="muted publication-help-intro">${t('publication.helpIntro')}</p><div class="publication-help-grid"><div><strong>01</strong><h3>${t('publication.helpStep1Title')}</h3><p>${t('publication.helpStep1Text')}</p></div><div><strong>02</strong><h3>${t('publication.helpStep2Title')}</h3><p>${t('publication.helpStep2Text')}</p></div><div><strong>03</strong><h3>${t('publication.helpStep3Title')}</h3><p>${t('publication.helpStep3Text')}</p></div></div><div class="notice publication-update-notice">${t('publication.helpNotice')}</div><div class="notice publication-update-notice">${t('publication.reviewPrompt')}</div></section>`;
}

export async function renderPublicationView() {
  const user = getCurrentUser();
  if (!user) return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('publication.eyebrow')}</span><h1>${t('publication.title')}</h1><p>${t('publication.subtitle')}</p></div></div>${renderAuthGate()}</div>`;
  const summary = getDeveloperSummary(user);
  const publications = await listPublications(user.id);
  const canPublish = user.developerStatus === 'approved' && summary.availableSlots > 0;
  const canUpdate = user.developerStatus === 'approved';
  return `<div class="content-wrap"><button class="link-button" type="button" data-action="developer" style="margin-bottom:18px">← ${t('common.back')}</button><div class="page-heading"><div><span class="eyebrow">${t('publication.eyebrow')}</span><h1>${t('publication.title')}</h1><p>${t('publication.subtitle')}</p></div><span class="status-chip">${summary.availableSlots} ${t('developer.availableSlots').toLowerCase()}</span></div>
    ${renderPublicationHelp()}
    ${canPublish ? renderConnectivityDiagnostic() + renderForm() : `<section class="publication-locked"><div class="auth-gate-icon" aria-hidden="true">⌁</div><h2>${t(user.developerStatus === 'approved' ? 'publication.noSlot' : 'publication.badgeRequired')}</h2><p>${t(user.developerStatus === 'approved' ? 'publication.noSlotText' : 'publication.badgeRequiredText')}</p><button class="button" type="button" data-action="developer">${t('publication.backToDeveloper')}</button></section>`}
    <section class="section"><div class="section-heading"><h2>${t('publication.yourApps')}</h2><span class="muted">${publications.length}</span></div>${publications.length ? `<div class="publication-list">${publications.map((publication) => renderPublicationCard(publication, canUpdate)).join('')}</div>` : `<div class="empty-state publication-empty"><div class="empty-icon">✦</div><h2>${t('publication.empty')}</h2><p>${t('publication.emptyText')}</p></div>`}</section>
  </div>`;
}

export function publicationErrorMessage(error) {
  const key = error?.message?.startsWith('publication.') ? error.message : 'publication.uploadFailed';
  return t(key);
}
