/**
 * Rotation du projecteur pendant un tournoi : fonction PURE de l'état et de
 * l'horloge serveur.
 *
 * Contrairement aux pages de classement de la battle (minuterie locale qui
 * repart de zéro à chaque rendu), la vue affichée se DÉDUIT de
 * `serverNow() - début de la ronde` : un rechargement du projecteur retombe
 * exactement au même endroit du cycle, et le labo peut sauter à n'importe
 * quel instant.
 *
 * Ronde en cours (demande de Romain, revue au premier tournoi du 29/09) :
 *   tirage animé, puis en boucle : classement, matchs de la ronde, puis
 *   CHAQUE partie en cours l'une après l'autre (liveMs par partie ; une
 *   partie qui se termine montre son résultat 10 s puis laisse la suivante).
 *   Classement et matchs durent standingsMs / roundMs PAR PAGE.
 *   Exception à la règle « fonction pure » : la longueur du tour dépend du
 *   nombre de parties en cours, qui change pendant la ronde. Déduite de la
 *   seule horloge, elle ferait sauter l'écran à chaque partie qui démarre ou
 *   finit. Le projecteur garde donc sa position (RoundCycle) ; au montage
 *   (rechargement, labo), elle est rejouée depuis la fin du tirage.
 * Fin de ronde : résultats et classement en alternance, en attendant le GM.
 * Final : podium, puis classement complet.
 */

import type { TMatch, TournamentPublicState, TRound } from '../tournamentTypes';

type Display = TournamentPublicState['config']['display'];

/** une partie qui vient de finir reste montrée ce temps-là */
export const LIVE_RESULT_HOLD_MS = 10_000;
/** lignes de classement par page (deux colonnes de 12) */
export const STANDINGS_PER_PAGE = 24;
/** matchs par page (deux colonnes de 8) */
export const MATCHES_PER_PAGE = 16;
/** podium du final avant le classement complet */
export const FINAL_PODIUM_MS = 16_000;
/** pas du tirage : un match révélé toutes les 1,4 s */
export const DRAW_STEP_MS = 1_400;
export const DRAW_INTRO_MS = 3_000;

export function drawDuration(round: TRound): number {
  const n = round.matches.length + (round.waiting || round.byePlayer ? 1 : 0);
  return Math.min(45_000, Math.max(9_000, DRAW_INTRO_MS + n * DRAW_STEP_MS + 4_000));
}

export interface LiveCandidate {
  match: TMatch;
  /** partie d'échecs à montrer */
  ref: string;
  /** la partie vient de se terminer (résultat affiché quelques secondes) */
  finished: boolean;
}

/** parties montrables au projecteur : en cours, ou finies il y a moins de 10 s */
export function liveCandidates(round: TRound, now: number): LiveCandidate[] {
  const out: LiveCandidate[] = [];
  for (const m of round.matches) {
    if (m.kind === 'bye' || !m.b) continue;
    if (m.live) {
      out.push({ match: m, ref: m.live.ref, finished: false });
      continue;
    }
    const last = m.games[m.games.length - 1];
    if (last?.ref && last.at && now - last.at < LIVE_RESULT_HOLD_MS) {
      out.push({ match: m, ref: last.ref, finished: true });
    }
  }
  return out.sort((x, y) => (x.match.id < y.match.id ? -1 : 1));
}

export type ProjoView =
  | { kind: 'lobby' }
  | { kind: 'draw'; round: TRound; elapsed: number }
  | { kind: 'standings'; page: number; pages: number; note: string | null }
  | { kind: 'round'; round: TRound; page: number; pages: number }
  | { kind: 'live'; round: TRound; candidates: LiveCandidate[]; slotKey: string; pinnedMatchId: string | null }
  | { kind: 'final_podium'; elapsed: number }
  | { kind: 'final_standings'; page: number; pages: number };

export interface RotationResult {
  view: ProjoView;
  /** clé stable de l'écran courant : change à chaque bascule (animations d'entrée) */
  key: string;
  /** fin de l'écran courant, pour la barre de progression (null = sans fin) */
  endsAt: number | null;
}

function pages(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}

