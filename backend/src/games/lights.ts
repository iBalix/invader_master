/**
 * Cues lumière (Philips Hue) dérivés de l'état de partie.
 *
 * Principe : le cloud envoie une INTENTION de haut niveau ("joue la scène
 * question, difficulté Difficile, elle dure 15 s"), jamais des ordres
 * d'ampoules. L'agent du bar joue l'animation localement, à l'horloge du bar.
 * Conséquences directes :
 *   - une question entière coûte ~3 messages au lieu de centaines de requêtes
 *     vers le bridge (le legacy le saturait, d'où les appels perdus) ;
 *   - le moment critique (rouge des 3 dernières secondes) ne traverse jamais
 *     le réseau : l'agent l'arme lui-même à la réception du cue.
 *
 * Émission : depuis withSession(), APRÈS saveSession, en fire-and-forget.
 * Les lumières ne doivent jamais casser ni ralentir le moteur de jeu.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { sendLightCue, type LightCue, type SceneName } from '../websocket/agent-bridge.js';
import type { SessionRow } from './types.js';

/** marge avant la fin de la question pour l'alerte rouge */
const WARN_BEFORE_MS = 3000;

// ---------------------------------------------------------------------------
// État mémoire (mono-process, même hypothèse que le mutex de l'engine)
// ---------------------------------------------------------------------------

/** dernière clé de cue émise, par session : évite de rejouer la même scène */
const lastCueKey = new Map<string, string>();
/**
 * Compteur monotone GLOBAL. Une seule session éclaire le bar à la fois, donc
 * un compteur unique suffit — et il évite qu'un cue manuel (bouton Tester)
 * entre en conflit de numérotation avec les cues de partie.
 * Borné pour rester dans un entier 32 bits (contrainte du worker PowerShell).
 */
let cueSeq = 0;
function nextSeq(): number {
  cueSeq = (cueSeq + 1) % 2_000_000_000;
  return cueSeq;
}
/** session autorisée à piloter les lumières (une seule partie éclaire le bar) */
let activeSessionId: string | null = null;
let activeSessionCheckedAt = 0;
const ACTIVE_CACHE_MS = 10_000;

let enabled = true;

export function setLightsEnabled(value: boolean): void {
  enabled = value;
}

export function areLightsEnabled(): boolean {
  return enabled;
}

/** à appeler à la création d'une session : invalide le cache de session active */
export function invalidateActiveSession(): void {
  activeSessionCheckedAt = 0;
}

export function forgetSession(sessionId: string): void {
  lastCueKey.delete(sessionId);
  invalidateActiveSession();
}

/**
 * Une seule session éclaire le bar : celle que /public/game/current renverrait.
 * Sans ça, une vieille session laissée ouverte dans un onglet GM piloterait
 * les lumières en pleine autre partie.
 */
async function isActiveSession(sessionId: string): Promise<boolean> {
  const now = Date.now();
  if (now - activeSessionCheckedAt > ACTIVE_CACHE_MS) {
    try {
      const { data } = await supabaseAdmin
        .from('game_sessions')
        .select('id')
        .is('ended_at', null)
        // même périmètre que /public/game/current : une partie d'échecs plus
        // récente ne doit pas voler le slot lumière du quiz en cours
        .in('mode', ['quiz', 'battle'])
        .order('created_at', { ascending: false })
        .limit(1);
      activeSessionId = data?.[0]?.id ?? null;
      activeSessionCheckedAt = now;
    } catch {
      return false;
    }
  }
  return activeSessionId === sessionId;
}

// ---------------------------------------------------------------------------
// Dérivation du cue depuis l'état
// ---------------------------------------------------------------------------

interface BattleRuntimeLike {
  roundNumber?: number;
  isFinal?: boolean;
  roundQuestionCount?: number;
  reveal?: { milestone?: number | null; victory?: boolean; repechage?: boolean };
}

function battleOf(session: SessionRow): BattleRuntimeLike {
  return ((session.runtime as Record<string, unknown>).battle ?? {}) as BattleRuntimeLike;
}

function currentDifficulty(session: SessionRow): string | undefined {
  const q = session.question_order[session.current_question_index];
  return q?.difficulty;
}

function phaseDurationMs(session: SessionRow): number | undefined {
  if (!session.phase_ends_at || !session.phase_started_at) return undefined;
  const ms =
    new Date(session.phase_ends_at).getTime() - new Date(session.phase_started_at).getTime();
  return ms > 0 ? ms : undefined;
}

/** Reste-t-il assez de temps pour armer l'alerte ? (cue reçu en retard = pas d'alerte) */
function warnAtMs(session: SessionRow): number | undefined {
  if (!session.phase_ends_at) return undefined;
  const remaining = new Date(session.phase_ends_at).getTime() - Date.now();
  const warn = remaining - WARN_BEFORE_MS;
  return warn > 500 ? warn : undefined;
}

interface ComputedCue {
  key: string;
  scene: SceneName;
  params: LightCue['params'];
}

