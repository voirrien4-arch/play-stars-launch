import { appIcon, escapeHtml, formatNumber, t } from './common.js';
import { formatCount } from '../services/app-repository.js';
import { saveAiPosition } from '../services/ai-position-service.js';

let open = false;
let loading = false;
let messages = [];
let position = null;
let dragState = null;
let suppressNextClick = false;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function setAiAssistantPosition(next) {
  if (!next || !Number.isFinite(Number(next.x)) || !Number.isFinite(Number(next.y))) {
    position = null;
    return;
  }
  position = {
    x: clamp(Number(next.x), 4, 96),
    y: clamp(Number(next.y), 6, 92)
  };
}

export function beginAiFabDrag(event) {
  if (event.button !== undefined && event.button !== 0) return false;
  const fab = event.target.closest('.ai-fab');
  if (!fab) return false;
  dragState = {
    fab,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  };
  fab.classList.add('is-dragging');
  fab.setPointerCapture?.(event.pointerId);
  return true;
}

export function moveAiFabDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return false;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (distance > 6) dragState.moved = true;
  if (!dragState.moved) return true;
  position = {
    x: clamp((event.clientX / Math.max(window.innerWidth, 1)) * 100, 4, 96),
    y: clamp((event.clientY / Math.max(window.innerHeight, 1)) * 100, 6, 92)
  };
  dragState.fab.classList.add('is-positioned');
  dragState.fab.style.setProperty('--ai-left', `${position.x}%`);
  dragState.fab.style.setProperty('--ai-top', `${position.y}%`);
  event.preventDefault();
  return true;
}

export function endAiFabDrag(event) {
  if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return false;
  const moved = dragState.moved;
  dragState.fab.classList.remove('is-dragging');
  dragState.fab.releasePointerCapture?.(dragState.pointerId);
  dragState = null;
  if (moved) {
    suppressNextClick = true;
    window.setTimeout(() => { suppressNextClick = false; }, 450);
    saveAiPosition(position);
  }
  return moved;
}

export function consumeAiFabClick() {
  const shouldIgnore = suppressNextClick;
  suppressNextClick = false;
  return shouldIgnore;
}

export function toggleAiAssistant() {
  open = !open;
  return open;
}

export function closeAiAssistant() {
  open = false;
  return open;
}

export function isAiAssistantOpen() { return open; }

export function addAiUserMessage(text) {
  messages = [...messages, { role: 'user', text }];
}

export function addAiAssistantMessage(payload) {
  messages = [...messages, { role: 'assistant', ...payload }];
}

export function setAiLoading(next) {
  loading = next;
}

export function isAiLoading() { return loading; }

export function resetAiConversation() {
  messages = [];
}

function securityBadge(app) {
  if (app.securityStatus === 'verified') return `<span class="ai-security-badge"><span aria-hidden="true">✓</span>${t('aiSearch.verified')}</span>`;
  if (app.securityStatus === 'review_required') return `<span class="ai-security-badge ai-security-badge-muted"><span aria-hidden="true">i</span>${t('aiSearch.securityAvailable')}</span>`;
  return `<span class="ai-security-badge ai-security-badge-muted"><span aria-hidden="true">i</span>${t('aiSearch.securityPending')}</span>`;
}

function resultCard(app) {
  const appId = escapeHtml(app.id);
  return `<article class="ai-result-card">
    <button class="ai-result-main" type="button" data-action="open-app" data-app-id="${appId}">
      ${appIcon(app)}
      <span class="ai-result-copy"><strong>${escapeHtml(app.name)}</strong><span>${escapeHtml(app.developer)}</span></span>
    </button>
    <div class="ai-result-meta"><span>★ ${escapeHtml(app.rating)} <small>(${formatNumber(app.reviews)})</small></span><span>${escapeHtml(app.version)}</span><span>${escapeHtml(app.size)}</span></div>
    <div class="ai-result-footer">${securityBadge(app)}<span>${formatCount(app.downloads)} ${t('common.downloads')}</span><button class="button button-small" type="button" data-action="open-app" data-app-id="${appId}">${t('aiSearch.openApp')}</button></div>
  </article>`;
}