/** page courante d'un écran paginé, chaque page durant `pageMs` */
function pageAt(pos: number, pageMs: number, pageCount: number): number {
  if (pageCount <= 1 || pageMs <= 0) return 0;
  return Math.min(pageCount - 1, Math.max(0, Math.floor(pos / pageMs)));
}

// ---------------------------------------------------------------------------
// Tour d'une ronde en cours
// ---------------------------------------------------------------------------

export interface RoundCycle {
  round: number;
  step: 'standings' | 'round' | 'live';
  /** début de l'étape */
  at: number;
  /** numéro du tour (clés d'écran) */
  idx: number;
  /** parties à montrer une par une (id de match), figées au début du direct */
  queue: string[];
  pos: number;
}

interface CycleCtx {
  round: TRound;
  d: Display;
  standingsPages: number;
  roundPages: number;
}

function stepEnd(c: RoundCycle, x: CycleCtx): number {
  if (c.step === 'standings') return c.at + x.d.standingsMs * x.standingsPages;
  if (c.step === 'round') return c.at + x.d.roundMs * x.roundPages;
  const m = x.round.matches.find((mm) => mm.id === c.queue[c.pos]);
  if (!m) return c.at;
  const full = c.at + x.d.liveMs;
  if (m.live) return full;
  // partie terminée : son résultat reste LIVE_RESULT_HOLD_MS, puis la suivante
  const last = m.games[m.games.length - 1];
  if (last?.at) return Math.max(c.at, Math.min(full, last.at + LIVE_RESULT_HOLD_MS));
  return c.at;
}

function nextStep(c: RoundCycle, x: CycleCtx, at: number): RoundCycle {
  if (c.step === 'standings') return { ...c, step: 'round', at, queue: [], pos: 0 };
  if (c.step === 'round') {
    const queue =
      x.d.liveMs > 0
        ? liveCandidates(x.round, at)
            .filter((k) => !k.finished)
            .sort((p, q) => p.match.board - q.match.board)
            .map((k) => k.match.id)
        : [];
    if (queue.length > 0) return { ...c, step: 'live', at, queue, pos: 0 };
    return { ...c, step: 'standings', at, idx: c.idx + 1, queue: [], pos: 0 };
  }
  if (c.pos + 1 < c.queue.length) return { ...c, at, pos: c.pos + 1 };
  return { ...c, step: 'standings', at, idx: c.idx + 1, queue: [], pos: 0 };
}

/** position du tour à l'instant `now` (idempotent : rappeler avec le même now ne change rien) */
export function advanceRoundCycle(prev: RoundCycle | null, x: CycleCtx, drawEnd: number, now: number): RoundCycle {
  let c: RoundCycle =
    prev && prev.round === x.round.number
      ? prev
      : { round: x.round.number, step: 'standings', at: drawEnd, idx: 0, queue: [], pos: 0 };
  for (let guard = 0; guard < 100_000; guard += 1) {
    const end = stepEnd(c, x);
    if (now < end) break;
    c = nextStep(c, x, end);
  }
  return c;
}

/**
 * `memo` : position mémorisée du tour de ronde (le projecteur la garde d'un
 * rendu à l'autre). Absente, le tour est rejoué depuis la fin du tirage.
 */