/**
 * Traduit l'état persisté en scène. Retourne null si la phase ne pilote pas
 * les lumières. La CLÉ intègre tous les discriminants : deux étapes de
 * cinématique partagent le même statut mais doivent produire deux cues.
 */
export function computeCue(session: SessionRow): ComputedCue | null {
  // Seuls les événements projo pilotent les lumières du bar. Les jeux de
  // tables (chess, ...) partagent des statuts ('lobby', 'end') qui matcheraient
  // le switch ci-dessous : on coupe court.
  if (session.mode !== 'quiz' && session.mode !== 'battle') return null;
  const mode = session.mode;
  const status = session.status;
  const qi = session.current_question_index;
  const b = battleOf(session);
  const runtime = session.runtime as Record<string, unknown>;

  const base = (scene: SceneName, params: LightCue['params'] = {}, extra = ''): ComputedCue => ({
    key: `${mode}|${status}|q${qi}|${extra}`,
    scene,
    params,
  });

  switch (status) {
    case 'lobby':
    case 'rules':
      return base('lobby');

    case 'pause':
      return base('pause');

    // Décompte de reprise : l'écran reste celui de la pause, les lumières
    // aussi. Renvoyer null (et non un cue 'pause' de plus) évite un message
    // pour rien : la scène en cours est déjà la bonne.
    case 'resuming':
      return null;

    case 'round_intro':
      return base(
        'round_intro',
        { durationMs: phaseDurationMs(session), round: b.roundNumber, isFinal: b.isFinal },
        `r${b.roundNumber}`,
      );

    case 'announce':
      return base(
        'category',
        { difficulty: currentDifficulty(session), isFinal: b.isFinal },
        `d${currentDifficulty(session) ?? ''}`,
      );

    case 'question':
      return base('question_start', {
        durationMs: phaseDurationMs(session),
        warnAtMs: warnAtMs(session),
        difficulty: currentDifficulty(session),
        isFinal: b.isFinal,
      });

    case 'locked':
      return base('question_end');

    case 'verdict':
      return base('verdict');

    case 'reveal': {
      if (mode === 'battle') {
        const r = b.reveal ?? {};
        if (r.victory) return base('round_winner', {}, 'victory');
        if (r.milestone != null) {
          return base('milestone', { milestone: r.milestone as 3 | 5 | 10 | 20 }, `m${r.milestone}`);
        }
        return base('reveal');
      }
      const special = (runtime.reveal as { special?: string | null } | undefined)?.special;
      if (special) return base('bonus_question', {}, `s${special}`);
      return base('reveal');
    }

    case 'leaderboard':
      return base('leaderboard_reveal');

    case 'cinematic': {
      const step = (runtime.cinematic as { step?: number } | undefined)?.step ?? 0;
      if (step <= 0) return base('leaderboard_reveal', {}, 'cine0');
      // étapes 1..5 dévoilent les rangs 5..1 ; le rang 1 a sa scène dorée
      const rank = 6 - step;
      if (rank === 1) return base('leaderboard_first', { rank }, 'cine1');
      if (rank >= 2 && rank <= 5) return base('cinematic_step', { rank }, `cine${step}`);
      return base('leaderboard_reveal', {}, `cine${step}`);
    }

    case 'rewards': {
      const revealed = (runtime.rewards as { revealed?: number } | undefined)?.revealed ?? 0;
      return base('rewards_step', {}, `rw${revealed}`);
    }

    case 'round_end':
      return base('round_end', { round: b.roundNumber }, `r${b.roundNumber}`);

    case 'closing':
      return base('event_end', { durationMs: phaseDurationMs(session) });

    case 'end':
      return base('idle', {}, 'end');

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Émission
// ---------------------------------------------------------------------------

/**
 * Appelé par withSession après chaque sauvegarde d'état.
 * Fire-and-forget : ne throw jamais, n'est jamais attendu.
 */
export async function onSessionCommitted(session: SessionRow): Promise<void> {
  try {
    if (!enabled) return;

    const computed = computeCue(session);
    if (!computed) return;

    if (lastCueKey.get(session.id) === computed.key) return;

    if (!(await isActiveSession(session.id))) return;

    const seq = nextSeq();
    lastCueKey.set(session.id, computed.key);

    const sent = sendLightCue({
      v: 1,
      seq,
      scene: computed.scene,
      params: computed.params,
    });

    console.log(
      `[lights] cue=${computed.scene} session=${session.id.slice(0, 8)} seq=${seq} sent=${sent}`,
    );

    if (session.ended_at) forgetSession(session.id);
  } catch (err) {
    // jamais remonté : une panne de lumière ne casse pas une partie
    console.error('[lights] cue error', err);
  }
}

/** Cue ponctuel hors partie (bouton Tester, extinction manuelle) */
export function sendManualCue(scene: SceneName): boolean {
  return sendLightCue({ v: 1, seq: nextSeq(), scene, params: {} });
}
