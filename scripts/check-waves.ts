/**
 * Vérification des salves Mario Kart / Smash, SANS base de données.
 * Branché dans `npm run lint`, à côté de check-tournament.ts (échecs).
 *
 *   npx tsx scripts/check-waves.ts
 */

import * as core from '../backend/src/games/tournament/core.js';
import { normalizeTournamentConfig } from '../backend/src/games/tournament/registry.js';
import {
  computeWaveStandings,
  partitionSizes,
  planBracket,
  pointsForPlaces,
  qualifyCount,
  scoreBracket,
  recomposeWave,
  scoreGroup,
  startBracket,
  startPoolWave,
} from '../backend/src/games/tournament/waves.js';
import {
  DEFAULT_TOURNAMENT_CONFIG,
  type TournamentConfig,
  type TournamentState,
} from '../backend/src/games/tournament/types.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function check(cond: boolean, message: string): void {
  if (!cond) {
    failures += 1;
    console.error('ECHEC', message);
  }
}

function sizesOk(n: number, max: number): void {
  const sizes = partitionSizes(n, max);
  const sum = sizes.reduce((s, x) => s + x, 0);
  if (max <= 2) {
    check(sum === n - (n % 2), `smash ${n} : tout le monde en paire sauf l'impair`);
    check(sizes.every((s) => s === 2), `smash ${n} : que des paires`);
    return;
  }
  if (n < 2) {
    check(sizes.length === 0, `mk ${n} : pas de groupe`);
    return;
  }
  check(sum === n, `mk ${n} : ${sizes.join('+')} ne fait pas ${n}`);
  check(sizes.every((s) => s >= 2 && s <= 4), `mk ${n} : taille illégale ${sizes.join('+')}`);
  check(!sizes.includes(1), `mk ${n} : un joueur seul`);
  check(sizes.filter((s) => s === 2).length <= 1, `mk ${n} : plus d'un groupe de 2`);
  if (n % 4 === 2 && n > 2) check(!sizes.includes(2), `mk ${n} : un 2 alors que des 3 suffisent`);
  if (n % 4 === 1 && n > 5) check(!sizes.includes(2), `mk ${n} : un 2 alors que des 3 suffisent`);
  if (n === 5) check(sizes.filter((s) => s === 2).length === 1 && sizes.includes(3), 'mk 5 : 3+2');
}

for (let n = 0; n <= 24; n += 1) {
  sizesOk(n, 4);
  sizesOk(n, 2);
}

const mk = normalizeTournamentConfig({
  title: 'Tournoi Mario Kart',
  game: 'mariokart',
  format: 'waves',
  plannedRounds: 3,
  placementPoints: [4, 3, 2, 1],
  parallelSlots: 2,
  grouping: 'swiss',
  lateJoin: true,
});
const sb = normalizeTournamentConfig({
  title: 'Tournoi Smash Bros',
  game: 'smash',
  format: 'waves',
  plannedRounds: 3,
  poolWinPoints: 1,
  parallelSlots: 2,
});
check(mk.format === 'waves' && mk.groupSize === 4 && mk.parallelSlots === 2, 'preset MK');
check(sb.format === 'waves' && sb.groupSize === 2 && sb.poolWinPoints === 1, 'preset SB');
check(normalizeTournamentConfig({}).format === 'swiss' && normalizeTournamentConfig({}).game === 'chess', 'défaut échecs inchangé');

let threw = false;
try {
  normalizeTournamentConfig({ game: 'chess', format: 'waves' });
} catch {
  threw = true;
}
check(threw, 'échecs + salves refusé');

function ctx(cfg: TournamentConfig, now = 1_000) {
  return { cfg, now, rng: mulberry32(7) };
}

function withPlayers(cfg: TournamentConfig, n: number): TournamentState {
  const state = core.createInitialState(1_000);
  const c = ctx(cfg);
  for (let i = 0; i < n; i += 1) {
    core.addPlayer(state, { ...c, now: 1_000 + i }, {
      playerId: `p${i + 1}`,
      pseudo: `J${i + 1}`,
      key: `j${i + 1}`,
      device: 'mobile',
    });
  }
  return state;
}

