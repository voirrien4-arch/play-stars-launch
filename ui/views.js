import { appRepository, formatCount } from '../services/app-repository.js';
import { getCurrentUser, getDeveloperSummary } from '../services/auth-service.js';
import { categories } from '../data/catalog.js';
import { appCard, appIcon, formatDate, formatNumber, navItem, sectionHeading, t, escapeHtml } from './common.js';
import { renderAuthGate } from './auth-view.js';
import { renderPublicationView } from './publication-view.js';
import { renderModerationView } from './moderation-view.js';
import { getReviewForCurrentUser, listReviews } from '../services/review-service.js';
import { listPublications, getDownloadCountsByOwner } from '../services/publication-service.js';
import { listReviewsForOwnedApps } from '../services/review-service.js';
import { renderSearchHistorySection, renderSearchPage } from './search-view.js';
import { safeCssColor, safeMediaUrl } from '../services/security-service.js';

export function renderNavigation(active, mobile = false) {
  const views = ['home', 'rankings', 'categories', 'updates', 'favorites'];
  if (!mobile) views.push('profile');
  const user = getCurrentUser();
  if (user?.role === 'admin') views.push('moderation');
  return views.map((view) => navItem(view, active)).join('');
}

export async function renderView(state) {
  if (state.view === 'detail') return renderDetail(state);
  if (state.view === 'categories') return renderCategories(state);
  if (state.view === 'updates') return renderUpdates(state);
  if (state.view === 'favorites') return renderFavorites(state);
  if (state.view === 'rankings') return renderRankings();
  if (state.view === 'profile') return renderProfile(state);
  if (state.view === 'developer') return renderDeveloper();
  if (state.view === 'publication') return renderPublicationView();
  if (state.view === 'moderation') return renderModerationView();
  if (state.view === 'search') return renderSearch(state);
  if (state.searchQuery) return renderSearch(state);
  return renderHome(state);
}

async function renderHome(state) {
  const newest = await appRepository.list({ ranking: 'newest' });
  return `<div class="content-wrap">
    <section class="hero"><div class="hero-content">
      <span class="eyebrow">${t('home.eyebrow')}</span>
      <h1>${t('home.title')}</h1>
      <p>${t('home.subtitle')}</p>
      <div class="hero-badge"><span aria-hidden="true">✓</span>${t('home.freeBadge')}</div>
      <div class="hero-actions"><button class="button button-light" type="button" data-action="navigate" data-view="categories">${t('home.explore')}</button><button class="button button-ghost" type="button" data-action="developer">${t('home.developer')}</button></div>
    </div></section>${renderSearchHistorySection(state)}
    <section class="section">${sectionHeading(t('home.categoriesTitle'), 'home.categoriesLink', 'categories')}<div class="category-row">${categories.slice(0, 7).map(categoryChip).join('')}</div></section>
    <section class="section">${sectionHeading(t('home.newTitle'), 'home.newLink', 'updates')}<div class="app-grid">${newest.slice(0, 4).map((app) => appCard(app, state.favorites)).join('')}</div></section>
    <section class="section rankings-cta"><div class="rankings-cta-copy"><span class="eyebrow">${t('rankings.eyebrow')}</span><h2>${t('rankings.ctaTitle')}</h2><p>${t('rankings.ctaText')}</p></div><button class="button" type="button" data-action="navigate" data-view="rankings">${t('rankings.openButton')}</button></section>
  </div>`;
}

async function renderRankings() {
  const popular = await appRepository.list({ ranking: 'popular' });
  const topRated = [...popular]
    .filter((app) => Number(app.rating || 0) > 0)
    .sort((first, second) => Number(second.rating || 0) - Number(first.rating || 0));
  return `<div class="content-wrap rankings-page">
    <div class="page-heading"><div><span class="eyebrow">${t('rankings.eyebrow')}</span><h1>${t('rankings.title')}</h1><p>${t('rankings.subtitle')}</p></div><button class="button button-ghost button-small" type="button" data-action="back">${t('common.back')}</button></div>
    <div class="rankings-grid"><article class="ranking-panel"><div class="ranking-panel-heading"><span class="ranking-badge" aria-hidden="true">⇣</span><div><h2>${t('rankings.downloadedTitle')}</h2><p>${t('rankings.downloadedText')}</p></div></div>${rankingList(popular.slice(0, 10), 'downloads')}</article><article class="ranking-panel ranking-panel-rating"><div class="ranking-panel-heading"><span class="ranking-badge" aria-hidden="true">★</span><div><h2>${t('rankings.ratedTitle')}</h2><p>${t('rankings.ratedText')}</p></div></div>${rankingList(topRated.slice(0, 10), 'rating')}</article></div>
  </div>`;
}

