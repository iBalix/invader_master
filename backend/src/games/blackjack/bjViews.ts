/**
 * Vues blackjack : ce que voient les clients.
 * Jamais exposés en vue publique : le sabot, le contenu des jokers (seul le
 * compte est public), les tokens de revanche (vue privée `you` uniquement).
 */

import { handTotal } from './deck.js';
import {
  activeSeats,
  bjStateOf,
  seatOf,
  type BjConfig,
  type BjFinal,
  type BjJokerEvent,
  type BjRoundResult,
  type BjSeat,
  type Card,
  type JokerType,
} from './types.js';
import type { PlayerRow, SessionRow } from '../types.js';

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
  outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | null;
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

export interface BjPublicState {
  id: string;
  joinCode: string;
  mode: 'blackjack';
  status: string;
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  config: Omit<BjConfig, 'creatorPseudo'>;
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

function handView(hand: BjSeat['hands'][number]): BjHandView {
  const { total, soft } = handTotal(hand.cards);
  return {
    cards: hand.cards,
    total,
    soft,
    bet: hand.bet,
    doubled: hand.doubled,
    fromSplit: hand.fromSplit,
    stood: hand.stood,
    busted: hand.busted,
    blackjack: hand.blackjack,
    locked: hand.locked,
    filetUsed: hand.filetUsed,
    outcome: hand.outcome ?? null,
    delta: hand.delta ?? null,
  };
}

export function buildBjPublicState(session: SessionRow): BjPublicState {
  const state = bjStateOf(session);
  const config = session.config as unknown as BjConfig;
  const { creatorPseudo: _omit, ...publicConfig } = config;
  const dealerTotal = state.dealer.revealed ? handTotal(state.dealer.cards).total : null;
  const dealerCards = state.dealer.revealed
    ? state.dealer.cards
    : state.dealer.cards.map((c, i) => (i === 1 ? '??' : c));

  const hand = state.turn ? seatOf(state, state.turn.playerId)?.hands[state.turn.hand] : null;

  return {
    id: session.id,
    joinCode: session.join_code,
    mode: 'blackjack',
    status: session.status,
    v: session.state_version,
    serverNow: Date.now(),
    phaseStartedAt: session.phase_started_at ? new Date(session.phase_started_at).getTime() : null,
    phaseEndsAt: session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null,
    config: publicConfig,
    roundIndex: state.roundIndex,
    isLastRound: state.isLastRound,
    nextIsLast: state.endAfterRound || state.roundIndex + 1 >= config.rounds - 1,
    endAfterRound: state.endAfterRound,
    shoeCount: state.shoe.length,
    shoeRefilled: state.shoeRefilled,
    dealer: { cards: dealerCards, total: dealerTotal, revealed: state.dealer.revealed },
    turn: state.turn
      ? { playerId: state.turn.playerId, hand: state.turn.hand, capAt: hand?.capAt ?? null }
      : null,
    windowSeq: state.windowSeq,
    seats: state.seats
      .filter((s) => !s.left)
      .map((s) => ({
        playerId: s.playerId,
        pseudo: s.pseudo,
        device: s.device,
        ringPos: s.ringPos,
        chips: s.chips,
        score: s.chips + s.roundsWon * config.prime,
        betInput: s.betInput,
        hasBet: s.betInput !== null,
        hands: s.hands.map(handView),
        jokerCount: s.jokers.length,
        shield: s.shield,
        attacksReceived: s.attacksReceived,
        playedThisRound: s.playedThisRound,
        roundsWon: s.roundsWon,
        joinPending: s.joinPending,
        left: s.left,
        lanterne: s.lanterne,
        isCreator: s.playerId === state.creatorId,
      })),
    skipVotes: state.skipVotes,
    lastRound: state.lastRound,
    lastJokerEvent: state.lastJokerEvent,
    result: state.result,
    rematch: state.rematch
      ? { offers: state.rematch.offers, sessionId: state.rematch.sessionId }
      : null,
    ended: session.ended_at !== null,
  };
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

export function buildBjYou(session: SessionRow, player: PlayerRow): BjYou | null {
  const state = bjStateOf(session);
  const seat = seatOf(state, player.id);
  if (!seat) return null;
  const token = state.rematch?.tokens?.[player.id];
  return {
    playerId: player.id,
    pseudo: seat.pseudo,
    seated: !seat.left,
    isCreator: state.creatorId === player.id,
    jokers: seat.jokers,
    skipVoted: state.skipVotes.includes(player.id),
    betInput: seat.betInput,
    rematch:
      token && state.rematch?.sessionId
        ? { sessionId: state.rematch.sessionId, playerToken: token }
        : null,
  };
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

export function buildBjLobbyItem(session: SessionRow): BjLobbyItem {
  const state = bjStateOf(session);
  const config = session.config as unknown as BjConfig;
  const seated = activeSeats(state).concat(state.seats.filter((s) => s.joinPending && !s.left));
  const isLobby = session.status === 'lobby';
  return {
    sessionId: session.id,
    joinCode: session.join_code,
    status: isLobby ? 'lobby' : 'playing',
    theme: config.theme,
    pseudos: seated.map((s) => s.pseudo),
    seatCount: seated.length,
    maxSeats: config.maxSeats,
    minBet: config.minBet,
    maxBet: config.maxBet,
    rounds: config.rounds,
    roundIndex: state.roundIndex,
    joinable: seated.length < config.maxSeats && (isLobby || config.lateJoin),
    createdAt: session.created_at,
  };
}
