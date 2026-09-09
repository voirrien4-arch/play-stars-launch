import { getCurrentUser, getUserProfiles } from '../services/auth-service.js';
import { escapeHtml, t } from './common.js';
import { safeMediaUrl } from '../services/security-service.js';

const icons = {
  shield: '<path d="M12 3 19 6v5c0 4.7-2.9 8.2-7 10-4.1-1.8-7-5.3-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m4.9 4.9 1.4 1.4M17.7 17.7l1.4 1.4M4 12H2M22 12h-2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 4V2M12 22v-2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.7-1.5 1.1-1.5 2.4M12 16.5v.1"/>',
  feedback: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 12.5Z"/><path d="M8 8h8M8 11h5"/>',
  game: '<path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.1 3.3a2 2 0 0 1-3.4.7L14 15h-4l-2.3 2.2a2 2 0 0 1-3.4-.7l-1.1-3.3A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16 12h.1M18 14h.1"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>'
};

function svgIcon(name) {
  return `<span class="account-menu-icon account-menu-icon-${name}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${icons[name] || icons.grid}</svg></span>`;
}

function menuRow(iconName, titleKey, badge = '', itemKey = titleKey, destination = '') {
  const action = destination ? 'navigate' : 'account-item';
  const destinationAttribute = destination ? ` data-view="${escapeHtml(destination)}"` : '';
  const itemAttribute = destination ? '' : ` data-account-item="${escapeHtml(itemKey)}"`;
  return `<button class="account-menu-row" type="button" data-action="${action}"${destinationAttribute}${itemAttribute}><span class="account-menu-row-main">${svgIcon(iconName)}<span>${t(titleKey)}</span></span>${badge ? `<span class="account-menu-badge">${badge}</span>` : ''}</button>`;
}

function accountData(user) {
  const name = String(user?.username || t('auth.guest')).trim();
  const email = String(user?.email || t('accountMenu.guestEmail')).trim();
  const initial = String(user?.avatarInitial || name.charAt(0) || 'P').charAt(0).toUpperCase();
  const avatarUrl = typeof user?.avatarUrl === 'object' ? user.avatarUrl?.publicUrl : user?.avatarUrl;
  return {
    id: user?.id || 'guest',
    name: escapeHtml(name),
    email: escapeHtml(email),
    initial: escapeHtml(initial),
    avatarUrl: safeMediaUrl(avatarUrl),
    signedIn: Boolean(user)
  };
}

function accountAvatar(data, className) {
  if (data.avatarUrl) return `<span class="${className}"><img src="${escapeHtml(data.avatarUrl)}" alt="" loading="lazy"></span>`;
  return `<span class="${className}">${data.initial}</span>`;
}

function renderProfileItem(profile, currentUser, index) {
  const isCurrent = Boolean(currentUser?.id && profile.id === currentUser.id);
  const data = accountData(profile);
  const avatarClass = index === 0 || isCurrent ? 'account-menu-avatar-green' : 'account-menu-avatar-purple';
  const action = isCurrent ? 'navigate' : profile.id === 'guest' ? 'open-auth' : 'switch-account';
  const switchEmail = action === 'switch-account' ? ` data-account-email="${data.email}"` : '';
  const destination = action === 'navigate' ? ' data-view="profile"' : action === 'open-auth' ? ' data-auth-mode="signin"' : '';
  const label = isCurrent ? t('accountMenu.current') : t('accountMenu.switchTo', { name: data.name });
  return `<button class="account-menu-profile ${isCurrent ? 'is-current' : ''}" type="button" data-action="${action}"${switchEmail}${destination} aria-label="${label}">
    ${accountAvatar(data, `account-menu-avatar ${avatarClass}`)}
    <span class="account-menu-profile-copy"><strong>${data.name}</strong><small>${data.email}</small></span>
    ${isCurrent ? '<span class="account-menu-profile-check" aria-hidden="true">✓</span>' : ''}
  </button>`;
}

export function renderAccountMenu(user = getCurrentUser()) {
  const account = accountData(user);
  const profiles = getUserProfiles();
  const visibleProfiles = profiles.length ? profiles : [{ id: 'guest', username: account.name, email: account.email, avatarInitial: account.initial }];
  return `<div class="modal-backdrop account-menu-backdrop" data-action="close-modal">
    <section class="account-menu-modal" role="dialog" aria-modal="true" aria-labelledby="accountMenuTitle">
      <div class="account-menu-header-row"><span class="account-menu-kicker" id="accountMenuTitle">${t('accountMenu.title')}</span><button class="modal-close account-menu-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button></div>
      <div class="account-menu-identity">
        ${accountAvatar(account, 'account-menu-avatar account-menu-avatar-green')}
        <div class="account-menu-identity-copy"><strong>${t('accountMenu.email', { email: account.email })}</strong><span>${t('accountMenu.greeting', { name: account.name })}</span></div>
      </div>
      <button class="account-menu-manage" type="button" data-action="navigate" data-view="profile">${t('accountMenu.manage')}</button>

      <div class="account-menu-section account-menu-recommended"><div class="account-menu-feature">${svgIcon('shield')}<strong>${t('accountMenu.recommended')}</strong></div></div>

      <div class="account-menu-section account-menu-switcher"><div class="account-menu-section-heading"><h3>${t('accountMenu.switchTitle')}</h3>${svgIcon('chevron')}</div><div class="account-menu-profile-list" role="list">${visibleProfiles.map((profile, index) => renderProfileItem(profile, user, index)).join('')}</div></div>

      <div class="account-menu-section"><h3>${t('accountMenu.moreTitle')}</h3><button class="account-menu-content-item" type="button" data-action="account-item" data-account-item="games"><span class="account-menu-content-icon">${svgIcon('game')}</span><span><strong>${t('accountMenu.gamesTitle')}</strong><span>${t('accountMenu.gamesText')}</span></span></button></div>

      <div class="account-menu-section account-menu-main"><h3>${t('accountMenu.mainTitle')}</h3>${menuRow('grid', 'accountMenu.apps', '', 'accountMenu.apps', 'categories')} ${menuRow('bell', 'accountMenu.notifications', '1')} ${menuRow('card', 'accountMenu.payments')} ${menuRow('shield', 'accountMenu.protect')} ${menuRow('folder', 'accountMenu.library', '', 'accountMenu.library', 'favorites')} ${menuRow('shield', 'accountMenu.personalization', '', 'accountMenu.personalization', 'profile')} ${menuRow('settings', 'accountMenu.settings')} ${menuRow('help', 'accountMenu.help')} ${menuRow('feedback', 'accountMenu.feedback')}</div>
    </section>
  </div>`;
}