function rankingList(apps, metric) {
  if (!apps.length) return `<p class="ranking-empty">${t('rankings.empty')}</p>`;
  return `<div class="ranking-list">${apps.map((app, index) => {
    const value = metric === 'rating' ? `★ ${escapeHtml(app.rating)}` : `${formatCount(app.downloads)} ${t('rankings.downloadsShort')}`;
    return `<button class="ranking-item" type="button" data-action="open-app" data-app-id="${escapeHtml(app.id)}" aria-label="${t('common.details')} : ${escapeHtml(app.name)}"><span class="ranking-position">${String(index + 1).padStart(2, '0')}</span>${appIcon(app)}<span class="ranking-copy"><strong>${escapeHtml(app.name)}</strong><span>${escapeHtml(app.developer)}</span></span><span class="ranking-value">${value}</span></button>`;
  }).join('')}</div>`;
}

function categoryChip(category, active = false) {
  return `<button class="category-chip ${active ? 'active' : ''}" type="button" data-action="category" data-category="${category.id}">${category.name}</button>`;
}

async function renderSearch(state) {
  if (!state.searchQuery.trim()) return renderSearchPage(state, []);
  const results = await appRepository.list({ query: state.searchQuery, ranking: state.ranking, category: state.searchCategory });
  return renderSearchPage(state, results);
}

async function renderCategories(state) {
  const selected = state.selectedCategory;
  const category = categories.find((item) => item.id === selected);
  const allApps = await appRepository.list({ ranking: 'popular' });
  const categoryApps = selected ? allApps.filter((app) => app.category === selected) : [];
  const countByCategory = categories.reduce((acc, item) => {
    acc[item.id] = allApps.filter((app) => app.category === item.id).length;
    return acc;
  }, {});
  const totalApps = allApps.length;
  return `<div class="content-wrap categories-page"><div class="page-heading category-heading"><div><span class="eyebrow">${t('nav.categories')}</span><h1>${category ? category.name : t('categories.title')}</h1><p>${category ? t('categories.selectedSubtitle', { count: categoryApps.length }) : t('categories.subtitle')}</p></div><div class="category-total"><strong>${totalApps}</strong><span>${t('categories.totalLabel')}</span></div></div>
    ${selected ? `<div class="category-selected-bar"><div><span class="category-selected-icon">${category.icon}</span><div><strong>${category.name}</strong><span>${t('categories.selectedHint')}</span></div></div><button class="button button-ghost button-small" type="button" data-action="clear-category">${t('categories.seeAll')}</button></div><div class="app-grid">${categoryApps.map((app) => appCard(app, state.favorites)).join('')}</div>` : `<section class="category-intro"><div class="category-intro-copy"><span class="category-kicker">✦ ${t('categories.kicker')}</span><h2>${t('categories.introTitle')}</h2><p>${t('categories.introText')}</p></div><div class="category-intro-orbit" aria-hidden="true"><span>✦</span><i>◈</i><b>＋</b></div></section><div class="category-grid">${categories.map((item, index) => `<button class="category-card category-tone-${index % 5}" type="button" data-action="category" data-category="${item.id}"><span class="category-card-top"><span class="category-card-icon">${item.icon}</span></span><span class="category-card-copy"><strong>${item.name}</strong><span>${countByCategory[item.id] || 0} ${t('common.apps')}</span></span></button>`).join('')}</div>`}
  </div>`;
}

