/**
 * Flappy Bar multijoueur — types du module.
 *
 * L'état complet vit dans game_sessions.runtime.flappybar (JSONB) : tout client
 * se reconstruit depuis GET /state. Les flaps de la manche en cours ne sont PAS
 * dans cet état : ils transitent par le WebSocket (fantômes) et ne sont
 * persistés qu'à la mort du joueur, rejoués par le serveur pour la distance
 * officielle (cf. flapSim.ts).
 *
 * Statuts de session : 'lobby' (avant la première manche et entre deux
 * manches) | 'playing' (compte à rebours puis manche) | 'end'. Comme pour les
 * échecs, on ne crée PAS de 4e statut : les dalles en kiosque gardent leur
 * bundle en cache et un statut inconnu les rendrait muettes. Le compte à
 * rebours se lit dans `round.startsAt` (futur) et le classement de la manche
 * précédente dans `lastRound` pendant le statut 'lobby'.
 */

import type { SessionRow } from '../types.js';

/** plafond dur de joueurs par partie : tout le bar (20 dalles) */
export const FLAP_MAX_PLAYERS = 20;
/** solo autorisé : on peut chasser les records seul */
export const FLAP_MIN_PLAYERS_TO_START = 1;
/** compte à rebours commun après le lancement d'une manche */
export const FLAP_COUNTDOWN_MS = 5_000;
/** délai avant de pouvoir relancer après une manche (le temps de lire le classement) */
export const FLAP_RESTART_LOCK_MS = 10_000;
/** durée max d'une manche (garde-fou, phase_ends_at) */
export const FLAP_ROUND_CAP_MS = 5 * 60_000;
/** salle d'attente AVANT la première manche sans lancement : la partie est fermée */
export const FLAP_LOBBY_TTL_MS = 5 * 60_000;
/** entre deux manches : pas de relance dans ce délai => partie fermée, joueurs renvoyés au lobby */
export const FLAP_IDLE_AFTER_ROUND_MS = 2 * 60_000;
/** socket morte en pleine manche : le joueur est résolu d'office après ce délai */
export const FLAP_DISCONNECT_GRACE_MS = 8_000;
/**
 * Un joueur vu (poll REST de /state, flap accepté) depuis moins de ce délai est
 * VIVANT même si sa socket est morte : la socket ne porte que les fantômes.
 * Le délai de grâce se réarme tant qu'il donne signe de vie ailleurs.
 */
export const FLAP_LIVENESS_MS = 12_000;
/** écart toléré entre la frame de mort déclarée et celle rejouée par le serveur */
export const FLAP_DEATH_TOLERANCE_FRAMES = 2;
export const FLAP_MAX_FLAPS_PER_SEC = 15;
/** 15 flaps/s pendant 5 min */
export const FLAP_MAX_FLAPS = 4_500;
export const FLAP_THEME_MAX_LEN = 32;
export const FLAP_INVITE_COOLDOWN_MS = 45_000;
export const FLAP_LOBBY_TOPIC = 'flappybar:lobby';
export const FLAP_RECORDS_TOPIC = 'flappybar:records';
export const FLAP_RECORDS_MODE = 'flappybar';
export const FLAP_DEFAULT_THEME = 'neon';

export interface FlapConfig {
  theme: string;
  /** 2..FLAP_MAX_PLAYERS (1 autorisé pour une partie solo) */
  maxPlayers: number;
  /** false : n'importe quel joueur actif peut lancer une manche */
  hostOnlyStart: boolean;
  countdownMs: number;
  roundCapMs: number;
  /** jamais exposé en vue publique */
  creatorPseudo: string;
}

/**
 * active : joue les manches ; pending : arrivé pendant une manche, entre à la
 * suivante ; left : parti (ligne game_players supprimée en douceur).
 */
export type FlapPlayerStatus = 'active' | 'pending' | 'left';

export interface FlapPlayer {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  joinedAt: number;
  status: FlapPlayerStatus;
  /** meilleure distance sur cette partie */
  bestDistance: number;
  roundsWon: number;
}

export type FlapResolvedBy = 'client' | 'server';

