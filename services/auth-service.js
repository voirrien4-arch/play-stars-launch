import { supabase, STORAGE_BUCKET } from './supabase-client.js';
import { registerDevice, checkDeviceLimit } from './device-fingerprint-service.js';

let currentProfile = null;

function validateCredentials({ username, email, password }) {
  if (!username?.trim() || username.trim().length < 2) throw new Error('auth.usernameInvalid');
  if (!/^\S+@\S+\.\S+$/.test(email ?? '')) throw new Error('auth.emailInvalid');
  if ((password ?? '').length < 8) throw new Error('auth.passwordShort');
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data;
}

function publicUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    email: profile.email || '',
    country: profile.country,
    avatarInitial: profile.avatar_initial,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    status: profile.status,
    referralCode: profile.referral_code,
    referredBy: profile.referred_by,
    referralConfirmed: profile.referral_confirmed,
    confirmedReferrals: profile.confirmed_referrals,
    developerStatus: profile.developer_status,
    developerNote: profile.developer_note,
    usedSlots: profile.used_slots,
    quarantineReason: profile.quarantine_reason,
    verificationRequested: profile.verification_requested,
    verificationNote: profile.verification_note,
    createdAt: profile.created_at
  };
}

export async function loadAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { currentProfile = null; return null; }
  currentProfile = await fetchProfile(session.user.id);
  if (currentProfile) currentProfile.email = session.user.email;
  return getCurrentUser();
}

export function getCurrentUser() { return publicUser(currentProfile); }

export function getUserProfiles() {
  return currentProfile ? [publicUser(currentProfile)] : [];
}

export function getDeveloperSummary(user = publicUser(currentProfile)) {
  if (!user) return { baseSlots: 0, confirmedReferrals: 0, bonusSlots: 0, availableSlots: 0, usedSlots: 0, status: 'none' };
  const confirmedReferrals = user.confirmedReferrals ?? 0;
  const baseSlots = user.developerStatus === 'approved' ? 2 : 0;
  const usedSlots = user.usedSlots ?? 0;
  return {
    baseSlots,
    confirmedReferrals,
    bonusSlots: confirmedReferrals,
    availableSlots: Math.max(0, baseSlots + confirmedReferrals - usedSlots),
    usedSlots,
    status: user.developerStatus ?? 'none'
  };
}

export async function signUp({ username, email, password, country, referralCode = '' }) {
  validateCredentials({ username, email, password });
  const normalizedEmail = email.trim().toLowerCase();

  const { blocked } = await checkDeviceLimit();
  if (blocked) throw new Error('auth.deviceLimitReached');

  let referrerId = null;
  const referredBy = referralCode.trim().toUpperCase();
  if (referredBy) {
    const { data: referrer } = await supabase.from('profiles').select('id, status').eq('referral_code', referredBy).single();
    if (!referrer || referrer.status !== 'active') throw new Error('auth.referralInvalid');
    referrerId = referrer.id;
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { username: username.trim() } }
  });
  if (signUpError) {
    console.error('Play Stars: échec signUp Supabase', signUpError);
    if (signUpError.message?.toLowerCase().includes('already')) throw new Error('auth.emailExists');
    throw new Error('auth.genericError');
  }

  const userId = signUpData.user.id;
  const hasSession = Boolean(signUpData.session);

  if (hasSession) {
    // Session immédiate = confirmation email désactivée côté Supabase.
    // Le trigger handle_new_user a déjà créé la ligne profiles ; on la complète.
    const { error: updateError } = await supabase.from('profiles').update({
      country: country || 'FR'
    }).eq('id', userId);
    if (updateError) {
      console.error('Play Stars: échec mise à jour profil après signUp', updateError);
      throw new Error('auth.genericError');
    }

    if (referrerId) {
      const { error: referralError } = await supabase.rpc('confirm_referral', { target_user_id: userId, code: referredBy });
      if (referralError) console.warn('Play Stars: parrainage non appliqué', referralError);
    }

    currentProfile = await fetchProfile(userId);
    if (currentProfile) currentProfile.email = normalizedEmail;
    registerDevice();
    return getCurrentUser();
  }

  // Pas de session : la confirmation par email est activée sur le projet
  // Supabase. Le compte est créé, mais restera inactif tant que le lien
  // reçu par email n'aura pas été cliqué. On ne peut pas encore modifier
  // son profil (RLS exige une session), le trigger l'a créé avec les
  // valeurs par défaut (pays FR, sans parrainage).
  currentProfile = null;
  const pendingError = new Error('auth.confirmEmailSent');
  pendingError.pendingConfirmation = true;
  throw pendingError;
}

