// Edge Function Supabase — assistant IA Play Stars.
// Gère : recherche/recommandation d'apps dans le catalogue, aide à la
// rédaction de descriptions APK pour les développeurs, réponses générales,
// et redirection vers la chaîne officielle si on demande "qui a créé Play Stars".
//
// Les réponses passent par un proxy externe (cbg-gemini-proxy) au lieu
// d'appeler l'API Gemini directement : plus besoin de secret GEMINI_API_KEY
// côté Supabase.
//
// Déploiement :
//   supabase functions deploy ai-assistant

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROXY_ENDPOINT = 'https://cbg-gemini-proxy.onrender.com/api/ai';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CREATOR_NAME = 'Mcamara';
const CREATOR_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function loadCatalog(): Promise<Array<Record<string, unknown>>> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from('publications')
    .select('id, app_name, package_name, category, release_notes, icon')
    .eq('status', 'approved')
    .limit(200);
  if (error || !data) return [];
  return data.map((row) => ({
    id: `publication-${row.id}`,
    name: row.app_name,
    packageName: row.package_name,
    category: row.category,
    description: row.release_notes ?? '',
    icon: row.icon
  }));
}

function asksAboutCreator(message: string): boolean {
  const normalized = message.toLowerCase();
  return /(qui\s+(a\s+)?(cr[ée]e|d[ée]veloppe|fait|gère)|createur|créateur|développeur\s+de\s+play\s*stars|derrière\s+play\s*stars)/i.test(normalized);
}

// Le proxy externe ne garantit pas une forme de réponse fixe (selon son
// implémentation, le texte peut arriver dans différents champs, ou en
// texte brut) : on essaie les formes les plus probables avant d'abandonner.
async function callProxy(message: string): Promise<string> {
  const response = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: message })
  });
  if (!response.ok) throw new Error(`Proxy error (${response.status})`);

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return raw.trim();
  }

  if (typeof payload === 'string') return payload.trim();
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidate = record.answer ?? record.text ?? record.response ?? record.message ?? record.reply
      ?? record.result ?? record.output ?? record.content;
    if (typeof candidate === 'string') return candidate.trim();
    const nested = (record as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof nested === 'string') return nested.trim();
  }
  return '';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Le proxy externe (hébergement gratuit) peut se mettre en veille après
// inactivité : le premier appel échoue pendant son réveil (quelques
// secondes). On retente une fois avant d'abandonner.
async function callProxyWithRetry(message: string): Promise<string> {
  try {
    return await callProxy(message);
  } catch (error) {
    console.warn('ai-assistant: premier appel proxy échoué, nouvelle tentative dans 4s', error);
    await sleep(4000);
    return await callProxy(message);
  }
}

async function searchCatalog(message: string, catalog: Array<Record<string, unknown>>) {
  const prompt = `Tu es le moteur de recherche du catalogue d'applications Android "Play Stars".
Catalogue disponible (JSON) :
${JSON.stringify(catalog).slice(0, 12000)}

Requête utilisateur : "${message}"

Réponds UNIQUEMENT avec un tableau JSON des "id" les plus pertinents (max 8), du plus au moins pertinent. Tableau vide [] si rien de pertinent. Aucun texte autour, aucune balise markdown.`;

  const text = await callProxyWithRetry(prompt);
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const ids = JSON.parse(cleaned);
    return Array.isArray(ids) ? ids.filter((id: unknown) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function helpWithDescription(message: string): Promise<string> {
  const prompt = `Tu es l'assistant développeur de la plateforme Android "Play Stars". Un développeur te demande de l'aide pour rédiger ou améliorer la description ou les notes de version de son application.

Demande du développeur : "${message}"

Rédige une réponse utile, concise et en français, avec une proposition concrète de texte (description ou notes de version selon le contexte). Reste factuel, évite les emojis excessifs, adapte le ton à une fiche d'application professionnelle.`;
  return await callProxyWithRetry(prompt);
}

async function recommend(message: string, catalog: Array<Record<string, unknown>>): Promise<{ text: string; ids: string[] }> {
  const prompt = `Tu es l'assistant de recommandation du catalogue Android "Play Stars".
Catalogue disponible (JSON) :
${JSON.stringify(catalog).slice(0, 12000)}

Demande utilisateur : "${message}"

Réponds avec un objet JSON strict de cette forme, sans texte autour ni balises markdown :
{"text": "une courte phrase de recommandation en français (1-2 phrases)", "ids": ["id1", "id2"]}
"ids" contient au maximum 6 identifiants d'applications du catalogue pertinents pour la demande, triés du plus au moins pertinent. Si rien n'est pertinent, "ids" est un tableau vide.`;

  const text = await callProxyWithRetry(prompt);
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((id: unknown) => typeof id === 'string') : []
    };
  } catch {
    return { text: cleaned.slice(0, 400), ids: [] };
  }
}

