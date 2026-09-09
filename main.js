import { getState, loadState, updateState, toggleFavorite, clearFavorites, addToHistory, addSearchHistory, removeSearchHistory, clearSearchHistory, setTheme } from './state/store.js';
import { loadAuth, getCurrentUser, signOut, requestDeveloperBadge, removeProfilePhoto } from './services/auth-service.js';
import { renderNavigation, renderView } from './ui/views.js';
import { renderAuthModal, authErrorMessage } from './ui/auth-view.js';
import { renderAccountMenu } from './ui/account-menu-view.js';
import { openAccountMenuItem } from './ui/account-menu-actions.js';
import { listPublications } from './services/publication-service.js';
import { appRepository } from './services/app-repository.js';
import { renderUpdatePublicationModal } from './ui/publication-view.js';
import { approvePublication, rejectPublication, approveBadge, rejectBadge } from './services/moderation-service.js';
import { unlockAccount, banAccount, deleteAccount } from './services/account-security-service.js';
import { t, renderLoadingShell, loadTranslations } from './ui/common.js';
import { downloadApk } from './services/download-service.js';
import { recordDownload, getDownloadCountsByOwner } from './services/publication-service.js';
import { renderFeedbackModal } from './ui/feedback-view.js';
import { reportApp, resolveAppReport } from './services/report-service.js';
import { closeAiAssistant, renderAiAssistant, toggleAiAssistant, addAiUserMessage, addAiAssistantMessage, setAiLoading } from './ui/ai-search-view.js';
import { beginAiFabDrag, consumeAiFabClick, endAiFabDrag, moveAiFabDrag, setAiAssistantPosition } from './ui/ai-search-view.js';
import { loadAiPosition } from './services/ai-position-service.js';
import { askAiAssistant } from './services/ai-assistant-service.js';
import { getSharedAppId, setAppShareLocation, shareApp } from './services/share-service.js';
import { loadPlatformUpdate, markPlatformUpdateDownloaded, updateDownloadTarget } from './services/platform-update-service.js';
import { renderPlatformUpdateGate } from './ui/platform-update-view.js';
import { loadNotifications, markAllNotificationsRead, markNotificationRead, countUnreadNotifications } from './services/notification-service.js';
import { renderNotifications } from './ui/notification-view.js';
import { markAdminFeedbackRead } from './services/admin-feedback-service.js';
import { createSubmitHandler } from './ui/form-handlers.js';
import { syncConnectivityDiagnostic } from './ui/connectivity-diagnostic-view.js';
import { renderSearchPopover } from './ui/search-view.js';
import { safeMediaUrl } from './services/security-service.js';

const mainContent = document.getElementById('mainContent');
const desktopNav = document.getElementById('desktopNav');
const mobileNav = document.getElementById('mobileNav');
const modalRoot = document.getElementById('modalRoot');
const toastRoot = document.getElementById('toastRoot');
const aiAssistantRoot = document.getElementById('aiAssistantRoot');
const platformUpdateRoot = document.getElementById('platformUpdateRoot');
const searchInput = document.getElementById('globalSearch');
const clearSearch = document.querySelector('.clear-search');
const searchPopover = document.getElementById('searchPopover');
const profileAvatarButton = document.getElementById('profileAvatarButton');
let toastTimer;
let hasPainted = false;
let renderSequence = 0;
let platformUpdate = null;
let platformDownloadStarted = false;
let searchFocused = false;