// 10 joueurs MK : 4+3+3, 2 groupes en jeu, le reste en file. Pas d'exempt.
{
  const state = withPlayers(mk, 10);
  const c = ctx(mk, 5_000);
  startPoolWave(state, c);
  core.commit(state, c);
  const wave = state.waves[0];
  check(state.phase === 'wave', 'phase salve');
  check(wave.groups.length === 3, `10 joueurs : 3 groupes, pas ${wave.groups.length}`);
  check(wave.sitOuts.length === 0, 'MK : personne assis');
  check(wave.groups.filter((g) => g.status === 'playing').length === 2, '2 matchs en même temps');
  check(wave.groups.filter((g) => g.status === 'queued').length === 1, 'un groupe en file');
  const playing = wave.groups.find((g) => g.status === 'playing');
  if (playing) {
    const places = [...playing.playerIds];
    scoreGroup(state, c, playing.id, places);
    core.commit(state, c);
    check(wave.groups.filter((g) => g.status === 'playing').length === 2, 'la file avance');
    const pts = pointsForPlaces(places, mk);
    check(pts[places[0]] === 4 && pts[places[1]] === 3, 'barème 4/3 quelle que soit la taille');
    const row = computeWaveStandings(state).find((s) => s.playerId === places[0]);
    check(row?.points === 4 && row.wins === 1, 'classement de poule');
  }
}

// groupe de 2 : toujours 4 et 3, pas un barème ramené à 2 et 1
{
  const pts = pointsForPlaces(['a', 'b'], mk);
  check(pts.a === 4 && pts.b === 3, 'groupe de 2 : 4 et 3');
  const pts3 = pointsForPlaces(['a', 'b', 'c'], mk);
  check(pts3.a === 4 && pts3.b === 3 && pts3.c === 2, 'groupe de 3 : 4, 3 et 2');
}

// Smash impair : un joueur ne joue pas. Victoire = 1 point.
{
  const state = withPlayers(sb, 5);
  const c = ctx(sb, 8_000);
  startPoolWave(state, c);
  core.commit(state, c);
  const wave = state.waves[0];
  check(wave.groups.length === 2 && wave.sitOuts.length === 1, 'smash 5 : 2 matchs et 1 assis');
  const g = wave.groups[0];
  scoreGroup(state, c, g.id, g.playerIds);
  core.commit(state, c);
  const winner = computeWaveStandings(state).find((s) => s.playerId === g.playerIds[0]);
  check(winner?.points === 1 && winner.wins === 1, 'poule smash : 1 point par match gagné');
}

// départ puis recomposition : le partant sort, un groupe déjà scoré ne bouge pas
{
  const state = withPlayers(mk, 8);
  const c = ctx(mk, 9_000);
  startPoolWave(state, c);
  const scored = state.waves[0].groups[0];
  scoreGroup(state, c, scored.id, [...scored.playerIds]);
  const leaver = state.waves[0].groups.find((g) => !g.places)?.playerIds[0];
  if (leaver) core.leavePlayer(state, c, leaver, 'self');
  recomposeWave(state, c, 'random');
  core.commit(state, c);
  const wave = state.waves[0];
  check(wave.groups.some((g) => g.id === scored.id && g.places !== null), 'un groupe scoré ne bouge pas');
  check(wave.groups.filter((g) => !g.places).every((g) => g.playerIds.length >= 2), 'recomposition : plus de groupe vide');
  check(!wave.groups.some((g) => g.playerIds.includes(leaver ?? '')), 'le partant n\'est pas remis');
}

