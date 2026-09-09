import { escapeHtml, formatDate, t } from './common.js';

const categories = ['suggestion', 'problem', 'catalog', 'developer', 'other'];

export function renderFeedbackModal(user = null, presetCategory = '') {
  const contactValue = user?.email || '';
  const categoryOptions = categories.map((category) => `<option value="${category}" ${presetCategory === category ? 'selected' : ''}>${t(`feedback.categories.${category}`)}</option>`).join('');
  const ratingOptions = [5, 4, 3, 2, 1].map((rating) => `<label><input type="radio" name="rating" value="${rating}"><span>${t('feedback.ratingChoice', { rating })}</span></label>`).join('');
  return `<div class="modal-backdrop feedback-backdrop" data-action="close-modal">
    <section class="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle" data-modal-content>
      <div class="feedback-header">
        <div>
          <span class="eyebrow">${t('feedback.eyebrow')}</span>
          <h2 id="feedbackTitle">${t('feedback.title')}</h2>
        </div>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button>
      </div>
      <p class="feedback-lead">${t('feedback.subtitle')}</p>
      ${!user ? `<div class="feedback-login-hint">${t('feedback.loginHint')}</div>` : ''}
      <form class="feedback-form" data-feedback-form>
        <label class="form-field">
          <span>${t('feedback.categoryLabel')}</span>
          <select name="category" required>${categoryOptions}</select>
        </label>
        <fieldset class="feedback-rating">
          <legend>${t('feedback.ratingLabel')}</legend>
          <div class="feedback-rating-options">
            ${ratingOptions}
            <label><input type="radio" name="rating" value="" checked><span>${t('feedback.noRating')}</span></label>
          </div>
        </fieldset>
        <label class="form-field">
          <span>${t('feedback.messageLabel')}</span>
          <textarea name="message" rows="5" maxlength="2000" required placeholder="${t('feedback.messagePlaceholder')}"></textarea>
          <small>${t('feedback.messageHint')}</small>
        </label>
        ${!user ? `<label class="form-field"><span>${t('feedback.contactLabel')}</span><input type="email" name="contactEmail" value="${escapeHtml(contactValue)}" placeholder="${t('feedback.contactPlaceholder')}"></label>` : ''}
        <p class="form-error" data-feedback-error role="alert"></p>
        <div class="feedback-form-actions">
          <button class="button button-primary" type="submit">${t('feedback.submit')}</button>
          <button class="button button-ghost" type="button" data-action="close-modal">${t('common.close')}</button>
        </div>
      </form>
    </section>
  </div>`;
}

function feedbackCategory(item) {
  return t(`feedback.categories.${item.category}`);
}

function renderFeedbackCard(item) {
  const statusKey = item.status === 'new' ? 'feedback.statusNew' : 'feedback.statusRead';
  const rating = item.rating
    ? `<div class="feedback-admin-rating" aria-label="${t('feedback.ratingAria', { rating: item.rating })}">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</div>`
    : '';
  const readButton = item.status === 'new'
    ? `<button class="button button-ghost button-small" type="button" data-action="feedback-read" data-feedback-id="${escapeHtml(item.id)}">${t('feedback.markRead')}</button>`
    : '';
  const replyEmail = item.contactEmail || item.accountEmail || '';
  const replyButton = replyEmail
    ? `<a class="button button-ghost button-small" href="mailto:${escapeHtml(replyEmail)}?subject=${encodeURIComponent(t('feedback.replySubject'))}">${t('feedback.reply')}</a>`
    : '';
  return `<article class="feedback-admin-card ${item.status === 'new' ? 'is-new' : ''}">
    <div class="feedback-admin-head">
      <div>
        <span class="feedback-category">${escapeHtml(feedbackCategory(item))}</span>
        <h3>${escapeHtml(item.username)}</h3>
        <small>${escapeHtml(item.accountEmail || item.contactEmail || t('feedback.noContact'))}</small>
      </div>
      <div class="feedback-admin-meta">
        <span class="status-chip status-${item.status === 'new' ? 'pending' : 'approved'}">${t(statusKey)}</span>
        <time>${escapeHtml(formatDate(item.createdAt))}</time>
      </div>
    </div>
    ${rating}
    <p>${escapeHtml(item.message)}</p>
    <div class="moderation-actions">${replyButton}${readButton}</div>
  </article>`;
}

export function renderAdminFeedbackList(feedback = []) {
  if (!feedback.length) {
    return `<div class="empty-state feedback-empty">
      <div class="empty-icon">✦</div>
      <h2>${t('feedback.adminEmptyTitle')}</h2>
      <p>${t('feedback.adminEmptyText')}</p>
    </div>`;
  }
  return `<div class="feedback-admin-list">${feedback.map(renderFeedbackCard).join('')}</div>`;
}
