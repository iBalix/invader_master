/**
 * Salves (Mario Kart, Smash Bros) : réducteurs purs, à côté des rondes
 * suisses. Les échecs n'entrent pas ici.
 *
 * Une salve découpe les actifs en groupes (4 max en MK, 2 en Smash). Si tout
 * le monde ne joue pas en même temps, les groupes au-delà de `parallel`
 * restent en file et passent dès qu'une place se libère. Le barrage et le
 * tableau n'ajoutent pas de points de poule.
 */

import { shuffle } from './swiss.js';
import {
  FEED_MAX,
  httpErr,
  type BracketMatch,
  type BracketRound,
  type BracketSeeding,
  type BracketState,
  type TournamentConfig,
  type TournamentState,
  type WaveGroup,
  type WaveGrouping,
  type WaveKind,
  type WaveRound,
  type StandingRow,
} from './types.js';

export interface WaveCtx {
  cfg: TournamentConfig;
  now: number;
  rng: () => number;
}

function iso(ctx: WaveCtx): string {
  return new Date(ctx.now).toISOString();
}

function pushFeed(state: TournamentState, ctx: WaveCtx, text: string): void {
  state.feedSeq += 1;
  state.feed.push({ seq: state.feedSeq, kind: 'round', text, at: iso(ctx) });
  if (state.feed.length > FEED_MAX) state.feed.splice(0, state.feed.length - FEED_MAX);
}

function activeIds(state: TournamentState): string[] {
  return Object.entries(state.roster)
    .filter(([, r]) => r.status === 'active')
    .sort((a, b) => a[1].seq - b[1].seq)
    .map(([id]) => id);
}

function pseudo(state: TournamentState, id: string): string {
  return state.roster[id]?.pseudo ?? '?';
}

/**
 * Découpe n joueurs.
 * MK (max 4) : on privilégie les groupes de 4, et s'il reste du monde on
 * casse des groupes de 4 pour faire des 3. Un seul groupe de 2, et seulement
 * si on ne peut pas l'éviter (5 joueurs). Jamais de joueur tout seul.
 * Smash (max 2) : des paires. L'éventuel joueur impair est rendu à l'appelant
 * (il ne forme pas un groupe).
 */
export function partitionSizes(n: number, maxSize: number): number[] {
  if (n < 2) return [];
  if (maxSize <= 2) return Array.from({ length: Math.floor(n / 2) }, () => 2);
  if (n <= 4) return [n];
  let fours = Math.floor(n / 4);
  const rem = n % 4;
  if (rem === 0) return Array.from({ length: fours }, () => 4);
  if (rem === 3) return [...Array.from({ length: fours }, () => 4), 3];
  if (rem === 2) {
    if (fours >= 1) {
      fours -= 1;
      return [...Array.from({ length: fours }, () => 4), 3, 3];
    }
    return [2];
  }
  if (fours >= 2) {
    fours -= 2;
    return [...Array.from({ length: fours }, () => 4), 3, 3, 3];
  }
  return [3, 2];
}

/** ordre de la salve : classement (égalités mélangées) ou tirage au sort */
export function orderPlayers(state: TournamentState, ids: string[], mode: WaveGrouping, rng: () => number): string[] {
  if (mode === 'random') return shuffle(ids, rng);
  const rank = new Map(state.standings.map((s) => [s.playerId, s.rank]));
  const seq = new Map(Object.entries(state.roster).map(([id, r]) => [id, r.seq]));
  const band = (id: string): string => {
    const s = state.standings.find((r) => r.playerId === id);
    return s ? `${s.points}:${s.wins}` : 'z';
  };
  const sorted = [...ids].sort(
    (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || (seq.get(a) ?? 0) - (seq.get(b) ?? 0),
  );
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const key = band(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && band(sorted[j]) === key) j += 1;
    out.push(...shuffle(sorted.slice(i, j), rng));
    i = j;
  }
  return out;
}

function chunk(order: string[], sizes: number[]): string[][] {
  const groups: string[][] = [];
  let i = 0;
  for (const size of sizes) {
    groups.push(order.slice(i, i + size));
    i += size;
  }
  return groups;
}

