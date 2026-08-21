/**
 * Machine à états du BLACKJACK multijoueur (2 à 8 joueurs, tables tactiles).
 *
 * Cycle d'une partie :
 *   lobby (salle d'attente, le créateur lance) ─► intro (tutoriel, skippable
 *   au vote unanime) ─► [ betting ─► dealing ─► acting ─► dealer ─► payout ]
 *   répété `rounds` fois ─► end (podium + revanche).
 *
 * Principes hérités du moteur (quiz/échecs) :
 *   - état complet dans runtime.blackjack, toute mutation sous withSession ;
 *   - phase_ends_at porte l'échéance de la phase courante, l'advancer
 *     (synchrone) applique les transitions dues, le sweeper rattrape après un
 *     redémarrage ;
 *   - le broadcast est un signal enrichi (registerSyncPayload) : le payload
 *     est un SNAPSHOT complet de la vue publique, le client peint sans
 *     aller-retour HTTP ;
 *   - le client n'envoie jamais de temps ni de résultat.
 *
 * Deux zones privées : le sabot et le contenu des jokers (le compte est
 * public, le contenu passe par la vue `you`).
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  generatePlayerToken,
  insertSession,
  listOpenSessions,
  loadPlayers,
  loadSession,
  markDirty,
  registerAdvancer,
  registerSyncPayload,
  validatePseudo,
  withSession,
} from '../engine.js';
import { broadcastTopic } from '../realtime.js';
import { buildShoe, handTotal, isNatural, sameRank } from './deck.js';
import {
  BJ_BET_MS_DEFAULT,
  BJ_DEALER_STEP_MS,
  BJ_FOLLOWUP_MS,
  BJ_HAND_CAP_MS,
  BJ_INTRO_MS,
  BJ_JOKER_PAUSE_MS,
  BJ_LOBBY_TOPIC,
  BJ_LOBBY_TTL_MS,
  BJ_MAX_ATTACKS_RECEIVED,
  BJ_MAX_JOKERS_HAND,
  BJ_MAX_PLAYED_PER_ROUND,
  BJ_PAYOUT_MS,
  BJ_THEME_MAX_LEN,
  JOKER_TYPES,
  JOKER_WEIGHTS,
  activeSeats,
  bjStateOf,
  ringPosOf,
  seatOf,
  type BjConfig,
  type BjHand,
  type BjRoundResult,
  type BjSeat,
  type BjState,
  type BjTitle,
  type Card,
  type JokerType,
} from './types.js';
import { buildBjPublicState } from './bjViews.js';
import type { PlayerRow, SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function httpErr(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}

function bjConfigOf(session: SessionRow): BjConfig {
  return session.config as unknown as BjConfig;
}

function notifyLobby(): void {
  void broadcastTopic(BJ_LOBBY_TOPIC, 'sync', {}).catch(() => undefined);
}

function nowIso(): string {
  return new Date().toISOString();
}

function setPhaseAt(session: SessionRow, endsAtMs: number | null): void {
  session.phase_started_at = nowIso();
  session.phase_ends_at = endsAtMs === null ? null : new Date(endsAtMs).toISOString();
}

function draw(state: BjState, config: BjConfig): Card {
  if (state.shoe.length === 0) {
    // ne devrait jamais arriver (re-remplissage en début de manche), mais un
    // sabot vide en pleine main ne doit pas figer la partie
    state.shoe = buildShoe(config.decks);
    state.shoeRefilled = true;
  }
  return state.shoe.pop() as Card;
}

function newHand(bet: number): BjHand {
  return {
    cards: [],
    bet,
    doubled: false,
    fromSplit: false,
    stood: false,
    busted: false,
    blackjack: false,
    locked: false,
    filetUsed: false,
    decisions: 0,
    capAt: null,
  };
}

/** une main attend encore une décision de son joueur */
function handActionable(hand: BjHand): boolean {
  return !hand.stood && !hand.busted && !hand.blackjack && !hand.locked;
}

/** pool de pioche selon la config ; vide = jokers désactivés */
function jokerPool(config: BjConfig): JokerType[] {
  return JOKER_TYPES.filter((t) => config.jokersEnabled[t]);
}

/**
 * Pioche pondérée. Si la main est pleine (3), conversion automatique en
 * jetons : jamais de décision de défausse en pleine manche.
 */
function drawJoker(seat: BjSeat, config: BjConfig): { type: JokerType | null; toChips: boolean } {
  const pool = jokerPool(config);
  if (pool.length === 0) return { type: null, toChips: false };
  if (seat.jokers.length >= BJ_MAX_JOKERS_HAND) {
    seat.chips += config.minBet;
    return { type: null, toChips: true };
  }
  const totalWeight = pool.reduce((sum, t) => sum + JOKER_WEIGHTS[t], 0);
  let roll = crypto.randomInt(totalWeight);
  for (const type of pool) {
    roll -= JOKER_WEIGHTS[type];
    if (roll < 0) {
      seat.jokers.push(type);
      return { type, toChips: false };
    }
  }
  seat.jokers.push(pool[0]);
  return { type: pool[0], toChips: false };
}

/** prime effective de la manche courante */
function primeOf(state: BjState, config: BjConfig): number {
  return state.isLastRound ? config.prime * 2 : config.prime;
}

// ---------------------------------------------------------------------------
// Création / join
// ---------------------------------------------------------------------------

export interface CreateBjInput {
  pseudo: string;
  device: string;
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
  jokersEnabled: Partial<Record<JokerType, boolean>>;
  jokerFrequency: 'rare' | 'normal' | 'generous';
  theme: string;
}

