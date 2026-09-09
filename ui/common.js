import { safeGradient, safeMediaUrl } from '../services/security-service.js';

let translations = {};
let translationsLoaded = false;
let translationsPromise = null;

export function loadTranslations(locale = 'fr') {
  if (translationsPromise) return translationsPromise;
  translationsPromise = fetch(`locales/${locale}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Impossible de charger locales/${locale}.json (${response.status})`);
      return response.json();
    })
    .then((data) => {
      translations = data;
      translationsLoaded = true;
      applyStaticTranslations();
    })
    .catch((error) => {
      console.error('Play Stars: échec du chargement des traductions', error);
      translations = {};
      translationsLoaded = true;
    });
  return translationsPromise;
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const value = t(element.dataset.i18n);
    if (value !== element.dataset.i18n) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const value = t(element.dataset.i18nPlaceholder);
    if (value !== element.dataset.i18nPlaceholder) element.setAttribute('placeholder', value);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const value = t(element.dataset.i18nTitle);
    if (value !== element.dataset.i18nTitle) element.setAttribute('title', value);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    const value = t(element.dataset.i18nAriaLabel);
    if (value !== element.dataset.i18nAriaLabel) element.setAttribute('aria-label', value);
  });
}

export function translationsReady() { return translationsLoaded; }

function lookup(key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), translations);
}

export const t = (key, values = {}) => {
  const found = lookup(key);
  const translated = typeof found === 'string' ? found : key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), translated);
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' }[character]));
}

export function icon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    categories: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    rankings: '<path d="M12 2c-2.5 3-4 5.7-4 8a4 4 0 0 0 8 0c0-1-.5-2-1-3 .3 1.6-.4 2.5-1.3 2.8.5-2-.7-4.3-2.7-5.3.6 1.4.4 2.8-.5 3.8C10 7 10.8 4.3 12 2Z"/><path d="M8.5 15.5a3.5 3.5 0 0 0 7 0"/>',
    updates: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v5h5M4 13a8 8 0 0 0 14.9 4M20 20v-5h-5"/>',
    favorites: '<path d="M20.8 8.8c0 5.5-8.8 10.2-8.8 10.2S3.2 14.3 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    moderation: '<path d="M12 3 4 6v6c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'
  };
  return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths[name] ?? '<circle cx="12" cy="12" r="3"/>'}</svg></span>`;
}

export function navItem(view, active) {
  return `<button class="nav-item ${active === view ? 'active' : ''}" type="button" data-action="navigate" data-view="${view}" aria-current="${active === view ? 'page' : 'false'}">${icon(view)}<span>${t(`nav.${view}`)}</span></button>`;
}

export function appIcon(app, large = false) {
  const iconUrl = safeMediaUrl(app.icon?.publicUrl);
  const image = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy">`
    : escapeHtml(app.initials);
  return `<span class="app-icon ${large ? 'app-icon-large' : ''}" style="background:${escapeHtml(safeGradient(app.gradient))}" aria-hidden="true">${image}</span>`;
}

export function appCard(app, favorites = []) {
  const favorite = favorites.includes(app.id);
  const id = escapeHtml(app.id);
  return `<article class="app-card" data-app-id="${id}">
    <button class="app-card-top" type="button" data-action="open-app" data-app-id="${id}" aria-label="${t('common.details')} : ${escapeHtml(app.name)}">
      ${appIcon(app)}
      <span class="app-card-title"><h3>${escapeHtml(app.name)}</h3><span class="app-developer">${escapeHtml(app.developer)}</span></span>
    </button>
    <p class="app-card-description">${escapeHtml(app.description)}</p>
    <div class="app-meta"><span class="rating">★ ${escapeHtml(app.rating)}<span>(${formatNumber(app.reviews)})</span></span><span>${escapeHtml(app.categoryName)}</span></div>
    <div class="card-actions">
      <button class="button button-small" type="button" data-action="open-app" data-app-id="${id}">${t('common.details')}</button>
      <button class="button button-ghost button-small" type="button" data-action="share-app" data-app-id="${id}">${t('share.button')}</button>
      <button class="favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-action="favorite" data-app-id="${id}" aria-label="${favorite ? t('common.unfavorite') : t('common.favorite')}">${favorite ? '♥' : '♡'}</button>
    </div>
  </article>`;
}

export function formatNumber(value) { return new Intl.NumberFormat('fr-FR').format(value); }
export function formatDate(value) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }

export function sectionHeading(title, actionKey, actionView) {
  return `<div class="section-heading"><h2>${title}</h2>${actionView ? `<button class="link-button" type="button" data-action="navigate" data-view="${actionView}">${t(actionKey)}</button>` : ''}</div>`;
}

export function renderLoadingGrid(count = 4) {
  return `<div class="app-grid loading-grid" aria-hidden="true">${Array.from({ length: count }, () => '<article class="skeleton-card"></article>').join('')}</div>`;
}

function renderSkeletonPanel(lines = 4) {
  return `<div class="skeleton-panel" aria-hidden="true"><span class="skeleton-line skeleton-line-short"></span><span class="skeleton-line skeleton-line-title"></span>${Array.from({ length: lines }, (_, index) => `<span class="skeleton-line ${index === lines - 1 ? 'skeleton-line-medium' : ''}"></span>`).join('')}</div>`;
}

export function renderLoadingShell(view = 'home') {
  const label = escapeHtml(t('common.loading'));
  if (view === 'search') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div><div class="skeleton-panel"><span class="skeleton-line skeleton-line-short"></span><span class="skeleton-line skeleton-line-title"></span>${Array.from({ length: 4 }, () => '<span class="skeleton-line"></span>').join('')}</div></div>`;
  if (view === 'detail') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-back"></div><div class="skeleton-detail-hero"><span class="skeleton-detail-icon"></span><div class="skeleton-detail-copy"><span class="skeleton-line skeleton-line-short"></span><span class="skeleton-line skeleton-line-title"></span><span class="skeleton-line skeleton-line-medium"></span></div></div><div class="skeleton-detail-grid">${renderSkeletonPanel(5)}${renderSkeletonPanel(6)}</div>${renderSkeletonPanel(4)}</div>`;
  if (view === 'profile') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div><div class="skeleton-profile"><span class="skeleton-profile-avatar"></span><div><span class="skeleton-line skeleton-line-title"></span><span class="skeleton-line skeleton-line-medium"></span></div></div><div class="skeleton-detail-grid">${renderSkeletonPanel(5)}${renderSkeletonPanel(5)}</div>${renderSkeletonPanel(3)}</div>`;
  if (view === 'categories') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div><div class="skeleton-category-grid">${Array.from({ length: 8 }, () => '<span class="skeleton-category"></span>').join('')}</div></div>`;
  if (view === 'updates') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div>${renderSkeletonPanel(3)}${renderSkeletonPanel(4)}<div class="skeleton-list">${Array.from({ length: 4 }, () => '<span class="skeleton-list-item"></span>').join('')}</div></div>`;
  if (view === 'publication' || view === 'developer' || view === 'moderation') return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div>${renderSkeletonPanel(5)}${renderSkeletonPanel(4)}<div class="skeleton-list">${Array.from({ length: 2 }, () => '<span class="skeleton-list-item"></span>').join('')}</div></div>`;
  return `<div class="content-wrap loading-shell" role="status" aria-label="${label}"><div class="skeleton-heading"><span></span><i></i></div>${renderLoadingGrid(4)}<div class="skeleton-section"><span></span>${renderLoadingGrid(4)}</div></div>`;
}