function syncProfileAvatar() {
  const user = getCurrentUser();
  const avatarUrl = safeMediaUrl(typeof user?.avatarUrl === 'object' ? user.avatarUrl?.publicUrl : user?.avatarUrl);
  if (profileAvatarButton) {
    profileAvatarButton.replaceChildren();
    if (avatarUrl) {
      const image = document.createElement('img');
      image.src = avatarUrl;
      image.alt = '';
      image.loading = 'lazy';
      profileAvatarButton.appendChild(image);
    } else {
      const initial = document.createElement('span');
      initial.id = 'profileAvatarInitial';
      initial.setAttribute('aria-hidden', 'true');
      initial.textContent = user?.avatarInitial || 'P';
      profileAvatarButton.appendChild(initial);
    }
  }
  if (profileAvatarButton) {
    const label = t('accountMenu.open');
    profileAvatarButton.title = label;
    profileAvatarButton.setAttribute('aria-label', label);
  }
}

async function syncNotificationDot() {
  const notifications = await loadNotifications();
  document.querySelector('.notification-dot')?.classList.toggle('is-hidden', countUnreadNotifications(notifications) === 0);
}

function isPlatformUpdateBlocking() {
  return Boolean(platformUpdate && getCurrentUser()?.role !== 'admin');
}

function syncPlatformUpdateSurface() {
  if (!platformUpdateRoot) return;
  platformUpdateRoot.innerHTML = isPlatformUpdateBlocking()
    ? renderPlatformUpdateGate(platformUpdate, platformDownloadStarted)
    : '';
}

function syncSearchSurface() {
  if (!searchPopover) return;
  const state = getState();
  searchPopover.innerHTML = renderSearchPopover(state, searchFocused);
  const isVisible = Boolean(searchPopover.innerHTML);
  searchPopover.classList.toggle('is-hidden', !isVisible);
  searchInput.setAttribute('aria-expanded', String(isVisible));
}

async function render() {
  const sequence = ++renderSequence;
  const state = getState();
  document.documentElement.dataset.theme = state.theme;
  syncProfileAvatar();
  desktopNav.innerHTML = renderNavigation(state.view);
  mobileNav.innerHTML = renderNavigation(state.view, true);
  syncAiSurface(state);
  syncPlatformUpdateSurface();
  mainContent.setAttribute('aria-busy', 'true');
  mainContent.innerHTML = renderLoadingShell(state.view);
  const viewPromise = renderView(state);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (!hasPainted) await new Promise((resolve) => setTimeout(resolve, 220));
  const renderedView = await viewPromise;
  if (sequence !== renderSequence) return;
  mainContent.innerHTML = renderedView;
  mainContent.removeAttribute('aria-busy');
  if (state.view === 'publication') syncConnectivityDiagnostic();
  hasPainted = true;
  syncAiSurface(state);
  syncPlatformUpdateSurface();
  searchInput.value = state.searchQuery;
  clearSearch.classList.toggle('is-hidden', !state.searchQuery);
  syncSearchSurface();
  if (!searchFocused) mainContent.focus({ preventScroll: true });
  syncNotificationDot();
}

function syncAiSurface(state) {
  const visibleViews = ['home', 'search', 'categories', 'updates', 'favorites', 'detail', 'profile'];
  const visible = visibleViews.includes(state.view);
  if (!visible) closeAiAssistant();
  aiAssistantRoot.innerHTML = renderAiAssistant(visible);
}

function repaintAiSurface() {
  syncAiSurface(getState());
  if (document.querySelector('.ai-panel')) document.querySelector('#aiSearchInput')?.focus();
}

function toast(message) {
  clearTimeout(toastTimer);
  const toastElement = document.createElement('div');
  toastElement.className = 'toast';
  toastElement.textContent = String(message || '').slice(0, 500);
  toastRoot.replaceChildren(toastElement);
  toastTimer = setTimeout(() => { toastRoot.innerHTML = ''; }, 3200);
}

function navigate(view) {
  modalRoot.innerHTML = '';
  searchFocused = false;
  if (view !== 'detail') setAppShareLocation(null, true);
  updateState({ view, searchQuery: view === 'search' ? getState().searchQuery : '', searchCategory: view === 'search' ? getState().searchCategory : null, selectedAppId: null, selectedCategory: view === 'categories' ? getState().selectedCategory : null });
  render();
}

