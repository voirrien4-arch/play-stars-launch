// Edge Function Supabase — actions admin sur un compte (débloquer,
// bannir, supprimer). La suppression d'un compte auth.users nécessite
// la clé service_role (l'API admin n'est pas accessible depuis le
// navigateur), d'où le passage par une Edge Function.
//
// Déploiement : "Verify JWT" doit être désactivé pour cette fonction
// (l'identité admin est vérifiée manuellement ci-dessous).

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

const ALLOWED_ACTIONS = ['unlock', 'ban', 'delete', 'resolve_alert'];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (!SERVICE_ROLE_KEY) return jsonResponse({ error: 'not_configured' }, 503);

  let body: { targetUserId?: string; action?: string; alertId?: number };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const action = String(body?.action ?? '');
  if (!ALLOWED_ACTIONS.includes(action)) return jsonResponse({ error: 'invalid_action' }, 400);

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'missing_token' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401);

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  if (callerProfile?.role !== 'admin') return jsonResponse({ error: 'admin_required' }, 403);

  try {
    if (action === 'resolve_alert') {
      const alertId = Number(body?.alertId);
      if (!alertId) return jsonResponse({ error: 'missing_alert_id' }, 400);
      await admin.from('security_alerts').update({ status: 'resolved' }).eq('id', alertId);
      return jsonResponse({ ok: true });
    }

    const targetUserId = String(body?.targetUserId ?? '');
    if (!targetUserId) return jsonResponse({ error: 'missing_target' }, 400);

    if (action === 'unlock') {
      const { data, error: unlockError } = await admin.from('profiles').update({
        status: 'active',
        quarantine_reason: null,
        verification_requested: false
      }).eq('id', targetUserId).select('id');
      if (unlockError) throw unlockError;
      if (!data || data.length === 0) return jsonResponse({ error: 'target_not_found' }, 404);
      return jsonResponse({ ok: true });
    }

    if (action === 'ban') {
      const { data, error: banError } = await admin.from('profiles').update({ status: 'banned' }).eq('id', targetUserId).select('id');
      if (banError) throw banError;
      if (!data || data.length === 0) return jsonResponse({ error: 'target_not_found' }, 404);
      return jsonResponse({ ok: true });
    }

    if (action === 'delete') {
      const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw deleteError;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'invalid_action' }, 400);
  } catch (error) {
    console.error('admin-account-action error:', error);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