function parseConfig(input: CreateBjInput): BjConfig {
  const maxSeats = Number(input.maxSeats);
  const decks = Number(input.decks);
  const startChips = Number(input.startChips);
  const minBet = Number(input.minBet);
  const maxBet = Number(input.maxBet);
  const rounds = Number(input.rounds);
  const decisionMs = Number(input.decisionMs);
  const theme = (input.theme ?? '').trim();
  const ok =
    Number.isInteger(maxSeats) && maxSeats >= 2 && maxSeats <= 8 &&
    [2, 4, 6].includes(decks) &&
    [200, 500, 1000].includes(startChips) &&
    Number.isInteger(minBet) && minBet >= 5 && minBet <= 100 &&
    Number.isInteger(maxBet) && maxBet >= minBet && maxBet <= startChips &&
    [6, 8, 10, 12].includes(rounds) &&
    [7000, 10000, 15000, 20000].includes(decisionMs) &&
    ['rare', 'normal', 'generous'].includes(input.jokerFrequency) &&
    theme.length > 0 && theme.length <= BJ_THEME_MAX_LEN;
  if (!ok) throw httpErr('error_bj_bad_config', 400);
  const jokersEnabled = {} as Record<JokerType, boolean>;
  for (const t of JOKER_TYPES) jokersEnabled[t] = input.jokersEnabled?.[t] !== false;
  return {
    maxSeats,
    lateJoin: input.lateJoin !== false,
    decks,
    startChips,
    minBet,
    maxBet,
    prime: maxBet * 2,
    rounds,
    decisionMs,
    betMs: BJ_BET_MS_DEFAULT,
    allowDouble: input.allowDouble !== false,
    allowSplit: input.allowSplit !== false,
    jokersEnabled,
    jokerFrequency: input.jokerFrequency,
    theme,
    creatorPseudo: input.pseudo.trim(),
  };
}

/**
 * Insert d'un joueur. Deux "Alex" dans la même partie sont ACCEPTÉS : la
 * contrainte UNIQUE(session_id, pseudo_norm) est contournée par un suffixe
 * technique sur pseudo_norm, le pseudo affiché reste identique (la table
 * d'origine est de toute façon affichée sous chaque siège).
 */
async function insertBjPlayer(sessionId: string, pseudo: string, device: string): Promise<PlayerRow> {
  const validationError = validatePseudo(pseudo);
  if (validationError) throw httpErr(validationError, 400);
  const trimmed = pseudo.trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const norm =
      attempt === 0
        ? trimmed.toLowerCase()
        : `${trimmed.toLowerCase()}~${crypto.randomBytes(3).toString('hex')}`;
    const { data, error } = await supabaseAdmin
      .from('game_players')
      .insert({
        session_id: sessionId,
        pseudo: trimmed,
        pseudo_norm: norm,
        device: device || 'unknown',
        player_token: generatePlayerToken(),
        bonuses: {},
        stats: {},
      })
      .select('*')
      .single();
    if (!error) return data as PlayerRow;
    if (!(`${error.message}`.includes('duplicate') || error.code === '23505')) throw error;
  }
  throw httpErr('error_player_already_exists', 409);
}

async function removeBjPlayer(player: PlayerRow): Promise<void> {
  await supabaseAdmin
    .from('game_players')
    .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
    .eq('id', player.id);
}

function makeSeat(state: BjState, player: PlayerRow, config: BjConfig, pending: boolean): BjSeat {
  const joinedSeq = state.seats.length;
  const seat: BjSeat = {
    playerId: player.id,
    pseudo: player.pseudo,
    device: player.device,
    ringPos: ringPosOf(player.device, joinedSeq),
    joinedSeq,
    chips: config.startChips,
    betInput: null,
    betLast: null,
    hands: [],
    jokers: [],
    shield: false,
    playedThisRound: 0,
    lastWindowPlayed: -1,
    attacksReceived: 0,
    compGiven: 0,
    roundsWon: 0,
    consecLosses: 0,
    joinPending: pending,
    left: false,
    lanterne: false,
    stats: {
      busts: 0,
      blackjacks: 0,
      twentyOnes: 0,
      jokersPlayed: 0,
      attacksSent: 0,
      biggestWin: 0,
      primes: 0,
    },
  };
  // chaque joueur démarre avec 1 joker, sinon la première manche est sèche
  drawJoker(seat, config);
  return seat;
}

export async function createBjSession(
  input: CreateBjInput,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const config = parseConfig(input);
  const state: BjState = {
    creatorId: '',
    shoe: buildShoe(config.decks),
    shoeRefilled: false,
    roundIndex: -1,
    seats: [],
    order: [],
    turn: null,
    windowSeq: 0,
    dealer: { cards: [], revealed: false },
    lastRound: null,
    lastJokerEvent: null,
    jokerEventSeq: 0,
    skipVotes: [],
    endAfterRound: false,
    isLastRound: false,
    result: null,
    rematch: null,
  };
  const session = await insertSession({
    mode: 'blackjack',
    status: 'lobby',
    config,
    runtime: { blackjack: state },
    phaseStartedAt: nowIso(),
    phaseEndsAt: new Date(Date.now() + BJ_LOBBY_TTL_MS).toISOString(),
  });
  const player = await insertBjPlayer(session.id, input.pseudo, input.device);
  const committed = await withSession(session.id, async (s) => {
    const st = bjStateOf(s);
    st.creatorId = player.id;
    st.seats.push(makeSeat(st, player, bjConfigOf(s), false));
    markDirty(s);
    return s;
  });
  notifyLobby();
  return { session: committed, player };
}

