/**
 * Vues Flappy Bar : ce que voient les clients.
 * Jamais exposés : les player_token (les jetons ne transitent que dans la
 * réponse de création / jointure) et le pseudo du créateur dans la config.
 * La vue publique embarque `serverNow` : c'est l'échantillon d'horloge des
 * dalles (clockSync), indispensable au départ commun des manches.
 */

import type { PlayerRow, SessionRow } from '../types.js';
import {
  activePlayers,
  aliveCount,
  flapConfigOf,
  flapStateOf,
  presentPlayers,
  restartUnlockAt,
  FLAP_MIN_PLAYERS_TO_START,
  type FlapConfig,
  type FlapLastRound,
  type FlapPlayerStatus,
  type FlapRound,
  type FlapRoundResult,
} from './types.js';

export type FlapSessionStatus = 'lobby' | 'playing' | 'end';

export interface FlapPlayerView {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  status: Exclude<FlapPlayerStatus, 'left'>;
  isHost: boolean;
  bestDistance: number;
  roundsWon: number;
}

export interface FlapRoundView extends FlapRound {
  aliveCount: number;
}

export interface FlapPublicState {
  id: string;
  joinCode: string;
  mode: 'flappybar';
  status: FlapSessionStatus;
  v: number;
  serverNow: number;
  phaseEndsAt: number | null;
  config: Omit<FlapConfig, 'creatorPseudo'>;
  hostPlayerId: string;
  players: FlapPlayerView[];
  round: FlapRoundView | null;
  lastRound: FlapLastRound | null;
  roundsPlayed: number;
  recordsVersion: number;
  /** ms epoch à partir duquel "Nouvelle manche" est autorisé (null avant la 1re manche) */
  restartUnlockAt: number | null;
  ended: boolean;
}

export interface FlapYou {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  status: FlapPlayerStatus;
  /** peut lancer une manche maintenant (statut, verrou, droits, effectif) */
  canStart: boolean;
  /** participe à la manche en cours */
  inRound: boolean;
  result: FlapRoundResult | null;
}

export interface FlapLobbyItem {
  sessionId: string;
  joinCode: string;
  status: 'lobby' | 'playing';
  theme: string;
  pseudos: string[];
  playerCount: number;
  maxPlayers: number;
  roundsPlayed: number;
  joinable: boolean;
  createdAt: string;
}

function sessionStatus(session: SessionRow): FlapSessionStatus {
  if (session.ended_at || session.status === 'end') return 'end';
  return session.status === 'playing' ? 'playing' : 'lobby';
}

export function buildFlapPublicState(session: SessionRow): FlapPublicState {
  const state = flapStateOf(session);
  const config = flapConfigOf(session);
  const { creatorPseudo: _omit, ...publicConfig } = config;
  void _omit;

  const players: FlapPlayerView[] = presentPlayers(state).map((p) => ({
    playerId: p.playerId,
    pseudo: p.pseudo,
    device: p.device,
    joinedSeq: p.joinedSeq,
    status: p.status === 'pending' ? 'pending' : 'active',
    isHost: p.playerId === state.hostPlayerId,
    bestDistance: p.bestDistance,
    roundsWon: p.roundsWon,
  }));

  return {
    id: session.id,
    joinCode: session.join_code,
    mode: 'flappybar',
    status: sessionStatus(session),
    v: session.state_version,
    serverNow: Date.now(),
    phaseEndsAt: session.phase_ends_at ? Date.parse(session.phase_ends_at) : null,
    config: publicConfig,
    hostPlayerId: state.hostPlayerId,
    players,
    round: state.round ? { ...state.round, aliveCount: aliveCount(state.round) } : null,
    lastRound: state.lastRound,
    roundsPlayed: state.roundsPlayed,
    recordsVersion: state.recordsVersion,
    restartUnlockAt: restartUnlockAt(state),
    ended: sessionStatus(session) === 'end',
  };
}

export function canStartRound(session: SessionRow, playerId: string, now = Date.now()): boolean {
  const state = flapStateOf(session);
  const config = flapConfigOf(session);
  if (sessionStatus(session) !== 'lobby') return false;
  const me = state.players[playerId];
  if (!me || me.status !== 'active') return false;
  if (config.hostOnlyStart && state.hostPlayerId !== playerId) return false;
  const unlock = restartUnlockAt(state);
  if (unlock !== null && now < unlock) return false;
  return activePlayers(state).length >= FLAP_MIN_PLAYERS_TO_START;
}

export function buildFlapYou(session: SessionRow, player: PlayerRow): FlapYou | null {
  const state = flapStateOf(session);
  const me = state.players[player.id];
  if (!me || me.status === 'left') return null;
  const inRound = state.round !== null && state.round.participants.includes(player.id);
  return {
    playerId: player.id,
    pseudo: me.pseudo,
    isHost: state.hostPlayerId === player.id,
    status: me.status,
    canStart: canStartRound(session, player.id),
    inRound,
    result: inRound && state.round ? state.round.results[player.id] ?? null : null,
  };
}

export function buildFlapLobbyItem(session: SessionRow): FlapLobbyItem {
  const state = flapStateOf(session);
  const config = flapConfigOf(session);
  const present = presentPlayers(state);
  const status = sessionStatus(session);
  return {
    sessionId: session.id,
    joinCode: session.join_code,
    status: status === 'playing' ? 'playing' : 'lobby',
    theme: config.theme,
    pseudos: present.map((p) => p.pseudo),
    playerCount: present.length,
    maxPlayers: config.maxPlayers,
    roundsPlayed: state.roundsPlayed,
    joinable: status !== 'end' && present.length < config.maxPlayers,
    createdAt: session.created_at,
  };
}
