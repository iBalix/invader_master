/**
 * Helpers de formatage pour l'interface tables.
 */

export function formatPrice(amount: number | string | null | undefined, currency = 'EUR'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || isNaN(n as number)) return '-';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n as number);
}

export function formatTime(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