export async function joinBjSession(
  sessionId: string,
  pseudo: string,
  device: string,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  // reprise par dalle : au bar, l'écran EST l'identité physique. Si cette
  // dalle a déjà un siège actif (localStorage perdu, navigateur redémarré),
  // on lui rend son siège au lieu de la laisser dehors.
  const dev = (device || 'unknown').toUpperCase();
  if (dev !== 'UNKNOWN') {
    const existing = await loadSession(sessionId);
    if (existing && existing.mode === 'blackjack' && !existing.ended_at) {
      const taken = bjStateOf(existing).seats.find(
        (seat) => !seat.left && seat.device.toUpperCase() === dev,
      );
      if (taken) {
        const owner = (await loadPlayers(sessionId)).find((p) => p.id === taken.playerId);
        if (owner) {
          // purge les transitions dues avant de rendre l'état
          const fresh = await withSession(sessionId, async (x) => x);
          return { session: fresh, player: owner };
        }
      }
    }
  }

  const player = await insertBjPlayer(sessionId, pseudo, device);
  try {
    const session = await withSession(sessionId, async (s) => {
      if (s.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
      const state = bjStateOf(s);
      const config = bjConfigOf(s);
      const seated = state.seats.filter((seat) => !seat.left);
      if (seated.length >= config.maxSeats) throw httpErr('error_bj_table_full', 409);
      // garde-fou de course : deux requêtes simultanées de la même dalle ne
      // doivent pas créer deux sièges (le chemin normal est la reprise ci-dessus)
      if (dev !== 'UNKNOWN' && seated.some((seat) => seat.device.toUpperCase() === dev)) {
        throw httpErr('error_bj_device_seated', 409);
      }
      if (s.status === 'lobby') {
        state.seats.push(makeSeat(state, player, config, false));
      } else if (s.status === 'end') {
        throw httpErr('error_bj_game_over', 409);
      } else {
        if (!config.lateJoin) throw httpErr('error_bj_table_closed', 409);
        const seat = makeSeat(state, player, config, true);
        // le retardataire entre avec la médiane de la table : dans la course
        // sans l'avoir volée
        const chipsSorted = activeSeats(state)
          .map((x) => x.chips)
          .sort((a, b) => a - b);
        if (chipsSorted.length > 0) {
          seat.chips = chipsSorted[Math.floor(chipsSorted.length / 2)];
        }
        state.seats.push(seat);
      }
      markDirty(s);
      return s;
    });
    notifyLobby();
    return { session, player };
  } catch (err) {
    await removeBjPlayer(player).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Déroulé d'une manche
// ---------------------------------------------------------------------------

/** fin de partie annulée (lobby expiré, plus assez de joueurs avant le début) */
function cancelGame(session: SessionRow, state: BjState): void {
  state.result = null;
  session.status = 'end';
  session.ended_at = nowIso();
  session.phase_ends_at = null;
  markDirty(session);
  notifyLobby();
}

function finishGame(session: SessionRow, state: BjState, config: BjConfig): void {
  const seats = state.seats.filter((s) => !s.left);
  const podium = seats
    .map((s) => ({
      playerId: s.playerId,
      pseudo: s.pseudo,
      score: s.chips + s.roundsWon * config.prime,
      chips: s.chips,
      roundsWon: s.roundsWon,
    }))
    .sort((a, b) => b.score - a.score);

  const titles: BjTitle[] = [];
  const best = (
    key: keyof BjSeat['stats'],
    titleKey: string,
    min: number,
  ): void => {
    let top: BjSeat | null = null;
    for (const s of seats) {
      if (s.stats[key] >= min && (!top || s.stats[key] > top.stats[key])) top = s;
    }
    if (top) {
      titles.push({ playerId: top.playerId, pseudo: top.pseudo, titleKey, value: top.stats[key] });
    }
  };
  best('busts', 'table.bj.title.busts', 2);
  best('blackjacks', 'table.bj.title.blackjacks', 1);
  best('twentyOnes', 'table.bj.title.twentyones', 2);
  best('jokersPlayed', 'table.bj.title.jokers', 2);
  best('biggestWin', 'table.bj.title.banco', 1);

  state.result = { podium, titles };
  state.rematch = { offers: [], sessionId: null };
  state.turn = null;
  session.status = 'end';
  session.ended_at = nowIso();
  session.phase_ends_at = null;
  markDirty(session);
  notifyLobby();
}

/**
 * Début d'une manche : ménage des départs, activation des retardataires,
 * renflouement de la lanterne rouge, remise à zéro des mains, sabot.
 */
function startBetting(session: SessionRow, state: BjState, config: BjConfig): void {
  // départs actés à la frontière de manche
  state.seats = state.seats.filter((s) => !s.left);
  for (const seat of state.seats) seat.joinPending = false;

  if (state.seats.length < 2) {
    finishGame(session, state, config);
    return;
  }
  state.roundIndex += 1;
  if (state.roundIndex >= config.rounds) {
    finishGame(session, state, config);
    return;
  }
  state.isLastRound = state.endAfterRound || state.roundIndex === config.rounds - 1;

  // sabot re-rempli sous 25 % (13 cartes par jeu)
  state.shoeRefilled = false;
  if (state.shoe.length < config.decks * 13) {
    state.shoe = buildShoe(config.decks);
    state.shoeRefilled = true;
  }

  for (const seat of state.seats) {
    seat.betInput = null;
    seat.hands = [];
    seat.playedThisRound = 0;
    seat.lastWindowPlayed = -1;
    seat.attacksReceived = 0;
    seat.compGiven = 0;
    seat.lanterne = false;
    if (seat.chips < config.minBet) {
      // prime de la lanterne rouge : on ne sort JAMAIS un joueur du jeu
      seat.chips = config.minBet * 5;
      seat.lanterne = true;
    }
  }
  state.turn = null;
  state.dealer = { cards: [], revealed: false };
  session.status = 'betting';
  setPhaseAt(session, Date.now() + config.betMs);
  markDirty(session);
}

/** durée de l'animation de distribution côté client (cascade) */
function dealAnimMs(cardCount: number): number {
  return Math.min(5200, 900 + cardCount * 240);
}

function dealRound(session: SessionRow, state: BjState, config: BjConfig): void {
  const seats = activeSeats(state);
  for (const seat of seats) {
    const fallback = Math.min(Math.max(seat.betLast ?? config.minBet, config.minBet), config.maxBet);
    const bet = Math.min(seat.betInput ?? fallback, seat.chips, config.maxBet);
    const finalBet = Math.max(config.minBet, bet);
    seat.chips -= finalBet;
    seat.betLast = finalBet;
    seat.betInput = finalBet;
    const hand = newHand(finalBet);
    seat.hands = [hand];
  }
  // distribution : deux passes, comme au casino
  for (let pass = 0; pass < 2; pass++) {
    for (const seat of seats) seat.hands[0].cards.push(draw(state, config));
    state.dealer.cards.push(draw(state, config));
  }
  for (const seat of seats) {
    const hand = seat.hands[0];
    if (isNatural(hand.cards)) {
      hand.blackjack = true;
      hand.stood = true;
      seat.stats.blackjacks += 1;
    }
  }
  state.dealer.revealed = false;
  session.status = 'dealing';
  const cardCount = seats.length * 2 + 2;
  setPhaseAt(session, Date.now() + dealAnimMs(cardCount));
  markDirty(session);
}

/** ouvre la fenêtre de décision de la main au trait */
function openWindow(session: SessionRow, state: BjState, hand: BjHand, config: BjConfig): void {
  state.windowSeq += 1;
  const now = Date.now();
  if (hand.capAt === null) hand.capAt = now + BJ_HAND_CAP_MS;
  const ms = hand.decisions === 0 ? config.decisionMs : BJ_FOLLOWUP_MS;
  setPhaseAt(session, Math.min(now + ms, hand.capAt));
}

function startDealerPhase(session: SessionRow, state: BjState): void {
  state.turn = null;
  session.status = 'dealer';
  setPhaseAt(session, Date.now() + BJ_DEALER_STEP_MS);
  markDirty(session);
}

/**
 * Passe au prochain (siège, main) qui attend une décision, dans l'ordre de
 * l'anneau. Plus personne => le croupier joue.
 */
function advanceTurn(session: SessionRow, state: BjState, config: BjConfig): void {
  const startIdx = state.turn ? state.order.indexOf(state.turn.playerId) : -1;
  const startHand = state.turn ? state.turn.hand : 0;

  // d'abord : la seconde main du siège courant (après un split)
  if (state.turn && startHand === 0) {
    const seat = seatOf(state, state.turn.playerId);
    if (seat && !seat.left && seat.hands[1] && handActionable(seat.hands[1])) {
      state.turn = { playerId: seat.playerId, hand: 1 };
      openWindow(session, state, seat.hands[1], config);
      markDirty(session);
      return;
    }
  }
  for (let i = startIdx + 1; i < state.order.length; i++) {
    const seat = seatOf(state, state.order[i]);
    if (!seat || seat.left || seat.joinPending) continue;
    for (let h = 0; h < seat.hands.length; h++) {
      if (handActionable(seat.hands[h])) {
        state.turn = { playerId: seat.playerId, hand: h };
        openWindow(session, state, seat.hands[h], config);
        markDirty(session);
        return;
      }
    }
  }
  startDealerPhase(session, state);
}

function beginActing(session: SessionRow, state: BjState, config: BjConfig): void {
  const seats = activeSeats(state).slice().sort((a, b) =>
    a.ringPos === b.ringPos ? a.joinedSeq - b.joinedSeq : a.ringPos - b.ringPos,
  );
  state.order = seats.map((s) => s.playerId);
  state.turn = null;
  session.status = 'acting';
  markDirty(session);
  advanceTurn(session, state, config);
}

/** le croupier tire jusqu'à 16, s'arrête à 17 (S17), une carte par pas */
function dealerStep(session: SessionRow, state: BjState, config: BjConfig): void {
  if (!state.dealer.revealed) {
    state.dealer.revealed = true;
    setPhaseAt(session, Date.now() + BJ_DEALER_STEP_MS);
    markDirty(session);
    return;
  }
  const { total } = handTotal(state.dealer.cards);
  if (total < 17) {
    state.dealer.cards.push(draw(state, config));
    setPhaseAt(session, Date.now() + BJ_DEALER_STEP_MS);
    markDirty(session);
    return;
  }
  computePayout(session, state, config);
}

function computePayout(session: SessionRow, state: BjState, config: BjConfig): void {
  const dealer = handTotal(state.dealer.cards);
  const dealerBust = dealer.total > 21;
  const dealerNatural = isNatural(state.dealer.cards);
  const result: BjRoundResult = {
    roundIndex: state.roundIndex,
    dealerTotal: dealer.total,
    dealerBust,
    hands: [],
    primeWinners: [],
    primeAmount: primeOf(state, config),
    jokerAwards: [],
    lanterne: [],
  };

  interface WinnerHand {
    seat: BjSeat;
    total: number;
    cards: number;
  }
  const winners: WinnerHand[] = [];

  for (const seat of activeSeats(state)) {
    let seatLost = seat.hands.length > 0;
    for (let h = 0; h < seat.hands.length; h++) {
      const hand = seat.hands[h];
      const total = handTotal(hand.cards).total;
      let outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
      let ret = 0;
      if (hand.busted) {
        outcome = 'bust';
      } else if (hand.blackjack) {
        if (dealerNatural) {
          outcome = 'push';
          ret = hand.bet;
        } else {
          outcome = 'blackjack';
          ret = hand.bet + Math.floor(hand.bet * 1.5);
        }
      } else if (dealerBust || total > dealer.total) {
        outcome = 'win';
        ret = hand.bet * 2;
      } else if (total === dealer.total) {
        outcome = 'push';
        ret = hand.bet;
      } else {
        outcome = 'lose';
      }
      seat.chips += ret;
      const delta = ret - hand.bet;
      hand.outcome = outcome;
      hand.delta = delta;
      if (delta > 0) {
        seatLost = false;
        seat.stats.biggestWin = Math.max(seat.stats.biggestWin, delta);
      }
      if (outcome === 'push') seatLost = false;
      if (outcome === 'win' || outcome === 'blackjack') {
        winners.push({ seat, total, cards: hand.cards.length });
      }
      if (!hand.busted && total === 21 && hand.cards.length >= 3) seat.stats.twentyOnes += 1;
      result.hands.push({
        playerId: seat.playerId,
        pseudo: seat.pseudo,
        handIndex: h,
        outcome,
        delta,
        total,
        cards: hand.cards.length,
      });
    }
    seat.consecLosses = seatLost ? seat.consecLosses + 1 : 0;
  }

  // prime de manche : meilleure main qui bat le croupier, départage au
  // nombre de cartes le plus faible (décourage le sur-tirage), partage sinon
  if (winners.length > 0) {
    const bestTotal = Math.max(...winners.map((w) => w.total));
    const atBest = winners.filter((w) => w.total === bestTotal);
    const fewest = Math.min(...atBest.map((w) => w.cards));
    const primeHands = atBest.filter((w) => w.cards === fewest);
    const uniqueSeats = [...new Set(primeHands.map((w) => w.seat))];
    const share = Math.floor(result.primeAmount / uniqueSeats.length);
    for (const seat of uniqueSeats) {
      seat.chips += share;
      seat.roundsWon += 1;
      seat.stats.primes += 1;
      result.primeWinners.push(seat.playerId);
    }
  }

  // pioches de jokers gagnées à la résolution
  const freq = config.jokerFrequency;
  const award = (seat: BjSeat, reason: string): void => {
    const before = seat.jokers.length;
    const res = drawJoker(seat, config);
    if (res.type === null && !res.toChips) return; // jokers désactivés
    result.jokerAwards.push({
      playerId: seat.playerId,
      pseudo: seat.pseudo,
      reason,
      toChips: res.toChips || seat.jokers.length === before,
    });
  };
  for (const seat of activeSeats(state)) {
    const hasNatural = seat.hands.some((hh) => hh.blackjack);
    const has21Long = seat.hands.some(
      (hh) => !hh.busted && handTotal(hh.cards).total === 21 && hh.cards.length >= 3,
    );
    if (hasNatural) award(seat, 'blackjack');
    if (freq !== 'rare' && has21Long) award(seat, 'twentyone');
    if (freq !== 'rare' && seat.consecLosses >= 2) award(seat, 'losses');
    if (result.primeWinners.includes(seat.playerId)) award(seat, 'prime');
    if (
      freq === 'generous' &&
      seat.hands.some((hh) => hh.outcome === 'win' && handTotal(hh.cards).total >= 20)
    ) {
      award(seat, 'strong');
    }
  }
  // le pingre : bat le croupier avec la plus petite main gagnante (si
  // plusieurs gagnants et minimum unique)
  if (freq !== 'rare' && winners.length >= 2) {
    const minTotal = Math.min(...winners.map((w) => w.total));
    const atMin = winners.filter((w) => w.total === minTotal);
    const uniq = [...new Set(atMin.map((w) => w.seat))];
    if (uniq.length === 1 && !result.primeWinners.includes(uniq[0].playerId)) {
      award(uniq[0], 'pingre');
    }
  }

  state.lastRound = result;
  session.status = 'payout';
  setPhaseAt(session, Date.now() + BJ_PAYOUT_MS);
  markDirty(session);
}

// ---------------------------------------------------------------------------
// Actions joueur
// ---------------------------------------------------------------------------

export async function bjBet(sessionId: string, player: PlayerRow, amount: number): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
    const state = bjStateOf(session);
    const config = bjConfigOf(session);
    if (session.status !== 'betting') throw httpErr('error_bj_not_betting', 409);
    const seat = seatOf(state, player.id);
    if (!seat || seat.left || seat.joinPending) throw httpErr('error_bj_not_seated', 403);
    if (!Number.isInteger(amount)) throw httpErr('error_bj_bad_bet', 400);
    const clamped = Math.max(config.minBet, Math.min(amount, config.maxBet, seat.chips));
    seat.betInput = clamped;
    markDirty(session);
    // tout le monde a misé : on distribue sans attendre la fin du chrono
    if (activeSeats(state).every((s) => s.betInput !== null)) {
      dealRound(session, state, config);
    }
    return session;
  });
}