export async function signIn({ email, password }) {
  if (!/^\S+@\S+\.\S+$/.test(email ?? '')) throw new Error('auth.emailInvalid');
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: password ?? '' });
  if (error) throw new Error('auth.invalidLogin');
  currentProfile = await fetchProfile(data.user.id);
  if (currentProfile) currentProfile.email = data.user.email;
  if (currentProfile?.status === 'suspended' || currentProfile?.status === 'banned') {
    await supabase.auth.signOut();
    currentProfile = null;
    throw new Error('auth.accountSuspended');
  }
  registerDevice();
  return getCurrentUser();
}

export async function signOut() {
  await supabase.auth.signOut();
  currentProfile = null;
}

const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function updateProfilePhoto(file) {
  if (!currentProfile) throw new Error('auth.loginRequired');
  if (!file || !PROFILE_IMAGE_TYPES.has(file.type)) throw new Error('profile.photoInvalid');
  if (file.size > PROFILE_IMAGE_MAX_BYTES) throw new Error('profile.photoTooLarge');

  const path = `avatars/${currentProfile.id}-${Date.now()}.${(file.type.split('/')[1] || 'png')}`;
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error('Play Stars: échec upload photo de profil', uploadError);
    throw new Error('profile.photoUploadFailed');
  }
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const avatarUrl = { publicUrl: data.publicUrl, fileId: path, filePath: path, mimeType: file.type, originalName: file.name };

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentProfile.id);
  if (updateError) {
    console.error('Play Stars: échec mise à jour profil (avatar_url)', updateError);
    throw new Error('profile.photoUploadFailed');
  }
  currentProfile.avatar_url = avatarUrl;
  return getCurrentUser();
}

export async function removeProfilePhoto() {
  if (!currentProfile) throw new Error('auth.loginRequired');
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', currentProfile.id);
  if (error) throw new Error('auth.genericError');
  currentProfile.avatar_url = null;
  return getCurrentUser();
}

// activateDemoAdmin supprimé : Supabase gère les vrais comptes,
// il n'y a plus lieu d'avoir un compte admin de démonstration.
// Pour créer un premier admin, exécute dans le SQL Editor Supabase :
//   update public.profiles set role = 'admin' where id = '<uuid-du-compte>';

export async function listDeveloperRequests() {
  if (!currentProfile || currentProfile.role !== 'admin') throw new Error('moderation.adminRequired');
  const { data, error } = await supabase.from('profiles').select('*').eq('developer_status', 'pending');
  if (error) throw new Error('auth.genericError');
  return data.map(publicUser);
}

export async function reviewDeveloperBadge(userId, status, note = '') {
  if (!currentProfile || currentProfile.role !== 'admin') throw new Error('moderation.adminRequired');
  if (!['approved', 'rejected'].includes(status)) throw new Error('moderation.invalidDecision');
  const { data, error } = await supabase.from('profiles')
    .update({ developer_status: status, developer_note: note.trim() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error('moderation.userNotFound');
  return publicUser(data);
}

export async function requestDeveloperBadge(note = '') {
  if (!currentProfile) throw new Error('auth.loginRequired');
  if (currentProfile.developer_status === 'approved') return getCurrentUser();
  const { error } = await supabase.rpc('request_developer_badge', { note: note.trim() });
  if (error) throw new Error('auth.genericError');
  currentProfile = await fetchProfile(currentProfile.id);
  return getCurrentUser();
}

export async function applyReferralCode(code) {
  if (!currentProfile) throw new Error('auth.loginRequired');
  if (currentProfile.referred_by) throw new Error('auth.referralAlreadyUsed');
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error('auth.referralInvalid');

  const { error } = await supabase.rpc('confirm_referral', { target_user_id: currentProfile.id, code: normalized });
  if (error) {
    if (error.message?.includes('referral_already_used')) throw new Error('auth.referralAlreadyUsed');
    throw new Error('auth.referralInvalid');
  }

  currentProfile = await fetchProfile(currentProfile.id);
  return getCurrentUser();
}

export async function requestAccountVerification(note = '') {
  if (!currentProfile) throw new Error('auth.loginRequired');
  const { data, error } = await supabase.from('profiles')
    .update({ verification_requested: true, verification_note: note.trim().slice(0, 500) })
    .eq('id', currentProfile.id)
    .select()
    .single();
  if (error) throw new Error('auth.genericError');
  currentProfile = data;
  return getCurrentUser();
}