/** points de poule. Le barème MK ne dépend pas de la taille du groupe. */
export function pointsForPlaces(places: string[], cfg: TournamentConfig): Record<string, number> {
  const out: Record<string, number> = {};
  if (cfg.game === 'smash') {
    places.forEach((id, i) => {
      out[id] = i === 0 ? cfg.poolWinPoints : 0;
    });
    return out;
  }
  places.forEach((id, i) => {
    out[id] = cfg.placementPoints[i] ?? 0;
  });
  return out;
}

function makeGroup(waveNumber: number, board: number, playerIds: string[], counts: boolean, prefix: string): WaveGroup {
  return {
    id: `${prefix}${waveNumber}g${board}`,
    wave: waveNumber,
    board,
    playerIds,
    status: 'queued',
    places: null,
    points: {},
    counts,
    scoredAt: null,
  };
}

/** les `parallel` premiers groupes ouverts jouent, le reste attend */
export function armQueue(wave: WaveRound): void {
  const parallel = Math.max(1, wave.parallel);
  let playing = wave.groups.filter((g) => !g.places && g.status === 'playing').length;
  for (const g of wave.groups) {
    if (g.places) {
      g.status = 'done';
      continue;
    }
    if (g.status === 'playing') continue;
    if (playing < parallel) {
      g.status = 'playing';
      playing += 1;
    } else {
      g.status = 'queued';
    }
  }
}

function openWave(state: TournamentState): WaveRound | null {
  if (state.phase !== 'wave' && state.phase !== 'barrage') return null;
  const wave = state.waves[state.waves.length - 1];
  if (!wave || wave.finishedAt) return null;
  return wave;
}

function assertPlaces(playerIds: string[], places: string[]): void {
  if (places.length !== playerIds.length || new Set(places).size !== places.length) {
    throw httpErr('error_tournament_bad_result', 400);
  }
  const a = [...places].sort();
  const b = [...playerIds].sort();
  if (a.some((id, i) => id !== b[i])) throw httpErr('error_tournament_bad_result', 400);
}

function buildWave(
  state: TournamentState,
  ctx: WaveCtx,
  kind: WaveKind,
  number: number,
  ids: string[],
  grouping: WaveGrouping,
  counts: boolean,
): WaveRound {
  const order = orderPlayers(state, ids, grouping, ctx.rng);
  const sizes = partitionSizes(order.length, ctx.cfg.groupSize);
  const used = sizes.reduce((sum, n) => sum + n, 0);
  const prefix = kind === 'barrage' ? 'b' : 'w';
  const groups = chunk(order, sizes).map((playerIds, i) => makeGroup(number, i + 1, playerIds, counts, prefix));
  const wave: WaveRound = {
    number,
    kind,
    startedAt: iso(ctx),
    finishedAt: null,
    grouping,
    parallel: ctx.cfg.parallelSlots,
    sitOuts: order.slice(used),
    groups,
  };
  armQueue(wave);
  return wave;
}

export function startPoolWave(state: TournamentState, ctx: WaveCtx, grouping?: WaveGrouping): WaveRound {
  if (ctx.cfg.format !== 'waves') throw httpErr('error_tournament_bad_config: pas un tournoi en salves', 400);
  if (state.phase !== 'registration' && state.phase !== 'wave_done') {
    throw httpErr('error_tournament_round_in_progress', 409);
  }
  if (state.bracket) throw httpErr('error_tournament_round_in_progress', 409);
  const ids = activeIds(state);
  if (ids.length < 2) throw httpErr('error_tournament_not_enough_players', 409);
  const mode = grouping === 'random' || grouping === 'swiss' ? grouping : ctx.cfg.grouping;
  const number = state.waves.filter((w) => w.kind === 'pool').length + 1;
  const wave = buildWave(state, ctx, 'pool', number, ids, mode, true);
  state.waves.push(wave);
  state.phase = 'wave';
  state.waitingForPlayers = false;
  state.pin = null;
  const file = wave.groups.filter((g) => g.status === 'queued').length;
  pushFeed(
    state,
    ctx,
    file > 0 ? `Salve ${number} : ${wave.groups.length} groupes, ${file} en file` : `Salve ${number} : ${wave.groups.length} groupes`,
  );
  return wave;
}