export type BjAct = 'hit' | 'stand' | 'double' | 'split';

export async function bjAct(
  sessionId: string,
  player: PlayerRow,
  action: BjAct,
  windowSeq: number,
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
    const state = bjStateOf(session);
    const config = bjConfigOf(session);
    if (session.status !== 'acting') throw httpErr('error_bj_not_your_turn', 409);
    if (!state.turn || state.turn.playerId !== player.id) {
      throw httpErr('error_bj_not_your_turn', 409);
    }
    // idempotence : un retry réseau d'une fenêtre déjà consommée est ignoré
    if (windowSeq !== state.windowSeq) throw httpErr('error_bj_stale_window', 409);
    const seat = seatOf(state, player.id);
    if (!seat) throw httpErr('error_bj_not_seated', 403);
    const hand = seat.hands[state.turn.hand];
    if (!hand || !handActionable(hand)) throw httpErr('error_bj_not_your_turn', 409);

    if (action === 'hit') {
      hand.cards.push(draw(state, config));
      hand.decisions += 1;
      const total = handTotal(hand.cards).total;
      if (total > 21) {
        hand.busted = true;
        seat.stats.busts += 1;
        advanceTurn(session, state, config);
      } else if (total === 21) {
        hand.stood = true;
        advanceTurn(session, state, config);
      } else {
        openWindow(session, state, hand, config);
        markDirty(session);
      }
      return session;
    }
    if (action === 'stand') {
      hand.stood = true;
      hand.decisions += 1;
      advanceTurn(session, state, config);
      return session;
    }
    if (action === 'double') {
      if (!config.allowDouble || hand.cards.length !== 2 || hand.doubled) {
        throw httpErr('error_bj_cannot_double', 409);
      }
      if (seat.chips < hand.bet) throw httpErr('error_bj_not_enough_chips', 409);
      seat.chips -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.decisions += 1;
      hand.cards.push(draw(state, config));
      if (handTotal(hand.cards).total > 21) {
        hand.busted = true;
        seat.stats.busts += 1;
      } else {
        hand.stood = true;
      }
      advanceTurn(session, state, config);
      return session;
    }
    // split
    if (
      !config.allowSplit ||
      seat.hands.length !== 1 ||
      hand.cards.length !== 2 ||
      hand.fromSplit ||
      !sameRank(hand.cards[0], hand.cards[1])
    ) {
      throw httpErr('error_bj_cannot_split', 409);
    }
    if (seat.chips < hand.bet) throw httpErr('error_bj_not_enough_chips', 409);
    seat.chips -= hand.bet;
    const first = newHand(hand.bet);
    const second = newHand(hand.bet);
    first.fromSplit = true;
    second.fromSplit = true;
    first.cards = [hand.cards[0], draw(state, config)];
    second.cards = [hand.cards[1], draw(state, config)];
    // 21 après séparation n'est PAS un blackjack : payé normalement
    if (handTotal(first.cards).total === 21) first.stood = true;
    if (handTotal(second.cards).total === 21) second.stood = true;
    seat.hands = [first, second];
    state.turn = { playerId: seat.playerId, hand: 0 };
    if (handActionable(first)) {
      openWindow(session, state, first, config);
      markDirty(session);
    } else {
      advanceTurn(session, state, config);
    }
    return session;
  });
}

