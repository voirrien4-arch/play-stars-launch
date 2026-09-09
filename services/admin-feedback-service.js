import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';
import { clampNumber, safeString } from './security-service.js';

const FEEDBACK_CATEGORIES = new Set(['suggestion', 'problem', 'catalog', 'developer', 'other']);

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id || 'guest',
    username: row.username,
    accountEmail: row.account_email,
    contactEmail: row.contact_email,
    category: row.category,
    rating: row.rating,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    readAt: row.read_at || ''
  };
}

export async function submitAdminFeedback({ category, rating, message, contactEmail = '' }) {
  const user = getCurrentUser();
  const cleanMessage = safeString(message, 2000);
  if (cleanMessage.length < 10) throw new Error('feedback.messageRequired');
  if (cleanMessage.length > 2000) throw new Error('feedback.messageTooLong');
  const cleanContactEmail = safeString(contactEmail, 254).toLowerCase();
  if (cleanContactEmail && !/^\S+@\S+\.\S+$/.test(cleanContactEmail)) throw new Error('feedback.emailInvalid');
  if (category && !FEEDBACK_CATEGORIES.has(String(category))) throw new Error('feedback.categoryInvalid');
  const cleanRating = rating === null || rating === '' || rating === undefined ? null : Math.round(clampNumber(rating, 1, 5, 0));
  if (cleanRating !== null && (cleanRating < 1 || cleanRating > 5)) throw new Error('feedback.ratingInvalid');

  const { data, error } = await supabase.from('admin_feedback').insert({
    user_id: user?.id || null,
    username: user?.username || 'Visiteur',
    account_email: user?.email || '',
    contact_email: cleanContactEmail,
    category: FEEDBACK_CATEGORIES.has(String(category)) ? String(category) : 'other',
    rating: cleanRating,
    message: cleanMessage
  }).select().single();
  if (error) throw new Error('feedback.sendFailed');
  return fromRow(data);
}

export async function listAdminFeedback() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  const { data, error } = await supabase.from('admin_feedback').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('moderation.adminRequired');
  return data.map(fromRow);
}

export async function markAdminFeedbackRead(feedbackId) {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') throw new Error('moderation.adminRequired');
  const { data, error } = await supabase.from('admin_feedback')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', feedbackId)
    .select()
    .single();
  if (error) throw new Error('feedback.notFound');
  return fromRow(data);
}
