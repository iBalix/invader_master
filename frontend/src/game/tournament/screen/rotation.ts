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
 * Ronde en cours (demande de Romain) :
 *   tirage animé, puis en boucle : classement 30 s, matchs de la ronde 30 s,
 *   un match en direct 3 min (tiré parmi les parties en cours).
 * Fin de ronde : résultats et classement en alternance, en attendant le GM.
 * Final : podium, puis classement complet.
 */

import type { TMatch, TournamentPublicState, TRound } from '../tournamentTypes';

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

/** page courante d'un écran paginé qui dure `durationMs` */
function pageAt(pos: number, durationMs: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  return Math.min(pageCount - 1, Math.floor(pos / (durationMs / pageCount)));
}

export function projoView(state: TournamentPublicState, now: number): RotationResult {
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
    const cycle = 20_000 + d.standingsMs;
    const pos = (t - FINAL_PODIUM_MS) % cycle;
    const idx = Math.floor((t - FINAL_PODIUM_MS) / cycle);
    if (pos < d.standingsMs) {
      const page = pageAt(pos, d.standingsMs, standingsPages);
      return {
        view: { kind: 'final_standings', page, pages: standingsPages },
        key: `final-standings-${idx}-${page}`,
        endsAt: now - pos + d.standingsMs,
      };
    }
    return { view: { kind: 'final_podium', elapsed: FINAL_PODIUM_MS }, key: `final-podium-${idx}`, endsAt: now - pos + cycle };
  }

  const roundPages = pages(round.matches.length, MATCHES_PER_PAGE);

  if (state.phase === 'round_done') {
    const start = round.finishedAt ?? now;
    const t = Math.max(0, now - start);
    const cycle = d.roundMs + d.standingsMs;
    const pos = t % cycle;
    const idx = Math.floor(t / cycle);
    if (pos < d.roundMs) {
      const page = pageAt(pos, d.roundMs, roundPages);
      return {
        view: { kind: 'round', round, page, pages: roundPages },
        key: `done-round-${idx}-${page}`,
        endsAt: now - pos + d.roundMs,
      };
    }
    const p2 = pos - d.roundMs;
    const page = pageAt(p2, d.standingsMs, standingsPages);
    return {
      view: { kind: 'standings', page, pages: standingsPages, note: `Ronde ${round.number} terminée` },
      key: `done-standings-${idx}-${page}`,
      endsAt: now - p2 + d.standingsMs,
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

  const cycle = d.standingsMs + d.roundMs + d.liveMs;
  const t = now - (start + drawMs);
  const idx = Math.floor(t / cycle);
  const pos = t - idx * cycle;
  if (pos < d.standingsMs) {
    const page = pageAt(pos, d.standingsMs, standingsPages);
    return {
      view: { kind: 'standings', page, pages: standingsPages, note: null },
      key: `standings-${idx}-${page}`,
      endsAt: now - pos + d.standingsMs,
    };
  }
  if (pos < d.standingsMs + d.roundMs) {
    const p2 = pos - d.standingsMs;
    const page = pageAt(p2, d.roundMs, roundPages);
    return {
      view: { kind: 'round', round, page, pages: roundPages },
      key: `round-${idx}-${page}`,
      endsAt: now - p2 + d.roundMs,
    };
  }
  const p3 = pos - d.standingsMs - d.roundMs;
  const candidates = liveCandidates(round, now);
  if (candidates.length > 0) {
    return {
      view: { kind: 'live', round, candidates, slotKey: `live-${round.number}-${idx}`, pinnedMatchId: null },
      key: `live-${round.number}-${idx}`,
      endsAt: now - p3 + d.liveMs,
    };
  }
  // aucune partie à montrer : le créneau alterne classement et matchs
  const sub = d.standingsMs + d.roundMs;
  const q = p3 % sub;
  const j = Math.floor(p3 / sub);
  if (q < d.standingsMs) {
    const page = pageAt(q, d.standingsMs, standingsPages);
    return {
      view: { kind: 'standings', page, pages: standingsPages, note: null },
      key: `fill-standings-${idx}-${j}-${page}`,
      endsAt: now - q + d.standingsMs,
    };
  }
  const page = pageAt(q - d.standingsMs, d.roundMs, roundPages);
  return {
    view: { kind: 'round', round, page, pages: roundPages },
    key: `fill-round-${idx}-${j}-${page}`,
    endsAt: now - (q - d.standingsMs) + d.roundMs,
  };
}

/** hachage stable (choix de la partie montrée, identique d'un rendu à l'autre) */
export function stableHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
