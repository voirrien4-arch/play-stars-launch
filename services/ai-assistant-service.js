import { clampNumber, safeGradient, safeMediaUrl, safeString, safeHttpUrl } from './security-service.js';

const MAX_MESSAGE_LENGTH = 500;

function functionUrl() {
  const baseUrl = safeHttpUrl(window.PLAYSTARS_SUPABASE_URL || '', { allowEmpty: true });
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/functions/v1/ai-assistant` : null;
}

function normalizeRemoteApp(item) {
  if (!item || typeof item !== 'object') return null;
  const id = safeString(item.id, 128);
  const name = safeString(item.name, 120);
  if (!id || !name) return null;
  const iconUrl = safeMediaUrl(item.icon?.publicUrl || item.iconUrl);
  return {
    id,
    name,
    developer: safeString(item.developer, 120),
    categoryName: safeString(item.categoryName || item.category, 80),
    description: safeString(item.description, 600),
    version: safeString(item.version, 40),
    size: safeString(item.size, 40),
    rating: clampNumber(item.rating, 0, 5, 0),
    reviews: Math.round(clampNumber(item.reviews, 0, 100000000, 0)),
    downloads: Math.round(clampNumber(item.downloads, 0, 1000000000, 0)),
    gradient: safeGradient(item.gradient),
    initials: safeString(item.initials || name.slice(0, 2), 4),
    icon: iconUrl ? { publicUrl: iconUrl } : null,
    securityStatus: ['verified', 'review_required', 'pending'].includes(item.securityStatus) ? item.securityStatus : 'pending',
    verified: item.verified === true
  };
}

// Envoie un message libre à l'assistant IA Play Stars (Gemini côté serveur).
// Retourne toujours une forme prévisible :
//   { type: 'text', text }
//   { type: 'apps', text, results }
//   { type: 'creator', text, channelUrl, creatorName }
export async function askAiAssistant(message) {
  const cleanMessage = String(message || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!cleanMessage) return { type: 'text', text: '' };

  const url = functionUrl();
  if (!url) throw new Error('aiAssistant.unavailable');

  const anonKey = window.PLAYSTARS_SUPABASE_ANON_KEY || '';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {})
      },
      body: JSON.stringify({ message: cleanMessage }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) detail += ` — ${errorPayload.error}`;
      } catch {
        // pas de corps JSON exploitable
      }
      console.error('Play Stars: assistant IA — réponse non OK', detail);
      const debugError = new Error('aiAssistant.unavailable');
      debugError.debugDetail = detail;
      throw debugError;
    }
    const payload = await response.json();
    if (payload?.error) {
      console.error('Play Stars: assistant IA — erreur applicative', payload.error);
      const debugError = new Error('aiAssistant.unavailable');
      debugError.debugDetail = payload.error;
      throw debugError;
    }

    if (payload.type === 'apps') {
      return {
        type: 'apps',
        text: safeString(payload.text, 400),
        results: Array.isArray(payload.results) ? payload.results.map(normalizeRemoteApp).filter(Boolean).slice(0, 8) : []
      };
    }
    if (payload.type === 'creator') {
      return {
        type: 'creator',
        text: safeString(payload.text, 300),
        channelUrl: safeHttpUrl(payload.channelUrl, { allowEmpty: true }) || '',
        creatorName: safeString(payload.creatorName, 80)
      };
    }
    return { type: 'text', text: safeString(payload.text, 800) };
  } finally {
    window.clearTimeout(timeout);
  }
}
