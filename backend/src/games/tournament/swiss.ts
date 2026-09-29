/**
 * Rondes suisses : fonctions PURES.
 *
 * Aucune I/O, aucune horloge implicite, aucun aléa caché : l'appelant fournit
 * `rng`. C'est ce qui permet de tout vérifier par simulation sans base
 * (scripts/check-tournament.ts), la base locale étant celle de production.
 *
 * Règles (actées avec Romain le 29/09/2026) :
 *   - ronde 1 aléatoire, puis ordre du classement : 1 contre 2, 3 contre 4 ;
 *   - jamais deux fois le même adversaire, revanche en dernier recours ;
 *   - nombre impair : l'exempt est le moins bien classé qui a le moins
 *     d'exemptions ; aux échecs il attend le premier joueur libéré.
 */

import {
  PAIRING_STEP_LIMIT,
  type ChessSide,
  type MatchResult,
  type RosterStatus,
  type StandingRow,
  type TournamentConfig,
  type TournamentMatch,
  type TournamentRound,
  type TournamentState,
} from './types.js';

// ---------------------------------------------------------------------------
// Pseudos
// ---------------------------------------------------------------------------

/**
 * Clé de comparaison d'un pseudo : sans accents, sans casse, espaces réduits.
 * « Élodie » tapé au téléphone et « elodie » tapé au clavier de la dalle
 * désignent le même joueur.
 */
export function pseudoKey(pseudo: string): string {
  return pseudo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

// ---------------------------------------------------------------------------
// Matchs
// ---------------------------------------------------------------------------

/** score du match en parties : victoire 1, nulle 0,5 */
export function gameScore(match: Pick<TournamentMatch, 'games'>): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const g of match.games) {
    if (g.winner === 'a') a += 1;
    else if (g.winner === 'b') b += 1;
    else {
      a += 0.5;
      b += 0.5;
    }
  }
  return { a, b };
}

export interface MatchDecision {
  decided: boolean;
  result: MatchResult | null;
  points: { a: number; b: number };
}

/**
 * Le match est-il décidé par ses parties ?
 *   best_of N : dès qu'un joueur dépasse N/2, ou après N parties ;
 *   all N     : après N parties.
 * Égalité à la fin : match nul.
 */
export function decideMatch(match: TournamentMatch, cfg: TournamentConfig): MatchDecision {
  const n = cfg.match.games;
  const played = match.games.length;
  const s = gameScore(match);
  const decided =
    cfg.match.decide === 'best_of' ? s.a > n / 2 || s.b > n / 2 || played >= n : played >= n;
  if (!decided) return { decided: false, result: null, points: { a: 0, b: 0 } };
  const result: MatchResult = s.a > s.b ? 'a' : s.b > s.a ? 'b' : 'draw';
  return { decided: true, result, points: pointsFor(match, result, cfg, 'games') };
}

/**
 * Points attribués pour un résultat.
 *   'games'    : barème appliqué partie par partie si scoring = 'game' ;
 *   'override' : résultat global imposé par le GM, barème de match.
 * Match bonus de l'exempt (floater) : rien pour l'adversaire attribué.
 */
export function pointsFor(
  match: Pick<TournamentMatch, 'games' | 'kind'>,
  result: MatchResult,
  cfg: TournamentConfig,
  mode: 'games' | 'override',
): { a: number; b: number } {
  const P = cfg.points;
  let pts: { a: number; b: number };
  if (result === 'forfeit_a') pts = { a: P.forfeit, b: P.loss };
  else if (result === 'forfeit_b') pts = { a: P.loss, b: P.forfeit };
  else if (result === 'bye') pts = { a: P.bye, b: 0 };
  else if (result === 'cancelled') pts = { a: 0, b: 0 };
  else if (mode === 'games' && cfg.match.scoring === 'game' && match.games.length > 0) {
    let a = 0;
    let b = 0;
    for (const g of match.games) {
      if (g.winner === 'a') {
        a += P.win;
        b += P.loss;
      } else if (g.winner === 'b') {
        a += P.loss;
        b += P.win;
      } else {
        a += P.draw;
        b += P.draw;
      }
    }
    pts = { a, b };
  } else if (result === 'a') pts = { a: P.win, b: P.loss };
  else if (result === 'b') pts = { a: P.loss, b: P.win };
  else pts = { a: P.draw, b: P.draw };
  if (match.kind === 'floater') pts = { a: pts.a, b: 0 };
  return pts;
}