async function renderUpdates(state) {
  const updated = await appRepository.listUpdated();
  const filter = state.updatesFilter || 'recent';
  const ordered = filter === 'popular'
    ? [...updated].sort((a, b) => b.downloads - a.downloads)
    : filter === 'rating'
      ? [...updated].sort((a, b) => b.rating - a.rating)
      : updated;
  const latest = updated[0];
  const totalDownloads = updated.reduce((total, app) => total + Number(app.downloads || 0), 0);
  const readableDate = (app) => app?.updatedAt ? formatDate(app.updatedAt) : escapeHtml(app?.updated || '');
  const latestDate = latest ? readableDate(latest) : '';
  const filterButton = (value, key) => `<button class="update-filter ${filter === value ? 'active' : ''}" type="button" data-action="updates-filter" data-filter="${value}" aria-pressed="${filter === value}">${t(key)}</button>`;
  const updateRow = (app) => {
    const id = escapeHtml(app.id);
    const favorite = state.favorites.includes(app.id);
    return `<article class="update-row">
      ${appIcon(app)}
      <div class="update-row-copy"><div class="update-row-title"><h3>${escapeHtml(app.name)}</h3><span class="update-row-version">${t('updates.version', { version: escapeHtml(app.version) })}</span></div><span class="update-row-developer">${escapeHtml(app.developer)}</span><p class="update-row-notes">${escapeHtml(app.releaseNotes || app.description)}</p><div class="update-row-meta"><span>↻ ${readableDate(app)}</span><span>${escapeHtml(app.size)}</span><span>★ ${escapeHtml(app.rating)}</span></div></div>
      <div class="update-row-actions"><button class="button button-small" type="button" data-action="open-app" data-app-id="${id}">${t('updates.viewApp')}</button><button class="favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-action="favorite" data-app-id="${id}" aria-label="${favorite ? t('common.unfavorite') : t('common.favorite')}">${favorite ? '♥' : '♡'}</button></div>
    </article>`;
  };
  return `<div class="content-wrap updates-page">
    <div class="page-heading"><div class="updates-heading-copy"><span class="eyebrow">${t('updates.eyebrow')}</span><h1>${t('updates.title')}</h1><p>${t('updates.subtitle')}</p></div><span class="updates-count-chip">${t('updates.count', { count: updated.length })}</span></div>
    <div class="updates-overview"><div class="updates-stat"><strong>${updated.length}</strong><span>${t('updates.appsUpdated')}</span></div><div class="updates-stat"><strong>${latest ? `v${escapeHtml(latest.version)}` : '—'}</strong><span>${t('updates.latestVersion')}</span></div><div class="updates-stat"><strong>${formatCount(totalDownloads)}</strong><span>${t('updates.communityDownloads')}</span></div></div>
    ${latest ? `<article class="update-featured"><div class="update-featured-main">${appIcon(latest, true)}<div class="update-featured-copy"><span class="update-kicker">↻ ${t('updates.latestKicker')}</span><h2>${escapeHtml(latest.name)}</h2><p class="update-featured-description">${escapeHtml(latest.releaseNotes || latest.description)}</p><div class="update-featured-meta"><span>${escapeHtml(latest.developer)}</span><span>${latestDate}</span><span>${escapeHtml(latest.size)}</span></div><button class="button" type="button" data-action="open-app" data-app-id="${escapeHtml(latest.id)}">${t('updates.openLatest')}</button></div></div><div class="update-featured-side"><span class="update-side-label">${t('updates.currentVersion')}</span><strong class="update-version">v${escapeHtml(latest.version)}</strong><p class="update-side-note">${t('updates.latestHint')}</p></div></article>` : emptyState('↻', 'updates.emptyTitle', 'updates.emptyText', 'navigate', 'home')}
    ${updated.length ? `<section class="section updates-list-section"><div class="section-heading update-section-heading"><div><span class="eyebrow">${t('updates.listEyebrow')}</span><h2>${t('updates.listTitle')}</h2></div></div><div class="update-filter-bar" role="group" aria-label="${t('updates.filterLabel')}">${filterButton('recent', 'updates.filterRecent')}${filterButton('popular', 'updates.filterPopular')}${filterButton('rating', 'updates.filterRating')}</div><div class="update-list">${ordered.map(updateRow).join('')}</div></section>` : ''}
  </div>`;
}

