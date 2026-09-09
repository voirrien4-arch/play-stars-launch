import { escapeHtml, t } from './common.js';

function renderNotificationItem(item) {
  const importanceClass = item.priority === 'important' ? 'is-important' : '';
  const readAction = item.unread
    ? `<button class="notification-read-button" type="button" data-action="notification-read" data-notification-id="${escapeHtml(item.id)}">${t('notifications.readOne')}</button>`
    : `<span class="notification-seen" aria-label="${t('notifications.readLabel')}">✓</span>`;
  return `<article class="notification-item ${item.unread ? 'unread' : ''} ${importanceClass}">
    <span class="empty-icon" style="width:34px;height:34px;flex:0 0 34px;margin:0;font-size:15px">${escapeHtml(item.icon)}</span>
    <div class="notification-item-copy">
      <strong>${t(item.titleKey)}</strong>
      <p>${t(item.textKey)}</p>
      <time>${t(item.timeKey)}</time>
    </div>
    <div class="notification-item-actions">${readAction}</div>
  </article>`;
}

export function renderNotifications(notifications = [], filter = 'all') {
  const visible = filter === 'unread'
    ? notifications.filter((item) => item.unread)
    : notifications;
  const unreadCount = notifications.filter((item) => item.unread).length;
  const list = visible.length
    ? visible.map(renderNotificationItem).join('')
    : `<div class="empty-state">
        <div class="empty-icon">✓</div>
        <h2>${t(filter === 'unread' ? 'notifications.emptyUnread' : 'notifications.empty')}</h2>
        <p>${t(filter === 'unread' ? 'notifications.emptyUnreadText' : 'notifications.emptyText')}</p>
      </div>`;

  return `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationTitle" data-modal-content>
      <div class="modal-header">
        <div>
          <span class="eyebrow">${t('notifications.eyebrow')}</span>
          <h2 id="notificationTitle">${t('notifications.title')}</h2>
        </div>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button>
      </div>
      <div class="notifications-toolbar">
        <div class="notifications-tabs" role="tablist" aria-label="${t('notifications.filterLabel')}">
          <button class="notifications-tab ${filter === 'all' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${filter === 'all'}" data-action="notifications-filter" data-filter="all">${t('notifications.all')}</button>
          <button class="notifications-tab ${filter === 'unread' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${filter === 'unread'}" data-action="notifications-filter" data-filter="unread">${t('notifications.unread')}</button>
        </div>
        <span class="notifications-unread-count">${t('notifications.unreadCount', { count: unreadCount })}</span>
      </div>
      <div class="notification-list">${list}</div>
      ${unreadCount ? `<button class="button button-ghost" style="width:100%;margin-top:16px" type="button" data-action="mark-read">${t('notifications.markRead')}</button>` : ''}
    </section>
  </div>`;
}