export function scoreGroup(state: TournamentState, ctx: WaveCtx, groupId: string, places: string[]): void {
  const wave = openWave(state);
  if (!wave) throw httpErr('error_tournament_no_round', 409);
  const group = wave.groups.find((g) => g.id === groupId);
  if (!group) throw httpErr('error_tournament_unknown_match', 404);
  if (group.playerIds.length < 2) throw httpErr('error_tournament_bad_result', 400);
  assertPlaces(group.playerIds, places);
  group.places = [...places];
  group.scoredAt = iso(ctx);
  group.points = group.counts ? pointsForPlaces(places, ctx.cfg) : {};
  group.status = 'done';
  armQueue(wave);
  const names = places.map((id) => pseudo(state, id)).join(', ');
  if (wave.groups.every((g) => g.places)) {
    wave.finishedAt = iso(ctx);
    state.phase = 'wave_done';
    pushFeed(state, ctx, wave.kind === 'barrage' ? `Barrage terminé (${names})` : `Salve ${wave.number} terminée`);
  } else {
    pushFeed(state, ctx, `Résultat : ${names}`);
  }
}

/**
 * Recompose les groupes pas encore scorés (un départ en cours de salve).
 * Les groupes déjà saisis ne bougent pas. Les inscrits arrivés après le
 * tirage attendent la salve suivante : on ne pioche que dans la salve en cours.
 */
export function recomposeWave(state: TournamentState, ctx: WaveCtx, grouping?: WaveGrouping): void {
  const wave = openWave(state);
  if (!wave) throw httpErr('error_tournament_no_round', 409);
  const mode = grouping === 'random' || grouping === 'swiss' ? grouping : wave.grouping;
  const pool: string[] = [];
  for (const g of wave.groups) {
    if (g.places) continue;
    for (const id of g.playerIds) {
      if (state.roster[id]?.status === 'active') pool.push(id);
    }
  }
  for (const id of wave.sitOuts) {
    if (state.roster[id]?.status === 'active') pool.push(id);
  }
  const ids = [...new Set(pool)];
  if (ids.length < 2) throw httpErr('error_tournament_not_enough_players', 409);
  const order = orderPlayers(state, ids, mode, ctx.rng);
  const sizes = partitionSizes(order.length, ctx.cfg.groupSize);
  const used = sizes.reduce((sum, n) => sum + n, 0);
  const done = wave.groups.filter((g) => g.places);
  const prefix = wave.kind === 'barrage' ? 'b' : 'w';
  const fresh = chunk(order, sizes).map((playerIds, i) =>
    makeGroup(wave.number, done.length + i + 1, playerIds, wave.kind === 'pool', prefix),
  );
  wave.groups = [...done, ...fresh];
  wave.sitOuts = order.slice(used);
  wave.grouping = mode;
  armQueue(wave);
  pushFeed(state, ctx, 'Groupes recomposés');
}

/** un départ retire le joueur des groupes pas encore scorés. Le GM recompose ensuite. */
export function detachLeaver(state: TournamentState, playerId: string): void {
  const wave = openWave(state);
  if (!wave) return;
  wave.sitOuts = wave.sitOuts.filter((id) => id !== playerId);
  for (const g of wave.groups) {
    if (g.places) continue;
    g.playerIds = g.playerIds.filter((id) => id !== playerId);
  }
}