async function renderFavorites(state) {
  const allApps = await appRepository.list();
  const favoriteApps = allApps.filter((app) => state.favorites.includes(app.id));
  const sort = state.favoriteSort || 'recent';
  const ordered = [...favoriteApps].sort((first, second) => {
    if (sort === 'rating') return Number(second.rating || 0) - Number(first.rating || 0);
    if (sort === 'popular') return Number(second.downloads || 0) - Number(first.downloads || 0);
    if (sort === 'name') return String(first.name).localeCompare(String(second.name), 'fr');
    return state.favorites.indexOf(first.id) - state.favorites.indexOf(second.id);
  });
  const totalDownloads = favoriteApps.reduce((total, app) => total + Number(app.downloads || 0), 0);
  const averageRating = favoriteApps.length
    ? (favoriteApps.reduce((total, app) => total + Number(app.rating || 0), 0) / favoriteApps.length).toFixed(1)
    : '—';
  const categoryCount = new Set(favoriteApps.map((app) => app.category)).size;
  const sortOptions = [['recent', 'favorites.sortRecent'], ['popular', 'favorites.sortPopular'], ['rating', 'favorites.sortRating'], ['name', 'favorites.sortName']];
  return `<div class="content-wrap favorites-page">
    <div class="page-heading"><div class="favorites-heading-copy"><span class="eyebrow">${t('favorites.eyebrow')}</span><h1>${t('favorites.title')}</h1><p>${t('favorites.subtitle')}</p></div><span class="favorites-count-chip">${t('favorites.savedCount', { count: favoriteApps.length })}</span></div>
    <div class="favorites-overview"><div class="favorites-stat"><strong>${favoriteApps.length}</strong><span>${t('favorites.appsSaved')}</span></div><div class="favorites-stat"><strong>${averageRating}</strong><span>${t('favorites.averageRating')}</span></div><div class="favorites-stat"><strong>${categoryCount}</strong><span>${t('favorites.categoriesCovered')}</span></div></div>
    ${favoriteApps.length ? `<div class="favorites-toolbar"><div class="favorites-toolbar-copy"><strong>${t('favorites.collectionTitle')}</strong><span>${t('favorites.collectionText', { downloads: formatCount(totalDownloads) })}</span></div><div><label class="sr-only" for="favoriteSort">${t('favorites.sortLabel')}</label><select class="favorites-sort" id="favoriteSort" data-favorite-sort>${sortOptions.map(([value, key]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${t(key)}</option>`).join('')}</select></div></div><div class="app-grid">${ordered.map((app) => appCard(app, state.favorites)).join('')}</div><button class="button button-ghost favorites-clear" type="button" data-action="clear-favorites">${t('favorites.clear')}</button>` : `<div class="empty-state favorites-empty"><div class="empty-icon">♡</div><h2>${t('favorites.emptyTitle')}</h2><p>${t('favorites.emptyText')}</p><button class="button button-small" type="button" data-action="navigate" data-view="home">${t('favorites.emptyCta')}</button></div>`}
  </div>`;
}

function emptyState(iconText, titleKey, textKey, action, value = '') {
  const button = action ? `<button class="button button-small" type="button" data-action="${action}" ${value && action === 'navigate' ? `data-view="${value}"` : ''}>${action === 'clear-search' ? t('search.clear') : t('home.explore')}</button>` : '';
  return `<div class="empty-state"><div class="empty-icon">${iconText}</div><h2>${t(titleKey)}</h2><p>${t(textKey)}</p>${button}</div>`;
}

function quarantineBanner(user) {
  if (user.status !== 'quarantined') return '';
  if (user.verificationRequested) {
    return `<section class="quarantine-banner quarantine-banner-pending"><div class="auth-gate-icon" aria-hidden="true">⏳</div><div><h2>${t('security.quarantinePendingTitle')}</h2><p>${t('security.quarantinePendingText')}</p></div></section>`;
  }
  return `<section class="quarantine-banner"><div class="auth-gate-icon" aria-hidden="true">⚠</div><div><h2>${t('security.quarantineTitle')}</h2><p>${t('security.quarantineText')}</p><form class="inline-form" data-verification-form><input name="note" maxlength="500" placeholder="${t('security.verificationPlaceholder')}" aria-label="${t('security.verificationPlaceholder')}"><button class="button button-small" type="submit">${t('security.requestVerification')}</button></form></div></section>`;
}

function profileAvatar(user, className = 'avatar avatar-large') {
  const url = typeof user?.avatarUrl === 'object' ? user.avatarUrl?.publicUrl : user?.avatarUrl;
  const safeUrl = safeMediaUrl(url);
  if (safeUrl) {
    return `<span class="${className} profile-photo-avatar"><img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(user.username || t('profile.avatarTitle'))}" loading="lazy"></span>`;
  }
  return `<span class="${className}">${escapeHtml(user?.avatarInitial || 'P')}</span>`;
}