async function openSharedAppOrRedirect(appId) {
  if (!appId) return false;
  const app = await appRepository.getById(appId);
  if (app) updateState({ view: 'detail', selectedAppId: appId });
  return false;
}

async function openNotifications(filter = 'all') {
  modalRoot.innerHTML = renderNotifications(await loadNotifications(), filter);
  modalRoot.querySelector('.modal-close')?.focus();
}

async function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (isPlatformUpdateBlocking() && action !== 'platform-download') {
    event.preventDefault();
    syncPlatformUpdateSurface();
    return;
  }
  if (action === 'platform-download') {
    if (!platformUpdate || platformDownloadStarted) return;
    target.disabled = true;
    try {
      await downloadApk(updateDownloadTarget(platformUpdate));
      await markPlatformUpdateDownloaded(platformUpdate.id);
      platformDownloadStarted = true;
      platformUpdate = null;
      syncPlatformUpdateSurface();
      toast(t('platformUpdate.downloadStarted'));
    } catch (error) {
      target.disabled = false;
      toast(t('platformUpdate.downloadFailed'));
    }
    return;
  }
  if (action === 'search-history') {
    const query = target.dataset.query || '';
    searchFocused = false;
    addSearchHistory(query);
    updateState({ searchQuery: query, view: 'search', selectedCategory: null });
    searchInput.value = query;
    return render();
  }
  if (action === 'save-search') {
    const saved = addSearchHistory(getState().searchQuery);
    if (saved) {
      toast(t('search.saved'));
      searchFocused = false;
      return render();
    }
    toast(t('search.tooShort'));
    return;
  }
  if (action === 'delete-search-history') {
    removeSearchHistory(target.dataset.query || '');
    syncSearchSurface();
    return render();
  }
  if (action === 'clear-search-history') {
    if (!getState().searchHistory.length) return;
    if (!window.confirm(t('search.clearHistoryConfirm'))) return;
    clearSearchHistory();
    toast(t('search.historyCleared'));
    syncSearchSurface();
    return render();
  }
  if (action === 'toggle-ai' && consumeAiFabClick()) return;
  if (action === 'navigate') return navigate(target.dataset.view);
  if (action === 'account-menu') {
    modalRoot.innerHTML = renderAccountMenu(getCurrentUser());
    modalRoot.querySelector('.account-menu-close')?.focus();
    return;
  }
  if (action === 'account-item') {
    await openAccountMenuItem(target.dataset.accountItem, modalRoot, getCurrentUser());
    return;
  }
  if (action === 'remove-profile-photo') {
    try {
      await removeProfilePhoto();
      toast(t('profile.photoRemoved'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('profile.') ? error.message : 'profile.photoUploadFailed'));
      return;
    }
  }
  if (action === 'switch-account') {
    modalRoot.innerHTML = renderAuthModal('signin', target.dataset.accountEmail || '');
    modalRoot.querySelector('input[name="password"]')?.focus();
    return;
  }
  if (action === 'open-app') {
    closeAiAssistant();
    if (getState().searchQuery.trim()) addSearchHistory(getState().searchQuery);
    searchFocused = false;
    setAppShareLocation(target.dataset.appId);
    updateState({ view: 'detail', selectedAppId: target.dataset.appId });
    return render();
  }
  if (action === 'share-app') {
    const app = await appRepository.getById(target.dataset.appId);
    if (!app) return toast(t('share.unavailable'));
    try {
      const result = await shareApp(app);
      toast(t(result === 'copied' ? 'share.copied' : 'share.success'));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      toast(t('share.unavailable'));
    }
    return;
  }
  if (action === 'toggle-ai') {
    toggleAiAssistant();
    repaintAiSurface();
    return;
  }
  if (action === 'close-ai') {
    closeAiAssistant();
    repaintAiSurface();
    return;
  }
  if (action === 'ai-example') {
    const message = target.dataset.query || '';
    if (!message) return;
    addAiUserMessage(message);
    setAiLoading(true);
    repaintAiSurface();
    try {
      const response = await askAiAssistant(message);
      addAiAssistantMessage(response);
    } catch (error) {
      console.warn('Play Stars: assistant IA indisponible', error);
      const text = error?.debugDetail ? `${t('aiSearch.error')} (${error.debugDetail})` : t('aiSearch.error');
      addAiAssistantMessage({ role: 'error', text });
    } finally {
      setAiLoading(false);
    }
    repaintAiSurface();
    return;
  }
  if (action === 'back') {
    setAppShareLocation(null, true);
    searchFocused = false;
    updateState({ view: 'home', searchQuery: '', selectedAppId: null });
    return render();
  }
  if (action === 'category') {
    updateState({ view: 'categories', selectedCategory: target.dataset.category });
    return render();
  }
  if (action === 'clear-category') {
    updateState({ view: 'categories', selectedCategory: null });
    return render();
  }
  if (action === 'ranking') {
    updateState({ ranking: target.dataset.ranking, view: 'search' });
    return render();
  }
  if (action === 'updates-filter') {
    updateState({ updatesFilter: target.dataset.filter, view: 'updates' });
    return render();
  }
  if (action === 'clear-search') {
    searchInput.value = '';
    searchFocused = true;
    updateState({ searchQuery: '', view: 'search', selectedCategory: null });
    return render().then(() => searchInput.focus());
  }
  if (action === 'favorite') {
    const added = toggleFavorite(target.dataset.appId);
    toast(t(added ? 'toast.favoriteAdded' : 'toast.favoriteRemoved'));
    return render();
  }
  if (action === 'clear-favorites') {
    if (!window.confirm(t('favorites.clearConfirm'))) return;
    clearFavorites();
    toast(t('favorites.cleared'));
    return render();
  }
  if (action === 'download') {
    if (!getCurrentUser()) {
      modalRoot.innerHTML = renderAuthModal('signin');
      modalRoot.querySelector('input')?.focus();
      toast(t('auth.downloadRequired'));
      return;
    }
    addToHistory(target.dataset.appId);
    const app = await appRepository.getById(target.dataset.appId);
    if (app?.downloadUrl) {
      const originalLabel = target.textContent;
      target.disabled = true;
      toast(t('detail.downloadPreparing'));
      try {
        await downloadApk(app, {
          onProgress: (percent) => { target.textContent = `${percent}%`; }
        });
        toast(t('detail.downloadStarted'));
        if (app.publicationId) recordDownload(app.publicationId);
      } catch (error) {
        console.warn('Play Stars: téléchargement APK indisponible', error);
        toast(t('detail.downloadUnavailable'));
      } finally {
        target.disabled = false;
        target.textContent = originalLabel;
      }
    } else {
      toast(`${t('toast.downloadSaved')} · ${t('detail.downloadReady')}`);
    }
    return render();
  }
  if (action === 'theme') {
    const nextTheme = getState().theme === 'dark' ? 'light' : 'dark';
    await setTheme(nextTheme);
    toast(t(nextTheme === 'dark' ? 'toast.themeDark' : 'toast.themeLight'));
    return render();
  }
  if (action === 'copy') {
    try { await navigator.clipboard.writeText(target.dataset.copy); } catch { /* le message reste utile si le presse-papiers est indisponible */ }
    toast(t('common.copied'));
    return;
  }
  if (action === 'notifications') {
    await openNotifications();
    return;
  }
  if (action === 'notifications-filter') {
    await openNotifications(target.dataset.filter || 'all');
    return;
  }
  if (action === 'notification-read') {
    await markNotificationRead(target.dataset.notificationId);
    await openNotifications();
    syncNotificationDot();
    return;
  }
  if (action === 'mark-read') {
    await markAllNotificationsRead();
    await openNotifications();
    toast(t('toast.read'));
    syncNotificationDot();
    return;
  }
  if (action === 'feedback-read') {
    try {
      await markAdminFeedbackRead(target.dataset.feedbackId);
      toast(t('feedback.statusRead'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('feedback.') ? error.message : 'auth.genericError'));
      return;
    }
  }
  if (action === 'open-auth' || action === 'auth-switch') {
    modalRoot.innerHTML = renderAuthModal(target.dataset.authMode || 'signin');
    modalRoot.querySelector('input')?.focus();
    return;
  }
  if (action === 'close-modal' && (target === event.target || target.classList.contains('modal-close'))) {
    modalRoot.innerHTML = '';
    return;
  }
  if (action === 'developer') {
    updateState({ view: 'developer', selectedAppId: null });
    return render();
  }
  if (action === 'create-publication') {
    updateState({ view: 'publication', selectedAppId: null });
    return render();
  }
  if (action === 'update-publication') {
    const user = getCurrentUser();
    if (!user) {
      modalRoot.innerHTML = renderAuthModal('signin');
      modalRoot.querySelector('input')?.focus();
      return;
    }
    const publication = (await listPublications(user.id)).find((item) => item.id === target.dataset.publicationId);
    if (!publication) {
      toast(t('publication.notFound'));
      return;
    }
    modalRoot.innerHTML = renderUpdatePublicationModal(publication);
    modalRoot.querySelector('input')?.focus();
    return;
  }
  if (action === 'request-developer') {
    try {
      await requestDeveloperBadge('');
      toast(t('toast.badgeRequested'));
      return render();
    } catch (error) {
      toast(authErrorMessage(error));
      return;
    }
  }
  if (action === 'approve-badge') {
    try {
      await approveBadge(target.dataset.userId);
      toast(t('moderation.badgeApprovedToast'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('moderation.') ? error.message : 'auth.genericError'));
      return;
    }
  }
  if (action === 'reject-badge') {
    const reason = window.prompt(t('moderation.badgeRejectPrompt'), t('moderation.defaultReason'));
    if (reason === null) return;
    try {
      await rejectBadge(target.dataset.userId, reason);
      toast(t('moderation.badgeRejectedToast'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('moderation.') ? error.message : 'auth.genericError'));
      return;
    }
  }
  if (action === 'report-app') {
    if (!getCurrentUser()) {
      modalRoot.innerHTML = renderAuthModal('signin');
      modalRoot.querySelector('input')?.focus();
      toast(t('auth.loginRequired'));
      return;
    }
    const reason = window.prompt(t('report.prompt'));
    if (reason === null) return;
    if (reason.trim().length < 5) { toast(t('report.reasonRequired')); return; }
    try {
      await reportApp(target.dataset.appId, target.dataset.publicationId || null, reason);
      toast(t('report.sent'));
    } catch (error) {
      toast(t('report.sendFailed'));
    }
    return;
  }
  if (action === 'open-developer-feedback') {
    modalRoot.innerHTML = renderFeedbackModal(getCurrentUser(), 'developer');
    modalRoot.querySelector('.modal-close')?.focus();
    return;
  }
  if (action === 'resolve-app-report') {
    try {
      await resolveAppReport(target.dataset.reportId);
      toast(t('report.resolvedToast'));
      return render();
    } catch (error) {
      toast(t('security.actionFailed'));
      return;
    }
  }
  if (action === 'unlock-account') {
    try {
      await unlockAccount(target.dataset.userId);
      toast(t('security.unlockedToast'));
      return render();
    } catch (error) {
      toast(t('security.actionFailed'));
      return;
    }
  }
  if (action === 'ban-account') {
    if (!window.confirm(t('security.banConfirm'))) return;
    try {
      await banAccount(target.dataset.userId);
      toast(t('security.bannedToast'));
      return render();
    } catch (error) {
      toast(t('security.actionFailed'));
      return;
    }
  }
  if (action === 'delete-account') {
    if (!window.confirm(t('security.deleteConfirm'))) return;
    try {
      await deleteAccount(target.dataset.userId);
      toast(t('security.deletedToast'));
      return render();
    } catch (error) {
      toast(t('security.actionFailed'));
      return;
    }
  }
  if (action === 'approve-publication') {
    try {
      await approvePublication(target.dataset.publicationId);
      toast(t('moderation.approvedToast'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('moderation.') ? error.message : 'publication.uploadFailed'));
      return;
    }
  }
  if (action === 'reject-publication') {
    const reason = window.prompt(t('moderation.rejectPrompt'), t('moderation.defaultReason'));
    if (reason === null) return;
    try {
      await rejectPublication(target.dataset.publicationId, reason);
      toast(t('moderation.rejectedToast'));
      return render();
    } catch (error) {
      toast(t(error?.message?.startsWith('moderation.') ? error.message : 'publication.uploadFailed'));
      return;
    }
  }
  if (action === 'sign-out') {
    await signOut();
    platformUpdate = await loadPlatformUpdate();
    platformDownloadStarted = false;
    toast(t('toast.signedOut'));
    updateState({ view: 'home' });
    return render();
  }
  if (action === 'soon') toast(t('common.soon'));
}

