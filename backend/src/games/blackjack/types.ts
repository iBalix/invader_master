/**
 * Blackjack multijoueur — types du module.
 *
 * L'état complet vit dans game_sessions.runtime.blackjack (JSONB) : tout
 * client se reconstruit depuis GET /state. Deux zones PRIVÉES n'apparaissent
 * jamais dans la vue publique : le sabot (state.shoe) et le contenu des
 * jokers de chaque joueur (seat.jokers, seul le compte est public).
 */

import type { SessionRow } from '../types.js';

/** carte compacte : rang (A23456789TJQK) + enseigne (shdc), ex "As", "Td" */
export type Card = string;

export type JokerType = 'force' | 'lock' | 'steal' | 'filet' | 'shield' | 'redraw';

export const JOKER_TYPES: JokerType[] = ['force', 'lock', 'steal', 'filet', 'shield', 'redraw'];

/** pondération de pioche (légèrement défensive, cf. cahier des charges) */
export const JOKER_WEIGHTS: Record<JokerType, number> = {
  filet: 20,
  shield: 18,
  redraw: 17,
  steal: 15,
  lock: 15,
  force: 15,
};

export interface BjConfig {
  maxSeats: number; // 2..8
  lateJoin: boolean;
  decks: number; // 2 | 4 | 6
  startChips: number;
  minBet: number;
  maxBet: number;
  /** prime de manche (montant fixe, doublée sur la dernière manche) */
  prime: number;
  rounds: number; // 6 | 8 | 10 | 12
  decisionMs: number; // première décision d'une main
  betMs: number;
  allowDouble: boolean;
  allowSplit: boolean;
  jokersEnabled: Record<JokerType, boolean>;
  jokerFrequency: 'rare' | 'normal' | 'generous';
  theme: string;
  creatorPseudo: string;
}

export interface BjHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  stood: boolean;
  busted: boolean;
  /** blackjack NATUREL (2 cartes de la donne initiale, hors split) */
  blackjack: boolean;
  locked: boolean;
  filetUsed: boolean;
  /** nombre de décisions déjà prises sur cette main (dégressivité du chrono) */
  decisions: number;
  /** plafond dur : instant (ms epoch) au-delà duquel la main est arrêtée */
  capAt: number | null;
  /** rempli au paiement */
  outcome?: 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
  delta?: number;
}

export interface BjSeatStats {
  busts: number;
  blackjacks: number;
  twentyOnes: number;
  jokersPlayed: number;
  attacksSent: number;
  biggestWin: number;
  primes: number;
}

export interface BjSeat {
  playerId: string;
  pseudo: string;
  device: string;
  /** position dans l'anneau physique du bar (index de RING, 100+ si inconnue) */
  ringPos: number;
  joinedSeq: number;
  chips: number;
  /** mise saisie pour la manche en cours (phase betting) */
  betInput: number | null;
  /** dernière mise jouée (défaut de la manche suivante) */
  betLast: number | null;
  hands: BjHand[];
  /** PRIVÉ : contenu des jokers (la vue publique n'expose que le compte) */
  jokers: JokerType[];
  shield: boolean;
  playedThisRound: number;
  /** fenêtre de décision où ce joueur a joué son dernier joker (1 par fenêtre) */
  lastWindowPlayed: number;
  attacksReceived: number;
  compGiven: number;
  roundsWon: number;
  consecLosses: number;
  /** assis en cours de partie : entre en jeu à la prochaine manche */
  joinPending: boolean;
  left: boolean;
  /** renfloué en début de manche (prime de la lanterne rouge) */
  lanterne: boolean;
  stats: BjSeatStats;
}

export interface BjJokerEvent {
  seq: number;
  type: JokerType;
  from: string; // playerId
  fromPseudo: string;
  to: string | null;
  toPseudo: string | null;
  /** annulé par un bouclier */
  shielded: boolean;
  /** carte concernée (vol : la carte volée ; force : la carte tirée) */
  card: Card | null;
  at: number;
}

export interface BjHandResult {
  playerId: string;
  pseudo: string;
  handIndex: number;
  outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
  delta: number;
  total: number;
  cards: number;
}