async function renderProfile(state) {
  const user = getCurrentUser();
  if (!user) return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('profile.eyebrow')}</span><h1>${t('profile.title')}</h1><p>${t('profile.subtitle')}</p></div><button class="profile-account-menu-button" type="button" data-action="account-menu" aria-label="${t('accountMenu.open')}">${t('accountMenu.title')}</button></div>${renderAuthGate()}<section class="panel phase-preview"><h3>${t('profile.phaseTwoTitle')}</h3><p>${t('profile.phaseTwoText')}</p></section></div>`;
  const recent = state.history.slice(0, 3);
  const historyApps = (await appRepository.list()).filter((app) => recent.includes(app.id));
  const summary = getDeveloperSummary(user);
  const referralUsed = Boolean(user.referredBy);
  const profileSteps = [
    { key: 'discover', done: true },
    { key: 'account', done: true },
    { key: 'personalize', done: Boolean(user.avatarUrl) },
    { key: 'creator', done: user.developerStatus === 'approved' }
  ];
  const completedSteps = profileSteps.filter((step) => step.done).length;
  const progress = Math.round((completedSteps / profileSteps.length) * 100);
  const favoriteCount = state.favorites.length;
  return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('profile.eyebrow')}</span><h1>${t('profile.welcome', { name: escapeHtml(user.username) })}</h1><p>${t('profile.subtitle')}</p></div></div>
    ${quarantineBanner(user)}
    <section class="profile-header">${profileAvatar(user)}<div class="profile-header-copy"><h1>${escapeHtml(user.username)}</h1><p>${escapeHtml(user.email)} · ${escapeHtml(user.country)}</p><span class="status-chip">${t('auth.role.' + user.role)}</span></div><button class="profile-account-menu-button" type="button" data-action="account-menu" aria-label="${t('accountMenu.open')}">${t('accountMenu.title')}</button></section>
    <section class="profile-journey-card"><div class="profile-journey-copy"><span class="eyebrow">${t('profile.journeyEyebrow')}</span><h2>${t('profile.journeyTitle')}</h2><p>${t('profile.journeyText')}</p></div><div class="profile-progress-summary"><strong>${progress}%</strong><span>${t('profile.journeyProgress', { completed: completedSteps, total: profileSteps.length })}</span><div class="profile-progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('profile.journeyProgress', { completed: completedSteps, total: profileSteps.length })}"><span style="width:${progress}%"></span></div></div><div class="profile-phase-list">${profileSteps.map((step, index) => `<div class="profile-phase ${step.done ? 'is-done' : ''}"><span class="profile-phase-marker">${step.done ? '✓' : String(index + 1)}</span><div><strong>${t(`profile.phase.${step.key}.title`)}</strong><span>${t(`profile.phase.${step.key}.text`)}</span></div></div>`).join('')}</div></section>
    <div class="profile-stat-grid"><article class="profile-stat-card"><span class="profile-stat-icon">♡</span><strong>${favoriteCount}</strong><span>${t('profile.statsFavorites')}</span><button type="button" data-action="navigate" data-view="favorites">${t('profile.statsFavoritesCta')}</button></article><article class="profile-stat-card"><span class="profile-stat-icon">↻</span><strong>${historyApps.length}</strong><span>${t('profile.statsHistory')}</span><button type="button" data-action="navigate" data-view="updates">${t('profile.statsHistoryCta')}</button></article><article class="profile-stat-card"><span class="profile-stat-icon">${user.avatarUrl ? '✓' : '○'}</span><strong>${user.avatarUrl ? t('profile.statsReady') : t('profile.statsToDo')}</strong><span>${t('profile.statsPhoto')}</span>${user.avatarUrl ? `<button type="button" data-action="account-menu">${t('profile.statsAccountCta')}</button>` : `<label class="profile-stat-action" for="profilePhotoInput">${t('profile.statsPhotoCta')}</label>`}</article><article class="profile-stat-card"><span class="profile-stat-icon">✦</span><strong>${t('developer.status.' + user.developerStatus)}</strong><span>${t('profile.statsDeveloper')}</span><button type="button" data-action="developer">${t('profile.statsDeveloperCta')}</button></article></div>
    <section class="profile-photo-card"><div class="profile-photo-preview" data-profile-photo-preview>${profileAvatar(user, 'avatar avatar-large profile-photo-avatar')}</div><div class="profile-photo-copy"><h3>${t('profile.photoTitle')}</h3><p>${t('profile.photoText')}</p><form class="profile-photo-form" data-profile-photo-form><label class="sr-only" for="profilePhotoInput">${t('profile.photoInput')}</label><input id="profilePhotoInput" name="profilePhoto" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" data-profile-photo-input><span class="profile-photo-hint">${t('profile.photoHint')}</span><p class="profile-photo-error" data-profile-photo-error role="alert"></p><button class="button button-small" type="submit">${t('profile.photoSave')}</button>${user.avatarUrl ? `<button class="button button-ghost button-small" type="button" data-action="remove-profile-photo">${t('profile.photoRemove')}</button>` : ''}</form></div></section>
    <div class="profile-grid"><div class="panel"><h3>${t('profile.settings')}</h3><div class="setting-row"><div><strong>${t('profile.darkMode')}</strong><small>${t('profile.darkModeText')}</small></div><button class="switch ${state.theme === 'dark' ? 'on' : ''}" type="button" data-action="theme" aria-label="${t('profile.darkMode')}"></button></div><div class="setting-row"><div><strong>${t('profile.notifications')}</strong><small>${t('profile.notificationsText')}</small></div><button class="switch on" type="button" data-action="notifications" aria-label="${t('profile.notifications')}"></button></div><div class="setting-row"><div><strong>${t('profile.account')}</strong><small>${t('profile.accountText')}</small></div><span class="status-chip">${t('profile.connected')}</span></div><div class="setting-row setting-row-account"><div><strong>${t('profile.accountActions')}</strong><small>${t('profile.accountActionsText')}</small></div><button class="button button-ghost button-small" type="button" data-action="sign-out">${t('auth.signout')}</button></div></div>
      <aside class="referral-card"><span class="eyebrow">${t('profile.referral')}</span><h3>${t('profile.referralHeadline')}</h3><p>${t('profile.referralText')}</p><div class="referral-code"><span>${escapeHtml(user.referralCode)}</span><button class="copy-button" type="button" data-action="copy" data-copy="${escapeHtml(user.referralCode)}">${t('profile.copy')}</button></div><div class="stat-row"><div><strong>${user.confirmedReferrals ?? 0}</strong><span>${t('profile.referrals')}</span></div><div><strong>${summary.availableSlots}</strong><span>${t('profile.slots')}</span></div></div>${!referralUsed ? `<form class="inline-form" data-referral-form><input name="referralCode" autocapitalize="characters" placeholder="${t('profile.referralPlaceholder')}" aria-label="${t('profile.referralInput')}"><button class="copy-button" type="submit">${t('profile.useCode')}</button></form>` : `<div class="referral-confirmed">✓ ${t('profile.referralUsed')}</div>`}</aside></div>
      <section class="section"><div class="section-heading"><h2>${t('profile.developer')}</h2><button class="link-button" type="button" data-action="developer">${t('profile.developerCta')}</button></div><div class="notice">${t('developer.status.' + user.developerStatus)} · ${t('profile.developerText')}</div></section>
      <section class="section">${sectionHeading(t('profile.history'), null, null)}${historyApps.length ? `<div class="app-grid">${historyApps.map((app) => appCard(app, state.favorites)).join('')}</div>` : emptyState('↻', 'profile.history', 'profile.emptyHistory')}</section>
  </div>`;
}

