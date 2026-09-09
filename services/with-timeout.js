/**
 * Empêche un appel réseau (Supabase ou autre) de rester bloqué
 * indéfiniment sans jamais résoudre ni rejeter — ce qui, côté UI,
 * se traduit par un bouton "chargement" figé sans aucun message
 * d'erreur, potentiellement pendant plusieurs minutes.
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