async function generalAnswer(message: string): Promise<string> {
  const prompt = `Tu es l'assistant officiel de la plateforme Android "Play Stars" (une boutique d'applications communautaire). Réponds en français, de façon utile, brève (maximum 5 phrases) et amicale.

Question de l'utilisateur : "${message}"`;
  return await callProxyWithRetry(prompt);
}

// Classification locale par mots-clés — évite un appel réseau supplémentaire
// au proxy externe (moins fiable étant hébergé gratuitement) rien que pour
// déterminer l'intention. Une petite imprécision ici est un moindre mal
// comparé à doubler le risque d'échec de chaque message.
function detectIntent(message: string): 'search' | 'recommend' | 'describe' | 'general' {
  const normalized = message.toLowerCase();
  if (/(d[ée]cri[st]|r[ée]dige|notes? de version|fiche produit|description de (mon|l'|l’)appli|am[ée]liore.*(description|texte))/i.test(normalized)) {
    return 'describe';
  }
  if (/(recommand|conseill|sugg[eè]r|propos.*app|quelle app|des id[ée]es d'app|une app (pour|de))/i.test(normalized)) {
    return 'recommend';
  }
  if (/(cherche|trouve( |-)moi|je (cherche|veux) l'app|as-tu l'app|existe.*app)/i.test(normalized)) {
    return 'search';
  }
  return 'general';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const message = String(body?.message ?? '').trim().slice(0, 500);
  if (!message) return jsonResponse({ type: 'text', text: '' });

  if (asksAboutCreator(message)) {
    return jsonResponse({
      type: 'creator',
      text: `Play Stars est créé par ${CREATOR_NAME}. Retrouve toutes les actualités sur la chaîne WhatsApp officielle.`,
      channelUrl: CREATOR_CHANNEL_URL,
      creatorName: CREATOR_NAME
    });
  }

  try {
    const intent = detectIntent(message);

    if (intent === 'describe') {
      const text = await helpWithDescription(message);
      return jsonResponse({ type: 'text', text });
    }

    const catalog = await loadCatalog();

    if (intent === 'search') {
      const ids = catalog.length ? await searchCatalog(message, catalog) : [];
      const catalogById = new Map(catalog.map((app) => [app.id, app]));
      const results = ids.map((id: string) => catalogById.get(id)).filter(Boolean);
      return jsonResponse({ type: 'apps', results });
    }

    if (intent === 'recommend') {
      if (!catalog.length) return jsonResponse({ type: 'apps', text: '', results: [] });
      const { text, ids } = await recommend(message, catalog);
      const catalogById = new Map(catalog.map((app) => [app.id, app]));
      const results = ids.map((id) => catalogById.get(id)).filter(Boolean);
      return jsonResponse({ type: 'apps', text, results });
    }

    const text = await generalAnswer(message);
    return jsonResponse({ type: 'text', text });
  } catch (error) {
    console.error('ai-assistant error:', error);
    return jsonResponse({ error: 'assistant_failed' }, 500);
  }
});