function renderScreenshot(screenshot, index) {
  const imageUrl = typeof screenshot === 'object' ? screenshot?.publicUrl : '';
  const safeImageUrl = safeMediaUrl(imageUrl);
  if (safeImageUrl) {
    return `<figure class="screenshot screenshot-image"><img src="${escapeHtml(safeImageUrl)}" alt="${t('detail.screenshotAlt', { index: index + 1 })}" loading="lazy"></figure>`;
  }
  const colors = String(screenshot || '#6046e8,#a48cfb').split(',');
  const firstColor = safeCssColor(colors[0]);
  const secondColor = safeCssColor(colors[1] || colors[0], firstColor);
  return `<div class="screenshot" style="--shot-a:${firstColor};--shot-b:${secondColor}"><div class="screen-bar"></div><div class="screen-block"></div><div class="screen-block"></div><div class="screen-block"></div></div>`;
}

function renderReviewStars(rating) {
  return `<span class="review-stars" aria-label="${t('review.ratingAria', { rating })}">${'★'.repeat(Number(rating))}${'☆'.repeat(5 - Number(rating))}</span>`;
}

function renderDetailSecurity(app) {
  if (app.securityStatus === 'verified') {
    return `<details class="security-disclosure security-verified"><summary><span class="security-status">${t('detail.securityVerified')}</span></summary><p>${t('detail.securityExplanation')}</p></details>`;
  }
  if (app.securityStatus === 'review_required') {
    return `<span class="security-status security-review">${t('detail.securityReview')}</span>`;
  }
  return `<span class="security-status security-pending">${t('detail.securityPending')}</span>`;
}

function renderReviewPanel(app, user, reviews, ownReview) {
  const reviewForm = user ? `<form class="review-form" data-review-form data-app-id="${escapeHtml(app.id)}">
    <fieldset><legend>${t('review.ratingLabel')}</legend><div class="star-picker">${[5, 4, 3, 2, 1].map((rating) => `<label><input type="radio" name="rating" value="${rating}" ${Number(ownReview?.rating) === rating ? 'checked' : ''} required><span aria-hidden="true">★</span><span class="sr-only">${t('review.starChoice', { rating })}</span></label>`).join('')}</div></fieldset>
    <label class="form-field"><span>${t('review.commentLabel')}</span><textarea name="comment" rows="3" maxlength="1000" required placeholder="${t('review.commentPlaceholder')}">${escapeHtml(ownReview?.comment || '')}</textarea></label>
    <p class="form-error" data-review-error role="alert"></p><button class="button button-small" type="submit">${ownReview ? t('review.update') : t('review.submit')}</button>
  </form>` : `<div class="review-login"><p>${t('review.loginText')}</p><button class="button button-ghost button-small" type="button" data-action="open-auth" data-auth-mode="signin">${t('auth.signin')}</button></div>`;
  const reviewList = reviews.length ? `<div class="review-list">${reviews.map((review) => `<article class="review-item"><div class="review-item-head"><div><strong>${escapeHtml(review.username)}</strong><time>${escapeHtml(formatDate(review.updatedAt || review.createdAt))}</time></div>${renderReviewStars(review.rating)}</div><p>${escapeHtml(review.comment)}</p></article>`).join('')}</div>` : `<p class="muted review-empty">${t('review.empty')}</p>`;
  return `<section class="panel section reviews-panel"><div class="section-heading"><div><h2>${t('review.title')}</h2><p class="review-subtitle">${t('review.subtitle')}</p></div><span class="muted">${formatNumber(reviews.length)} ${t('common.reviews')}</span></div>${reviewForm}${reviewList}</section>`;
}

