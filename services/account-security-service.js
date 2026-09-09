import { supabase } from './supabase-client.js';
import { getCurrentUser, requestAccountVerification } from './auth-service.js';

function requireAdmin() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  return user;
}

function functionUrl(name) {
  const baseUrl = window.PLAYSTARS_SUPABASE_URL || '';
  if (!baseUrl || baseUrl.includes('TON-PROJET')) return null;
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${name}`;
}

async function callAdminAction(payload) {
  const url = functionUrl('admin-account-action');
  if (!url) throw new Error('security.adminActionUnavailable');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('auth.loginRequired');
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: window.PLAYSTARS_SUPABASE_ANON_KEY || ''
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error('security.adminActionUnavailable');
  return result;
}

// Liste les comptes actuellement en quarantaine, avec le détail des
// appareils/IP partagés pour que l'admin puisse trancher.
export async function listQuarantinedAccounts() {
  requireAdmin();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_initial, status, quarantine_reason, verification_requested, verification_note, created_at')
    .eq('status', 'quarantined')
    .order('created_at', { ascending: false });
  if (error) throw new Error('auth.genericError');

  const { data: alerts } = await supabase
    .from('security_alerts')
    .select('id, profile_id, details, status, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const alertsByProfile = new Map();
  (alerts || []).forEach((alert) => {
    if (!alertsByProfile.has(alert.profile_id)) alertsByProfile.set(alert.profile_id, alert);
  });

  return (profiles || []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    avatarInitial: profile.avatar_initial,
    quarantineReason: profile.quarantine_reason,
    verificationRequested: profile.verification_requested,
    verificationNote: profile.verification_note,
    createdAt: profile.created_at,
    alert: alertsByProfile.get(profile.id) || null
  }));
}

export async function unlockAccount(targetUserId) {
  requireAdmin();
  return callAdminAction({ action: 'unlock', targetUserId });
}

export async function banAccount(targetUserId) {
  requireAdmin();
  return callAdminAction({ action: 'ban', targetUserId });
}

export async function deleteAccount(targetUserId) {
  requireAdmin();
  return callAdminAction({ action: 'delete', targetUserId });
}

export async function resolveSecurityAlert(alertId) {
  requireAdmin();
  return callAdminAction({ action: 'resolve_alert', alertId });
}

export async function listOpenSecurityAlerts() {
  requireAdmin();
  const { data, error } = await supabase
    .from('security_alerts')
    .select('id, profile_id, details, status, created_at, profiles:profile_id(username)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    username: row.profiles?.username || '',
    details: row.details,
    status: row.status,
    createdAt: row.created_at
  }));
}

export async function listAllUsers({ search = '', role = '', status = '' } = {}) {
  requireAdmin();
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
  if (role) query = query.eq('role', role);
  if (status) query = query.eq('status', status);
  if (search.trim()) query = query.ilike('username', `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw new Error('auth.genericError');
  return data || [];
}

export async function setUserRole(targetUserId, role) {
  requireAdmin();
  if (!['user', 'admin'].includes(role)) throw new Error('security.invalidRole');
  const { error } = await supabase.from('profiles').update({ role }).eq('id', targetUserId);
  if (error) throw new Error('auth.genericError');
}

export { requestAccountVerification };
