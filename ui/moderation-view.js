import { getCurrentUser } from '../services/auth-service.js';
import { listModerationQueue, listBadgeQueue } from '../services/moderation-service.js';
import { listAdminFeedback } from '../services/admin-feedback-service.js';
import { formatFileSize } from '../services/publication-service.js';
import { escapeHtml, formatDate, t } from './common.js';
import { renderAuthGate } from './auth-view.js';
import { loadPublishedPlatformUpdate } from '../services/platform-update-service.js';
import { renderPlatformUpdateAdminPanel } from './platform-update-view.js';
import { renderAdminFeedbackList } from './feedback-view.js';
import { listQuarantinedAccounts } from '../services/account-security-service.js';
import { listAppReports } from '../services/report-service.js';

function reportCard(report) {
  return `<article class="moderation-card">
    <div class="moderation-card-head"><div class="publication-icon">⚑</div><div><h3>${escapeHtml(report.appName || report.appId)}</h3><p>${t('moderation.requestedOn')} ${formatDate(report.createdAt)}</p></div></div>
    <div class="moderation-reason">${escapeHtml(report.reason)}</div>
    <div class="moderation-actions"><button class="button button-small" type="button" data-action="resolve-app-report" data-report-id="${escapeHtml(String(report.id))}">${t('report.resolve')}</button></div>
  </article>`;
}

function securityCard(account) {
  const matchCount = account.alert?.details?.matchedAccounts;
  return `<article class="moderation-card security-card">
    <div class="moderation-card-head"><div class="publication-icon">${escapeHtml(account.avatarInitial || '!')}</div><div><h3>${escapeHtml(account.username)}</h3><p>${escapeHtml(account.quarantineReason || t('security.quarantineTitle'))}</p></div><span class="status-chip status-pending">${t('security.quarantineTitle')}</span></div>
    <div class="publication-meta"><span>${t('moderation.requestedOn')} ${formatDate(account.createdAt)}</span>${matchCount ? `<span>${t('security.matchedAccounts', { count: matchCount })}</span>` : ''}</div>
    ${account.verificationRequested ? `<div class="moderation-reason"><strong>${t('security.verificationNoteLabel')}</strong> ${escapeHtml(account.verificationNote || t('security.noNote'))}</div>` : `<p class="muted">${t('security.noVerificationRequest')}</p>`}
    <div class="moderation-actions"><button class="button button-small" type="button" data-action="unlock-account" data-user-id="${escapeHtml(account.id)}">${t('security.unlock')}</button><button class="button button-ghost button-small" type="button" data-action="ban-account" data-user-id="${escapeHtml(account.id)}">${t('security.ban')}</button><button class="button button-ghost button-small" type="button" data-action="delete-account" data-user-id="${escapeHtml(account.id)}">${t('security.delete')}</button></div>
  </article>`;
}

function publicationCard(publication) {
  const isPending = publication.status === 'pending';
  return `<article class="moderation-card">
    <div class="moderation-card-head"><div class="publication-icon">✦</div><div><h3>${escapeHtml(publication.appName)}</h3><p>${escapeHtml(publication.packageName)}</p></div><span class="status-chip status-${escapeHtml(publication.status)}">${t(`publication.status.${publication.status}`)}</span></div>
    <div class="publication-meta"><span>v${escapeHtml(publication.version)}</span><span>${formatFileSize(publication.file?.sizeBytes)}</span><span>${formatDate(publication.updatedAt || publication.createdAt)}</span></div>
    ${publication.releaseNotes ? `<p class="publication-notes">${escapeHtml(publication.releaseNotes)}</p>` : ''}
    <div class="moderation-file"><span>${t('moderation.fileLabel')}</span><strong>${escapeHtml(publication.file?.originalName || t('moderation.fileMissing'))}</strong></div>
    ${publication.moderationReason ? `<div class="moderation-reason"><strong>${t('moderation.reasonLabel')}</strong> ${escapeHtml(publication.moderationReason)}</div>` : ''}
    ${isPending ? `<div class="moderation-actions"><button class="button button-small" type="button" data-action="approve-publication" data-publication-id="${escapeHtml(publication.id)}">${t('moderation.approve')}</button><button class="button button-ghost button-small" type="button" data-action="reject-publication" data-publication-id="${escapeHtml(publication.id)}">${t('moderation.reject')}</button></div>` : ''}
  </article>`;
}