// ---------------------------------------------------------------------------
// Jokers
// ---------------------------------------------------------------------------

function emitJokerEvent(
  state: BjState,
  type: JokerType,
  from: BjSeat,
  to: BjSeat | null,
  shielded: boolean,
  card: Card | null,
): void {
  state.jokerEventSeq += 1;
  state.lastJokerEvent = {
    seq: state.jokerEventSeq,
    type,
    from: from.playerId,
    fromPseudo: from.pseudo,
    to: to?.playerId ?? null,
    toPseudo: to?.pseudo ?? null,
    shielded,
    card,
    at: Date.now(),
  };
}

/** relance le chrono du joueur au trait après l'animation d'un joker */
function pauseForJoker(session: SessionRow, state: BjState): void {
  if (session.status !== 'acting' || !state.turn) return;
  const seat = seatOf(state, state.turn.playerId);
  const hand = seat?.hands[state.turn.hand];
  if (!hand) return;
  const target = Date.now() + BJ_JOKER_PAUSE_MS;
  if (hand.capAt !== null && hand.capAt < target) hand.capAt = target;
  const current = session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : 0;
  if (current < target) setPhaseAt(session, target);
}

export async function bjJoker(
  sessionId: string,
  player: PlayerRow,
  type: JokerType,
  targetId: string | null,
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
    const state = bjStateOf(session);
    const config = bjConfigOf(session);
    const inActing = session.status === 'acting';
    const inDealer = session.status === 'dealer';
    if (!inActing && !(inDealer && type === 'filet')) throw httpErr('error_bj_joker_phase', 409);

    const seat = seatOf(state, player.id);
    if (!seat || seat.left || seat.joinPending) throw httpErr('error_bj_not_seated', 403);
    if (!seat.jokers.includes(type)) throw httpErr('error_bj_no_joker', 409);
    if (seat.playedThisRound >= BJ_MAX_PLAYED_PER_ROUND) throw httpErr('error_bj_joker_limit', 409);
    if (inActing && seat.lastWindowPlayed === state.windowSeq) {
      throw httpErr('error_bj_joker_window', 409);
    }

    const consume = (): void => {
      seat.jokers.splice(seat.jokers.indexOf(type), 1);
      seat.playedThisRound += 1;
      seat.lastWindowPlayed = state.windowSeq;
      seat.stats.jokersPlayed += 1;
    };

    const isAttack = type === 'force' || type === 'lock' || type === 'steal';
    let target: BjSeat | null = null;
    if (isAttack) {
      if (!targetId) throw httpErr('error_bj_bad_target', 400);
      target = seatOf(state, targetId);
      if (!target || target.left || target.joinPending || target.playerId === seat.playerId) {
        throw httpErr('error_bj_bad_target', 400);
      }
      if (target.attacksReceived >= BJ_MAX_ATTACKS_RECEIVED) {
        throw httpErr('error_bj_target_protected', 409);
      }
      seat.stats.attacksSent += 1;
      // bouclier : l'attaque est consommée, l'effet est annulé, tout le monde le voit
      if (target.shield) {
        target.shield = false;
        consume();
        emitJokerEvent(state, type, seat, target, true, null);
        pauseForJoker(session, state);
        markDirty(session);
        return session;
      }
    }

    const advanceIfTurnDead = (): void => {
      if (session.status !== 'acting' || !state.turn) return;
      const turnSeat = seatOf(state, state.turn.playerId);
      const turnHand = turnSeat?.hands[state.turn.hand];
      if (!turnHand || !handActionable(turnHand)) advanceTurn(session, state, config);
    };

    const settle = (hand: BjHand, owner: BjSeat): void => {
      const total = handTotal(hand.cards).total;
      if (total > 21) {
        hand.busted = true;
        hand.stood = false;
        owner.stats.busts += 1;
      } else if (total === 21) {
        hand.stood = true;
      }
    };

    if (type === 'force') {
      const t = target as BjSeat;
      const hand = t.hands.find(
        (hh) => !hh.busted && !hh.blackjack && handTotal(hh.cards).total >= 12,
      );
      if (!hand) throw httpErr('error_bj_bad_target', 409);
      const card = draw(state, config);
      hand.cards.push(card);
      settle(hand, t);
      t.attacksReceived += 1;
      consume();
      emitJokerEvent(state, type, seat, t, false, card);
    } else if (type === 'lock') {
      const t = target as BjSeat;
      const hand = t.hands.find((hh) => handActionable(hh) && handTotal(hh.cards).total <= 16);
      if (!hand) throw httpErr('error_bj_bad_target', 409);
      hand.locked = true;
      hand.stood = true;
      t.attacksReceived += 1;
      consume();
      emitJokerEvent(state, type, seat, t, false, null);
    } else if (type === 'steal') {
      const t = target as BjSeat;
      const victim = t.hands.find((hh) => !hh.busted && !hh.blackjack && hh.cards.length >= 2);
      const mine = seat.hands.find((hh) => !hh.busted && !hh.blackjack);
      if (!victim || !mine) throw httpErr('error_bj_bad_target', 409);
      const card = victim.cards.pop() as Card;
      victim.cards.push(draw(state, config));
      mine.cards.push(card);
      settle(victim, t);
      settle(mine, seat);
      t.attacksReceived += 1;
      consume();
      emitJokerEvent(state, type, seat, t, false, card);
    } else if (type === 'filet') {
      const hand = seat.hands.find((hh) => hh.busted && !hh.filetUsed && hh.cards.length >= 3);
      if (!hand) throw httpErr('error_bj_no_bust', 409);
      hand.cards.pop();
      hand.busted = false;
      hand.stood = true;
      hand.filetUsed = true;
      consume();
      emitJokerEvent(state, type, seat, null, false, null);
    } else if (type === 'shield') {
      if (seat.shield) throw httpErr('error_bj_shield_armed', 409);
      seat.shield = true;
      consume();
      emitJokerEvent(state, type, seat, null, false, null);
    } else {
      // redraw : nouvelle main (2 cartes fraîches), avant toute décision
      const hand = seat.hands[0];
      if (
        !hand ||
        seat.hands.length !== 1 ||
        hand.cards.length !== 2 ||
        !handActionable(hand) ||
        hand.doubled
      ) {
        throw httpErr('error_bj_cannot_redraw', 409);
      }
      hand.cards = [draw(state, config), draw(state, config)];
      hand.blackjack = false;
      if (handTotal(hand.cards).total === 21) hand.stood = true;
      consume();
      emitJokerEvent(state, type, seat, null, false, null);
    }

    // dédommagement : chaque attaque subie donne une pioche à la victime
    if (isAttack && target && target.compGiven < 2) {
      target.compGiven += 1;
      drawJoker(target, config);
    }

    advanceIfTurnDead();
    pauseForJoker(session, state);
    markDirty(session);
    return session;
  });
}