let searchRenderTimer;

function handleSearch(event) {
  const query = event.target.value;
  searchFocused = true;
  updateState({ searchQuery: query, view: 'search', selectedCategory: null });
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(() => render(), query ? 180 : 0);
  syncSearchSurface();
}

function commitSearch() {
  const query = searchInput.value.trim().replace(/\s+/g, ' ');
  if (!query) {
    searchFocused = true;
    updateState({ searchQuery: '', view: 'search', selectedCategory: null });
    return render();
  }
  if (query.length < 2) {
    toast(t('search.tooShort'));
    return;
  }
  searchFocused = false;
  addSearchHistory(query);
  updateState({ searchQuery: query, view: 'search', selectedCategory: null });
  searchInput.value = query;
  render();
}

function handleSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitSearch();
  }
  if (event.key === 'Escape') {
    searchFocused = false;
    if (getState().view === 'search' && !getState().searchQuery.trim()) {
      updateState({ view: 'home', searchQuery: '', selectedAppId: null });
      render();
      return;
    }
    syncSearchSurface();
  }
}

let screenshotPreviewUrls = [];
let iconPreviewUrl = '';

function handleIconPreview(event) {
  const input = event.target.closest('[data-icon-input]');
  if (!input) return;
  if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl);
  iconPreviewUrl = '';
  const preview = input.closest('.form-field')?.querySelector('[data-icon-preview]');
  if (!preview) return;
  preview.replaceChildren();
  const file = input.files?.[0];
  if (!file) return;
  iconPreviewUrl = URL.createObjectURL(file);
  const image = document.createElement('img');
  image.src = iconPreviewUrl;
  image.alt = file.name;
  preview.appendChild(image);
}

