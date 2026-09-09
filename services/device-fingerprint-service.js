import { supabase } from './supabase-client.js';

// Empreinte basée sur des caractéristiques stables de l'appareil/navigateur
// (pas de stockage local aléatoire, pour ne pas pouvoir être effacée par
// l'utilisateur en vidant son cache).
async function computeFingerprint() {
  const parts = [
    navigator.userAgent || '',
    navigator.language || '',
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    navigator.hardwareConcurrency || '',
    navigator.deviceMemory || '',
    (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
    navigator.platform || ''
  ].join('|');
  const encoded = new TextEncoder().encode(parts);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function functionUrl(name) {
  const baseUrl = window.PLAYSTARS_SUPABASE_URL || '';
  if (!baseUrl || baseUrl.includes('TON-PROJET')) return null;
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${name}`;
}

// Appelée AVANT la création du compte : vérifie si l'appareil/l'IP a déjà
// 2 comptes ou plus. Retourne { blocked: false } en cas de doute ou de
// panne réseau — ne jamais empêcher une inscription légitime sur une
// simple erreur technique (la quarantaine après coup reste le filet de
// sécurité si ce pré-contrôle est indisponible).
export async function checkDeviceLimit() {
  try {
    const url = functionUrl('check-device-limit');
    if (!url) return { blocked: false };
    const fingerprint = await computeFingerprint();
    const anonKey = window.PLAYSTARS_SUPABASE_ANON_KEY || '';
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ fingerprint })
    });
    if (!response.ok) return { blocked: false };
    const payload = await response.json();
    return { blocked: Boolean(payload?.blocked) };
  } catch (error) {
    console.warn('Play Stars: vérification appareil impossible', error);
    return { blocked: false };
  }
}

// Appelée après une connexion ou une inscription réussie. Ne bloque jamais
// le flux (best-effort) : une panne réseau ici ne doit pas empêcher l'accès.
export async function registerDevice() {
  try {
    const url = functionUrl('register-device');
    if (!url) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const fingerprint = await computeFingerprint();
    const anonKey = window.PLAYSTARS_SUPABASE_ANON_KEY || '';
    await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey
      },
      body: JSON.stringify({ fingerprint })
    });
  } catch (error) {
    console.warn('Play Stars: enregistrement de l\'appareil impossible', error);
  }
}