export function startBarrage(state: TournamentState, ctx: WaveCtx, rawGroups: string[][]): WaveRound {
  if (ctx.cfg.format !== 'waves') throw httpErr('error_tournament_bad_config: pas un tournoi en salves', 400);
  if (state.phase !== 'wave_done') throw httpErr('error_tournament_round_in_progress', 409);
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) throw httpErr('error_tournament_bad_result', 400);
  const seen = new Set<string>();
  const groups = rawGroups.map((ids) => {
    if (!Array.isArray(ids)) throw httpErr('error_tournament_bad_result', 400);
    const clean = [...new Set(ids.map((id) => String(id)))];
    if (ctx.cfg.game === 'smash' && clean.length !== 2) {
      throw httpErr('error_tournament_bad_result', 400);
    }
    if (ctx.cfg.game === 'mariokart' && (clean.length < 2 || clean.length > ctx.cfg.groupSize)) {
      throw httpErr('error_tournament_bad_result', 400);
    }
    for (const id of clean) {
      if (seen.has(id)) throw httpErr('error_tournament_player_busy', 409);
      seen.add(id);
      if (state.roster[id]?.status !== 'active') throw httpErr('error_unknown_player', 404);
    }
    return clean;
  });
  const number = state.waves.filter((w) => w.kind === 'barrage').length + 1;
  const wave: WaveRound = {
    number,
    kind: 'barrage',
    startedAt: iso(ctx),
    finishedAt: null,
    grouping: 'swiss',
    parallel: ctx.cfg.parallelSlots,
    sitOuts: [],
    groups: groups.map((playerIds, i) => makeGroup(number, i + 1, playerIds, false, 'b')),
  };
  armQueue(wave);
  state.waves.push(wave);
  state.phase = 'barrage';
  state.pin = null;
  pushFeed(state, ctx, `Barrage : ${wave.groups.length} match${wave.groups.length > 1 ? 's' : ''}`);
  return wave;
}

/** combien entrent dans le tableau : 8, sinon 4, sinon 2 (Smash seul) */
export function qualifyCount(game: TournamentConfig['game'], n: number): number {
  if (n >= 8) return 8;
  if (n >= 4) return 4;
  if (game === 'smash' && n >= 2) return 2;
  return 0;
}

/**
 * Le dernier barrage terminé réordonne ses joueurs entre eux (le 1er du
 * match passe devant le 2e) sans changer la place du reste du classement.
 */
export function seededOrder(state: TournamentState): string[] {
  const fromStandings = state.standings.filter((s) => s.status === 'active').map((s) => s.playerId);
  let order = fromStandings.length > 0 ? fromStandings : activeIds(state);
  const last = [...state.waves].reverse().find((w) => w.kind === 'barrage' && w.finishedAt);
  if (!last) return order;
  const place = new Map<string, number>();
  for (const g of last.groups) {
    (g.places ?? []).forEach((id, i) => place.set(id, i));
  }
  if (place.size === 0) return order;
  const slots = order.filter((id) => place.has(id));
  const resorted = [...slots].sort(
    (a, b) => (place.get(a) ?? 9) - (place.get(b) ?? 9) || order.indexOf(a) - order.indexOf(b),
  );
  let k = 0;
  order = order.map((id) => {
    if (!place.has(id)) return id;
    const next = resorted[k];
    k += 1;
    return next;
  });
  return order;
}

function matchShell(id: string, round: BracketRound, board: number, label: string, playerIds: string[]): BracketMatch {
  return {
    id,
    round,
    board,
    label,
    playerIds,
    status: playerIds.length >= 2 ? 'pending' : 'waiting',
    places: null,
    loserGames: null,
    scoredAt: null,
  };
}

