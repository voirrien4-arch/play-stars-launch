const STORAGE_KEY = 'play-stars-phase1-state';

const initialState = {
  view: 'home',
  selectedAppId: null,
  selectedCategory: null,
  searchQuery: '',
  searchCategory: null,
  ranking: 'popular',
  updatesFilter: 'recent',
  favoriteSort: 'recent',
  favorites: [],
  history: [],
  searchHistory: [],
  theme: 'light',
  notifications: []
};

let state = { ...initialState };
let persistTimer;

async function storage() {
  if (!window.localStorage) return null;
  return {
    getItem: async (key) => window.localStorage.getItem(key),
    setItem: async (key, value) => window.localStorage.setItem(key, value)
  };
}

export async function loadState() {
  try {
    const api = await storage();
    const raw = api ? await api.getItem(STORAGE_KEY) : null;
    if (raw) {
      state = { ...initialState, ...JSON.parse(raw) };
      state.favorites = Array.isArray(state.favorites) ? state.favorites.filter((item) => typeof item === 'string').slice(0, 200) : [];
      state.history = Array.isArray(state.history) ? state.history.filter((item) => typeof item === 'string').slice(0, 12) : [];
      state.searchHistory = Array.isArray(state.searchHistory)
        ? state.searchHistory.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, 12)
        : [];
      if (!['light', 'dark'].includes(state.theme)) state.theme = initialState.theme;
      if (!['popular', 'newest', 'rating'].includes(state.ranking)) state.ranking = initialState.ranking;
      if (!['recent', 'popular', 'rating'].includes(state.updatesFilter)) state.updatesFilter = initialState.updatesFilter;
      if (!['recent', 'popular', 'rating', 'name'].includes(state.favoriteSort)) state.favoriteSort = initialState.favoriteSort;
    }
  } catch (error) {
    console.warn('Play Stars: état local indisponible', error);
  }
  return getState();
}

export function getState() {
  return {
    ...state,
    favorites: Array.isArray(state.favorites) ? [...state.favorites] : [],
    history: Array.isArray(state.history) ? [...state.history] : [],
    searchHistory: Array.isArray(state.searchHistory) ? [...state.searchHistory] : []
  };
}

export function updateState(patch) {
  state = { ...state, ...patch };
  schedulePersist();
  return getState();
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const api = await storage();
      if (api) await api.setItem(STORAGE_KEY, JSON.stringify({ favorites: state.favorites, history: state.history, searchHistory: state.searchHistory, theme: state.theme, favoriteSort: state.favoriteSort }));
    } catch (error) { console.warn('Play Stars: sauvegarde impossible', error); }
  }, 80);
}

export function toggleFavorite(appId) {
  const isFavorite = state.favorites.includes(appId);
  state.favorites = isFavorite ? state.favorites.filter((id) => id !== appId) : [...state.favorites, appId];
  schedulePersist();
  return !isFavorite;
}

export function clearFavorites() {
  state.favorites = [];
  schedulePersist();
}

export function addToHistory(appId) {
  state.history = [appId, ...state.history.filter((id) => id !== appId)].slice(0, 12);
  schedulePersist();
}

export function addSearchHistory(query) {
  const value = String(query || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (value.length < 2) return false;
  state.searchHistory = [value, ...state.searchHistory.filter((item) => item.toLocaleLowerCase('fr') !== value.toLocaleLowerCase('fr'))].slice(0, 12);
  schedulePersist();
  return true;
}

export function removeSearchHistory(query) {
  const value = String(query || '').trim().toLocaleLowerCase('fr');
  state.searchHistory = state.searchHistory.filter((item) => item.toLocaleLowerCase('fr') !== value);
  schedulePersist();
}

export function clearSearchHistory() {
  state.searchHistory = [];
  schedulePersist();
}

export async function setTheme(theme) {
  updateState({ theme });
  document.documentElement.dataset.theme = theme;
}

export function resetTransientState() { state = { ...state, view: 'home', selectedAppId: null, selectedCategory: null, searchQuery: '', searchCategory: null }; }
