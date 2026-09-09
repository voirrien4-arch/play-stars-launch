import { escapeHtml, t } from './common.js';

export function renderAuthModal(mode = 'signin', email = '') {
  const signUp = mode === 'signup';
  return `<div class="modal-backdrop" data-action="close-modal">
    <form class="modal auth-modal" data-auth-form data-auth-mode="${signUp ? 'signup' : 'signin'}" novalidate>
      <div class="modal-header"><div><span class="eyebrow">${t('auth.eyebrow')}</span><h2>${t(signUp ? 'auth.signupTitle' : 'auth.signinTitle')}</h2></div><button class="modal-close" type="button" data-action="close-modal" aria-label="${t('common.close')}">×</button></div>
      <p class="auth-intro">${t(signUp ? 'auth.signupText' : 'auth.signinText')}</p>
      ${signUp ? `<label class="form-field"><span>${t('auth.username')}</span><input name="username" autocomplete="username" required minlength="2" placeholder="${t('auth.usernamePlaceholder')}"></label>` : ''}
      <label class="form-field"><span>${t('auth.email')}</span><input name="email" type="email" autocomplete="email" required value="${escapeHtml(email)}" placeholder="${t('auth.emailPlaceholder')}"></label>
      <label class="form-field"><span>${t('auth.password')}</span><input name="password" type="password" autocomplete="${signUp ? 'new-password' : 'current-password'}" required minlength="8" placeholder="${t('auth.passwordPlaceholder')}"></label>
      ${signUp ? `<div class="form-grid"><label class="form-field"><span>${t('auth.country')}</span><select name="country"><option value="FR">${t('auth.countryFrance')}</option><option value="BE">${t('auth.countryBelgium')}</option><option value="CA">${t('auth.countryCanada')}</option><option value="OTHER">${t('auth.countryOther')}</option></select></label><label class="form-field"><span>${t('auth.referralOptional')}</span><input name="referralCode" autocapitalize="characters" placeholder="${t('auth.referralPlaceholder')}"></label></div>` : ''}
      <p class="form-error" data-auth-error role="alert"></p>
      <button class="button auth-submit" type="submit">${t(signUp ? 'auth.createAccount' : 'auth.signin')}</button>
      <button class="button button-ghost auth-switch" type="button" data-action="auth-switch" data-auth-mode="${signUp ? 'signin' : 'signup'}">${t(signUp ? 'auth.haveAccount' : 'auth.needAccount')}</button>
    </form>
  </div>`;
}

export function renderAuthGate() {
  return `<section class="auth-gate"><div class="auth-gate-icon" aria-hidden="true">✦</div><span class="eyebrow">${t('auth.eyebrow')}</span><h2>${t('auth.gateTitle')}</h2><p>${t('auth.gateText')}</p><div class="auth-gate-actions"><button class="button" type="button" data-action="open-auth" data-auth-mode="signup">${t('auth.createAccount')}</button><button class="button button-ghost" type="button" data-action="open-auth" data-auth-mode="signin">${t('auth.signin')}</button></div></section>`;
}

export function authErrorMessage(error) {
  const key = error?.message?.startsWith('auth.') ? error.message : 'auth.genericError';
  return t(key);
}

export function userLabel(user) {
  return escapeHtml(user?.username ?? t('auth.guest'));
}
