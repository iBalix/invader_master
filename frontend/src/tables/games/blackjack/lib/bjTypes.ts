/**
 * Types du blackjack côté tables : miroir des vues backend
 * (backend/src/games/blackjack/bjViews.ts) + types d'entrée.
 */

export type Card = string; // rang (A23456789TJQK) + enseigne (shdc), '??' = face cachée

export type JokerType = 'force' | 'lock' | 'steal' | 'filet' | 'shield' | 'redraw';

export const JOKER_TYPES: JokerType[] = ['force', 'lock', 'steal', 'filet', 'shield', 'redraw'];

export type BjStatus = 'lobby' | 'intro' | 'betting' | 'dealing' | 'acting' | 'dealer' | 'payout' | 'end';

export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BjConfigView {
  maxSeats: number;
  lateJoin: boolean;
  decks: number;
  startChips: number;
  minBet: number;
  maxBet: number;
  prime: number;
  rounds: number;
  decisionMs: number;
  betMs: number;
  allowDouble: boolean;
  allowSplit: boolean;
  jokersEnabled: Record<JokerType, boolean>;
  jokerFrequency: 'rare' | 'normal' | 'generous';
  theme: string;
}

export interface BjHandView {
  cards: Card[];
  total: number;
  soft: boolean;
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  stood: boolean;
  busted: boolean;
  blackjack: boolean;
  locked: boolean;
  filetUsed: boolean;
  outcome: BjOutcome | null;
  delta: number | null;
}

export interface BjSeatView {
  playerId: string;
  pseudo: string;
  device: string;
  ringPos: number;
  chips: number;
  score: number;
  betInput: number | null;
  hasBet: boolean;
  hands: BjHandView[];
  jokerCount: number;
  shield: boolean;
  attacksReceived: number;
  playedThisRound: number;
  roundsWon: number;
  joinPending: boolean;
  left: boolean;
  lanterne: boolean;
  isCreator: boolean;
}

export interface BjJokerEvent {
  seq: number;
  type: JokerType;
  from: string;
  fromPseudo: string;
  to: string | null;
  toPseudo: string | null;
  shielded: boolean;
  card: Card | null;
  at: number;
}

export interface BjHandResult {
  playerId: string;
  pseudo: string;
  handIndex: number;
  outcome: BjOutcome;
  delta: number;
  total: number;
  cards: number;
}

export interface BjRoundResult {
  roundIndex: number;
  dealerTotal: number;
  dealerBust: boolean;
  hands: BjHandResult[];
  primeWinners: string[];
  primeAmount: number;
  jokerAwards: Array<{ playerId: string; pseudo: string; reason: string; toChips: boolean }>;
  lanterne: string[];
}

export interface BjFinal {
  podium: Array<{ playerId: string; pseudo: string; score: number; chips: number; roundsWon: number }>;
  titles: Array<{ playerId: string; pseudo: string; titleKey: string; value: number }>;
}

export interface BjPublicState {
  id: string;
  joinCode: string;
  mode: 'blackjack';
  status: BjStatus;
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  config: BjConfigView;
  roundIndex: number;
  isLastRound: boolean;
  nextIsLast: boolean;
  endAfterRound: boolean;
  shoeCount: number;
  shoeRefilled: boolean;
  dealer: { cards: Card[]; total: number | null; revealed: boolean };
  turn: { playerId: string; hand: number; capAt: number | null } | null;
  windowSeq: number;
  seats: BjSeatView[];
  skipVotes: string[];
  lastRound: BjRoundResult | null;
  lastJokerEvent: BjJokerEvent | null;
  result: BjFinal | null;
  rematch: { offers: string[]; sessionId: string | null } | null;
  ended: boolean;
}

export interface BjYou {
  playerId: string;
  pseudo: string;
  seated: boolean;
  isCreator: boolean;
  jokers: JokerType[];
  skipVoted: boolean;
  betInput: number | null;
  rematch: { sessionId: string; playerToken: string } | null;
}

export interface BjStateResponse {
  state: BjPublicState;
  you: BjYou | null;
}

export interface BjLobbyItem {
  sessionId: string;
  joinCode: string;
  status: 'lobby' | 'playing';
  theme: string;
  pseudos: string[];
  seatCount: number;
  maxSeats: number;
  minBet: number;
  maxBet: number;
  rounds: number;
  roundIndex: number;
  joinable: boolean;
  createdAt: string;
}

export interface CreateBjInput {
  pseudo: string;
  maxSeats: number;
  lateJoin: boolean;
  decks: number;
  startChips: number;
  minBet: number;
  maxBet: number;
  rounds: number;
  decisionMs: number;
  allowDouble: boolean;
  allowSplit: boolean;
  jokersEnabled: Record<JokerType, boolean>;
  jokerFrequency: 'rare' | 'normal' | 'generous';
  theme: string;
}

export type BjAct = 'hit' | 'stand' | 'double' | 'split';
export type BjMeta = 'launch' | 'skip-intro' | 'leave' | 'end-after-round' | 'rematch';

/**
 * Estimation de durée d'une partie (minutes), alignée sur le cahier des
 * charges : ~34 s de tronc commun par manche + ~13 s par joueur (chrono
 * dégressif, jokers et séparations compris).
 */
export function estimateMinutes(rounds: number, players: number): number {
  return Math.max(1, Math.round((rounds * (34 + 13 * players)) / 60));
}
