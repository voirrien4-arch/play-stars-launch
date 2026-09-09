import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';

function statusNotifications() {
  const user = getCurrentUser();
  if (!user || user.developerStatus === 'none') return [];
  const titleKey = user.developerStatus === 'approved' ? 'notifications.developerApprovedTitle' : 'notifications.developerStatusTitle';
  const textKey = user.developerStatus === 'approved' ? 'notifications.developerApprovedText' : 'notifications.developerStatusText';
  return [{
    id: `developer-status-${user.developerStatus}`,
    titleKey,
    textKey,
    timeKey: 'notifications.timeNow',
    icon: user.developerStatus === 'approved' ? '✓' : '✦',
    priority: user.developerStatus === 'pending' ? 'important' : 'normal'
  }];
}

function availableNotifications() {
  return statusNotifications().map((item) => ({ priority: 'normal', ...item }));
}

export async function loadNotifications() {
  const user = getCurrentUser();
  const notifications = availableNotifications();
  if (!user || !notifications.length) return notifications.map((item) => ({ ...item, unread: true }));

  const ids = notifications.map((item) => item.id);
  const { data, error } = await supabase.from('notification_reads').select('notification_id').eq('user_id', user.id).in('notification_id', ids);
  const readIds = new Set(error ? [] : data.map((row) => row.notification_id));
  return notifications.map((item) => ({ ...item, unread: !readIds.has(item.id) }));
}

export async function markNotificationRead(notificationId) {
  const user = getCurrentUser();
  const notifications = await loadNotifications();
  if (!user || !notifications.some((item) => item.id === notificationId)) return notifications;
  await supabase.from('notification_reads').upsert({ user_id: user.id, notification_id: notificationId }, { onConflict: 'user_id,notification_id' });
  return loadNotifications();
}

export async function markAllNotificationsRead() {
  const user = getCurrentUser();
  const notifications = availableNotifications();
  if (!user || !notifications.length) return loadNotifications();
  const rows = notifications.map((item) => ({ user_id: user.id, notification_id: item.id }));
  await supabase.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id' });
  return loadNotifications();
}

export function countUnreadNotifications(notifications = []) {
  return notifications.filter((item) => item.unread).length;
}
