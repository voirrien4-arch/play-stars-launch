// Logique partagée pour générer la page de preview Open Graph d'une
// publication — utilisée à la fois par netlify/functions/og-app.js (si
// jamais redéployé sur Netlify) et server.js (déploiement Render).

const SUPABASE_URL = process.env.PLAYSTARS_SUPABASE_URL || 'https://hdbscsygultpzurfydpn.supabase.co';
const SUPABASE_ANON_KEY = process.env.PLAYSTARS_SUPABASE_ANON_KEY || 'sb_publishable_19cEMplz7rGqCy4GMEM6XQ__LRaFj1I';

const BOT_USER_AGENT_PATTERN = /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|pinterest|skypeuripreview|vkshare|redditbot|applebot|googlebot/i;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function isBotUserAgent(userAgent = '') {
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

async function fetchPublication(publicationId) {
  const url = `${SUPABASE_URL}/rest/v1/publications?id=eq.${encodeURIComponent(publicationId)}&status=eq.approved&select=*`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0] || null;
}

function renderOgHtml({ name, description, imageUrl, pageUrl }) {
  const safeName = escapeHtml(name);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(pageUrl);
  const imageTags = imageUrl ? `
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${safeName} · Play Stars</title>
  <meta name="description" content="${safeDescription}">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeName} · Play Stars">
  <meta property="og:description" content="${safeDescription}">${imageTags}
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:site_name" content="Play Stars">

  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${safeName} · Play Stars">
  <meta name="twitter:description" content="${safeDescription}">

  <meta http-equiv="refresh" content="0; url=${safeUrl}">
  <script>window.location.replace(${JSON.stringify(pageUrl)});</script>
</head>
<body>
  <p>Redirection vers <a href="${safeUrl}">${safeName} sur Play Stars</a>…</p>
</body>
</html>`;
}

/**
 * Construit la réponse (statusCode, headers, body|Location) pour une
 * requête sur "/" avec ?app=... — indépendant du framework HTTP utilisé.
 */
async function buildOgResponse({ appId, userAgent, siteUrl }) {
  const publicationId = String(appId || '').replace(/^publication-/, '');
  const pageUrl = `${siteUrl}/?app=${encodeURIComponent(appId)}`;

  if (!publicationId) {
    return { statusCode: 302, location: siteUrl };
  }

  if (!isBotUserAgent(userAgent)) {
    return { statusCode: 302, location: `${siteUrl}/index.html?app=${encodeURIComponent(appId)}` };
  }

  const publication = await fetchPublication(publicationId).catch(() => null);
  if (!publication) {
    return { statusCode: 302, location: pageUrl };
  }

  const html = renderOgHtml({
    name: publication.app_name || 'Application',
    description: publication.release_notes?.slice(0, 200) || 'Découvre cette application sur Play Stars.',
    imageUrl: publication.icon?.publicUrl || '',
    pageUrl
  });

  return { statusCode: 200, html };
}

module.exports = { buildOgResponse, isBotUserAgent, fetchPublication, renderOgHtml };
