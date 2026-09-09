function configuredSiteUrl() {
  const configured = String(window.PLAYSTARS_SITE_URL || '').trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '');
  return window.location.origin;
}

export function getAppShareUrl(appId) {
  const url = new URL(window.location.href);
  url.searchParams.set('app', appId);
  return `${configuredSiteUrl()}${url.pathname}${url.search}`;
}

export function getSharedAppId() {
  return new URLSearchParams(window.location.search).get('app') || '';
}

export function setAppShareLocation(appId, replace = false) {
  const url = new URL(window.location.href);
  if (appId) url.searchParams.set('app', appId);
  else url.searchParams.delete('app');
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('share.unavailable');
}

export async function shareApp(app) {
  const url = getAppShareUrl(app.id);
  const shareData = {
    title: `${app.name} · Play Stars`,
    text: `Découvre ${app.name} sur Play Stars`,
    url
  };
  if (navigator.share) {
    await navigator.share(shareData);
    return 'shared';
  }
  await copyText(url);
  return 'copied';
}
