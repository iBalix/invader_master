/**
 * Vues Bar Invaders : ce que voient les clients.
 * Jamais exposés : les player_token (les jetons ne transitent que dans la
 * réponse de création / jointure) et le pseudo du créateur dans la config.
 * La vue publique embarque `serverNow` : c'est l'échantillon d'horloge des
 * dalles (clockSync), indispensable au départ commun des manches.
 */

import type { PlayerRow, SessionRow } from '../types.js';
import {
  activePlayers,
  aliveCount,
  invConfigOf,
  invStateOf,
  presentPlayers,
  restartUnlockAt,
  INV_MIN_PLAYERS_TO_START,
  type InvConfig,
  type InvEndReason,
  type InvLastRound,
  type InvPlayerStatus,
  type InvRound,
  type InvRoundResult,
} from './types.js';

export type InvSessionStatus = 'lobby' | 'playing' | 'end';

export interface InvPlayerView {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  status: Exclude<InvPlayerStatus, 'left'>;
  isHost: boolean;
  bestScore: number;
  roundsWon: number;
}

export interface InvRoundView extends InvRound {
  aliveCount: number;
}

export interface InvPublicState {
  id: string;
  joinCode: string;
  mode: 'barinvaders';
  status: InvSessionStatus;
  v: number;
  serverNow: number;
  phaseEndsAt: number | null;
  config: Omit<InvConfig, 'creatorPseudo'>;
  hostPlayerId: string;
  players: InvPlayerView[];
  round: InvRoundView | null;
  lastRound: InvLastRound | null;
  roundsPlayed: number;
  recordsVersion: number;
  /** ms epoch à partir duquel "Nouvelle partie" est autorisé (null avant la 1re manche) */
  restartUnlockAt: number | null;
  ended: boolean;
  /** pourquoi la partie est fermée (statut 'end'), sinon null */
  endReason: InvEndReason | null;
}

export interface InvYou {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  status: InvPlayerStatus;
  /** peut lancer une manche maintenant (statut, verrou, droits, effectif) */
  canStart: boolean;
  /** participe à la manche en cours */
  inRound: boolean;
  result: InvRoundResult | null;
}

export interface InvLobbyItem {
  sessionId: string;
  joinCode: string;
  status: 'lobby' | 'playing';
  pseudos: string[];
  playerCount: number;
  maxPlayers: number;
  roundsPlayed: number;
  joinable: boolean;
  createdAt: string;
}

function sessionStatus(session: SessionRow): InvSessionStatus {
  if (session.ended_at || session.status === 'end') return 'end';
  return session.status === 'playing' ? 'playing' : 'lobby';
}

export function buildInvPublicState(session: SessionRow): InvPublicState {
  const state = invStateOf(session);
  const config = invConfigOf(session);
  const { creatorPseudo: _omit, ...publicConfig } = config;
  void _omit;

  const players: InvPlayerView[] = presentPlayers(state).map((p) => ({
    playerId: p.playerId,
    pseudo: p.pseudo,
    device: p.device,
    joinedSeq: p.joinedSeq,
    status: p.status === 'pending' ? 'pending' : 'active',
    isHost: p.playerId === state.hostPlayerId,
    bestScore: p.bestScore,
    roundsWon: p.roundsWon,
  }));

  return {
    id: session.id,
    joinCode: session.join_code,
    mode: 'barinvaders',
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
    endReason: state.endReason ?? null,
  };
}

export function canStartRound(session: SessionRow, playerId: string, now = Date.now()): boolean {
  const state = invStateOf(session);
  const config = invConfigOf(session);
  if (sessionStatus(session) !== 'lobby') return false;
  const me = state.players[playerId];
  if (!me || me.status !== 'active') return false;
  if (config.hostOnlyStart && state.hostPlayerId !== playerId) return false;
  const unlock = restartUnlockAt(state);
  if (unlock !== null && now < unlock) return false;
  return activePlayers(state).length >= INV_MIN_PLAYERS_TO_START;
}

export function buildInvYou(session: SessionRow, player: PlayerRow): InvYou | null {
  const state = invStateOf(session);
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

export function buildInvLobbyItem(session: SessionRow): InvLobbyItem {
  const state = invStateOf(session);
  const config = invConfigOf(session);
  const present = presentPlayers(state);
  const status = sessionStatus(session);
  return {
    sessionId: session.id,
    joinCode: session.join_code,
    status: status === 'playing' ? 'playing' : 'lobby',
    pseudos: present.map((p) => p.pseudo),
    playerCount: present.length,
    maxPlayers: config.maxPlayers,
    roundsPlayed: state.roundsPlayed,
    joinable: status !== 'end' && present.length < config.maxPlayers,
    createdAt: session.created_at,
  };
}
