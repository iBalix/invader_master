/**
 * Formats d'affichage de Bar Invaders : scores en points avec séparateur
 * de milliers, durées de partie.
 */

export function formatScore(score: number, locale: 'fr' | 'en' = 'fr'): string {
  const value = Math.max(0, Math.floor(score));
  return value.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB');
}

/** "4:07" : minutes, secondes */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
