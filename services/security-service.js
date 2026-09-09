const SAFE_HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const DEFAULT_GRADIENT = 'linear-gradient(135deg,#6046e8,#a48cfb)';
const HEX_COLOR = '#[0-9a-f]{3,8}';

export function safeHttpUrl(value, { allowEmpty = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return allowEmpty ? '' : null;
  try {
    const url = new URL(raw);
    if (!SAFE_HTTP_PROTOCOLS.has(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function safeMediaUrl(value) {
  const url = safeHttpUrl(value, { allowEmpty: true });
  return url || '';
}

export function safeDownloadUrl(value) {
  return safeHttpUrl(value, { allowEmpty: true });
}

export function safeGradient(value, fallback = DEFAULT_GRADIENT) {
  const candidate = String(value || '').trim();
  const pattern = new RegExp(`^linear-gradient\\(\\s*135deg\\s*,\\s*${HEX_COLOR}\\s*,\\s*${HEX_COLOR}\\s*\\)$`, 'i');
  return pattern.test(candidate) ? candidate : fallback;
}

export function safeCssColor(value, fallback = '#6046e8') {
  const candidate = String(value || '').trim();
  const pattern = new RegExp(`^${HEX_COLOR}$`, 'i');
  return pattern.test(candidate) ? candidate : fallback;
}

export function clampNumber(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

export function safeString(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maximum);
}