function badgeCard(account) {
  return `<article class="moderation-card badge-request-card"><div class="moderation-card-head"><div class="publication-icon">${escapeHtml(account.avatarInitial)}</div><div><h3>${escapeHtml(account.username)}</h3><p>${escapeHtml(account.email)} · ${escapeHtml(account.country)}</p></div><span class="status-chip status-pending">${t('developer.status.pending')}</span></div><div class="publication-meta"><span>${t('moderation.requestedOn')} ${formatDate(account.createdAt)}</span><span>${account.confirmedReferrals ?? 0} ${t('profile.referrals')}</span></div><div class="moderation-actions"><button class="button button-small" type="button" data-action="approve-badge" data-user-id="${escapeHtml(account.id)}">${t('moderation.approve')}</button><button class="button button-ghost button-small" type="button" data-action="reject-badge" data-user-id="${escapeHtml(account.id)}">${t('moderation.reject')}</button></div></article>`;
}

export async function renderModerationView() {
  const user = getCurrentUser();
  if (!user) return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('moderation.eyebrow')}</span><h1>${t('moderation.title')}</h1><p>${t('moderation.subtitle')}</p></div></div>${renderAuthGate()}</div>`;
  if (user.role !== 'admin') return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('moderation.eyebrow')}</span><h1>${t('moderation.title')}</h1><p>${t('moderation.subtitle')}</p></div></div><section class="publication-locked"><div class="auth-gate-icon" aria-hidden="true">⌁</div><h2>${t('moderation.adminRequired')}</h2><p>${t('moderation.adminRequiredText')}</p></section></div>`;
  const [queue, badgeQueue, platformUpdate, feedback, quarantinedAccounts, appReports] = await Promise.all([listModerationQueue(), listBadgeQueue(), loadPublishedPlatformUpdate(), listAdminFeedback(), listQuarantinedAccounts().catch(() => []), listAppReports().catch(() => [])]);
  const pending = queue.filter((publication) => publication.status === 'pending').length + badgeQueue.length;
  const unreadFeedback = feedback.filter((item) => item.status === 'new').length;
  return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('moderation.eyebrow')}</span><h1>${t('moderation.title')}</h1><p>${t('moderation.subtitle')}</p></div><span class="status-chip status-pending">${pending} ${t('moderation.pendingCount')}</span></div><section class="moderation-banner panel"><div class="auth-gate-icon" aria-hidden="true">✓</div><div><h2>${t('moderation.bannerTitle')}</h2><p>${t('moderation.bannerText')}</p></div></section>${renderPlatformUpdateAdminPanel(platformUpdate)}${quarantinedAccounts.length ? `<section class="section"><div class="section-heading"><h2>${t('security.sectionTitle')}</h2><span class="muted">${quarantinedAccounts.length}</span></div><div class="moderation-list">${quarantinedAccounts.map(securityCard).join('')}</div></section>` : ''}${appReports.length ? `<section class="section"><div class="section-heading"><h2>${t('report.sectionTitle')}</h2><span class="muted">${appReports.length}</span></div><div class="moderation-list">${appReports.map(reportCard).join('')}</div></section>` : ''}${badgeQueue.length ? `<section class="section"><div class="section-heading"><h2>${t('moderation.badgesTitle')}</h2><span class="muted">${badgeQueue.length}</span></div><div class="moderation-list">${badgeQueue.map(badgeCard).join('')}</div></section>` : ''}<section class="section"><div class="section-heading"><h2>${t('moderation.publicationsTitle')}</h2><span class="muted">${queue.length}</span></div>${queue.length ? `<div class="moderation-list">${queue.map(publicationCard).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">✓</div><h2>${t('moderation.emptyTitle')}</h2><p>${t('moderation.emptyText')}</p></div>`}</section><section class="section"><div class="section-heading"><div><h2>${t('feedback.adminTitle')}</h2><p class="muted">${t('feedback.adminText')}</p></div><span class="status-chip ${unreadFeedback ? 'status-pending' : 'status-approved'}">${t('feedback.adminCount', { count: unreadFeedback })}</span></div>${renderAdminFeedbackList(feedback)}</section></div>`;
}