// ---------------------------------------------------------------------------
// Actions de table (lancer, votes, départs, revanche)
// ---------------------------------------------------------------------------

export type BjMeta = 'launch' | 'skip-intro' | 'leave' | 'end-after-round' | 'rematch';

const ROUND_STATUSES = new Set(['betting', 'dealing', 'acting', 'dealer', 'payout']);

export async function bjMeta(
  sessionId: string,
  player: PlayerRow,
  action: BjMeta,
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
    const state = bjStateOf(session);
    const config = bjConfigOf(session);
    const seat = seatOf(state, player.id);
    if (!seat) throw httpErr('error_bj_not_seated', 403);

    if (action === 'launch') {
      if (session.status !== 'lobby') throw httpErr('error_bj_already_started', 409);
      if (state.creatorId !== player.id) throw httpErr('error_bj_not_creator', 403);
      if (activeSeats(state).length < 2) throw httpErr('error_bj_need_players', 409);
      state.skipVotes = [];
      if (state.fromRematch) {
        // revanche : tout le monde connaît le jeu, on distribue directement
        startBetting(session, state, config);
      } else {
        session.status = 'intro';
        setPhaseAt(session, Date.now() + BJ_INTRO_MS);
        markDirty(session);
      }
      notifyLobby();
      return session;
    }

    if (action === 'skip-intro') {
      if (session.status !== 'intro') throw httpErr('error_bj_already_started', 409);
      if (!state.skipVotes.includes(player.id)) {
        state.skipVotes.push(player.id);
        markDirty(session);
      }
      const actives = activeSeats(state);
      if (actives.every((s) => state.skipVotes.includes(s.playerId))) {
        startBetting(session, state, config);
      }
      return session;
    }

    if (action === 'leave') {
      if (session.status === 'lobby') {
        state.seats = state.seats.filter((s) => s.playerId !== player.id);
        if (state.seats.length === 0) {
          cancelGame(session, state);
          return session;
        }
        if (state.creatorId === player.id) {
          // le joueur assis depuis le plus longtemps hérite du bouton
          const oldest = state.seats.slice().sort((a, b) => a.joinedSeq - b.joinedSeq)[0];
          state.creatorId = oldest.playerId;
        }
        markDirty(session);
        notifyLobby();
        return session;
      }
      if (session.status === 'end') return session;
      seat.left = true;
      for (const hand of seat.hands) {
        if (handActionable(hand)) hand.stood = true;
      }
      if (state.creatorId === player.id) {
        const remaining = state.seats.filter((s) => !s.left).sort((a, b) => a.joinedSeq - b.joinedSeq);
        if (remaining.length > 0) state.creatorId = remaining[0].playerId;
      }
      if (session.status === 'acting' && state.turn?.playerId === player.id) {
        advanceTurn(session, state, config);
      } else if (session.status === 'betting') {
        if (activeSeats(state).every((s) => s.betInput !== null)) {
          dealRound(session, state, config);
        }
      } else if (session.status === 'intro') {
        const actives = activeSeats(state);
        if (actives.length >= 2 && actives.every((s) => state.skipVotes.includes(s.playerId))) {
          startBetting(session, state, config);
        }
      }
      markDirty(session);
      notifyLobby();
      return session;
    }

    if (action === 'end-after-round') {
      if (!ROUND_STATUSES.has(session.status)) throw httpErr('error_bj_already_started', 409);
      if (state.creatorId !== player.id) throw httpErr('error_bj_not_creator', 403);
      state.endAfterRound = true;
      state.isLastRound = true;
      markDirty(session);
      return session;
    }

    // rematch
    if (session.status !== 'end' || !state.rematch) throw httpErr('error_bj_game_over', 409);
    if (state.rematch.offers.includes(player.id)) return session;
    state.rematch.offers.push(player.id);
    markDirty(session);
    if (state.rematch.sessionId === null && state.rematch.offers.length >= 2) {
      await createRematch(session, state, config);
    } else if (state.rematch.sessionId !== null) {
      await appendToRematch(state, seat);
    }
    return session;
  });
}

