import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';

const MAX_COMMENT_LENGTH = 1000;

function fromRow(row) {
  return {
    id: row.id,
    appId: row.app_id,
    userId: row.user_id,
    username: row.username,
    rating: row.rating,
    comment: row.comment,
    developerReply: row.developer_reply || '',
    developerReplyAt: row.developer_reply_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listReviews(appId) {
  const { data, error } = await supabase.from('reviews').select('*').eq('app_id', appId).order('updated_at', { ascending: false });
  if (error) return [];
  return data.map(fromRow);
}

export async function getReviewForCurrentUser(appId) {
  const user = getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('reviews').select('*').eq('app_id', appId).eq('user_id', user.id).single();
  if (error || !data) return null;
  return fromRow(data);
}

export async function getReviewSummary(appId) {
  const reviews = await listReviews(appId);
  if (!reviews.length) return { count: 0, average: 0 };
  const average = reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
  return { count: reviews.length, average: Math.round(average * 10) / 10 };
}

export async function saveReview(appId, { rating, comment }) {
  const user = getCurrentUser();
  if (!user) throw new Error('review.loginRequired');
  const numericRating = Number(rating);
  const cleanComment = String(comment || '').trim();
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) throw new Error('review.invalidRating');
  if (cleanComment.length < 3) throw new Error('review.commentRequired');
  if (cleanComment.length > MAX_COMMENT_LENGTH) throw new Error('review.commentTooLong');

  const { data, error } = await supabase.from('reviews')
    .upsert({ app_id: appId, user_id: user.id, username: user.username || '', rating: numericRating, comment: cleanComment }, { onConflict: 'app_id,user_id' })
    .select()
    .single();
  if (error) throw new Error('review.saveFailed');
  return fromRow(data);
}

// Avis reçus sur les applications d'un développeur, avec sa propre réponse
// éventuelle (utilisé dans l'espace développeur).
export async function listReviewsForOwnedApps(publicationIds) {
  if (!publicationIds.length) return [];
  const appIds = publicationIds.map((id) => `publication-${id}`);
  const { data, error } = await supabase.from('reviews').select('*').in('app_id', appIds).order('updated_at', { ascending: false });
  if (error) return [];
  return data.map(fromRow);
}

export async function replyToReview(reviewId, reply) {
  const user = getCurrentUser();
  if (!user) throw new Error('auth.loginRequired');
  const cleanReply = String(reply || '').trim();
  if (cleanReply.length < 3) throw new Error('review.replyRequired');
  const { error } = await supabase.rpc('reply_to_review', { target_review_id: reviewId, reply: cleanReply });
  if (error) throw new Error('review.replyFailed');
}
