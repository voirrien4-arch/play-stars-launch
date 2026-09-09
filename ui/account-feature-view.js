import { escapeHtml, t } from './common.js';

const FEATURES = {
  'accountMenu.payments': {
    icon: '▣',
    title: 'accountFeatures.payments.title',
    eyebrow: 'accountFeatures.payments.eyebrow',
    text: 'accountFeatures.payments.text',
    status: 'accountFeatures.payments.status',
    rows: ['accountFeatures.payments.rowOne', 'accountFeatures.payments.rowTwo'],
    action: { label: 'accountFeatures.payments.action', type: 'navigate', view: 'profile' }
  },
  'accountMenu.protect': {
    icon: '✓',
    title: 'accountFeatures.protect.title',
    eyebrow: 'accountFeatures.protect.eyebrow',
    text: 'accountFeatures.protect.text',
    status: 'accountFeatures.protect.status',
    rows: ['accountFeatures.protect.rowOne', 'accountFeatures.protect.rowTwo'],
    action: { label: 'accountFeatures.protect.action', type: 'navigate', view: 'developer' }
  },
  'accountMenu.settings': {
    icon: '⚙',
    title: 'accountFeatures.settings.title',
    eyebrow: 'accountFeatures.settings.eyebrow',
    text: 'accountFeatures.settings.text',
    rows: ['accountFeatures.settings.rowOne', 'accountFeatures.settings.rowTwo'],
    action: { label: 'accountFeatures.settings.action', type: 'theme' }
  },
  'accountMenu.help': {
    icon: '?',
    title: 'accountFeatures.help.title',
    eyebrow: 'accountFeatures.help.eyebrow',
    text: 'accountFeatures.help.text',
    rows: ['accountFeatures.help.rowOne', 'accountFeatures.help.rowTwo'],
    action: { label: 'accountFeatures.help.action', type: 'email' }
  },
  games: {
    icon: '◆',
    title: 'accountFeatures.games.title',
    eyebrow: 'accountFeatures.games.eyebrow',
    text: 'accountFeatures.games.text',
    rows: ['accountFeatures.games.rowOne', 'accountFeatures.games.rowTwo'],
    action: { label: 'accountFeatures.games.action', type: 'navigate', view: 'categories' }
  }
};

function renderAction(action) {
  if (action.type === 'email') {
    const subject = encodeURIComponent(t('accountFeatures.help.emailSubject'));
    return `<a class="button button-primary account-feature-action" href="mailto:playstars.support.officiel@gmail.com?subject=${subject}">${t(action.label)}</a>`;
  }
  const view = action.view ? ` data-view="${escapeHtml(action.view)}"` : '';
  const featureAction = action.featureAction ? ` data-feature-action="${escapeHtml(action.featureAction)}"` : '';
  return `<button class="button button-primary account-feature-action" type="button" data-action="${escapeHtml(action.type)}"${view}${featureAction}>${t(action.label)}</button>`;
}

export function renderAccountFeature(item) {
  const feature = FEATURES[item] || FEATURES['accountMenu.settings'];
  return `<div class="modal-backdrop account-feature-backdrop" data-action="close-modal">
    <section class="account-feature-modal" role="dialog" aria-modal="true" aria-labelledby="accountFeatureTitle" data-modal-content>
      <div class="account-feature-header"><div class="account-feature-icon" aria-hidden="true">${feature.icon}</div><button class="modal-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button></div>
      <span class="eyebrow">${t(feature.eyebrow)}</span>
      <h2 id="accountFeatureTitle">${t(feature.title)}</h2>
      <p class="account-feature-lead">${t(feature.text)}</p>
      ${feature.status ? `<div class="account-feature-status"><span class="account-feature-status-dot" aria-hidden="true"></span><strong>${t(feature.status)}</strong></div>` : ''}
      <div class="account-feature-list">${feature.rows.map((key) => `<div class="account-feature-row"><span class="account-feature-check" aria-hidden="true">✓</span><span>${t(key)}</span></div>`).join('')}</div>
      ${renderAction(feature.action)}
      <button class="button button-ghost account-feature-secondary" type="button" data-action="close-modal">${t('accountFeatures.close')}</button>
    </section>
  </div>`;
}
