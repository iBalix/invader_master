/**
 * Validation de pseudo côté client, MIROIR des règles backend
 * (backend/src/games/engine.ts validatePseudo) : feedback immédiat, le
 * serveur reste l'arbitre.
 */

const PSEUDO_REGEX = /^[a-zA-Z0-9_éàèêëïîôùûüç' -]+$/;

export function isValidPseudo(pseudo: string): boolean {
  const trimmed = pseudo.trim();
  if (!trimmed || trimmed.length > 16) return false;
  return PSEUDO_REGEX.test(trimmed) && /[a-zA-Zéàèêëïîôùûüç]/.test(trimmed);
}
