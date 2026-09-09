// Edge Function Supabase — anti-multi-comptes.
// Appelée après chaque connexion/inscription réussie côté client.
// Enregistre l'empreinte appareil + IP, et met le compte en quarantaine
// si l'appareil/l'IP est déjà lié à 2 comptes ou plus (donc celui-ci serait
// le 3e). Utilise la clé service_role (fournie automatiquement par
// Supabase à toutes les Edge Functions, jamais exposée au navigateur).
//
// Déploiement : "Verify JWT" doit être désactivé pour cette fonction
// (l'identité de l'utilisateur est vérifiée manuellement via son token
// de session, pas via le mécanisme JWT natif de la plateforme).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (!SERVICE_ROLE_KEY) return jsonResponse({ error: 'not_configured' }, 503);

  let body: { fingerprint?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const fingerprint = String(body?.fingerprint ?? '').trim().slice(0, 128);
  if (!fingerprint) return jsonResponse({ error: 'missing_fingerprint' }, 400);

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'missing_token' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401);
  const userId = userData.user.id;

  const ip = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim())
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || '';

  try {
    const { data: matches } = await admin
      .from('device_fingerprints')
      .select('profile_id')
      .or(`fingerprint_hash.eq.${fingerprint},ip_address.eq.${ip}`)
      .neq('profile_id', userId);

    const distinctOtherAccounts = new Set((matches || []).map((row: { profile_id: string }) => row.profile_id));

    await admin.from('device_fingerprints').insert({
      profile_id: userId,
      fingerprint_hash: fingerprint,
      ip_address: ip,
      user_agent: userAgent
    });

    if (distinctOtherAccounts.size >= 2) {
      const { data: currentProfile } = await admin.from('profiles').select('status').eq('id', userId).single();
      if (currentProfile?.status === 'active') {
        await admin.from('profiles').update({
          status: 'quarantined',
          quarantine_reason: 'Plusieurs comptes détectés sur le même appareil ou la même adresse IP.'
        }).eq('id', userId);

        await admin.from('security_alerts').insert({
          profile_id: userId,
          alert_type: 'multi_account',
          details: { fingerprint, ip, matchedAccounts: distinctOtherAccounts.size + 1 }
        });
      }
      return jsonResponse({ quarantined: true });
    }

    return jsonResponse({ quarantined: false });
  } catch (error) {
    console.error('register-device error:', error);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
