import { appIcon, escapeHtml, t } from './common.js';
import { categories } from '../data/catalog.js';
import { formatCount } from '../services/app-repository.js';

function searchResultRow(app, favorites = []) {
  const favorite = favorites.includes(app.id);
  const id = escapeHtml(app.id);
  return `<article class="search-result-row" data-app-id="${id}">
    <button class="search-result-row-main" type="button" data-action="open-app" data-app-id="${id}" aria-label="${t('common.details')} : ${escapeHtml(app.name)}">
      ${appIcon(app)}
      <div class="search-result-row-copy">
        <span class="search-result-row-title">${escapeHtml(app.name)}</span>
        <span class="search-result-row-developer">${escapeHtml(app.developer)} · v${escapeHtml(app.version)}</span>
        <span class="search-result-row-meta"><span class="rating">★ ${escapeHtml(app.rating)}</span><span>${formatCount(app.downloads)} ${t('common.downloads')}</span></span>
      </div>
    </button>
    <button class="favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-action="favorite" data-app-id="${id}" aria-label="${favorite ? t('common.unfavorite') : t('common.favorite')}">${favorite ? '♥' : '♡'}</button>
  </article>`;
}

function searchHistoryItems(history = [], query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase('fr');
  return history
    .filter((item) => !normalizedQuery || item.toLocaleLowerCase('fr').includes(normalizedQuery))
    .slice(0, 12);
}

function historyButton(query, compact = false) {
  const safeQuery = escapeHtml(query);
  const useLabel = escapeHtml(t('search.useHistory', { query }));
  const removeLabel = escapeHtml(t('search.removeHistory', { query }));
  return `<div class="search-history-item ${compact ? 'is-compact' : ''}">
    <button class="search-history-query" type="button" data-action="search-history" data-query="${safeQuery}" aria-label="${useLabel}">
      <span class="search-history-icon" aria-hidden="true">◷</span><span>${safeQuery}</span>
    </button>
    <button class="search-history-remove" type="button" data-action="delete-search-history" data-query="${safeQuery}" aria-label="${removeLabel}">×</button>
  </div>`;
}

export function renderSearchPopover(state, visible = false) {
  const history = searchHistoryItems(state.searchHistory, state.searchQuery);
  if (!visible || state.view === 'search' || (!history.length && !state.searchQuery.trim())) return '';
  const query = state.searchQuery.trim();
  return `<div class="search-popover" role="region" aria-label="${t('search.suggestionsLabel')}">
    ${query ? `<div class="search-popover-heading"><span>${t('search.searchingFor')}</span><button type="button" data-action="save-search">${t('search.saveSearch')}</button></div>` : `<div class="search-popover-heading"><span>${t('search.recentTitle')}</span><button type="button" data-action="clear-search-history">${t('search.clearHistory')}</button></div>`}
    ${history.length ? `<div class="search-history-list">${history.map((item) => historyButton(item, true)).join('')}</div>` : `<p class="search-popover-empty">${t('search.noMatchingHistory')}</p>`}
  </div>`;
}

export function renderSearchHistorySection(state) {
  const history = searchHistoryItems(state.searchHistory).slice(0, 6);
  if (!history.length) return '';
  return `<section class="section search-history-section">
    <div class="section-heading"><div><span class="eyebrow">${t('search.historyEyebrow')}</span><h2>${t('search.historyTitle')}</h2></div><button class="link-button" type="button" data-action="clear-search-history">${t('search.clearHistory')}</button></div>
    <div class="search-history-grid">${history.map((item) => historyButton(item)).join('')}</div>
  </section>`;
}

export function renderSearchPage(state, results) {
  if (!state.searchQuery.trim()) return renderSearchLanding(state);
  const query = escapeHtml(state.searchQuery.trim());
  const countLabel = t(results.length === 1 ? 'search.oneResult' : 'search.resultCount', { count: results.length });
  const history = searchHistoryItems(state.searchHistory).slice(0, 5);
  const historyStrip = history.length
    ? `<div class="search-result-history"><span>${t('search.historyLabel')}</span>${history.map((item) => `<button type="button" data-action="search-history" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>`
    : '';
  return `<div class="content-wrap search-results-page">
    <div class="page-heading search-page-heading"><div><span class="eyebrow">${t('search.eyebrow')}</span><h1>${t('search.resultsFor', { query })}</h1><p>${countLabel}</p></div><button class="button button-ghost button-small" type="button" data-action="save-search">${t('search.saveSearch')}</button></div>
    ${historyStrip}
    <div class="search-controls"><div class="search-control-copy"><strong>${t('search.refineTitle')}</strong><span>${t('search.refineText')}</span></div>${renderSearchFilters(state.ranking, state.searchCategory)}</div>
    ${results.length ? `<div class="search-result-list">${results.map((app) => searchResultRow(app, state.favorites)).join('')}</div>` : `<div class="search-empty-wrap"><div class="empty-state"><div class="empty-icon">⌕</div><h2>${t('search.emptyTitle')}</h2><p>${t('search.emptyText')}</p><button class="button button-small" type="button" data-action="clear-search">${t('search.clear')}</button></div>${history.length ? `<div class="search-empty-history"><strong>${t('search.tryHistory')}</strong>${history.map((item) => `<button type="button" data-action="search-history" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>` : ''}</div>`}
  </div>`;
}

function renderSearchLanding(state) {
  const history = searchHistoryItems(state.searchHistory);
  return `<div class="content-wrap search-landing-page">
    <div class="page-heading search-landing-heading">
      <div><span class="eyebrow">${t('search.eyebrow')}</span><h1>${t('search.landingTitle')}</h1><p>${t('search.landingText')}</p></div>
      <button class="button button-ghost button-small" type="button" data-action="back">${t('common.back')}</button>
    </div>
    <section class="search-landing-panel" aria-labelledby="search-history-heading">
      <div class="search-landing-panel-heading"><div><span class="eyebrow">${t('search.historyEyebrow')}</span><h2 id="search-history-heading">${t('search.recentTitle')}</h2></div>${history.length ? `<button class="link-button" type="button" data-action="clear-search-history">${t('search.clearHistory')}</button>` : ''}</div>
      ${history.length ? `<div class="search-landing-history">${history.map((item) => historyButton(item)).join('')}</div>` : `<div class="search-landing-empty"><span class="search-landing-empty-icon" aria-hidden="true">◷</span><div><h3>${t('search.historyEmptyTitle')}</h3><p>${t('search.historyEmptyText')}</p></div></div>`}
    </section>
    <section class="search-landing-tip" aria-label="${t('search.searchTipLabel')}"><span class="search-landing-tip-icon" aria-hidden="true">⌕</span><div><strong>${t('search.searchTipTitle')}</strong><p>${t('search.searchTipText')}</p></div></section>
  </div>`;
}

function renderSearchFilters(active, activeCategory = null) {
  const filters = [['popular', 'common.popular'], ['newest', 'common.newest'], ['rating', 'common.rating']];
  const rankingButtons = filters.map(([value, key]) => `<button class="filter-button ${active === value ? 'active' : ''}" type="button" data-action="ranking" data-ranking="${value}" aria-pressed="${active === value}">${t(key)}</button>`).join('');
  const categoryOptions = categories.map((cat) => `<option value="${escapeHtml(cat.id)}" ${activeCategory === cat.id ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`).join('');
  return `<div class="filter-bar search-filter-bar">${rankingButtons}<select class="favorites-sort search-category-select" data-search-category-select aria-label="${t('search.filterCategory')}"><option value="">${t('search.allCategories')}</option>${categoryOptions}</select></div>`;
}
