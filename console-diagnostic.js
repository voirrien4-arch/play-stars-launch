// ============================================================
// DIAGNOSTIC PLAY STARS — à coller directement dans la console
// du navigateur (F12 ou menu développeur), sur le site déjà en
// ligne. Ne nécessite AUCUN redéploiement.
//
// Comment l'utiliser sur mobile (Chrome Android) :
// 1. Ouvre ton site Play Stars, connecte-toi normalement.
// 2. Dans Chrome, tape dans la barre d'adresse : chrome://inspect
//    (ou utilise "Eruda" / "vConsole" si tu n'as pas de PC à côté —
//    dis-le-moi si c'est le cas, je te donne une autre méthode).
// Le plus simple si tu as accès à un PC/Mac : ouvre le site sur
// l'ordinateur, appuie sur F12, va dans l'onglet "Console", colle
// ce script en entier, appuie sur Entrée, et copie-moi le résultat.
// ============================================================

(async () => {
  const log = (label, ok, detail = '') => {
    console.log(`%c${ok ? '✅' : '❌'} ${label}`, `color:${ok ? 'green' : 'red'};font-weight:bold`, detail);
  };

  console.log('%c--- Diagnostic Play Stars ---', 'font-size:14px;font-weight:bold');

  // 1. Le client Supabase est-il chargé sur cette page ?
  let supabaseClient;
  try {
    const mod = await import('/services/supabase-client.js');
    supabaseClient = mod.supabase;
    log('Module supabase-client.js chargé', true);
  } catch (e) {
    log('Module supabase-client.js chargé', false, e.message);
    console.log('→ Vérifie que tu es bien sur le site Play Stars (pas une autre page).');
    return;
  }

  // 2. Session active ?
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session;
  log('Session active', Boolean(session), session?.user?.email || '');

  // 3. Test réel d'upload dans apk/ (petit fichier texte, rapide)
  const start1 = performance.now();
  try {
    const testPath = `apk/console-diag-${Date.now()}.txt`;
    const { error } = await supabaseClient.storage.from('play-stars-files')
      .upload(testPath, new Blob(['test'], { type: 'text/plain' }));
    const ms = Math.round(performance.now() - start1);
    if (error) {
      log(`Upload test dans apk/ (${ms} ms)`, false, error.message);
    } else {
      log(`Upload test dans apk/ (${ms} ms)`, true);
      await supabaseClient.storage.from('play-stars-files').remove([testPath]);
    }
  } catch (e) {
    const ms = Math.round(performance.now() - start1);
    log(`Upload test dans apk/ (${ms} ms, exception réseau)`, false, e.message);
  }

  // 4. Test réel d'upload dans images/ (vrai PNG minimal)
  const start2 = performance.now();
  try {
    const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const testPath = `images/console-diag-${Date.now()}.png`;
    const { error } = await supabaseClient.storage.from('play-stars-files')
      .upload(testPath, new Blob([pngBytes], { type: 'image/png' }), { contentType: 'image/png' });
    const ms = Math.round(performance.now() - start2);
    if (error) {
      log(`Upload test dans images/ (${ms} ms)`, false, error.message);
    } else {
      log(`Upload test dans images/ (${ms} ms)`, true);
      await supabaseClient.storage.from('play-stars-files').remove([testPath]);
    }
  } catch (e) {
    const ms = Math.round(performance.now() - start2);
    log(`Upload test dans images/ (${ms} ms, exception réseau)`, false, e.message);
  }

  // 5. Vitesse de connexion générale (fetch simple vers Supabase, sans storage)
  const start3 = performance.now();
  try {
    await fetch(window.PLAYSTARS_SUPABASE_URL + '/auth/v1/health', { method: 'GET' });
    const ms = Math.round(performance.now() - start3);
    log(`Ping serveur Supabase (${ms} ms)`, ms < 3000, ms >= 3000 ? 'Connexion lente' : '');
  } catch (e) {
    const ms = Math.round(performance.now() - start3);
    log(`Ping serveur Supabase (${ms} ms, échec)`, false, e.message);
  }

  console.log('%c--- Fin du diagnostic — copie tout ce bloc et envoie-le ---', 'font-size:14px;font-weight:bold');
})();
