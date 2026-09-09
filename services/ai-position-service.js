const STORAGE_KEY = 'ai-assistant-position';

function validPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(92, Math.max(6, y))
  };
}

export async function loadAiPosition() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return validPosition(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn('Play Stars: position du bouton IA indisponible', error);
    return null;
  }
}

export async function saveAiPosition(position) {
  const clean = validPosition(position);
  if (!clean) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('Play Stars: position du bouton IA non enregistrée', error);
  }
}
