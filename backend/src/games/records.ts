/**
 * Records du bar, communs à tous les jeux (table game_records, migration 051).
 *
 * Un record par (mode, pseudo normalisé) : le tableau d'honneur affiché sur
 * les dalles est court et lisible, et un même joueur n'y apparaît qu'une fois
 * avec sa meilleure marque. Le pseudo n'est pas une identité forte (pas de
 * compte au bar), c'est assumé : c'est le nom qu'on crie à la table d'à côté.
 *
 * Toutes les écritures sont conditionnelles côté SQL (`.lt('score', ...)`) :
 * deux manches qui se terminent en même temps sur deux sessions ne peuvent pas
 * écraser un meilleur score avec un moins bon.
 */

import { supabaseAdmin } from '../config/supabase.js';

export interface RecordView {
  rank: number;
  pseudo: string;
  score: number;
  unit: string;
  details: Record<string, unknown>;
  device: string | null;
  achievedAt: string;
}

export interface UpsertRecordInput {
  mode: string;
  pseudo: string;
  score: number;
  unit: string;
  details?: Record<string, unknown>;
  sessionId?: string | null;
  device?: string | null;
}

export interface UpsertRecordResult {
  /** le score enregistré est meilleur que ce qui existait (ou premier record) */
  improved: boolean;
  /** meilleure marque AVANT cet appel, null si le pseudo n'avait aucun record */
  previous: number | null;
}

interface RecordRow {
  id: string;
  mode: string;
  pseudo: string;
  pseudo_norm: string;
  /** NUMERIC : PostgREST peut le sérialiser en nombre ou en chaîne selon la version */
  score: number | string;
  unit: string;
  details: Record<string, unknown> | null;
  session_id: string | null;
  device: string | null;
  achieved_at: string;
}

export function normPseudo(pseudo: string): string {
  return pseudo.trim().toLowerCase();
}

function scoreOf(row: RecordRow): number {
  return Number(row.score);
}

async function findRecord(mode: string, pseudoNorm: string): Promise<RecordRow | null> {
  const { data, error } = await supabaseAdmin
    .from('game_records')
    .select('*')
    .eq('mode', mode)
    .eq('pseudo_norm', pseudoNorm)
    .maybeSingle();
  if (error) throw error;
  return (data as RecordRow) ?? null;
}

export async function upsertRecord(input: UpsertRecordInput): Promise<UpsertRecordResult> {
  const pseudo = input.pseudo.trim();
  const pseudoNorm = normPseudo(pseudo);
  const details = input.details ?? {};
  const nowIso = new Date().toISOString();

  let existing = await findRecord(input.mode, pseudoNorm);

  if (!existing) {
    const { error } = await supabaseAdmin.from('game_records').insert({
      mode: input.mode,
      pseudo,
      pseudo_norm: pseudoNorm,
      score: input.score,
      unit: input.unit,
      // previousBest mémorisé dans details : permet de rejouer l'upsert d'une
      // même manche (commit échoué puis retenté) sans perdre l'information
      details: { ...details, previousBest: null },
      session_id: input.sessionId ?? null,
      device: input.device ?? null,
      achieved_at: nowIso,
    });
    if (!error) return { improved: true, previous: null };
    // course entre deux manches simultanées : la ligne vient d'être créée par
    // l'autre, on repasse par le chemin "existant"
    if (error.code !== '23505' && !`${error.message}`.includes('duplicate')) throw error;
    existing = await findRecord(input.mode, pseudoNorm);
    if (!existing) throw error;
  }

  const existingScore = scoreOf(existing);
  const stored = existing.details ?? {};

  // rejeu idempotent : ce record EST celui de cette manche (le commit qui
  // l'accompagnait a échoué et a été retenté), on renvoie le même verdict
  if (
    details.sessionId !== undefined &&
    details.roundIndex !== undefined &&
    stored.sessionId === details.sessionId &&
    stored.roundIndex === details.roundIndex
  ) {
    const previousBest = stored.previousBest;
    return { improved: true, previous: typeof previousBest === 'number' ? previousBest : null };
  }

  if (input.score <= existingScore) return { improved: false, previous: existingScore };

  const { data, error } = await supabaseAdmin
    .from('game_records')
    .update({
      pseudo,
      score: input.score,
      unit: input.unit,
      details: { ...details, previousBest: existingScore },
      session_id: input.sessionId ?? null,
      device: input.device ?? null,
      achieved_at: nowIso,
    })
    .eq('id', existing.id)
    .lt('score', input.score)
    .select('id');
  if (error) throw error;
  // 0 ligne : quelqu'un a fait mieux entre notre lecture et notre écriture
  return { improved: (data?.length ?? 0) > 0, previous: existingScore };
}

/** tableau d'honneur : meilleur score d'abord, le plus ancien gagne à égalité */
export async function listRecords(mode: string, limit = 10): Promise<RecordView[]> {
  const { data, error } = await supabaseAdmin
    .from('game_records')
    .select('*')
    .eq('mode', mode)
    .order('score', { ascending: false })
    .order('achieved_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as RecordRow[]) ?? []).map((row, i) => ({
    rank: i + 1,
    pseudo: row.pseudo,
    score: scoreOf(row),
    unit: row.unit,
    details: row.details ?? {},
    device: row.device,
    achievedAt: row.achieved_at,
  }));
}

export async function bestRecord(mode: string): Promise<{ pseudo: string; score: number } | null> {
  const [top] = await listRecords(mode, 1);
  return top ? { pseudo: top.pseudo, score: top.score } : null;
}