/** premier tour de tableau. `seeds` est déjà limité et, si besoin, mélangé. */
export function planBracket(game: TournamentConfig['game'], seeds: string[], seeding: BracketSeeding): BracketMatch[] {
  const n = seeds.length;
  if (game === 'mariokart') {
    if (n >= 8) {
      const semiA = seeding === 'random' ? seeds.slice(0, 4) : [seeds[0], seeds[2], seeds[5], seeds[7]];
      const semiB = seeding === 'random' ? seeds.slice(4, 8) : [seeds[1], seeds[3], seeds[4], seeds[6]];
      return [
        matchShell('bk-s1', 'semi', 1, 'Demi-finale A', semiA),
        matchShell('bk-s2', 'semi', 2, 'Demi-finale B', semiB),
        matchShell('bk-f', 'final', 1, 'Finale', []),
      ];
    }
    return [matchShell('bk-f', 'final', 1, 'Finale', seeds.slice(0, 4))];
  }
  if (n >= 8) {
    const pairs: Array<[number, number]> =
      seeding === 'random'
        ? [
            [0, 1],
            [2, 3],
            [4, 5],
            [6, 7],
          ]
        : [
            [0, 7],
            [1, 6],
            [2, 5],
            [3, 4],
          ];
    const labels = seeding === 'random' ? ['Quart 1', 'Quart 2', 'Quart 3', 'Quart 4'] : ['1er contre 8e', '2e contre 7e', '3e contre 6e', '4e contre 5e'];
    return [
      ...pairs.map((pair, i) => matchShell(`bk-q${i + 1}`, 'qf', i + 1, labels[i], [seeds[pair[0]], seeds[pair[1]]])),
      matchShell('bk-sf1', 'sf', 1, 'Demi-finale', []),
      matchShell('bk-sf2', 'sf', 2, 'Demi-finale', []),
      matchShell('bk-f', 'final', 1, 'Finale', []),
    ];
  }
  if (n >= 4) {
    const a = seeding === 'random' ? [seeds[0], seeds[1]] : [seeds[0], seeds[3]];
    const b = seeding === 'random' ? [seeds[2], seeds[3]] : [seeds[1], seeds[2]];
    return [
      matchShell('bk-sf1', 'sf', 1, 'Demi-finale', a),
      matchShell('bk-sf2', 'sf', 2, 'Demi-finale', b),
      matchShell('bk-f', 'final', 1, 'Finale', []),
    ];
  }
  return [matchShell('bk-f', 'final', 1, 'Finale', seeds.slice(0, 2))];
}

export function startBracket(state: TournamentState, ctx: WaveCtx, seeding: BracketSeeding): BracketState {
  if (ctx.cfg.format !== 'waves') throw httpErr('error_tournament_bad_config: pas un tournoi en salves', 400);
  if (state.phase !== 'wave_done') throw httpErr('error_tournament_round_in_progress', 409);
  if (state.bracket) throw httpErr('error_tournament_round_in_progress', 409);
  const ordered = seededOrder(state);
  const n = qualifyCount(ctx.cfg.game, ordered.length);
  if (n < 2) throw httpErr('error_tournament_not_enough_players', 409);
  let seeds = ordered.slice(0, n);
  if (seeding === 'random') seeds = shuffle(seeds, ctx.rng);
  const bracket: BracketState = {
    seeding,
    startedAt: iso(ctx),
    seeds,
    matches: planBracket(ctx.cfg.game, seeds, seeding),
  };
  state.bracket = bracket;
  state.phase = 'bracket';
  state.pin = null;
  pushFeed(state, ctx, seeding === 'random' ? 'Phase finale : tirage au sort' : 'Phase finale : têtes de série');
  return bracket;
}

function winnerOf(matches: BracketMatch[], round: BracketRound, board: number): string | null {
  return matches.find((m) => m.round === round && m.board === board)?.places?.[0] ?? null;
}

function advanceBracket(bracket: BracketState): void {
  const { matches } = bracket;
  const qf = matches.filter((m) => m.round === 'qf');
  if (qf.length > 0 && qf.every((m) => m.places)) {
    const sf1 = matches.find((m) => m.round === 'sf' && m.board === 1);
    const sf2 = matches.find((m) => m.round === 'sf' && m.board === 2);
    const w = (board: number) => winnerOf(matches, 'qf', board);
    if (sf1 && sf1.status === 'waiting' && w(1) && w(4)) {
      sf1.playerIds = [w(1) as string, w(4) as string];
      sf1.status = 'pending';
    }
    if (sf2 && sf2.status === 'waiting' && w(2) && w(3)) {
      sf2.playerIds = [w(2) as string, w(3) as string];
      sf2.status = 'pending';
    }
  }
  const final = matches.find((m) => m.round === 'final');
  if (!final || final.status !== 'waiting') return;
  const sf = matches.filter((m) => m.round === 'sf');
  if (sf.length === 2 && sf.every((m) => m.places)) {
    const a = winnerOf(matches, 'sf', 1);
    const b = winnerOf(matches, 'sf', 2);
    if (a && b) {
      final.playerIds = [a, b];
      final.status = 'pending';
    }
    return;
  }
  const semis = matches.filter((m) => m.round === 'semi');
  if (semis.length === 2 && semis.every((m) => m.places && m.places.length >= 2)) {
    const a = semis.find((m) => m.board === 1)?.places;
    const b = semis.find((m) => m.board === 2)?.places;
    if (a && b) {
      final.playerIds = [a[0], b[0], a[1], b[1]];
      final.status = 'pending';
    }
  }
}

