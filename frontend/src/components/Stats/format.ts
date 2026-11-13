/**
 * Formats et calculs de dates de la section Stats.
 *
 * Les dates circulent en chaines `YYYY-MM-DD` et sont manipulees en UTC : ce
 * sont des jours calendaires, pas des instants. Passer par le fuseau local
 * decalerait un jour sur deux changements d'heure par an.
 */

const DAY_MS = 86400000;

// --- nombres ----------------------------------------------------------------

const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtEur(value: number): string {
  return eur0.format(Math.round(value));
}

export function fmtEur2(value: number): string {
  return eur2.format(value);
}

export function fmtInt(value: number): string {
  return int0.format(Math.round(value));
}

/** Montant court pour les axes : 850 €, 12 k€, 1,2 M€. */
export function fmtEurAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${dec1.format(value / 1_000_000).replace(/,0$/, '')} M€`;
  if (abs >= 10_000) return `${int0.format(value / 1000)} k€`;
  if (abs >= 1000) return `${dec1.format(value / 1000).replace(/,0$/, '')} k€`;
  return `${int0.format(value)} €`;
}

/** `ratio` entre 0 et 1. */
export function fmtPct(ratio: number, digits = 1): string {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio * 100)} %`;
}

/** Evolution relative, ou null quand la base est nulle (pas de division). */
export function deltaRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.005) return null;
  return (current - previous) / Math.abs(previous);
}

export function fmtDelta(ratio: number): string {
  const sign = ratio > 0 ? '+' : ratio < 0 ? '-' : '';
  const abs = Math.abs(ratio) * 100;
  const body = abs >= 1000 ? int0.format(abs) : dec1.format(abs);
  return `${sign}${body} %`;
}

// --- dates ------------------------------------------------------------------

export function parseISO(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return toISO(parseISO(day) + n * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to) - parseISO(from)) / DAY_MS) + 1;
}

/** Aujourd'hui a Montpellier, quel que soit le fuseau du navigateur. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYearFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayLongFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOnlyFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

/** 8 nov. */
export function fmtDay(day: string): string {
  return dayFmt.format(parseISO(day));
}

/** 8 nov. 2026 */
export function fmtDayYear(day: string): string {
  return dayYearFmt.format(parseISO(day));
}

/** dimanche 8 novembre 2026 */
export function fmtDayLong(day: string): string {
  return dayLongFmt.format(parseISO(day));
}

/** `month` au format YYYY-MM -> nov. 26 */
export function fmtMonth(month: string): string {
  return monthFmt.format(parseISO(`${month}-01`));
}

/** `month` au format YYYY-MM -> novembre 2026 */
export function fmtMonthLong(month: string): string {
  return monthLongFmt.format(parseISO(`${month}-01`));
}

/** 1 a 12 -> janv., févr., ... */
export function fmtMonthName(monthNumber: number): string {
  return monthOnlyFmt.format(Date.UTC(2024, monthNumber - 1, 1));
}

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// --- regroupement dans le temps ---------------------------------------------

export type Granularity = 'day' | 'week' | 'month';

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
};

/** Granularite lisible par defaut selon la longueur de la periode. */
export function autoGranularity(days: number): Granularity {
  if (days <= 62) return 'day';
  if (days <= 400) return 'week';
  return 'month';
}

/** Lundi de la semaine de `day`. */
function weekStart(day: string): string {
  const ts = parseISO(day);
  const dow = (new Date(ts).getUTCDay() + 6) % 7; // 0 = lundi
  return toISO(ts - dow * DAY_MS);
}

export function bucketKey(day: string, granularity: Granularity): string {
  if (granularity === 'day') return day;
  if (granularity === 'week') return weekStart(day);
  return day.slice(0, 7);
}

export interface Bucket {
  key: string;
  /** Libelle d'axe, court. */
  label: string;
  /** Libelle d'infobulle, complet. */
  longLabel: string;
}

/** Tous les intervalles couvrant [from, to], vides compris, dans l'ordre. */
export function buildBuckets(from: string, to: string, granularity: Granularity): Bucket[] {
  const buckets: Bucket[] = [];
  const seen = new Set<string>();
  const end = parseISO(to);
  for (let ts = parseISO(from); ts <= end; ts += DAY_MS) {
    const day = toISO(ts);
    const key = bucketKey(day, granularity);
    if (seen.has(key)) continue;
    seen.add(key);
    if (granularity === 'day') {
      buckets.push({ key, label: fmtDay(day), longLabel: fmtDayLong(day) });
    } else if (granularity === 'week') {
      const last = addDays(key, 6);
      buckets.push({ key, label: fmtDay(key), longLabel: `Semaine du ${fmtDay(key)} au ${fmtDayYear(last)}` });
    } else {
      buckets.push({ key, label: fmtMonth(key), longLabel: fmtMonthLong(key) });
    }
  }
  return buckets;
}

/** Liste continue des mois `YYYY-MM` entre deux mois inclus. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Moyenne glissante sur `window` points (fenetre incomplete en debut de serie). */
export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}