export function projoView(
  state: TournamentPublicState,
  now: number,
  memo?: { current: RoundCycle | null },
): RotationResult {
  const round = state.rounds[state.rounds.length - 1] ?? null;
  const d = state.config.display;
  const standingsPages = pages(state.standings.length, STANDINGS_PER_PAGE);

  if (state.phase === 'registration' || !round) {
    return { view: { kind: 'lobby' }, key: 'lobby', endsAt: state.phaseEndsAt };
  }

  if (state.phase === 'final') {
    const start = state.finishedAt ?? now;
    const t = Math.max(0, now - start);
    if (t < FINAL_PODIUM_MS) {
      return { view: { kind: 'final_podium', elapsed: t }, key: 'final-podium', endsAt: start + FINAL_PODIUM_MS };
    }
    // podium et classement complet en alternance
    const standingsTotal = d.standingsMs * standingsPages;
    const cycle = 20_000 + standingsTotal;
    const pos = (t - FINAL_PODIUM_MS) % cycle;
    const idx = Math.floor((t - FINAL_PODIUM_MS) / cycle);
    if (pos < standingsTotal) {
      const page = pageAt(pos, d.standingsMs, standingsPages);
      return {
        view: { kind: 'final_standings', page, pages: standingsPages },
        key: `final-standings-${idx}-${page}`,
        endsAt: now - pos + (page + 1) * d.standingsMs,
      };
    }
    return { view: { kind: 'final_podium', elapsed: FINAL_PODIUM_MS }, key: `final-podium-${idx}`, endsAt: now - pos + cycle };
  }

  const roundPages = pages(round.matches.length, MATCHES_PER_PAGE);

  if (state.phase === 'round_done') {
    const start = round.finishedAt ?? now;
    const t = Math.max(0, now - start);
    const roundTotal = d.roundMs * roundPages;
    const cycle = roundTotal + d.standingsMs * standingsPages;
    const pos = t % cycle;
    const idx = Math.floor(t / cycle);
    if (pos < roundTotal) {
      const page = pageAt(pos, d.roundMs, roundPages);
      return {
        view: { kind: 'round', round, page, pages: roundPages },
        key: `done-round-${idx}-${page}`,
        endsAt: now - pos + (page + 1) * d.roundMs,
      };
    }
    const p2 = pos - roundTotal;
    const page = pageAt(p2, d.standingsMs, standingsPages);
    return {
      view: { kind: 'standings', page, pages: standingsPages, note: `Ronde ${round.number} terminée` },
      key: `done-standings-${idx}-${page}`,
      endsAt: now - p2 + (page + 1) * d.standingsMs,
    };
  }

  // ronde en cours
  const start = round.startedAt ?? now;
  const drawMs = drawDuration(round);
  if (now < start + drawMs) {
    return { view: { kind: 'draw', round, elapsed: now - start }, key: `draw-${round.number}`, endsAt: start + drawMs };
  }

  // vue imposée par le GM
  if (state.pin && state.pin.until && state.pin.until > now) {
    if (state.pin.view === 'standings') {
      return {
        view: { kind: 'standings', page: 0, pages: standingsPages, note: null },
        key: `pin-standings-${state.pin.until}`,
        endsAt: state.pin.until,
      };
    }
    if (state.pin.view === 'round') {
      return { view: { kind: 'round', round, page: 0, pages: roundPages }, key: `pin-round-${state.pin.until}`, endsAt: state.pin.until };
    }
    const cands = liveCandidates(round, now);
    return {
      view: { kind: 'live', round, candidates: cands, slotKey: `pin-${state.pin.until}`, pinnedMatchId: state.pin.matchId },
      key: `pin-live-${state.pin.until}`,
      endsAt: state.pin.until,
    };
  }

  const x: CycleCtx = { round, d, standingsPages, roundPages };
  const c = advanceRoundCycle(memo?.current ?? null, x, start + drawMs, now);
  if (memo) memo.current = c;
  if (c.step === 'standings') {
    const page = pageAt(now - c.at, d.standingsMs, standingsPages);
    return {
      view: { kind: 'standings', page, pages: standingsPages, note: null },
      key: `standings-${c.idx}-${page}`,
      endsAt: c.at + (page + 1) * d.standingsMs,
    };
  }
  if (c.step === 'round') {
    const page = pageAt(now - c.at, d.roundMs, roundPages);
    return {
      view: { kind: 'round', round, page, pages: roundPages },
      key: `round-${c.idx}-${page}`,
      endsAt: c.at + (page + 1) * d.roundMs,
    };
  }
  const matchId = c.queue[c.pos];
  const slotKey = `live-${round.number}-${c.idx}-${c.pos}`;
  return {
    view: {
      kind: 'live',
      round,
      candidates: liveCandidates(round, now).filter((k) => k.match.id === matchId),
      slotKey,
      pinnedMatchId: null,
    },
    key: slotKey,
    endsAt: stepEnd(c, x),
  };
}

/** hachage stable (choix de la partie montrée, identique d'un rendu à l'autre) */
export function stableHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