async function renderDetail(state) {
  const app = await appRepository.getById(state.selectedAppId);
  if (!app) return emptyState('?', 'search.emptyTitle', 'search.emptyText', 'navigate', 'home');
  const user = getCurrentUser();
  const [reviews, ownReview] = await Promise.all([listReviews(app.id), getReviewForCurrentUser(app.id)]);
  const downloadLabel = user ? t('common.download') : t('auth.downloadRequired');
  const safeAppId = escapeHtml(app.id);
  return `<div class="content-wrap"><button class="link-button" type="button" data-action="back" style="margin-bottom:18px">← ${t('common.back')}</button><section class="detail-hero">${appIcon(app, true)}<div><span class="eyebrow">${escapeHtml(app.categoryName)}</span><h1>${escapeHtml(app.name)}</h1><p class="muted">${escapeHtml(app.developer)} · ${app.verified ? t('common.developerBadge') : t('common.free')}</p><div class="detail-security-summary">${renderDetailSecurity(app)}</div></div><div class="detail-actions"><button class="favorite-button ${state.favorites.includes(app.id) ? 'is-favorite' : ''}" type="button" data-action="favorite" data-app-id="${safeAppId}" aria-label="${t(state.favorites.includes(app.id) ? 'common.unfavorite' : 'common.favorite')}">${state.favorites.includes(app.id) ? '♥' : '♡'}</button><button class="button button-ghost button-small" type="button" data-action="share-app" data-app-id="${safeAppId}">${t('share.button')}</button><button class="button ${user ? '' : 'button-download-locked'}" type="button" data-action="download" data-app-id="${safeAppId}" aria-describedby="downloadAccountNotice">${downloadLabel}</button></div></section>
    <div class="detail-layout"><div><section class="panel"><div class="section-heading"><h2>${t('detail.about')}</h2><span class="rating">★ ${app.rating}</span></div><p class="detail-description">${escapeHtml(app.description)} ${t('detail.communityText')}</p><button class="link-button report-app-link" type="button" data-action="report-app" data-app-id="${safeAppId}" data-publication-id="${escapeHtml(app.publicationId || '')}">${t('report.linkLabel')}</button><div class="detail-free-banner"><span aria-hidden="true">✓</span>${t('home.freeBadge')}</div><div class="notice">${t('detail.downloadNotice')}</div><div class="download-account-notice" id="downloadAccountNotice"><span aria-hidden="true">✦</span><span>${user ? t('detail.downloadReady') : t('detail.accountRequired')}</span></div></section><section class="panel section"><h3>${t('detail.screenshots')}</h3>${app.screenshots.length ? `<div class="screenshot-row">${app.screenshots.slice(0, 4).map(renderScreenshot).join('')}</div>` : `<div class="notice">${t('detail.noScreenshots')}</div>`}</section><section class="panel section"><div class="section-heading"><h2>${t('detail.ratingTitle')}</h2><span class="muted">${formatNumber(app.reviews)} ${t('common.reviews')}</span></div><div class="stat-row"><div class="stat"><strong>${app.rating}</strong><span>${t('profile.ratingOutOf')}</span></div><div class="stat"><strong>${formatCount(app.downloads)}</strong><span>${t('common.downloads')}</span></div></div></section></div>
      <aside class="panel"><h3>${t('detail.information')}</h3><div class="info-list"><div class="info-row"><span>${t('detail.version')}</span><span>${escapeHtml(app.version)}</span></div><div class="info-row"><span>${t('detail.size')}</span><span>${escapeHtml(app.size)}</span></div><div class="info-row"><span>${t('detail.updated')}</span><span>${escapeHtml(app.updated)}</span></div><div class="info-row"><span>${t('detail.android')}</span><span>${escapeHtml(app.android)}</span></div><div class="info-row"><span>${t('detail.permissions')}</span><span>${escapeHtml(app.permissions)}</span></div><div class="info-row"><span>${t('detail.security')}</span>${renderDetailSecurity(app)}</div>${app.officialUrl ? `<div class="official-site-link"><span>${t('detail.officialSite')}</span><a href="${escapeHtml(app.officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(app.officialUrl)}</a></div>` : `<div class="official-site-missing">${t('detail.officialSiteMissing')}</div>`}</div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><h3>${t('detail.versions')}</h3><div class="notice">v${escapeHtml(app.version)} · ${escapeHtml(app.releaseNotes)}</div></aside></div>
    ${renderReviewPanel(app, user, reviews, ownReview)}
  </div>`;
}

export async function renderDeveloper() {
  const user = getCurrentUser();
  if (!user) return `<div class="content-wrap"><div class="page-heading"><div><span class="eyebrow">${t('developer.eyebrow')}</span><h1>${t('developer.title')}</h1><p>${t('developer.text')}</p></div></div>${renderAuthGate()}</div>`;
  const summary = getDeveloperSummary(user);
  const canRequest = user.developerStatus === 'none' || user.developerStatus === 'rejected' || user.developerStatus === 'revoked';
  const publications = await listPublications(user.id);
  const approved = user.developerStatus === 'approved';
  const downloadCounts = approved ? await getDownloadCountsByOwner(user.id) : {};
  const steps = [
    { key: 'step1', done: user.developerStatus !== 'none' },
    { key: 'step2', done: ['approved', 'rejected', 'revoked'].includes(user.developerStatus) },
    { key: 'step3', done: approved }
  ];
  const publicationRows = publications.length
    ? `<div class="developer-publication-list">${publications.slice(0, 5).map((publication) => `<div class="developer-publication-row"><div class="developer-publication-copy"><strong>${escapeHtml(publication.appName)}</strong><span>v${escapeHtml(publication.version)} · ${t(`publication.status.${publication.status}`)}${publication.status === 'approved' ? ` · ${t('developer.downloadCount', { count: downloadCounts[publication.id] || 0 })}` : ''}</span></div>${publication.status !== 'rejected' ? `<button class="button button-ghost button-small" type="button" data-action="update-publication" data-publication-id="${escapeHtml(publication.id)}">${t('publication.updateButton')}</button>` : ''}</div>`).join('')}</div>`
    : `<div class="notice" style="margin-top:16px">${t('developer.noPublications')}</div>`;
  const ownedReviews = approved ? await listReviewsForOwnedApps(publications.filter((p) => p.status === 'approved').map((p) => p.id)) : [];
  const reviewsSection = ownedReviews.length ? `<section class="panel section"><div class="section-heading"><h2>${t('developer.reviewsTitle')}</h2><span class="muted">${ownedReviews.length}</span></div><div class="moderation-list">${ownedReviews.map((review) => `<article class="moderation-card"><div class="moderation-card-head"><div><h3>${escapeHtml(review.username)}</h3><p>★ ${escapeHtml(review.rating)}</p></div></div><p class="publication-notes">${escapeHtml(review.comment)}</p>${review.developerReply ? `<div class="moderation-reason"><strong>${t('review.developerReplyLabel')}</strong> ${escapeHtml(review.developerReply)}</div>` : `<form class="inline-form" data-reply-form data-review-id="${escapeHtml(review.id)}"><input name="reply" maxlength="1000" placeholder="${t('review.replyPlaceholder')}" aria-label="${t('review.replyPlaceholder')}"><button class="button button-small" type="submit">${t('review.replySubmit')}</button></form>`}</article>`).join('')}</div></section>` : '';
  return `<div class="content-wrap"><button class="link-button" type="button" data-action="back" style="margin-bottom:18px">← ${t('common.back')}</button><section class="hero"><div class="hero-content developer-hero-content"><span class="eyebrow">${t('developer.eyebrow')}</span><h1>${t('developer.title')}</h1><p>${t('developer.text')}</p>${canRequest ? `<button class="button button-light" type="button" data-action="request-developer">${t('developer.request')}</button>` : `<div class="developer-status-message">${t('developer.statusMessage.' + user.developerStatus)}</div>`}</div></section><div class="developer-grid"><section class="panel"><div class="section-heading"><h2>${t('developer.statusTitle')}</h2><span class="status-chip status-${user.developerStatus}">${t('developer.status.' + user.developerStatus)}</span></div><p class="muted">${t('developer.statusText')}</p><div class="developer-stat-grid"><div class="developer-stat"><strong>${summary.availableSlots}</strong><span>${t('developer.availableSlots')}</span></div><div class="developer-stat"><strong>${summary.confirmedReferrals}</strong><span>${t('profile.referrals')}</span></div><div class="developer-stat"><strong>${summary.usedSlots}</strong><span>${t('developer.usedSlots')}</span></div></div><button class="button button-ghost button-small" type="button" style="margin-top:14px" data-action="open-developer-feedback">${t('developer.contactAdmin')}</button></section><section class="panel"><h2>${t('developer.publicationTitle')}</h2><p class="muted">${t(approved ? 'developer.publicationText' : 'developer.badgeRequiredText')}</p><p class="muted developer-free-notice">${t('developer.freeUnlimitedNotice')}</p>${approved && summary.availableSlots > 0 ? `<button class="button button-ghost" type="button" data-action="create-publication">${t('developer.createApp')}</button>` : `<button class="button button-ghost" type="button" data-action="request-developer" ${canRequest ? '' : 'disabled'}>${t(approved ? 'developer.noSlotsAction' : 'developer.request')}</button>`}</section></div><section class="panel section"><div class="section-heading"><h2>${t('developer.steps')}</h2><span class="muted">${t('developer.publicationCount', { count: publications.length })}</span></div><div class="developer-checklist">${steps.map((step, index) => `<div class="developer-checklist-item ${step.done ? 'is-done' : ''}"><span class="developer-checklist-marker">${step.done ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>${t(`developer.${step.key}Title`)}</strong><span>${t(`developer.${step.key}Text`)}</span></div></div>`).join('')}</div>${publicationRows}</section>${reviewsSection}</div>`;
}

