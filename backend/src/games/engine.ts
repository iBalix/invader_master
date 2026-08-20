/**
 * Moteur de jeu — infrastructure commune quiz/battle.
 *
 * Principes :
 * - L'état de partie vit dans game_sessions (Postgres), source de vérité unique.
 * - Toute mutation passe par withSession() : mutex par session, transitions
 *   automatiques dues (rattrapage paresseux), save + state_version++ + broadcast.
 * - Les timers serveur (setTimeout) déclenchent les transitions auto ; s'ils
 *   meurent (redémarrage), le rattrapage paresseux au prochain accès corrige.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { broadcast } from './realtime.js';
import { onSessionCommitted } from './lights.js';
import type { GameMode, GameStatus, PlayerRow, SessionRow } from './types.js';

// ---------------------------------------------------------------------------
// Accès DB
// ---------------------------------------------------------------------------

export async function loadSession(idOrCode: string): Promise<SessionRow | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq(isUuid ? 'id' : 'join_code', isUuid ? idOrCode : idOrCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return (data as SessionRow) ?? null;
}

export async function loadPlayers(sessionId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabaseAdmin
    .from('game_players')
    .select('*')
    .eq('session_id', sessionId)
    .neq('status', 'removed')
    .order('joined_at');
  if (error) throw error;
  return (data as PlayerRow[]) ?? [];
}

export async function saveSession(session: SessionRow): Promise<void> {
  // Garde optimiste : la version attendue est celle chargée sous le mutex.
  // Si un autre process (rolling deploy, double replica) a écrit entre-temps,
  // on échoue bruyamment plutôt que d'écraser son état.
  const expectedVersion = session.state_version;
  session.state_version += 1;
  const { error, data } = await supabaseAdmin
    .from('game_sessions')
    .update({
      status: session.status,
      previous_status: session.previous_status,
      config: session.config,
      question_order: session.question_order,
      current_question_index: session.current_question_index,
      phase_started_at: session.phase_started_at,
      phase_ends_at: session.phase_ends_at,
      runtime: session.runtime,
      state_version: session.state_version,
      started_at: session.started_at,
      ended_at: session.ended_at,
    })
    .eq('id', session.id)
    .eq('state_version', expectedVersion)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      `saveSession: session ${session.id} non mise à jour (version attendue ${expectedVersion} : ` +
        `session supprimée ou modifiée par un autre process)`,
    );
  }
}

/**
 * Clôt les sessions actives des modes donnés. Les modes "événement projo"
 * (quiz/battle) s'excluent mutuellement ; les jeux de tables (chess, ...)
 * vivent en parallèle et ne doivent JAMAIS être fauchés par un lancement de quiz.
 */
export async function endActiveSessions(modes: GameMode[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from('game_sessions')
    .update({ ended_at: new Date().toISOString(), status: 'end' })
    .is('ended_at', null)
    .in('mode', modes);
  if (error) throw error;
}

export interface InsertSessionFields {
  mode: GameMode;
  status: GameStatus;
  config: unknown;
  runtime: unknown;
  quizId?: string | null;
  questionOrder?: unknown[];
  phaseStartedAt?: string | null;
  phaseEndsAt?: string | null;
}

/** Insert d'une session avec join_code unique (retry sur collision). */
export async function insertSession(fields: InsertSessionFields): Promise<SessionRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .insert({
        mode: fields.mode,
        status: fields.status,
        join_code: joinCode,
        quiz_id: fields.quizId ?? null,
        config: fields.config,
        question_order: fields.questionOrder ?? [],
        current_question_index: -1,
        phase_started_at: fields.phaseStartedAt ?? null,
        phase_ends_at: fields.phaseEndsAt ?? null,
        runtime: fields.runtime,
        state_version: 1,
      })
      .select('*')
      .single();
    if (!error) return data as SessionRow;
    if (!`${error.message}`.includes('duplicate')) throw error;
  }
  throw new Error('Impossible de générer un code de session unique');
}

/** Sessions ouvertes d'un mode (base des lobbies multi-parties). */
export async function listOpenSessions(mode: GameMode, limit = 30): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('mode', mode)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as SessionRow[]) ?? [];
}

/** Auth joueur : token opaque cherché en base (401 côté routes si null). */
export async function findPlayerByToken(
  sessionId: string,
  token: string | undefined,
): Promise<PlayerRow | null> {
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from('game_players')
    .select('*')
    .eq('session_id', sessionId)
    .eq('player_token', token)
    .neq('status', 'removed')
    .maybeSingle();
  return (data as PlayerRow) ?? null;
}