function messageBubble(message) {
  if (message.role === 'user') {
    return `<div class="ai-message ai-message-user"><p>${escapeHtml(message.text)}</p></div>`;
  }
  if (message.role === 'error') {
    return `<div class="ai-message ai-message-assistant ai-message-error"><p>${escapeHtml(message.text)}</p></div>`;
  }
  // assistant
  const textHtml = message.text ? `<p>${escapeHtml(message.text)}</p>` : '';
  if (message.type === 'creator') {
    const channel = message.channelUrl ? `<a class="button button-small" href="${escapeHtml(message.channelUrl)}" target="_blank" rel="noopener noreferrer">${t('aiSearch.channelLink')}</a>` : '';
    return `<div class="ai-message ai-message-assistant">${textHtml}${channel}</div>`;
  }
  if (message.type === 'apps') {
    const results = message.results || [];
    const list = results.length ? `<div class="ai-results-list">${results.map(resultCard).join('')}</div>` : `<p class="ai-empty-inline">${t('aiSearch.noResultsText')}</p>`;
    return `<div class="ai-message ai-message-assistant">${textHtml}${list}</div>`;
  }
  return `<div class="ai-message ai-message-assistant">${textHtml}</div>`;
}

function panelBody() {
  const thread = messages.map(messageBubble).join('');
  const loadingBubble = loading ? `<div class="ai-message ai-message-assistant ai-message-loading" role="status" aria-label="${t('common.loading')}"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div>` : '';
  if (!messages.length && !loading) {
    return `<div class="ai-empty"><span aria-hidden="true">✦</span><p>${t('aiSearch.hint')}</p><div class="ai-suggestions"><button type="button" data-action="ai-example" data-query="${t('aiSearch.exampleRecommend')}">${t('aiSearch.exampleRecommendLabel')}</button><button type="button" data-action="ai-example" data-query="${t('aiSearch.exampleDescribe')}">${t('aiSearch.exampleDescribeLabel')}</button><button type="button" data-action="ai-example" data-query="${t('aiSearch.exampleCreator')}">${t('aiSearch.exampleCreatorLabel')}</button></div></div>`;
  }
  return `<div class="ai-thread">${thread}${loadingBubble}</div>`;
}

export function renderAiAssistant(visible = true) {
  if (!visible) return '';
  const positionClass = position ? ' is-positioned' : '';
  const positionStyle = position ? ` style="--ai-left:${position.x}%;--ai-top:${position.y}%;"` : '';
  return `<div class="ai-assistant-layer ${open ? 'is-open' : ''}">
    <button class="ai-fab${positionClass}"${positionStyle} type="button" data-action="toggle-ai" title="${t('aiSearch.dragHint')}" aria-label="${t(open ? 'aiSearch.close' : 'aiSearch.open')}" aria-expanded="${open}"><span aria-hidden="true">✦</span></button>
    ${open ? `<section class="ai-panel" role="dialog" aria-modal="false" aria-labelledby="aiAssistantTitle"><div class="ai-panel-header"><div><span class="ai-panel-kicker">✦ ${t('aiSearch.kicker')}</span><h2 id="aiAssistantTitle">${t('aiSearch.title')}</h2></div><button class="ai-panel-close" type="button" data-action="close-ai" aria-label="${t('common.close')}">×</button></div><p class="ai-panel-intro">${t('aiSearch.intro')}</p><div class="ai-panel-body">${panelBody()}</div><form class="ai-search-form" data-ai-search-form><label class="sr-only" for="aiSearchInput">${t('aiSearch.inputLabel')}</label><input id="aiSearchInput" name="query" type="text" value="" placeholder="${t('aiSearch.placeholder')}" autocomplete="off" ${loading ? 'disabled' : ''}><button class="button" type="submit" ${loading ? 'disabled' : ''}>${t('aiSearch.searchButton')}</button></form></section>` : ''}
  </div>`;
}