/** nouvelle table dans la salle d'attente, avec les partants déjà assis */
async function createRematch(session: SessionRow, state: BjState, config: BjConfig): Promise<void> {
  const rematch = state.rematch as NonNullable<BjState['rematch']>;
  const offerSeats = rematch.offers
    .map((id) => seatOf(state, id))
    .filter((s): s is BjSeat => s !== null);
  if (offerSeats.length < 2) return;

  const newState: BjState = {
    creatorId: '',
    // tout le monde vient de jouer : pas de présentation au lancement
    fromRematch: true,
    shoe: buildShoe(config.decks),
    shoeRefilled: false,
    roundIndex: -1,
    seats: [],
    order: [],
    turn: null,
    windowSeq: 0,
    dealer: { cards: [], revealed: false },
    lastRound: null,
    lastJokerEvent: null,
    jokerEventSeq: 0,
    skipVotes: [],
    endAfterRound: false,
    isLastRound: false,
    result: null,
    rematch: null,
  };
  const newSession = await insertSession({
    mode: 'blackjack',
    status: 'lobby',
    config: { ...config },
    runtime: { blackjack: newState },
    phaseStartedAt: nowIso(),
    phaseEndsAt: new Date(Date.now() + BJ_LOBBY_TTL_MS).toISOString(),
  });

  const tokens: Record<string, string> = {};
  const players: PlayerRow[] = [];
  for (const old of offerSeats) {
    const p = await insertBjPlayer(newSession.id, old.pseudo, old.device);
    tokens[old.playerId] = p.player_token;
    players.push(p);
  }
  await withSession(newSession.id, async (s) => {
    const st = bjStateOf(s);
    st.creatorId = players[0].id;
    for (const p of players) st.seats.push(makeSeat(st, p, bjConfigOf(s), false));
    markDirty(s);
  });
  rematch.sessionId = newSession.id;
  rematch.tokens = tokens;
  markDirty(session);
  notifyLobby();
}

