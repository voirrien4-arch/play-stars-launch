import { getCurrentUser, listDeveloperRequests, reviewDeveloperBadge } from './auth-service.js';
import { listAllPublications, reviewPublication } from './publication-service.js';

function requireAdmin() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  return user;
}

export async function listModerationQueue() {
  requireAdmin();
  const publications = await listAllPublications();
  return publications.sort((first, second) => {
    const pendingOrder = Number(second.status === 'pending') - Number(first.status === 'pending');
    return pendingOrder || new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt);
  });
}

export async function approvePublication(publicationId) {
  requireAdmin();
  return reviewPublication(publicationId, 'approved');
}

export async function rejectPublication(publicationId, reason = '') {
  requireAdmin();
  return reviewPublication(publicationId, 'rejected', reason);
}

export async function listBadgeQueue() {
  requireAdmin();
  return listDeveloperRequests();
}

export async function approveBadge(userId) {
  requireAdmin();
  return reviewDeveloperBadge(userId, 'approved');
}

export async function rejectBadge(userId, reason = '') {
  requireAdmin();
  return reviewDeveloperBadge(userId, 'rejected', reason);
}
