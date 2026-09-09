import { categories } from '../data/catalog.js';
import { listAllPublications } from './publication-service.js';
import { getReviewSummary } from './review-service.js';
import { safeHttpUrl } from './security-service.js';

function publishedApp(publication) {
  const category = categories.find((item) => item.id === publication.category);
  const updatedAt = publication.updatedAt || publication.createdAt;
  return {
    id: `publication-${publication.id}`,
    publicationId: publication.id,
    name: publication.appName,
    developer: publication.ownerName || 'Développeur Play Stars',
    category: publication.category || 'tools',
    categoryName: category?.name || 'Outils',
    description: publication.releaseNotes || 'Une application Android publiée sur Play Stars.',
    version: publication.version,
    size: formatFileSize(publication.file?.sizeBytes),
    sizeBytes: publication.file?.sizeBytes || 0,
    android: '8.0+',
    rating: 0,
    reviews: 0,
    downloads: publication.downloadCount || 0,
    updated: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(updatedAt)),
    updatedAt,
    initials: publication.appName.slice(0, 2).toUpperCase(),
    gradient: 'linear-gradient(135deg,#6046e8,#a48cfb)',
    icon: publication.icon || null,
    verified: publication.ownerVerified === true,
    permissions: publication.permissions || 'À vérifier',
    releaseNotes: publication.releaseNotes || 'Première version publiée.',
    screenshots: publication.screenshots || [],
    officialUrl: safeHttpUrl(publication.officialUrl, { allowEmpty: true }) || '',
    downloadUrl: safeHttpUrl(publication.file?.publicUrl, { allowEmpty: true }) || '',
    downloadName: publication.file?.originalName || `${publication.appName}.apk`,
    securityStatus: publication.securityStatus || 'pending'
  };
}

async function allApps() {
  const publications = await listAllPublications();
  const approved = publications.filter((publication) => publication.status === 'approved');
  const catalog = approved.map(publishedApp);
  return Promise.all(catalog.map(async (app) => {
    const summary = await getReviewSummary(app.id);
    if (!summary.count) return app;
    const totalReviews = (app.reviews || 0) + summary.count;
    const weightedAverage = (((app.rating || 0) * (app.reviews || 0)) + (summary.average * summary.count)) / totalReviews;
    return { ...app, reviews: totalReviews, rating: Math.round(weightedAverage * 10) / 10 };
  }));
}

function normalizeSearchValue(value = '') {
  return String(value)
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Distance d'édition simple (Levenshtein), plafonnée pour rester rapide
// même sur un grand catalogue : on ne calcule jamais au-delà du seuil
// toléré, on arrête dès qu'on sait que ce sera dépassé.
function editDistanceWithinLimit(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, col) => col);
  for (let row = 1; row < rows; row += 1) {
    const current = [row];
    let rowMin = current[0];
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      const value = Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return false;
    previous = current;
  }
  return previous[cols - 1] <= limit;
}

// Un token ne matche pas exactement en sous-chaîne : on tolère une petite
// faute de frappe (1 caractère pour un mot court, 2 pour un mot long) en
// comparant aux mots du texte cible.
function fuzzyTokenMatch(token, searchableWords) {
  if (token.length < 4) return false;
  const limit = token.length <= 6 ? 1 : 2;
  return searchableWords.some((word) => Math.abs(word.length - token.length) <= limit && editDistanceWithinLimit(token, word, limit));
}

function searchScore(app, queryTokens, normalizedQuery) {
  const name = normalizeSearchValue(app.name);
  const developer = normalizeSearchValue(app.developer);
  const category = normalizeSearchValue(app.categoryName);
  const description = normalizeSearchValue(`${app.description} ${app.releaseNotes || ''}`);
  const searchable = `${name} ${developer} ${category} ${description}`;
  const searchableWords = searchable.split(' ').filter(Boolean);

  const allTokensMatch = queryTokens.every((token) => {
    if (searchable.includes(token)) return true;
    return fuzzyTokenMatch(token, searchableWords);
  });
  if (!allTokensMatch) return 0;

  let score = 100;
  if (name === normalizedQuery) score += 1200;
  else if (name.startsWith(normalizedQuery)) score += 900;
  else if (name.includes(normalizedQuery)) score += 650;
  queryTokens.forEach((token) => {
    if (name.split(' ').some((word) => word.startsWith(token))) score += 180;
    if (developer.includes(token)) score += 90;
    if (category.includes(token)) score += 75;
    if (description.includes(token)) score += 25;
    if (!searchable.includes(token)) score -= 40; // léger malus si ce n'est qu'un match approximatif
  });
  return score;
}

export const appRepository = {
  async list({ query = '', category = null, ranking = 'popular' } = {}) {
    const normalized = normalizeSearchValue(query);
    const queryTokens = normalized.split(' ').filter(Boolean);
    const appsList = await allApps();
    const ranked = appsList.map((app) => ({
      app,
      score: normalized ? searchScore(app, queryTokens, normalized) : 1
    })).filter(({ app, score }) => (!normalized || score > 0) && (!category || app.category === category));

    ranked.sort((first, second) => {
      if (normalized && second.score !== first.score) return second.score - first.score;
      if (ranking === 'newest') return new Date(second.app.updatedAt || 0) - new Date(first.app.updatedAt || 0);
      if (ranking === 'rating') return Number(second.app.rating || 0) - Number(first.app.rating || 0);
      return Number(second.app.downloads || 0) - Number(first.app.downloads || 0);
    });
    return ranked.map(({ app }) => app);
  },
  async getById(id) { return (await allApps()).find((app) => app.id === id) ?? null; },
  async listCategories() { return categories; },
  async listUpdated() { return (await this.list({ ranking: 'newest' })).slice(0, 12); }
};

export function formatCount(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace('.', ',')} k`;
  return String(value);
}

export function formatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}