export interface BjRoundResult {
  roundIndex: number;
  dealerTotal: number;
  dealerBust: boolean;
  hands: BjHandResult[];
  /** vainqueur(s) de la manche (meilleure main qui bat le croupier) */
  primeWinners: string[]; // playerIds
  primeAmount: number;
  jokerAwards: Array<{ playerId: string; pseudo: string; reason: string; toChips: boolean }>;
  lanterne: string[]; // playerIds renfloués au début de la manche SUIVANTE
}

export interface BjTitle {
  playerId: string;
  pseudo: string;
  titleKey: string; // table.bj.title.*
  value: number;
}

export interface BjFinal {
  podium: Array<{ playerId: string; pseudo: string; score: number; chips: number; roundsWon: number }>;
  titles: BjTitle[];
}

export interface BjState {
  creatorId: string;
  /** PRIVÉ : jamais exposé en vue publique */
  shoe: Card[];
  /** le sabot vient d'être rempli (animation) */
  shoeRefilled: boolean;
  roundIndex: number; // 0-based, -1 avant la première manche
  seats: BjSeat[];
  /** ordre du tour de la manche courante (playerIds triés par ringPos) */
  order: string[];
  turn: { playerId: string; hand: number } | null;
  /** identifiant de fenêtre de décision : incrémenté à chaque changement */
  windowSeq: number;
  dealer: { cards: Card[]; revealed: boolean };
  lastRound: BjRoundResult | null;
  lastJokerEvent: BjJokerEvent | null;
  jokerEventSeq: number;
  skipVotes: string[];
  endAfterRound: boolean;
  /** la manche en cours est la dernière (prime doublée) */
  isLastRound: boolean;
  result: BjFinal | null;
  rematch: {
    offers: string[];
    sessionId: string | null;
    /** PRIVÉ : playerId (ancienne partie) -> token de la nouvelle */
    tokens?: Record<string, string>;
  } | null;
}

export function bjStateOf(session: SessionRow): BjState {
  const state = (session.runtime as { blackjack?: BjState }).blackjack;
  if (!state) {
    throw Object.assign(new Error('Session sans état blackjack'), { httpStatus: 500 });
  }
  return state;
}

export function seatOf(state: BjState, playerId: string): BjSeat | null {
  return state.seats.find((s) => s.playerId === playerId) ?? null;
}

/** sièges qui participent à la manche courante */
export function activeSeats(state: BjState): BjSeat[] {
  return state.seats.filter((s) => !s.left && !s.joinPending);
}

/**
 * L'anneau physique des dalles du bar, dans l'ordre du tour de salle.
 * Sert au placement à l'écran ET à l'ordre du tour de table.
 */
export const BAR_RING: string[] = [
  'TABLE02-1',
  'TABLE03-1',
  'TABLE05-1',
  'TABLE06-1',
  'TABLE07-1',
  'TABLE08-1',
  'TABLE09-1',
  'TABLE10-1',
  'TABLE04-1',
  'TABLE01-1',
  'TABLE01-2',
  'TABLE04-2',
  'TABLE10-2',
  'TABLE09-2',
  'TABLE08-2',
  'TABLE07-2',
  'TABLE06-2',
  'TABLE05-2',
  'TABLE03-2',
  'TABLE02-2',
];

export function ringPosOf(device: string, joinedSeq: number): number {
  const idx = BAR_RING.indexOf(device.toUpperCase());
  // dalle inconnue : placée après les autres, dans l'ordre d'arrivée
  return idx >= 0 ? idx : 100 + joinedSeq;
}

export const BJ_LOBBY_TOPIC = 'blackjack:lobby';
export const BJ_LOBBY_TTL_MS = 15 * 60_000;
export const BJ_INTRO_MS = 66_000;
export const BJ_BET_MS_DEFAULT = 12_000;
export const BJ_FOLLOWUP_MS = 6_000; // décisions suivantes d'une même main
export const BJ_HAND_CAP_MS = 24_000;
export const BJ_DEALER_STEP_MS = 1_200;
export const BJ_PAYOUT_MS = 9_000;
export const BJ_JOKER_PAUSE_MS = 8_000; // relance du chrono après un joker
export const BJ_MAX_JOKERS_HAND = 3;
export const BJ_MAX_PLAYED_PER_ROUND = 2;
export const BJ_MAX_ATTACKS_RECEIVED = 2;
export const BJ_THEME_MAX_LEN = 32;
