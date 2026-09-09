const express = require('express');
const path = require('path');
const { buildOgResponse } = require('./og-shared');

const app = express();
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://playstars.duckdns.org';

// Requête sur "/" avec un paramètre ?app=... : preview Open Graph pour
// les robots de partage (WhatsApp, Facebook, Telegram...), redirection
// directe vers la SPA pour les vrais visiteurs humains.
app.get('/', async (req, res, next) => {
  const appId = req.query.app;
  if (!appId) return next(); // Pas de paramètre app : sert index.html normalement.

  try {
    const result = await buildOgResponse({
      appId: String(appId),
      userAgent: req.get('user-agent') || '',
      siteUrl: SITE_URL
    });
    if (result.statusCode === 302) {
      return res.redirect(302, result.location);
    }
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).send(result.html);
  } catch (error) {
    console.error('Play Stars: erreur génération preview OG —', error);
    return next();
  }
});

// Route dédiée pour tester/déboguer directement la génération OG.
app.get('/og-preview', async (req, res) => {
  const appId = req.query.app || '';
  const result = await buildOgResponse({
    appId: String(appId),
    userAgent: 'whatsapp', // Force le mode "bot" pour l'aperçu de test.
    siteUrl: SITE_URL
  }).catch((error) => ({ statusCode: 500, html: `Erreur: ${error.message}` }));
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(result.statusCode === 302 ? 200 : result.statusCode).send(result.html || `Redirection vers ${result.location}`);
});

// Fichiers statiques (JS, CSS, images...). Le dossier admin/ est exclu :
// le panel admin est déployé séparément (voir play-stars-admin-netlify),
// il ne doit pas être accessible depuis le domaine public du site. Les
// fichiers .sql/.md (scripts de migration, notes internes) ne sont pas
// non plus destinés à être servis publiquement.
app.use((req, res, next) => {
  if (req.path.startsWith('/admin') || /\.(sql|md)$/i.test(req.path)) {
    return res.status(404).send('Not found');
  }
  next();
});
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Fallback SPA : toute autre route inconnue retombe sur index.html, pour
// que le routing côté client continue de fonctionner normalement.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Play Stars server listening on port ${PORT}`);
});
