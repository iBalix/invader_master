/**
 * Types du client Bar Invaders, alignés sur backend/src/games/barinvaders
 * (invViews.ts pour les vues, barinvaders-bridge.ts pour le WebSocket).
 */

export type { BarRecordItem } from '../../flappybar/lib/flapTypes';

export type InvPlayerStatus = 'active' | 'pending' | 'left';
export type InvResolvedBy = 'client' | 'server';
export type InvRoundEnd = 'all_dead' | 'cap' | 'terminated';
export type InvEndReason = 'idle' | 'empty' | 'terminated';
export type InvSessionStatus = 'lobby' | 'playing' | 'end';
export type InvAction = 'start' | 'leave' | 'invite';

export interface InvConfigPublic {
  maxPlayers: number;
  hostOnlyStart: boolean;
  countdownMs: number;
  roundCapMs: number;
}

export interface InvRoundResult {
  alive: boolean;
  overFrame: number | null;
  score: number;
  wave: number;
  kills: number;
  ufoHits: number;
  timeMs: number;
  resolvedBy: InvResolvedBy | null;
  mismatch: boolean;
}

export interface InvRoundView {
  index: number;
  startsAt: number;
  capAt: number;
  startedBy: string;
  participants: string[];
  results: Record<string, InvRoundResult>;
  aliveCount: number;
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
  personalBest: boolean;
  firstRecord: boolean;
  barRecord: boolean;
  previousBest: number | null;
}

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
  records: { applied: boolean; barBefore: InvRecordRef | null; barAfter: InvRecordRef | null };
}

export interface InvPlayerView {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  status: 'active' | 'pending';
  isHost: boolean;
  bestScore: number;
  roundsWon: number;
}

export interface InvPublicState {
  id: string;
  joinCode: string;
  mode: 'barinvaders';
  status: InvSessionStatus;
  /** version du snapshot (realtime) */
  v: number;
  serverNow: number;
  phaseEndsAt: number | null;
  config: InvConfigPublic;
  hostPlayerId: string;
  players: InvPlayerView[];
  round: InvRoundView | null;
  lastRound: InvLastRound | null;
  roundsPlayed: number;
  recordsVersion: number;
  restartUnlockAt: number | null;
  ended: boolean;
  endReason: InvEndReason | null;
}

export interface InvYou {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  status: InvPlayerStatus;
  canStart: boolean;
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

export interface InvStateResponse {
  state: InvPublicState;
  you: InvYou | null;
}

export interface InvCreateResponse extends InvStateResponse {
  sessionId: string;
  joinCode: string;
  playerToken: string;
}

export interface InvJoinResponse extends InvStateResponse {
  sessionId: string;
  playerToken: string;
}

export interface InvGameOverResponse extends InvStateResponse {
  result: InvRoundResult | null;
}

export interface CreateInvInput {
  pseudo: string;
  device?: string;
  maxPlayers?: number;
}

export interface InvGameOverInput {
  roundIndex: number;
  frame: number;
  inputs: number[];
}

/* ---------- WebSocket /ws/barinvaders ---------- */

export interface InvWsRound {
  index: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

export type InvWsServerMsg =
  | {
      t: 'hello';
      role: 'player' | 'spectator';
      playerId: string | null;
      serverNow: number;
      round: InvWsRound | null;
      inputs: Record<string, number[]>;
      marks: Record<string, number>;
      dead: Record<string, { frame: number; score: number }>;
    }
  | { t: 'round'; round: InvWsRound }
  | { t: 'in'; p: string; f: number; m: number }
  | { t: 'hb'; p: string; f: number }
  | { t: 'dead'; p: string; frame: number; score: number; wave: number }
  | { t: 'ended'; index: number }
  | { t: 'joined'; p: string }
  | { t: 'left'; p: string }
  | { t: 'bye' };

export type InvWsClientMsg = { t: 'in'; f: number; m: number } | { t: 'hb'; f: number };
