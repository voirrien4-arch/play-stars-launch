import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';

/**
 * Trace chaque étape d'une tentative de publication (upload APK, icône,
 * captures, insertion finale) dans la table upload_logs, consultable
 * depuis le panel admin — pour diagnostiquer un échec sans avoir besoin
 * d'accéder à la console du navigateur de la personne qui publie.
 *
 * Best-effort : un échec d'écriture de log n'interrompt jamais le
 * parcours réel de publication.
 */
export function createUploadLogger() {
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = getCurrentUser();

  async function log(step, { detail = '', progressPercent = null, durationMs = null } = {}) {
    try {
      const { error } = await supabase.from('upload_logs').insert({
        user_id: user?.id || null,
        username: user?.username || '',
        session_id: sessionId,
        step,
        detail: String(detail).slice(0, 500),
        progress_percent: progressPercent,
        duration_ms: durationMs
      });
      if (error) console.warn('Play Stars: log upload non enregistré —', error.message);
    } catch (error) {
      console.warn('Play Stars: log upload non enregistré (exception) —', error?.message || error);
    }
  }

  return { sessionId, log };
}