// ---------------------------------------------------------------------------
// Mutex par session (process unique sur Railway)
// ---------------------------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(sessionId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    sessionId,
    prev.then(() => next),
  );
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(sessionId) === next) locks.delete(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Scheduler : transitions automatiques
// ---------------------------------------------------------------------------

const timers = new Map<string, ReturnType<typeof setTimeout>>();
type AdvanceFn = (session: SessionRow) => boolean;
/** enregistré par quizFlow (et plus tard battleFlow) pour éviter l'import circulaire */
const advancers = new Map<string, AdvanceFn>();

export function registerAdvancer(mode: string, fn: AdvanceFn): void {
  advancers.set(mode, fn);
}

/**
 * Une transition auto est-elle due ? Check pur, sans effet de bord.
 * À utiliser dans les routes de lecture : si true, passer par withSession()
 * pour appliquer (et persister) la transition. Ne JAMAIS appeler advanceIfDue
 * sur une copie jetable : les advancers ont des effets de bord (queueJudging).
 */
export function isAdvanceDue(session: SessionRow): boolean {
  if (!session.phase_ends_at || session.ended_at) return false;
  return Date.now() >= new Date(session.phase_ends_at).getTime();
}

/** Applique en boucle toutes les transitions auto dues. Retourne true si mutation. */
export function advanceIfDue(session: SessionRow): boolean {
  const advance = advancers.get(session.mode);
  if (!advance) return false;
  let mutated = false;
  // borne de sécurité anti-boucle
  for (let i = 0; i < 20; i++) {
    if (!session.phase_ends_at) break;
    if (Date.now() < new Date(session.phase_ends_at).getTime()) break;
    if (!advance(session)) break;
    mutated = true;
  }
  return mutated;
}

export function scheduleNext(session: SessionRow): void {
  const existing = timers.get(session.id);
  if (existing) clearTimeout(existing);
  if (!session.phase_ends_at || session.ended_at) return;
  const delay = Math.max(50, new Date(session.phase_ends_at).getTime() - Date.now() + 30);
  const timer = setTimeout(() => {
    timers.delete(session.id);
    // tick : mutation vide, les transitions dues s'appliquent dans withSession
    withSession(session.id, async () => undefined).catch((err) =>
      console.error('[game] tick error', err),
    );
  }, delay);
  timers.set(session.id, timer);
}

/**
 * Filet de sécurité : les timers vivent en mémoire et meurent au restart.
 * Le rattrapage paresseux (au premier accès client) couvre le cas courant,
 * mais une séquence auto (cinématique, récompenses) resterait figée si aucun
 * client ne poll. Ce balayage léger tick les sessions actives en retard.
 */
const SWEEP_INTERVAL_MS = 15000;

async function sweepDueSessions(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('id')
    .is('ended_at', null)
    .not('phase_ends_at', 'is', null)
    .lte('phase_ends_at', new Date().toISOString())
    .limit(5);
  if (error || !data) return;
  for (const row of data) {
    await withSession(row.id, async () => undefined).catch((err) =>
      console.error('[game] sweep error', err),
    );
  }
}

const sweeper = setInterval(() => {
  sweepDueSessions().catch(() => undefined);
}, SWEEP_INTERVAL_MS);
sweeper.unref?.();

// ---------------------------------------------------------------------------
// withSession : cœur du moteur
// ---------------------------------------------------------------------------

export async function withSession<T>(
  sessionId: string,
  fn: (session: SessionRow) => Promise<T>,
): Promise<T> {
  return withLock(sessionId, async () => {
    const session = await loadSession(sessionId);
    if (!session) throw Object.assign(new Error('Session introuvable'), { httpStatus: 404 });
    const beforeVersion = session.state_version;
    const autoMutated = advanceIfDue(session);
    const result = await fn(session);
    // fn signale une mutation en incrémentant runtime._dirty ou en modifiant l'état ;
    // on sauvegarde si quelque chose a bougé (transition auto ou action).
    const dirty = autoMutated || (session as SessionRow & { _dirty?: boolean })._dirty === true;
    if (dirty) {
      delete (session as SessionRow & { _dirty?: boolean })._dirty;
      session.state_version = beforeVersion; // saveSession fait l'incrément
      await saveSession(session);
      scheduleNext(session);
      await broadcast(session.id, 'sync', {
        v: session.state_version,
        status: session.status,
        qi: session.current_question_index,
      });
      // Cue lumière : fire-and-forget STRICT. Jamais await, jamais de rejet
      // remonté — une panne de lumière ne doit ni casser ni ralentir une partie.
      void onSessionCommitted(session).catch(() => undefined);
    }
    return result;
  });
}

/** à appeler dans fn() pour marquer la session modifiée */
export function markDirty(session: SessionRow): void {
  (session as SessionRow & { _dirty?: boolean })._dirty = true;
}

/** pose une nouvelle phase : statut + timestamps (durée null = piloté GM) */
export function setPhase(
  session: SessionRow,
  status: SessionRow['status'],
  durationMs: number | null,
): void {
  session.status = status;
  session.phase_started_at = new Date().toISOString();
  session.phase_ends_at =
    durationMs === null ? null : new Date(Date.now() + durationMs).toISOString();
  markDirty(session);
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I/L/O/0/1

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export const PSEUDO_REGEX = /^[a-zA-Z0-9_éàèêëïîôùûüç' -]+$/;

export function validatePseudo(pseudo: string): string | null {
  const trimmed = pseudo.trim();
  if (!trimmed || trimmed.length === 0) return 'error_player_invalid_name';
  if (trimmed.length > 16) return 'error_player_name_too_long';
  if (!PSEUDO_REGEX.test(trimmed) || !/[a-zA-Zéàèêëïîôùûüç]/.test(trimmed)) {
    return 'error_player_invalid_name';
  }
  return null;
}
