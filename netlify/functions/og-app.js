// Netlify Function : sert une page HTML minimale avec les balises Open
// Graph/Twitter Card pour une publication précise, afin que WhatsApp,
// Facebook, Telegram, etc. affichent un aperçu riche (nom, image,
// description) quand un lien d'app est partagé.
//
// Les robots de ces plateformes ne lisent que le HTML statique — ils
// n'exécutent pas le JavaScript de la SPA — donc les meta tags générés
// côté client ne leur sont jamais visibles. Cette fonction leur sert
// une page dédiée pendant que les vrais visiteurs humains sont
// redirigés vers l'application normale (voir netlify.toml).

const SUPABASE_URL = process.env.PLAYSTARS_SUPABASE_URL || 'https://hdbscsygultpzurfydpn.supabase.co';
const SUPABASE_ANON_KEY = process.env.PLAYSTARS_SUPABASE_ANON_KEY || 'sb_publishable_19cEMplz7rGqCy4GMEM6XQ__LRaFj1I';
const SITE_URL = process.env.URL || 'https://playstars.duckdns.org';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
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

function renderHtml({ appId, name, description, imageUrl, pageUrl }) {
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

const BOT_USER_AGENT_PATTERN = /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|pinterest|skypeuripreview|vkshare|redditbot|applebot|googlebot/i;

exports.handler = async (event) => {
  const appId = event.queryStringParameters?.app || '';
  const publicationId = appId.replace(/^publication-/, '');
  const pageUrl = `${SITE_URL}/?app=${encodeURIComponent(appId)}`;
  const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || '';
  const isBot = BOT_USER_AGENT_PATTERN.test(userAgent);

  if (!publicationId) {
    return { statusCode: 302, headers: { Location: SITE_URL } };
  }

  // Un vrai visiteur humain n'a pas besoin de cette page intermédiaire :
  // on le renvoie directement vers la SPA, qui gère déjà l'ouverture de
  // la bonne fiche via son propre routing (state.view / ?app=...).
  if (!isBot) {
    return { statusCode: 302, headers: { Location: `${SITE_URL}/index.html?app=${encodeURIComponent(appId)}` } };
  }

  const publication = await fetchPublication(publicationId).catch(() => null);

  if (!publication) {
    // App introuvable ou pas encore approuvée : redirige simplement,
    // pas d'erreur affichée aux robots ni aux visiteurs.
    return { statusCode: 302, headers: { Location: pageUrl } };
  }

  const html = renderHtml({
    appId,
    name: publication.app_name || 'Application',
    description: publication.release_notes?.slice(0, 200) || 'Découvre cette application sur Play Stars.',
    imageUrl: publication.icon?.publicUrl || '',
    pageUrl
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: html
  };
};