/** un retardataire de l'écran de fin rejoint la revanche déjà créée */
async function appendToRematch(state: BjState, seat: BjSeat): Promise<void> {
  const rematch = state.rematch as NonNullable<BjState['rematch']>;
  const newId = rematch.sessionId as string;
  try {
    const p = await insertBjPlayer(newId, seat.pseudo, seat.device);
    await withSession(newId, async (s) => {
      if (s.mode !== 'blackjack' || s.status !== 'lobby') throw httpErr('error_bj_table_closed', 409);
      const st = bjStateOf(s);
      const config = bjConfigOf(s);
      if (st.seats.filter((x) => !x.left).length >= config.maxSeats) {
        throw httpErr('error_bj_table_full', 409);
      }
      st.seats.push(makeSeat(st, p, config, false));
      markDirty(s);
    });
    if (rematch.tokens) rematch.tokens[seat.playerId] = p.player_token;
  } catch {
    // table pleine ou déjà lancée : l'offre reste enregistrée sans siège
  }
}

// ---------------------------------------------------------------------------
// Action staff (console /api/game)
// ---------------------------------------------------------------------------

export async function bjGmAction(sessionId: string, action: string): Promise<SessionRow> {
  if (action !== 'terminate') {
    throw httpErr(`Action inconnue pour une partie de blackjack: ${action}`, 400);
  }
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'blackjack') throw httpErr('Session introuvable', 404);
    if (session.status === 'end') return session;
    cancelGame(session, bjStateOf(session));
    return session;
  });
}

export async function listOpenBjSessions(): Promise<SessionRow[]> {
  return listOpenSessions('blackjack', 30);
}

// ---------------------------------------------------------------------------
// Transitions automatiques
// ---------------------------------------------------------------------------

function bjAdvance(session: SessionRow): boolean {
  const state = bjStateOf(session);
  const config = bjConfigOf(session);
  switch (session.status) {
    case 'lobby':
      cancelGame(session, state);
      return true;
    case 'intro':
      startBetting(session, state, config);
      return true;
    case 'betting':
      dealRound(session, state, config);
      return true;
    case 'dealing':
      beginActing(session, state, config);
      return true;
    case 'acting': {
      // chrono écoulé : l'action par défaut est RESTER, jamais d'exclusion
      if (!state.turn) {
        startDealerPhase(session, state);
        return true;
      }
      const seat = seatOf(state, state.turn.playerId);
      const hand = seat?.hands[state.turn.hand];
      if (hand && handActionable(hand)) {
        hand.stood = true;
      }
      advanceTurn(session, state, config);
      return true;
    }
    case 'dealer':
      dealerStep(session, state, config);
      return true;
    case 'payout':
      startBetting(session, state, config);
      return true;
    default:
      return false;
  }
}

registerAdvancer('blackjack', bjAdvance);

/**
 * Payload d'accélération du signal 'sync' : un SNAPSHOT COMPLET de la vue
 * publique. À N joueurs, plusieurs acteurs mutent l'état presque en même
 * temps : un delta séquentiel (comme aux échecs) raterait sa cible une fois
 * sur deux, un snapshot s'applique dès que sa version est plus récente. La
 * main de blackjack est petite, le poids reste négligeable.
 */
registerSyncPayload('blackjack', (session) => ({ snapshot: buildBjPublicState(session) }));
