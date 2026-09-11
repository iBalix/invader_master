/**
 * Types de Flappy Bar côté tables : miroir des vues backend
 * (backend/src/games/flappybar/flapViews.ts et types.ts) + types d'entrée,
 * réponses API, messages WebSocket.
 */

export const FLAP_THEME_IDS = ['neon', 'pixel', 'invader', 'abyss', 'aurora'] as const;
export type FlapThemeId = (typeof FLAP_THEME_IDS)[number];
export const FLAP_DEFAULT_THEME: FlapThemeId = 'neon';

/** plafond côté serveur (FLAP_MAX_PLAYERS) : tout le bar */
export const FLAP_MAX_PLAYERS = 20;
export const FLAP_PLAYER_CAP_CHOICES = [4, 8, 12, 20] as const;

export type FlapSessionStatus = 'lobby' | 'playing' | 'end';
export type FlapPlayerStatus = 'active' | 'pending' | 'left';
export type FlapResolvedBy = 'client' | 'server';
export type FlapRoundEnd = 'all_dead' | 'cap' | 'terminated';
export type FlapEndReason = 'idle' | 'empty' | 'terminated';

export interface FlapConfigView {
  theme: string;
  maxPlayers: number;
  hostOnlyStart: boolean;
  countdownMs: number;
  roundCapMs: number;
}

export interface FlapPlayerView {
  playerId: string;
  pseudo: string;
  device: string;
  joinedSeq: number;
  status: 'active' | 'pending';
  isHost: boolean;
  bestDistance: number;
  roundsWon: number;
}

export interface FlapRoundResult {
  alive: boolean;
  deathFrame: number | null;
  distance: number;
  pipes: number;
  timeMs: number;
  flapsCount: number;
  resolvedBy: FlapResolvedBy | null;
  mismatch: boolean;
}

export interface FlapRoundView {
  index: number;
  seed: number;
  /** ms epoch serveur : convertir avec serverNow() de clockSync */
  startsAt: number;
  capAt: number;
  startedBy: string;
  participants: string[];
  results: Record<string, FlapRoundResult>;
  aliveCount: number;
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
  personalBest: boolean;
  firstRecord: boolean;
  barRecord: boolean;
  previousBest: number | null;
}

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
    applied: boolean;
    barBefore: FlapRecordRef | null;
    barAfter: FlapRecordRef | null;
  };
}

export interface FlapPublicState {
  id: string;
  joinCode: string;
  mode: 'flappybar';
  status: FlapSessionStatus;
  v: number;
  serverNow: number;
  phaseEndsAt: number | null;
  config: FlapConfigView;
  hostPlayerId: string;
  players: FlapPlayerView[];
  round: FlapRoundView | null;
  lastRound: FlapLastRound | null;
  roundsPlayed: number;
  recordsVersion: number;
  restartUnlockAt: number | null;
  ended: boolean;
  endReason: FlapEndReason | null;
}

export interface FlapYou {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  status: FlapPlayerStatus;
  canStart: boolean;
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

/* ---------- entrées / réponses API ---------- */

export interface CreateFlapInput {
  pseudo: string;
  theme: string;
  maxPlayers: number;
}

export type FlapAction = 'start' | 'leave' | 'invite';

export interface FlapStateResponse {
  state: FlapPublicState;
  you: FlapYou | null;
}

export interface FlapCreateResponse extends FlapStateResponse {
  sessionId: string;
  joinCode: string;
  playerToken: string;
  you: FlapYou;
}

export interface FlapJoinResponse extends FlapStateResponse {
  sessionId: string;
  playerToken: string;
  you: FlapYou;
}

export interface FlapDeathInput {
  roundIndex: number;
  frame: number;
  flaps: number[];
}

export interface FlapDeathResponse extends FlapStateResponse {
  result: FlapRoundResult | null;
}

/** GET /public/<mode>/records : générique à tous les jeux */
export interface BarRecordItem {
  rank: number;
  pseudo: string;
  score: number;
  unit: string;
  details: Record<string, unknown>;
  device: string | null;
  achievedAt: string;
}

/* ---------- WebSocket /ws/flappybar ---------- */

export interface FlapWsRound {
  index: number;
  seed: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

export type FlapWsServerMessage =
  | {
      t: 'hello';
      role: 'player' | 'spectator';
      playerId: string | null;
      serverNow: number;
      round: FlapWsRound | null;
      /** flaps déjà connus de la manche en cours, par joueur */
      players: Record<string, number[]>;
      /** joueurs déjà morts : frame de mort */
      dead: Record<string, number>;
    }
  | { t: 'joined'; p: string }
  | { t: 'left'; p: string }
  | { t: 'flap'; p: string; f: number }
  | { t: 'round'; round: FlapWsRound }
  | { t: 'dead'; p: string; f: number; d: number }
  | { t: 'end'; index: number }
  | { t: 'bye' };

export type FlapWsClientMessage = { t: 'flap'; f: number };
