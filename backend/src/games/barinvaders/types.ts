/**
 * Bar Invaders multijoueur — types du module.
 *
 * L'état complet vit dans game_sessions.runtime.barinvaders (JSONB) : tout
 * client se reconstruit depuis GET /state. Les entrées de la manche en cours
 * ne sont PAS dans cet état : elles transitent par le WebSocket (panneau des
 * adversaires, mode spectateur) et ne sont persistées qu'à la fin de partie
 * du joueur, rejouées par le serveur pour le score officiel (cf. invSim.ts).
 *
 * Statuts de session : 'lobby' (avant la première manche et entre deux
 * manches) | 'playing' (compte à rebours puis manche) | 'end'. Comme pour les
 * échecs et Flappy Bar, on ne crée PAS de 4e statut : les dalles en kiosque
 * gardent leur bundle en cache et un statut inconnu les rendrait muettes. Le
 * compte à rebours se lit dans `round.startsAt` (futur) et le classement de la
 * manche précédente dans `lastRound` pendant le statut 'lobby'.
 *
 * Contrairement à Flappy Bar, une manche n'a pas de seed : la borne de 1978
 * n'a aucun hasard, tout passe par des tables. Tous les joueurs affrontent
 * donc la même partie tant que leurs entrées sont les mêmes.
 */

import type { SessionRow } from '../types.js';
import { SIM } from './invSim.js';

/** plafond dur de joueurs par partie */
export const INV_MAX_PLAYERS = 8;
/** solo autorisé : on peut chasser les records seul */
export const INV_MIN_PLAYERS_TO_START = 1;
/** compte à rebours commun après le lancement d'une manche */
export const INV_COUNTDOWN_MS = 5_000;
/** délai avant de pouvoir relancer après une manche (le temps de lire le classement) */
export const INV_RESTART_LOCK_MS = 10_000;
/** durée max d'une manche (garde-fou, phase_ends_at) : la fin de la sim */
export const INV_ROUND_CAP_MS = Math.round((SIM.MAX_FRAMES * 1000) / SIM.FPS);
/** salle d'attente AVANT la première manche sans lancement : la partie est fermée */
export const INV_LOBBY_TTL_MS = 5 * 60_000;
/** entre deux manches : pas de relance dans ce délai => partie fermée, joueurs renvoyés au lobby */
export const INV_IDLE_AFTER_ROUND_MS = 2 * 60_000;
/** socket morte en pleine manche : le joueur est résolu d'office après ce délai */
export const INV_DISCONNECT_GRACE_MS = 8_000;
/**
 * Un joueur vu (poll REST de /state, entrée acceptée) depuis moins de ce délai
 * est VIVANT même si sa socket est morte : la socket ne porte que l'affichage
 * des adversaires. Le délai de grâce se réarme tant qu'il donne signe de vie.
 */
export const INV_LIVENESS_MS = 12_000;
/** écart toléré entre la frame de fin déclarée et celle rejouée par le serveur */
export const INV_DEATH_TOLERANCE_FRAMES = 2;
/** liste plate [frame, masque, ...] : 2 nombres par changement, au rythme maximal pendant toute la manche */
export const INV_MAX_INPUTS = 2 * SIM.MAX_INPUTS_PER_SEC * Math.round(INV_ROUND_CAP_MS / 1000);
export const INV_INVITE_COOLDOWN_MS = 45_000;
export const INV_LOBBY_TOPIC = 'barinvaders:lobby';
export const INV_RECORDS_TOPIC = 'barinvaders:records';
export const INV_RECORDS_MODE = 'barinvaders';

