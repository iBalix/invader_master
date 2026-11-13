/**
 * Objectifs affiches sur la section Stats : points morts mensuels (lignes de
 * reference des graphiques de CA) et marge brute cible.
 *
 * Stockes dans Supabase (table singleton `finance_stats_settings`, migration
 * 057). Tant que la migration n'est pas appliquee, la lecture retombe sur les
 * valeurs par defaut ci-dessous (celles de l'ancien rapport Looker Studio) et
 * l'ecriture est refusee avec un message explicite.
 */

import { supabaseAdmin } from '../config/supabase.js';

export interface BreakEvenPoint {
  /** Libelle court affiche sur la ligne, ex. "PM 2026/27". */
  label: string;
  /** CA mensuel a atteindre, en euros. */
  monthly: number;
}

export interface StatsSettings {
  breakEven: BreakEvenPoint[];
  /** Entre 0 et 1. */
  grossMarginTarget: number;
  /** false quand la table n'existe pas encore : valeurs par defaut. */
  persisted: boolean;
}

export const DEFAULT_STATS_SETTINGS: Omit<StatsSettings, 'persisted'> = {
  breakEven: [
    { label: 'PM 2025', monthly: 14800 },
    { label: 'PM 2026/27', monthly: 16500 },
    { label: 'PM 2028', monthly: 17000 },
  ],
  grossMarginTarget: 0.75,
};

const TABLE = 'finance_stats_settings';

export class StatsSettingsUnavailableError extends Error {
  constructor() {
    super(
      "La table des objectifs n'existe pas encore : appliquer docs/migration-057-finance-stats-settings.sql dans Supabase.",
    );
  }
}

/** PostgREST : PGRST205 = table absente du cache de schema, 42P01 = table inconnue. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|does not exist/i.test(error.message ?? '')
  );
}

function sanitizeBreakEven(raw: unknown): BreakEvenPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: BreakEvenPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = String((item as { label?: unknown }).label ?? '').trim().slice(0, 30);
    const monthly = Number((item as { monthly?: unknown }).monthly);
    if (!label || !Number.isFinite(monthly) || monthly <= 0 || monthly > 1_000_000) continue;
    points.push({ label, monthly: Math.round(monthly) });
  }
  return points.slice(0, 6);
}

export async function getStatsSettings(): Promise<StatsSettings> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('break_even, gross_margin_target')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { ...DEFAULT_STATS_SETTINGS, persisted: false };
    throw error;
  }
  if (!data) return { ...DEFAULT_STATS_SETTINGS, persisted: true };

  const target = Number(data.gross_margin_target);
  return {
    breakEven: sanitizeBreakEven(data.break_even),
    grossMarginTarget: Number.isFinite(target) && target > 0 && target < 1 ? target : DEFAULT_STATS_SETTINGS.grossMarginTarget,
    persisted: true,
  };
}

/** Valide puis enregistre. Leve une erreur lisible si l'entree est invalide. */
export async function saveStatsSettings(input: {
  breakEven?: unknown;
  grossMarginTarget?: unknown;
}): Promise<StatsSettings> {
  const breakEven = sanitizeBreakEven(input.breakEven);
  if (Array.isArray(input.breakEven) && breakEven.length !== input.breakEven.length) {
    throw new RangeError('Chaque point mort doit avoir un libellé et un montant mensuel positif (6 au maximum).');
  }
  const target = Number(input.grossMarginTarget);
  if (!Number.isFinite(target) || target <= 0 || target >= 1) {
    throw new RangeError('La marge cible doit être comprise entre 0 et 100 %.');
  }

  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert({ id: 1, break_even: breakEven, gross_margin_target: target }, { onConflict: 'id' });

  if (error) {
    if (isMissingTable(error)) throw new StatsSettingsUnavailableError();
    throw error;
  }
  return { breakEven, grossMarginTarget: target, persisted: true };
}
