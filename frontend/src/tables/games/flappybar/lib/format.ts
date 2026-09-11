/**
 * Formats d'affichage de Flappy Bar (mètres, durées, dates de records).
 * Les grands chiffres du HUD passent par formatMeters(m, 0).
 */

export function formatMeters(meters: number, decimals = 1, locale: 'fr' | 'en' = 'fr'): string {
  const factor = 10 ** decimals;
  const value = Math.floor(meters * factor) / factor;
  const text = value.toFixed(decimals);
  return locale === 'fr' ? text.replace('.', ',') : text;
}

/** "1:32.4" : minutes, secondes, dixième */
export function formatDuration(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/** "Aujourd'hui", "Hier", sinon "12 août" (année ajoutée si différente) */
export function formatRelativeDay(iso: string, locale: 'fr' | 'en' = 'fr', now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return locale === 'fr' ? "Aujourd'hui" : 'Today';
  if (diffDays === 1) return locale === 'fr' ? 'Hier' : 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', opts);
}