export interface InvConfig {
  /** 1..INV_MAX_PLAYERS */
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
export type InvPlayerStatus = 'active' | 'pending' | 'left';

export interface InvPlayer {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  joinedAt: number;
  status: InvPlayerStatus;
  /** meilleur score sur cette partie */
  bestScore: number;
  roundsWon: number;
}

export type InvResolvedBy = 'client' | 'server';

export interface InvRoundResult {
  alive: boolean;
  /** frame de fin de partie (GAME OVER), null tant qu'il joue */
  overFrame: number | null;
  score: number;
  /** vague atteinte */
  wave: number;
  /** envahisseurs abattus */
  kills: number;
  /** soucoupes abattues */
  ufoHits: number;
  /** temps de jeu en ms */
  timeMs: number;
  /** client = fin déclarée et rejouée ; server = résolu d'office (socket morte, plafond) */
  resolvedBy: InvResolvedBy | null;
  /** la frame déclarée s'écartait de plus de INV_DEATH_TOLERANCE_FRAMES du rejeu */
  mismatch: boolean;
}

export interface InvRound {
  index: number;
  /** départ commun, ms epoch serveur */
  startsAt: number;
  /** fin forcée, ms epoch serveur (= phase_ends_at) */
  capAt: number;
  startedBy: string;
  participants: string[];
  results: Record<string, InvRoundResult>;
}

export interface InvRankingEntry {
  rank: number;
  playerId: string;
  pseudo: string;
  device: string;
  score: number;
  wave: number;
  kills: number;
  ufoHits: number;
  timeMs: number;
  resolvedBy: InvResolvedBy;
  /** a battu son propre record du bar */
  personalBest: boolean;
  /** premier record enregistré pour ce pseudo */
  firstRecord: boolean;
  /** a battu le record absolu du bar */
  barRecord: boolean;
  previousBest: number | null;
}

export type InvRoundEnd = 'all_dead' | 'cap' | 'terminated';

/** pourquoi la partie s'est fermée : délai sans relance, plus personne, arrêt staff */
export type InvEndReason = 'idle' | 'empty' | 'terminated';

export interface InvRecordRef {
  pseudo: string;
  score: number;
}

export interface InvLastRound {
  index: number;
  startsAt: number;
  endedAt: number;
  endedBy: InvRoundEnd;
  ranking: InvRankingEntry[];
  records: {
    /** false tant que l'upsert des records (asynchrone) n'a pas été fait */
    applied: boolean;
    barBefore: InvRecordRef | null;
    barAfter: InvRecordRef | null;
  };
}

export interface InvState {
  hostPlayerId: string;
  players: Record<string, InvPlayer>;
  /** non nul UNIQUEMENT en statut 'playing' */
  round: InvRound | null;
  lastRound: InvLastRound | null;
  roundsPlayed: number;
  nextRoundIndex: number;
  /** compteur d'arrivées, sert à joinedSeq */
  joinCounter: number;
  /** +1 à chaque upsert de records réussi : le client refetch GET /records */
  recordsVersion: number;
  /** dernière invitation diffusée au bar (anti-spam) */
  inviteAt: number | null;
  /** renseigné quand la partie est fermée (statut 'end') */
  endReason?: InvEndReason;
}

export function invStateOf(session: SessionRow): InvState {
  const state = (session.runtime as { barinvaders?: InvState }).barinvaders;
  if (!state) {
    throw Object.assign(new Error('Session sans état barinvaders'), { httpStatus: 500 });
  }
  return state;
}

export function invConfigOf(session: SessionRow): InvConfig {
  return session.config as unknown as InvConfig;
}

export function playerOf(state: InvState, playerId: string): InvPlayer | null {
  return state.players[playerId] ?? null;
}

/** joueurs qui jouent les manches, dans l'ordre d'arrivée */
export function activePlayers(state: InvState): InvPlayer[] {
  return Object.values(state.players)
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.joinedSeq - b.joinedSeq);
}

/** joueurs présents (actifs + en attente), dans l'ordre d'arrivée */
export function presentPlayers(state: InvState): InvPlayer[] {
  return Object.values(state.players)
    .filter((p) => p.status !== 'left')
    .sort((a, b) => a.joinedSeq - b.joinedSeq);
}

export function aliveCount(round: InvRound | null): number {
  if (!round) return 0;
  let n = 0;
  for (const id of round.participants) {
    if (round.results[id]?.alive) n += 1;
  }
  return n;
}

/** instant (ms epoch) à partir duquel on peut relancer une manche */
export function restartUnlockAt(state: InvState): number | null {
  if (!state.lastRound) return null;
  return state.lastRound.endedAt + INV_RESTART_LOCK_MS;
}