/** true si le tableau vient de désigner son vainqueur (phase finale des écrans) */
export function scoreBracket(
  state: TournamentState,
  ctx: WaveCtx,
  matchId: string,
  places: string[],
  loserGames: number | null,
): boolean {
  if (state.phase !== 'bracket' || !state.bracket) throw httpErr('error_tournament_no_round', 409);
  const match = state.bracket.matches.find((m) => m.id === matchId);
  if (!match || match.status === 'waiting' || match.playerIds.length < 2) {
    throw httpErr('error_tournament_unknown_match', 404);
  }
  assertPlaces(match.playerIds, places);
  if (ctx.cfg.game === 'smash') {
    if (loserGames !== 0 && loserGames !== 1 && loserGames !== 2) throw httpErr('error_tournament_bad_result', 400);
    match.loserGames = loserGames;
  } else {
    match.loserGames = null;
  }
  match.places = [...places];
  match.status = 'done';
  match.scoredAt = iso(ctx);
  advanceBracket(state.bracket);
  const final = state.bracket.matches.find((m) => m.round === 'final');
  if (final?.places) {
    state.bracketWinnerId = final.places[0] ?? null;
    state.phase = 'final';
    state.finishedAt = iso(ctx);
    state.pin = null;
    pushFeed(state, ctx, `${pseudo(state, final.places[0])} remporte le tournoi !`);
    return true;
  }
  pushFeed(state, ctx, `${pseudo(state, places[0])} passe au tour suivant`);
  return false;
}

/** barème modifié en cours de poules : on recalcule les groupes déjà saisis */
export function recomputePoolPoints(state: TournamentState, cfg: TournamentConfig): void {
  for (const wave of state.waves ?? []) {
    if (wave.kind !== 'pool') continue;
    for (const g of wave.groups) {
      if (!g.counts || !g.places) continue;
      g.points = pointsForPlaces(g.places, cfg);
    }
  }
}

export function computeWaveStandings(state: TournamentState): StandingRow[] {
  const rows = new Map<string, StandingRow>();
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
    });
  }
  for (const wave of state.waves ?? []) {
    for (const g of wave.groups) {
      if (!g.counts || !g.places) continue;
      g.places.forEach((id, index) => {
        const row = rows.get(id);
        if (!row) return;
        row.points += g.points[id] ?? 0;
        row.played += 1;
        if (index === 0) row.wins += 1;
        else row.losses += 1;
      });
    }
  }
  for (const [id, list] of Object.entries(state.adjustments)) {
    const row = rows.get(id);
    if (!row) continue;
    const sum = list.reduce((s, x) => s + x.delta, 0);
    row.adjustment = sum;
    row.points += sum;
  }
  const seqOf = (id: string): number => state.roster[id]?.seq ?? 0;
  const excluded = (s: StandingRow): number => (s.status === 'excluded' ? 1 : 0);
  const list = [...rows.values()].sort((x, y) => {
    if (excluded(x) !== excluded(y)) return excluded(x) - excluded(y);
    if (y.points !== x.points) return y.points - x.points;
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (x.losses !== y.losses) return x.losses - y.losses;
    return seqOf(x.playerId) - seqOf(y.playerId);
  });
  list.forEach((r, i) => {
    const prev = list[i - 1];
    const same =
      prev !== undefined &&
      excluded(prev) === excluded(r) &&
      prev.points === r.points &&
      prev.wins === r.wins &&
      prev.losses === r.losses;
    if (same) {
      r.rank = prev.rank;
      r.tied = true;
    } else {
      r.rank = i + 1;
      r.tied = false;
    }
  });
  return list;
}
