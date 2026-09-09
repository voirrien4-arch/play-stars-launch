// Edge Function Supabase — vérification préventive anti-multi-comptes.
// Appelée AVANT la création du compte (donc sans utilisateur connecté),
// pour bloquer l'inscription elle-même si l'appareil/l'IP a déjà 2 comptes
// ou plus liés, plutôt que de laisser le compte se créer puis le mettre
// en quarantaine après coup.
//
// Déploiement : "Verify JWT" doit être désactivé pour cette fonction.

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
  if (!fingerprint) return jsonResponse({ blocked: false });

  const ip = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim())
    || request.headers.get('cf-connecting-ip')
    || 'unknown';

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: matches } = await admin
      .from('device_fingerprints')
      .select('profile_id')
      .or(`fingerprint_hash.eq.${fingerprint},ip_address.eq.${ip}`);

    const distinctAccounts = new Set((matches || []).map((row: { profile_id: string }) => row.profile_id));

    return jsonResponse({ blocked: distinctAccounts.size >= 2, matchedAccounts: distinctAccounts.size });
  } catch (error) {
    console.error('check-device-limit error:', error);
    // En cas de panne, on laisse passer plutôt que de bloquer des inscriptions légitimes.
    return jsonResponse({ blocked: false });
  }
});