function handleScreenshotPreview(event) {
  const input = event.target.closest('[data-screenshot-input]');
  if (!input) return;
  screenshotPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  screenshotPreviewUrls = [];
  const preview = input.closest('.form-field')?.querySelector('[data-screenshot-preview]');
  if (!preview) return;
  preview.replaceChildren();
  Array.from(input.files || []).slice(0, 4).forEach((file) => {
    const url = URL.createObjectURL(file);
    screenshotPreviewUrls.push(url);
    const image = document.createElement('img');
    image.src = url;
    image.alt = file.name;
    preview.appendChild(image);
  });
}

let profilePhotoPreviewUrl = '';

function handleProfilePhotoPreview(event) {
  const input = event.target.closest('[data-profile-photo-input]');
  if (!input) return;
  const preview = input.closest('[data-profile-photo-form]')?.closest('.profile-photo-copy')?.previousElementSibling;
  if (!preview) return;
  if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
  profilePhotoPreviewUrl = '';
  const file = input.files?.[0];
  if (!file) return;
  profilePhotoPreviewUrl = URL.createObjectURL(file);
  preview.replaceChildren();
  const wrapper = document.createElement('span');
  wrapper.className = 'avatar avatar-large profile-photo-avatar';
  const image = document.createElement('img');
  image.src = profilePhotoPreviewUrl;
  image.alt = file.name;
  wrapper.appendChild(image);
  preview.appendChild(wrapper);
}