export interface FlapRoundResult {
  alive: boolean;
  deathFrame: number | null;
  /** mètres, 1 décimale */
  distance: number;
  pipes: number;
  /** temps de survie en ms */
  timeMs: number;
  flapsCount: number;
  /** client = mort déclarée et validée ; server = résolu d'office (socket morte, plafond) */
  resolvedBy: FlapResolvedBy | null;
  /** la frame déclarée s'écartait de plus de FLAP_DEATH_TOLERANCE_FRAMES du rejeu */
  mismatch: boolean;
}

export interface FlapRound {
  index: number;
  /** seed du niveau, entier 32 bits */
  seed: number;
  /** départ commun, ms epoch serveur */
  startsAt: number;
  /** fin forcée, ms epoch serveur (= phase_ends_at) */
  capAt: number;
  startedBy: string;
  participants: string[];
  results: Record<string, FlapRoundResult>;
}

export interface FlapRankingEntry {
  rank: number;
  playerId: string;
  pseudo: string;
  device: string;
  distance: number;
  pipes: number;
  timeMs: number;
  flapsCount: number;
  resolvedBy: FlapResolvedBy;
  /** a battu son propre record du bar */
  personalBest: boolean;
  /** premier record enregistré pour ce pseudo */
  firstRecord: boolean;
  /** a battu le record absolu du bar */
  barRecord: boolean;
  previousBest: number | null;
}

export type FlapRoundEnd = 'all_dead' | 'cap' | 'terminated';

/** pourquoi la partie s'est fermée : délai sans relance, plus personne, arrêt staff */
export type FlapEndReason = 'idle' | 'empty' | 'terminated';

export interface FlapRecordRef {
  pseudo: string;
  score: number;
}

export interface FlapLastRound {
  index: number;
  seed: number;
  startsAt: number;
  endedAt: number;
  endedBy: FlapRoundEnd;
  ranking: FlapRankingEntry[];
  records: {
    /** false tant que l'upsert des records (asynchrone) n'a pas été fait */
    applied: boolean;
    barBefore: FlapRecordRef | null;
    barAfter: FlapRecordRef | null;
  };
}

export interface FlapState {
  hostPlayerId: string;
  players: Record<string, FlapPlayer>;
  /** non nul UNIQUEMENT en statut 'playing' */
  round: FlapRound | null;
  lastRound: FlapLastRound | null;
  roundsPlayed: number;
  nextRoundIndex: number;
  /** compteur d'arrivées, sert à joinedSeq */
  joinCounter: number;
  /** +1 à chaque upsert de records réussi : le client refetch GET /records */
  recordsVersion: number;
  /** dernière invitation diffusée au bar (anti-spam) */
  inviteAt: number | null;
  /** renseigné quand la partie est fermée (statut 'end') */
  endReason?: FlapEndReason;
}

export function flapStateOf(session: SessionRow): FlapState {
  const state = (session.runtime as { flappybar?: FlapState }).flappybar;
  if (!state) {
    throw Object.assign(new Error('Session sans état flappybar'), { httpStatus: 500 });
  }
  return state;
}

export function flapConfigOf(session: SessionRow): FlapConfig {
  return session.config as unknown as FlapConfig;
}

export function playerOf(state: FlapState, playerId: string): FlapPlayer | null {
  return state.players[playerId] ?? null;
}

/** joueurs qui jouent les manches, dans l'ordre d'arrivée */
export function activePlayers(state: FlapState): FlapPlayer[] {
  return Object.values(state.players)
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.joinedSeq - b.joinedSeq);
}

/** joueurs présents (actifs + en attente), dans l'ordre d'arrivée */
export function presentPlayers(state: FlapState): FlapPlayer[] {
  return Object.values(state.players)
    .filter((p) => p.status !== 'left')
    .sort((a, b) => a.joinedSeq - b.joinedSeq);
}

export function aliveCount(round: FlapRound | null): number {
  if (!round) return 0;
  let n = 0;
  for (const id of round.participants) {
    if (round.results[id]?.alive) n += 1;
  }
  return n;
}

/** instant (ms epoch) à partir duquel on peut relancer une manche */
export function restartUnlockAt(state: FlapState): number | null {
  if (!state.lastRound) return null;
  return state.lastRound.endedAt + FLAP_RESTART_LOCK_MS;
}