export function isRoundComplete(round: TournamentRound): boolean {
  return (
    round.waiting === null &&
    round.matches.every((m) => m.status === 'done' || m.status === 'cancelled')
  );
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

/**
 * Classement recalculé DE ZÉRO à partir des rondes et des ajustements : une
 * correction d'une ronde passée donne exactement le même résultat qu'un
 * tournoi joué directement avec la bonne valeur.
 *
 * Départage : points, Buchholz (somme des points des adversaires), victoires,
 * confrontation directe, ordre d'inscription. Les exclus ferment la marche.
 */
export function computeStandings(state: TournamentState): StandingRow[] {
  interface Acc extends StandingRow {
    opponents: string[];
  }
  const rows = new Map<string, Acc>();
  for (const [id, r] of Object.entries(state.roster)) {
    rows.set(id, {
      playerId: id,
      pseudo: r.pseudo,
      rank: 0,
      tied: false,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      played: 0,
      buchholz: 0,
      adjustment: 0,
      byes: 0,
      status: r.status,
      opponents: [],
    });
  }
  // confrontation directe : pairKey -> vainqueur (null = nul)
  const h2h = new Map<string, string | null>();
  for (const round of state.rounds) {
    for (const m of round.matches) {
      if (m.status !== 'done' || !m.result || m.result === 'cancelled') continue;
      const ra = rows.get(m.a);
      if (m.kind === 'bye') {
        if (ra) {
          ra.points += m.points.a;
          ra.byes += 1;
        }
        continue;
      }
      if (!m.b) continue;
      const rb = rows.get(m.b);
      const aWins = m.result === 'a' || m.result === 'forfeit_a';
      const bWins = m.result === 'b' || m.result === 'forfeit_b';
      if (ra) {
        ra.points += m.points.a;
        ra.played += 1;
        if (aWins) ra.wins += 1;
        else if (bWins) ra.losses += 1;
        else ra.draws += 1;
        ra.opponents.push(m.b);
      }
      // partie bonus : hors classement pour l'adversaire attribué
      if (m.kind === 'normal') {
        if (rb) {
          rb.points += m.points.b;
          rb.played += 1;
          if (bWins) rb.wins += 1;
          else if (aWins) rb.losses += 1;
          else rb.draws += 1;
          rb.opponents.push(m.a);
        }
        h2h.set(pairKey(m.a, m.b), aWins ? m.a : bWins ? m.b : null);
      }
    }
  }
  for (const [id, list] of Object.entries(state.adjustments)) {
    const r = rows.get(id);
    if (!r) continue;
    const sum = list.reduce((s, x) => s + x.delta, 0);
    r.adjustment = sum;
    r.points += sum;
  }
  for (const r of rows.values()) {
    r.buchholz = r.opponents.reduce((s, o) => s + (rows.get(o)?.points ?? 0), 0);
  }
  const seqOf = (id: string): number => state.roster[id]?.seq ?? 0;
  const excluded = (s: RosterStatus): number => (s === 'excluded' ? 1 : 0);
  const list = [...rows.values()].sort((x, y) => {
    if (excluded(x.status) !== excluded(y.status)) return excluded(x.status) - excluded(y.status);
    if (y.points !== x.points) return y.points - x.points;
    if (y.buchholz !== x.buchholz) return y.buchholz - x.buchholz;
    if (y.wins !== x.wins) return y.wins - x.wins;
    const w = h2h.get(pairKey(x.playerId, y.playerId));
    if (w === x.playerId) return -1;
    if (w === y.playerId) return 1;
    return seqOf(x.playerId) - seqOf(y.playerId);
  });
  list.forEach((r, i) => {
    const prev = list[i - 1];
    const sameAsPrev =
      prev !== undefined &&
      excluded(prev.status) === excluded(r.status) &&
      prev.points === r.points &&
      prev.buchholz === r.buchholz &&
      prev.wins === r.wins &&
      !h2h.get(pairKey(prev.playerId, r.playerId));
    if (sameAsPrev) {
      r.rank = prev.rank;
      r.tied = true;
    } else {
      r.rank = i + 1;
      r.tied = false;
    }
  });
  return list.map(({ opponents: _opponents, ...row }) => row);
}

// ---------------------------------------------------------------------------
// Historique utile aux appariements
// ---------------------------------------------------------------------------

export interface PairingHistory {
  /** adversaires déjà rencontrés (matchs normaux et parties bonus) */
  met: Map<string, Set<string>>;
  /** nombre d'exemptions par joueur */
  byes: Map<string, number>;
  /** couleurs jouées, dans l'ordre */
  colors: Map<string, ChessSide[]>;
}

export function pairingHistory(state: TournamentState): PairingHistory {
  const met = new Map<string, Set<string>>();
  const byes = new Map<string, number>();
  const colors = new Map<string, ChessSide[]>();
  const addMet = (x: string, y: string): void => {
    if (!met.has(x)) met.set(x, new Set());
    met.get(x)?.add(y);
  };
  const addColor = (id: string, c: ChessSide): void => {
    if (!colors.has(id)) colors.set(id, []);
    colors.get(id)?.push(c);
  };
  for (const round of state.rounds) {
    if (round.byePlayer) byes.set(round.byePlayer, (byes.get(round.byePlayer) ?? 0) + 1);
    for (const m of round.matches) {
      if (!m.b || m.kind === 'bye' || m.status === 'cancelled') continue;
      addMet(m.a, m.b);
      addMet(m.b, m.a);
      for (const g of m.games) {
        const ca = g.colorA ?? m.colorA;
        if (!ca) continue;
        addColor(m.a, ca);
        addColor(m.b, ca === 'w' ? 'b' : 'w');
      }
    }
  }
  return { met, byes, colors };
}

// ---------------------------------------------------------------------------
// Appariements
// ---------------------------------------------------------------------------

export interface PairingInput {
  /** joueurs à apparier, dans l'ordre du classement (déjà mélangés en ronde 1) */
  order: string[];
  history: PairingHistory;
}

export interface PairingOutput {
  pairs: Array<{ a: string; b: string; colorA: ChessSide; rematch: boolean }>;
  bye: string | null;
  rematches: number;
}

/**
 * Couleur conseillée du joueur a : on équilibre blancs et noirs, puis on
 * alterne avec la dernière partie, puis on alterne d'un match à l'autre.
 */
export function assignColor(
  a: string,
  b: string,
  colors: Map<string, ChessSide[]>,
  boardIndex: number,
): ChessSide {
  const ca = colors.get(a) ?? [];
  const cb = colors.get(b) ?? [];
  const balance = (arr: ChessSide[]): number =>
    arr.filter((c) => c === 'w').length - arr.filter((c) => c === 'b').length;
  const da = balance(ca);
  const db = balance(cb);
  if (da < db) return 'w';
  if (da > db) return 'b';
  const la = ca[ca.length - 1];
  const lb = cb[cb.length - 1];
  if (la === 'b' && lb !== 'b') return 'w';
  if (lb === 'b' && la !== 'b') return 'b';
  if (la === 'w' && lb !== 'w') return 'b';
  if (lb === 'w' && la !== 'w') return 'w';
  return boardIndex % 2 === 0 ? 'w' : 'b';
}

/**
 * Appariement Monrad : le premier joueur libre affronte le suivant qu'il n'a
 * jamais rencontré, avec retour arrière en cas d'impasse (borné). Nombre
 * impair : l'exempt est pris depuis le bas du classement parmi ceux qui ont
 * le moins d'exemptions ; si cet exempt rend l'appariement impossible sans
 * revanche, on essaie le suivant avant de se résoudre à une revanche.
 */
export function pairPlayers(input: PairingInput): PairingOutput {
  const { order, history } = input;
  const hasMet = (x: string, y: string): boolean => history.met.get(x)?.has(y) ?? false;
  let steps = 0;

  const solve = (rest: string[]): Array<[string, string]> | null => {
    if (rest.length === 0) return [];
    steps += 1;
    if (steps > PAIRING_STEP_LIMIT) return null;
    const [first, ...others] = rest;
    for (let j = 0; j < others.length; j += 1) {
      const cand = others[j];
      if (hasMet(first, cand)) continue;
      const sub = solve([...others.slice(0, j), ...others.slice(j + 1)]);
      if (sub) return [[first, cand], ...sub];
      if (steps > PAIRING_STEP_LIMIT) return null;
    }
    return null;
  };

  // candidats à l'exemption : les moins exemptés, du bas vers le haut
  const byeCandidates: string[] = [];
  if (order.length % 2 === 1) {
    const minByes = Math.min(...order.map((id) => history.byes.get(id) ?? 0));
    for (let i = order.length - 1; i >= 0; i -= 1) {
      if ((history.byes.get(order[i]) ?? 0) === minByes) byeCandidates.push(order[i]);
    }
  }

  let bye: string | null = null;
  let pairs: Array<[string, string]> | null = null;
  if (byeCandidates.length === 0) {
    pairs = solve(order);
  } else {
    for (const cand of byeCandidates) {
      pairs = solve(order.filter((id) => id !== cand));
      if (pairs) {
        bye = cand;
        break;
      }
      if (steps > PAIRING_STEP_LIMIT) break;
    }
    if (!pairs) bye = byeCandidates[0];
  }

  let rematches = 0;
  const rematchSet = new Set<string>();
  if (!pairs) {
    // repli : chacun prend le plus proche jamais rencontré, sinon le plus proche
    pairs = [];
    const pool = order.filter((id) => id !== bye);
    while (pool.length >= 2) {
      const first = pool.shift() as string;
      let idx = pool.findIndex((c) => !hasMet(first, c));
      if (idx < 0) {
        idx = 0;
        rematches += 1;
        rematchSet.add(pairKey(first, pool[0]));
      }
      pairs.push([first, pool.splice(idx, 1)[0]]);
    }
  }

  return {
    pairs: pairs.map(([a, b], i) => ({
      a,
      b,
      colorA: assignColor(a, b, history.colors, i),
      rematch: rematchSet.has(pairKey(a, b)),
    })),
    bye,
    rematches,
  };
}

/** mélange de Fisher-Yates (aléa fourni par l'appelant) */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