// tableau MK : têtes de série 1,3,6,8 / 2,4,5,7 puis finale à 4
{
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const matches = planBracket('mariokart', seeds, 'seeded');
  const a = matches.find((m) => m.id === 'bk-s1');
  const b = matches.find((m) => m.id === 'bk-s2');
  check(a?.playerIds.join() === 's1,s3,s6,s8', `demie A ${a?.playerIds.join()}`);
  check(b?.playerIds.join() === 's2,s4,s5,s7', `demie B ${b?.playerIds.join()}`);
  const state = withPlayers(mk, 8);
  const c = ctx(mk, 20_000);
  startPoolWave(state, c);
  for (const g of [...state.waves[0].groups]) {
    if (!g.places) scoreGroup(state, c, g.id, [...g.playerIds]);
  }
  core.commit(state, c);
  check(state.phase === 'wave_done', 'salve terminée');
  startBracket(state, c, 'seeded');
  const semi = state.bracket?.matches.find((m) => m.round === 'semi');
  if (semi) {
    scoreBracket(state, c, 'bk-s1', [...(state.bracket?.matches.find((m) => m.id === 'bk-s1')?.playerIds ?? [])], null);
    scoreBracket(state, c, 'bk-s2', [...(state.bracket?.matches.find((m) => m.id === 'bk-s2')?.playerIds ?? [])], null);
  }
  const final = state.bracket?.matches.find((m) => m.round === 'final');
  check(final?.status === 'pending' && final.playerIds.length === 4, 'finale MK à 4');
  const s1 = state.bracket?.matches.find((m) => m.id === 'bk-s1')?.places ?? [];
  const s2 = state.bracket?.matches.find((m) => m.id === 'bk-s2')?.places ?? [];
  check(final?.playerIds.join() === [s1[0], s2[0], s1[1], s2[1]].join(), 'les 2 premiers de chaque demie');
  const done = scoreBracket(state, c, 'bk-f', [...(final?.playerIds ?? [])], null);
  check(done && state.phase === 'final' && state.bracketWinnerId === final?.playerIds[0], 'vainqueur du tableau');
  // les points de poule n'ont pas bougé avec le tableau
  const before = computeWaveStandings(state).map((s) => s.points);
  check(before.every((p) => p === 4 || p === 3 || p === 2 || p === 1 || p === 0), 'le tableau ne rajoute pas de points');
}

// Smash : quarts 1v8, 2v7, 3v6, 4v5 puis demies croisées. Score 3-0 / 3-1 / 3-2.
{
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const matches = planBracket('smash', seeds, 'seeded');
  const q = (i: number) => matches.find((m) => m.id === `bk-q${i}`)?.playerIds.join();
  check(q(1) === 'a,h' && q(2) === 'b,g' && q(3) === 'c,f' && q(4) === 'd,e', `quarts ${[1, 2, 3, 4].map(q).join(' | ')}`);
  check(qualifyCount('smash', 5) === 4, '5 smash : tableau à 4');
  check(qualifyCount('mariokart', 5) === 4, '5 mk : finale à 4');
  check(qualifyCount('mariokart', 3) === 0, '3 mk : pas de tableau');
  const state = withPlayers(sb, 8);
  const c = ctx(sb, 30_000);
  startPoolWave(state, c);
  for (const g of [...state.waves[0].groups]) scoreGroup(state, c, g.id, [...g.playerIds]);
  core.commit(state, c);
  startBracket(state, c, 'seeded');
  let bad = false;
  try {
    scoreBracket(state, c, 'bk-q1', state.bracket?.matches[0].playerIds ?? [], 4);
  } catch {
    bad = true;
  }
  check(bad, 'score smash hors 0, 1 ou 2 refusé');
  for (const id of ['bk-q1', 'bk-q2', 'bk-q3', 'bk-q4']) {
    const m = state.bracket?.matches.find((x) => x.id === id);
    scoreBracket(state, c, id, [...(m?.playerIds ?? [])], 1);
  }
  const sf1 = state.bracket?.matches.find((m) => m.id === 'bk-sf1');
  const q1 = state.bracket?.matches.find((m) => m.id === 'bk-q1')?.places?.[0];
  const q4 = state.bracket?.matches.find((m) => m.id === 'bk-q4')?.places?.[0];
  check(sf1?.playerIds.join() === `${q1},${q4}`, 'demie : vainqueur 1v8 contre vainqueur 4v5');
  check(state.bracket?.matches.find((m) => m.id === 'bk-q1')?.loserGames === 1, '3-1 enregistré');
}

// un échecs par défaut ne gagne pas de salves vides qui casseraient le classement suisse
{
  const chess = { ...DEFAULT_TOURNAMENT_CONFIG };
  const state = withPlayers(chess, 4);
  check(state.waves.length === 0 && state.bracket === null, 'échecs : pas de salve');
  check(state.standings.length === 4 && state.standings.every((s) => s.points === 0), 'classement échecs vide');
}

if (failures > 0) {
  console.error(`${failures} échec(s)`);
  process.exit(1);
}
console.log('salves OK');
