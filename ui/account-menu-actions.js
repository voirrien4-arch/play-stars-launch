import { renderNotifications } from './notification-view.js';
import { renderAccountFeature } from './account-feature-view.js';
import { renderFeedbackModal } from './feedback-view.js';
import { loadNotifications } from '../services/notification-service.js';

export async function openAccountMenuItem(item, modalRoot, user = null) {
  if (item === 'accountMenu.notifications') {
    modalRoot.innerHTML = renderNotifications(await loadNotifications());
  } else if (item === 'accountMenu.feedback') {
    modalRoot.innerHTML = renderFeedbackModal(user);
  } else {
    modalRoot.innerHTML = renderAccountFeature(item);
  }
  modalRoot.querySelector('.modal-close')?.focus();
}
