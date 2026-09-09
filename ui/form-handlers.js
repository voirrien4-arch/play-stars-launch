import { signIn, signUp, applyReferralCode, updateProfilePhoto, requestAccountVerification } from '../services/auth-service.js';
import { replyToReview } from '../services/review-service.js';
import { createPublication, updatePublication } from '../services/publication-service.js';
import { publicationErrorMessage } from './publication-view.js';
import { authErrorMessage } from './auth-view.js';
import { saveReview } from '../services/review-service.js';
import { publishPlatformUpdate, loadPlatformUpdate } from '../services/platform-update-service.js';
import { askAiAssistant } from '../services/ai-assistant-service.js';
import { addAiUserMessage, addAiAssistantMessage, setAiLoading } from './ai-search-view.js';
import { submitAdminFeedback } from '../services/admin-feedback-service.js';
import { t } from './common.js';

export function createSubmitHandler({ modalRoot, toast, render, repaintAiSurface, setPlatformUpdate, setPlatformDownloadStarted }) {
  return async function handleSubmit(event) {
    const authForm = event.target.closest('[data-auth-form]');
    const referralForm = event.target.closest('[data-referral-form]');
    const publicationForm = event.target.closest('[data-publication-form]');
    const updateForm = event.target.closest('[data-publication-update-form]');
    const platformUpdateForm = event.target.closest('[data-platform-update-form]');
    const profilePhotoForm = event.target.closest('[data-profile-photo-form]');
    const feedbackForm = event.target.closest('[data-feedback-form]');
    const aiForm = event.target.closest('[data-ai-search-form]');
    const reviewForm = event.target.closest('[data-review-form]');
    const verificationForm = event.target.closest('[data-verification-form]');
    const replyForm = event.target.closest('[data-reply-form]');
    if (!authForm && !referralForm && !publicationForm && !updateForm && !platformUpdateForm && !profilePhotoForm && !feedbackForm && !aiForm && !reviewForm && !verificationForm && !replyForm) return;
    event.preventDefault();

    if (feedbackForm) {
      const submitButton = feedbackForm.querySelector('button[type="submit"]');
      const errorBox = feedbackForm.querySelector('[data-feedback-error]');
      if (submitButton) submitButton.disabled = true;
      if (errorBox) errorBox.textContent = '';
      try {
        const data = new FormData(feedbackForm);
        await submitAdminFeedback({ category: data.get('category'), rating: data.get('rating'), message: data.get('message'), contactEmail: data.get('contactEmail') });
        modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal feedback-success-modal" role="dialog" aria-modal="true" aria-labelledby="feedbackSuccessTitle" data-modal-content><div class="empty-icon">✓</div><h2 id="feedbackSuccessTitle">${t('feedback.successTitle')}</h2><p>${t('feedback.successText')}</p><button class="button button-primary" type="button" data-action="close-modal">${t('common.close')}</button></section></div>`;
      } catch (error) {
        if (errorBox) errorBox.textContent = t(error?.message?.startsWith('feedback.') ? error.message : 'feedback.sendFailed');
        else toast(t('feedback.sendFailed'));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }

    if (aiForm) {
      const data = new FormData(aiForm);
      const message = String(data.get('query') || '').trim();
      if (!message) return;
      aiForm.reset();
      addAiUserMessage(message);
      setAiLoading(true);
      repaintAiSurface();
      try {
        const response = await askAiAssistant(message);
        addAiAssistantMessage(response);
      } catch (error) {
        console.warn('Play Stars: assistant IA indisponible', error);
        const text = error?.debugDetail ? `${t('aiSearch.error')} (${error.debugDetail})` : t('aiSearch.error');
        addAiAssistantMessage({ role: 'error', text });
      } finally {
        setAiLoading(false);
      }
      repaintAiSurface();
      return;
    }

    if (reviewForm) {
      const data = new FormData(reviewForm);
      try {
        await saveReview(reviewForm.dataset.appId, { rating: data.get('rating'), comment: data.get('comment') });
        toast(t('review.saved'));
        return render();
      } catch (error) {
        const errorBox = reviewForm.querySelector('[data-review-error]');
        if (errorBox) errorBox.textContent = t(error?.message?.startsWith('review.') ? error.message : 'review.saveFailed');
        return;
      }
    }

    if (platformUpdateForm) {
      const submitButton = platformUpdateForm.querySelector('button[type="submit"]');
      const errorBox = platformUpdateForm.querySelector('[data-platform-update-error]');
      if (submitButton) submitButton.disabled = true;
      if (errorBox) errorBox.textContent = '';
      try {
        const data = new FormData(platformUpdateForm);
        toast(t('platformUpdate.uploading'));
        const update = await publishPlatformUpdate({ version: data.get('version'), message: data.get('message'), file: data.get('platformApk') });
        setPlatformUpdate(update);
        setPlatformDownloadStarted(false);
        toast(t('platformUpdate.publishedToast'));
        return render();
      } catch (error) {
        const key = error?.message?.startsWith('platformUpdate.') ? error.message : 'platformUpdate.uploadFailed';
        if (errorBox) errorBox.textContent = t(key);
        else toast(t(key));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }

    if (profilePhotoForm) {
      const submitButton = profilePhotoForm.querySelector('button[type="submit"]');
      const errorBox = profilePhotoForm.querySelector('[data-profile-photo-error]');
      if (submitButton) submitButton.disabled = true;
      if (errorBox) errorBox.textContent = '';
      try {
        const file = profilePhotoForm.querySelector('input[type="file"]')?.files?.[0];
        await updateProfilePhoto(file);
        toast(t('profile.photoSaved'));
        return render();
      } catch (error) {
        const key = error?.message?.startsWith('profile.') ? error.message : 'profile.photoUploadFailed';
        if (errorBox) errorBox.textContent = t(key);
        else toast(t(key));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }

    if (verificationForm) {
      const submitButton = verificationForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        const data = new FormData(verificationForm);
        await requestAccountVerification(data.get('note') || '');
        toast(t('security.verificationSent'));
        return render();
      } catch (error) {
        toast(t('auth.genericError'));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }

    if (replyForm) {
      const submitButton = replyForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        const data = new FormData(replyForm);
        await replyToReview(replyForm.dataset.reviewId, data.get('reply') || '');
        toast(t('review.replySubmit'));
        return render();
      } catch (error) {
        toast(t(error?.message?.startsWith('review.') ? error.message : 'review.replyFailed'));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }

    const form = authForm || referralForm || publicationForm || updateForm;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      if (authForm) {
        const data = new FormData(authForm);
        if (authForm.dataset.authMode === 'signup') {
          await signUp({ username: data.get('username'), email: data.get('email'), password: data.get('password'), country: data.get('country'), referralCode: data.get('referralCode') });
          toast(t('toast.accountCreated'));
        } else {
          await signIn({ email: data.get('email'), password: data.get('password') });
          toast(t('toast.signedIn'));
        }
        setPlatformUpdate(await loadPlatformUpdate());
        setPlatformDownloadStarted(false);
        modalRoot.innerHTML = '';
        return render();
      }
      const bindProgress = () => {
        const progressEl = document.querySelector('[data-upload-progress]');
        return (percent) => {
          if (!progressEl) return;
          progressEl.hidden = false;
          const bar = progressEl.querySelector('[data-upload-progress-bar]');
          const label = progressEl.querySelector('[data-upload-progress-label]');
          const clamped = Math.max(0, Math.min(100, percent));
          if (bar) bar.style.width = `${clamped}%`;
          if (label) label.textContent = `${clamped}%`;
        };
      };

      if (updateForm) {
        const data = new FormData(updateForm);
        toast(t('publication.updating'));
        await updatePublication(updateForm.dataset.publicationId, { version: data.get('version'), releaseNotes: data.get('releaseNotes'), officialUrl: data.get('officialUrl'), file: data.get('apk'), icon: data.get('icon'), screenshots: data.getAll('screenshots') }, { onProgress: bindProgress() });
        modalRoot.innerHTML = '';
        toast(t('publication.updated'));
        return render();
      }
      if (publicationForm) {
        const data = new FormData(publicationForm);
        toast(t('publication.uploading'));
        await createPublication({ appName: data.get('appName'), packageName: data.get('packageName'), version: data.get('version'), category: data.get('category'), officialUrl: data.get('officialUrl'), releaseNotes: data.get('releaseNotes'), file: data.get('apk'), icon: data.get('icon'), screenshots: data.getAll('screenshots') }, { onProgress: bindProgress() });
        toast(t('publication.created'));
        return render();
      }
      const data = new FormData(referralForm);
      await applyReferralCode(data.get('referralCode') || '');
      toast(t('toast.referralApplied'));
      return render();
    } catch (error) {
      const message = (publicationForm || updateForm) && !error?.message?.startsWith('auth.') ? publicationErrorMessage(error) : authErrorMessage(error);
      const errorBox = authForm?.querySelector('[data-auth-error]');
      const publicationError = publicationForm?.querySelector('[data-publication-error]');
      const updateError = updateForm?.querySelector('[data-publication-error]');
      if (errorBox) errorBox.textContent = message;
      else if (publicationError) publicationError.textContent = message;
      else if (updateError) updateError.textContent = message;
      else toast(message);
    } finally {
      if (submitButton) submitButton.disabled = false;
      const progressEl = document.querySelector('[data-upload-progress]');
      if (progressEl) progressEl.hidden = true;
    }
  };
}