function handleFavoriteSortChange(event) {
  const select = event.target.closest('[data-favorite-sort]');
  if (!select) return;
  updateState({ favoriteSort: select.value });
  render();
}

function handleSearchCategoryChange(event) {
  const select = event.target.closest('[data-search-category-select]');
  if (!select) return;
  updateState({ searchCategory: select.value || null });
  render();
}

const handleSubmit = createSubmitHandler({
  modalRoot,
  toast,
  render,
  repaintAiSurface,
  setPlatformUpdate: (value) => { platformUpdate = value; },
  setPlatformDownloadStarted: (value) => { platformDownloadStarted = value; }
});

document.addEventListener('pointerdown', (event) => {
  if (isPlatformUpdateBlocking() && !event.target.closest('[data-platform-update-content]')) {
    event.preventDefault();
    event.stopPropagation();
    syncPlatformUpdateSurface();
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (isPlatformUpdateBlocking() && !event.target.closest('[data-platform-update-content]')) {
    event.preventDefault();
    event.stopPropagation();
    document.querySelector('[data-action="platform-download"]')?.focus();
  }
}, true);

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.ai-fab')) beginAiFabDrag(event);
});
document.addEventListener('pointermove', (event) => {
  moveAiFabDrag(event);
}, { passive: false });
document.addEventListener('pointerup', (event) => {
  endAiFabDrag(event);
});
document.addEventListener('pointercancel', (event) => {
  endAiFabDrag(event);
});
document.addEventListener('click', handleAction);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', (event) => {
  handleIconPreview(event);
  handleScreenshotPreview(event);
  handleProfilePhotoPreview(event);
  handleFavoriteSortChange(event);
  handleSearchCategoryChange(event);
});
searchInput.addEventListener('input', handleSearch);
searchInput.addEventListener('focus', () => {
  searchFocused = true;
  const state = getState();
  if (state.view !== 'search') {
    searchInput.value = '';
    updateState({ view: 'search', searchQuery: '', selectedCategory: null });
    render();
    return;
  }
  syncSearchSurface();
});
searchInput.addEventListener('keydown', handleSearchKeydown);
searchInput.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (!searchPopover?.contains(document.activeElement)) {
      searchFocused = false;
      syncSearchSurface();
    }
  }, 160);
});

const [savedAiPosition] = await Promise.all([loadAiPosition(), loadState(), loadAuth(), loadTranslations('fr')]);
setAiAssistantPosition(savedAiPosition);
platformUpdate = await loadPlatformUpdate();
const sharedAppId = getSharedAppId();
const redirectedSharedApp = await openSharedAppOrRedirect(sharedAppId);
window.addEventListener('popstate', () => {
  const appId = getSharedAppId();
  if (appId) {
    openSharedAppOrRedirect(appId).then((redirected) => {
      if (!redirected) render();
    });
    return;
  }
  updateState({ view: 'home', selectedAppId: null });
  render();
});
if (!redirectedSharedApp) await render();

window.setInterval(async () => {
  const latest = await loadPlatformUpdate();
  if (latest?.id !== platformUpdate?.id) {
    platformUpdate = latest;
    platformDownloadStarted = false;
    syncPlatformUpdateSurface();
  }
  syncNotificationDot();
}, 60000);
