import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';
import { safeString } from './security-service.js';

export async function reportApp(appId, publicationId, reason) {
  const user = getCurrentUser();
  if (!user) throw new Error('auth.loginRequired');
  const cleanReason = safeString(reason, 500);
  if (cleanReason.trim().length < 5) throw new Error('report.reasonRequired');

  const { error } = await supabase.from('app_reports').insert({
    app_id: appId,
    publication_id: publicationId || null,
    reporter_id: user.id,
    reason: cleanReason.trim()
  });
  if (error) throw new Error('report.sendFailed');
}

export async function listAppReports() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  const { data, error } = await supabase
    .from('app_reports')
    .select('id, app_id, publication_id, reason, status, created_at, publications:publication_id(app_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    appId: row.app_id,
    publicationId: row.publication_id,
    appName: row.publications?.app_name || '',
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at
  }));
}

export async function resolveAppReport(reportId) {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  const { error } = await supabase.from('app_reports').update({ status: 'resolved' }).eq('id', reportId);
  if (error) throw new Error('auth.genericError');
}
