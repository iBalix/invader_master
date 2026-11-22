/**
 * Vérification des salves Mario Kart / Smash, SANS base de données.
 * Branché dans `npm run lint`, à côté de check-tournament.ts (échecs).
 *
 *   npx tsx scripts/check-waves.ts
 */

import * as core from '../backend/src/games/tournament/core.js';
import { normalizeTournamentConfig, patchTournamentConfig } from '../backend/src/games/tournament/registry.js';
import {
  computeWaveStandings,
  partitionSizes,
  planBracket,
  pointsForPlaces,
  qualifyCount,
  claimsConflict,
  recomputePoolPoints,
  scoreBracket,
  recomposeWave,
  scoreGroup,
  seededOrder,
  startBarrage,
  startBracket,
  startPoolWave,
  submitBracketClaim,
  submitGroupClaim,
} from '../backend/src/games/tournament/waves.js';
import {
  DEFAULT_TOURNAMENT_CONFIG,
  poolMaxOf,
  tournamentStateOf,
  type TournamentConfig,
  type TournamentState,
  type WaveGroup,
} from '../backend/src/games/tournament/types.js';
import type { SessionRow } from '../backend/src/games/types.js';

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

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    check(false, `${code} aurait dû échouer`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(msg.startsWith(code), `${code} attendu, reçu ${msg}`);
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

// ---------------------------------------------------------------------------
// Réglages : 30 points max en MK, 3 en Smash
// ---------------------------------------------------------------------------

const mk = normalizeTournamentConfig({
  title: 'Tournoi Mario Kart',
  game: 'mariokart',
  format: 'waves',
  plannedRounds: 3,
  parallelSlots: 2,
  grouping: 'swiss',
  lateJoin: true,
});
const sb = normalizeTournamentConfig({
  title: 'Tournoi Smash Bros',
  game: 'smash',
  format: 'waves',
  plannedRounds: 3,
  parallelSlots: 2,
});
check(mk.format === 'waves' && mk.groupSize === 4 && mk.parallelSlots === 2, 'preset MK');
check(sb.format === 'waves' && sb.groupSize === 2, 'preset SB');
check(mk.poolMaxPoints === 30, `MK : 30 points max par salve, pas ${mk.poolMaxPoints}`);
check(sb.poolMaxPoints === 3, `Smash : 3 points max par match, pas ${sb.poolMaxPoints}`);
check(normalizeTournamentConfig({ game: 'smash' }, mk).poolMaxPoints === 3, 'changer de jeu remet le maximum du jeu');
check(patchTournamentConfig(mk, { poolMaxPoints: 40 }).poolMaxPoints === 40, 'maximum modifiable en cours de tournoi');
check(patchTournamentConfig(mk, { title: 'x' }).poolMaxPoints === 30, 'un autre réglage ne touche pas le maximum');
expectCode(() => normalizeTournamentConfig({ game: 'mariokart', poolMaxPoints: 0 }), 'error_tournament_bad_config');
expectCode(() => normalizeTournamentConfig({ game: 'mariokart', poolMaxPoints: 2.5 }), 'error_tournament_bad_config');
check(normalizeTournamentConfig({}).format === 'swiss' && normalizeTournamentConfig({}).game === 'chess', 'défaut échecs inchangé');
// tournoi lancé avant les points saisis : pas de poolMaxPoints dans sa config
{
  const legacyMk = { ...mk } as Partial<TournamentConfig>;
  delete legacyMk.poolMaxPoints;
  const legacySb = { ...sb } as Partial<TournamentConfig>;
  delete legacySb.poolMaxPoints;
  check(poolMaxOf(legacyMk as TournamentConfig) === 30 && poolMaxOf(legacySb as TournamentConfig) === 3, 'ancienne config : 30 / 3 par défaut');
  check(patchTournamentConfig(legacyMk as TournamentConfig, {}).poolMaxPoints === 30, 'ancienne config complétée au premier réglage');
}

expectCode(() => normalizeTournamentConfig({ game: 'chess', format: 'waves' }), 'error_tournament_bad_config');

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

/** points d'un groupe : le 1er a `top`, chacun des suivants `step` de moins */
function ladder(ids: string[], top: number, step: number): Record<string, number> {
  return Object.fromEntries(ids.map((id, i) => [id, Math.max(0, top - i * step)]));
}

function scoreAll(state: TournamentState, cfg: TournamentConfig, now: number): void {
  const c = ctx(cfg, now);
  for (const g of [...(state.waves[state.waves.length - 1]?.groups ?? [])]) {
    if (!g.places) scoreGroup(state, c, g.id, { scores: ladder(g.playerIds, cfg.poolMaxPoints, cfg.game === 'smash' ? 2 : 7) });
  }
  core.commit(state, c);
}

// ---------------------------------------------------------------------------
// Poules : chacun marque ses points, le classement en fait la somme
// ---------------------------------------------------------------------------

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
    const [a, b, d] = playing.playerIds;
    const rest = playing.playerIds.slice(3);
    // l'ordre saisi n'importe pas : les places se déduisent des points
    const scores: Record<string, number> = { [b]: 27, [a]: 12, [d]: 30, ...Object.fromEntries(rest.map((id) => [id, 5])) };
    scoreGroup(state, c, playing.id, { scores });
    core.commit(state, c);
    check(wave.groups.filter((g) => g.status === 'playing').length === 2, 'la file avance');
    check(playing.places?.[0] === d && playing.places?.[1] === b && playing.places?.[2] === a, 'places déduites des points');
    check(playing.points[d] === 30 && playing.points[a] === 12, 'les points saisis sont les points de poule');
    const top = computeWaveStandings(state).find((s) => s.playerId === d);
    check(top?.points === 30 && top.wins === 1 && top.rank === 1, 'classement : 30 points, une victoire, 1er');
    const second = computeWaveStandings(state).find((s) => s.playerId === b);
    check(second?.points === 27 && second.losses === 1, 'classement : 27 points');
  }
}

// saisies refusées : hors bornes, joueur en trop ou manquant, demi-point
{
  const state = withPlayers(mk, 8);
  const c = ctx(mk, 6_000);
  startPoolWave(state, c);
  const g = state.waves[0].groups[0];
  const ok = ladder(g.playerIds, 30, 5);
  expectCode(() => scoreGroup(state, c, g.id, { scores: { ...ok, [g.playerIds[0]]: 31 } }), 'error_tournament_bad_points');
  expectCode(() => scoreGroup(state, c, g.id, { scores: { ...ok, [g.playerIds[0]]: -1 } }), 'error_tournament_bad_points');
  expectCode(() => scoreGroup(state, c, g.id, { scores: { ...ok, [g.playerIds[0]]: 12.5 } }), 'error_tournament_bad_points');
  expectCode(() => scoreGroup(state, c, g.id, { scores: { ...ok, intrus: 3 } }), 'error_tournament_bad_result');
  const missing = { ...ok };
  delete missing[g.playerIds[1]];
  expectCode(() => scoreGroup(state, c, g.id, { scores: missing }), 'error_tournament_bad_result');
  expectCode(() => scoreGroup(state, c, g.id, { places: [...g.playerIds] }), 'error_tournament_bad_result');
  check(g.places === null, 'une saisie refusée ne pose rien');
  // nombres envoyés en texte par un formulaire : acceptés
  scoreGroup(state, c, g.id, { scores: Object.fromEntries(g.playerIds.map((id, i) => [id, String(20 - i)])) });
  check(g.scores?.[g.playerIds[0]] === 20, 'points en texte convertis');
}

// égalité en tête : personne ne gagne, nul pour les deux
{
  const state = withPlayers(mk, 4);
  const c = ctx(mk, 7_000);
  startPoolWave(state, c);
  const g = state.waves[0].groups[0];
  const [a, b, d, e] = g.playerIds;
  scoreGroup(state, c, g.id, { scores: { [a]: 25, [b]: 25, [d]: 10, [e]: 0 } });
  core.commit(state, c);
  const rows = computeWaveStandings(state);
  const ra = rows.find((s) => s.playerId === a);
  const rb = rows.find((s) => s.playerId === b);
  check(ra?.wins === 0 && ra.draws === 1 && rb?.draws === 1, 'égalité en tête : nul');
  check(ra?.rank === rb?.rank && ra?.rank === 1 && ra?.tied !== rb?.tied, 'même rang à égalité');
  check(rows.find((s) => s.playerId === e)?.points === 0, '0 point accepté');
}

// Smash impair : un joueur ne joue pas. Points de 0 à 3.
{
  const state = withPlayers(sb, 5);
  const c = ctx(sb, 8_000);
  startPoolWave(state, c);
  core.commit(state, c);
  const wave = state.waves[0];
  check(wave.groups.length === 2 && wave.sitOuts.length === 1, 'smash 5 : 2 matchs et 1 assis');
  const g = wave.groups[0];
  const [a, b] = g.playerIds;
  expectCode(() => scoreGroup(state, c, g.id, { scores: { [a]: 4, [b]: 0 } }), 'error_tournament_bad_points');
  scoreGroup(state, c, g.id, { scores: { [a]: 1, [b]: 3 } });
  core.commit(state, c);
  const rows = computeWaveStandings(state);
  check(rows.find((s) => s.playerId === b)?.points === 3 && rows.find((s) => s.playerId === b)?.wins === 1, 'smash : 3 points, victoire');
  check(rows.find((s) => s.playerId === a)?.points === 1, 'smash : le perdant garde ses points');
  check(g.places?.[0] === b, 'smash : le meilleur score passe devant');
}

// cumul sur plusieurs salves : la somme des points
{
  const state = withPlayers(mk, 8);
  startPoolWave(state, ctx(mk, 10_000));
  scoreAll(state, mk, 10_000);
  startPoolWave(state, ctx(mk, 11_000));
  scoreAll(state, mk, 12_000);
  const total = new Map<string, number>();
  for (const w of state.waves) {
    for (const g of w.groups) {
      for (const [id, pts] of Object.entries(g.scores ?? {})) total.set(id, (total.get(id) ?? 0) + pts);
    }
  }
  check(
    computeWaveStandings(state).every((s) => s.points === (total.get(s.playerId) ?? 0) && s.played === 2),
    'classement = somme des points des salves',
  );
}

// départ puis recomposition : le partant sort, un groupe déjà scoré ne bouge pas
{
  const state = withPlayers(mk, 8);
  const c = ctx(mk, 9_000);
  startPoolWave(state, c);
  const scored = state.waves[0].groups[0];
  scoreGroup(state, c, scored.id, { scores: ladder(scored.playerIds, 30, 6) });
  const leaver = state.waves[0].groups.find((g) => !g.places)?.playerIds[0];
  if (leaver) core.leavePlayer(state, c, leaver, 'self');
  recomposeWave(state, c, 'random');
  core.commit(state, c);
  const wave = state.waves[0];
  check(wave.groups.some((g) => g.id === scored.id && g.places !== null), 'un groupe scoré ne bouge pas');
  check(wave.groups.filter((g) => !g.places).every((g) => g.playerIds.length >= 2), 'recomposition : plus de groupe vide');
  check(wave.groups.filter((g) => !g.places).every((g) => g.scores === null), 'groupes recomposés sans points');
  check(!wave.groups.some((g) => g.playerIds.includes(leaver ?? '')), 'le partant n\'est pas remis');
}

// ---------------------------------------------------------------------------
// Barrage : toujours en places, ne compte pas au classement
// ---------------------------------------------------------------------------

{
  const state = withPlayers(mk, 8);
  startPoolWave(state, ctx(mk, 13_000));
  scoreAll(state, mk, 13_000);
  const c = ctx(mk, 14_000);
  const before = computeWaveStandings(state).map((s) => `${s.playerId}:${s.points}`).join();
  const order = seededOrder(state);
  const [x, y] = [order[2], order[3]];
  startBarrage(state, c, [[x, y]]);
  const g = state.waves[state.waves.length - 1].groups[0];
  expectCode(() => scoreGroup(state, c, g.id, { scores: { [x]: 30, [y]: 0 } }), 'error_tournament_bad_result');
  submitGroupClaim(state, c, y, g.id, { places: [y, x] });
  check(g.claims[0]?.scores === null && g.claims[0]?.places[0] === y, 'barrage : proposition en places');
  scoreGroup(state, c, g.id, { places: [y, x] });
  core.commit(state, c);
  check(g.scores === null && Object.keys(g.points).length === 0, 'barrage : pas de points');
  check(computeWaveStandings(state).map((s) => `${s.playerId}:${s.points}`).join() === before, 'barrage : classement inchangé');
  const after = seededOrder(state);
  check(after.indexOf(y) < after.indexOf(x), 'barrage : le vainqueur passe devant');
}

// ---------------------------------------------------------------------------
// Tableau : inchangé (places, vainqueur et 3-x en Smash)
// ---------------------------------------------------------------------------

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
  scoreAll(state, mk, 20_000);
  check(state.phase === 'wave_done', 'salve terminée');
  const before = computeWaveStandings(state).map((s) => s.points).join();
  startBracket(state, c, 'seeded');
  check(state.bracket?.seeds[0] === computeWaveStandings(state)[0].playerId, 'tête de série 1 = meilleur total');
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
  core.commit(state, c);
  check(computeWaveStandings(state).map((s) => s.points).join() === before, 'le tableau ne rajoute pas de points');
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
  scoreAll(state, sb, 30_000);
  startBracket(state, c, 'seeded');
  expectCode(() => scoreBracket(state, c, 'bk-q1', state.bracket?.matches[0].playerIds ?? [], 4), 'error_tournament_bad_result');
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

// ---------------------------------------------------------------------------
// Propositions des joueurs : rien ne compte avant la validation du GM
// ---------------------------------------------------------------------------

{
  const state = withPlayers(mk, 10);
  const c = ctx(mk, 40_000);
  startPoolWave(state, c);
  const playing = state.waves[0].groups.find((g) => g.status === 'playing');
  const queued = state.waves[0].groups.find((g) => g.status === 'queued');
  if (playing && queued) {
    const outsider = queued.playerIds[0];
    const mine = ladder(playing.playerIds, 30, 7);
    const before = computeWaveStandings(state).map((s) => s.points).join();
    expectCode(() => submitGroupClaim(state, c, outsider, playing.id, { scores: mine }), 'error_tournament_not_in_match');
    expectCode(
      () => submitGroupClaim(state, c, queued.playerIds[0], queued.id, { scores: ladder(queued.playerIds, 30, 7) }),
      'error_tournament_claim_closed',
    );
    expectCode(() => submitGroupClaim(state, c, playing.playerIds[0], playing.id, { places: [...playing.playerIds] }), 'error_tournament_bad_result');
    expectCode(
      () => submitGroupClaim(state, c, playing.playerIds[0], playing.id, { scores: { ...mine, [playing.playerIds[0]]: 99 } }),
      'error_tournament_bad_points',
    );
    submitGroupClaim(state, c, playing.playerIds[0], playing.id, { scores: mine });
    check(playing.claims[0]?.scores?.[playing.playerIds[0]] === 30, 'la proposition garde les points');
    check(playing.claims[0]?.places[0] === playing.playerIds[0], 'la proposition déduit les places');
    // même ordre, un point d'écart : c'est un désaccord
    const almost = { ...mine, [playing.playerIds[1]]: mine[playing.playerIds[1]] - 1 };
    submitGroupClaim(state, { ...c, now: 41_000 }, playing.playerIds[1], playing.id, { scores: almost });
    check(claimsConflict(playing.claims), 'points différents : à trancher');
    check(playing.places === null && playing.scores === null, 'une proposition ne pose pas le résultat');
    core.commit(state, c);
    check(computeWaveStandings(state).map((s) => s.points).join() === before, 'le classement n\'a pas bougé');
    submitGroupClaim(state, { ...c, now: 42_000 }, playing.playerIds[0], playing.id, { scores: almost });
    check(playing.claims.filter((cl) => cl.playerId === playing.playerIds[0]).length === 1, 'une proposition par joueur');
    check(!claimsConflict(playing.claims), 'mêmes points : plus de désaccord');
    check(playing.claims[playing.claims.length - 1].playerId === playing.playerIds[0], 'la dernière saisie remplace la précédente');
    state.roster[playing.playerIds[2]].status = 'left';
    expectCode(
      () => submitGroupClaim(state, c, playing.playerIds[2], playing.id, { scores: mine }),
      'error_tournament_not_in_match',
    );
  }
  const agree = withPlayers(mk, 8);
  const ca = ctx(mk, 50_000);
  startPoolWave(agree, ca);
  const g = agree.waves[0].groups[0];
  const pts = ladder(g.playerIds, 28, 6);
  submitGroupClaim(agree, ca, g.playerIds[0], g.id, { scores: pts });
  submitGroupClaim(agree, ca, g.playerIds[1], g.id, { scores: pts });
  check(!claimsConflict(g.claims) && g.claims.length === 2, 'deux saisies identiques : pas de conflit, à valider quand même');
  scoreGroup(agree, ca, g.id, { scores: g.claims[0].scores });
  check(g.claims.length === 0 && g.scores?.[g.playerIds[0]] === 28, 'la validation du GM pose les points et efface les propositions');
}

// Smash : poule en points, élimination 3-0 / 3-1 / 3-2, un autre match est refusé.
{
  const state = withPlayers(sb, 8);
  const c = ctx(sb, 60_000);
  startPoolWave(state, c);
  const g = state.waves[0].groups[0];
  submitGroupClaim(state, c, g.playerIds[0], g.id, { scores: { [g.playerIds[0]]: 3, [g.playerIds[1]]: 2 } });
  check(g.claims[0]?.loserGames === null && g.claims[0]?.scores?.[g.playerIds[1]] === 2, 'poule smash : des points, pas de 3-n');
  scoreAll(state, sb, 60_000);
  startBracket(state, c, 'seeded');
  const q = state.bracket?.matches[0];
  const stranger = state.bracket?.matches[1]?.playerIds[0];
  if (q && stranger) {
    expectCode(() => submitBracketClaim(state, c, stranger, q.id, [...q.playerIds], 0), 'error_tournament_not_in_match');
    expectCode(() => submitBracketClaim(state, c, q.playerIds[0], q.id, [...q.playerIds], 4), 'error_tournament_bad_result');
    submitBracketClaim(state, c, q.playerIds[0], q.id, [...q.playerIds], 2);
    check(q.places === null && q.claims[0]?.loserGames === 2 && q.claims[0]?.scores === null, '3-2 proposé, pas encore officiel');
    scoreBracket(state, c, q.id, [...q.playerIds], 0);
    check(q.claims.length === 0 && q.loserGames === 0 && q.places?.[0] === q.playerIds[0], 'le GM corrige le 3-2 en 3-0');
  }
}

{
  const chess = { ...DEFAULT_TOURNAMENT_CONFIG };
  const state = withPlayers(chess, 4);
  expectCode(() => submitGroupClaim(state, ctx(chess), 'p1', 'nope', { scores: { p1: 1, p2: 0 } }), 'error_tournament_bad_config');
}

// ---------------------------------------------------------------------------
// Tournoi en cours au déploiement : groupes saisis en places, sans `scores`
// ---------------------------------------------------------------------------

{
  const state = withPlayers(mk, 8);
  const c = ctx(mk, 70_000);
  startPoolWave(state, c);
  const old = state.waves[0].groups[0];
  // état tel qu'enregistré avant le passage aux points
  old.places = [...old.playerIds];
  old.points = pointsForPlaces(old.places, mk);
  old.status = 'done';
  delete (old as Partial<WaveGroup>).scores;
  delete (state.waves[0].groups[1] as Partial<WaveGroup>).scores;
  const session = { runtime: { tournament: state } } as unknown as SessionRow;
  const loaded = tournamentStateOf(session);
  check(loaded.waves[0].groups.every((g) => g.scores !== undefined), 'chargement : scores complété');
  core.commit(loaded, c);
  const first = computeWaveStandings(loaded).find((s) => s.playerId === old.playerIds[0]);
  check(first?.points === 4 && first.wins === 1, 'ancien groupe : barème 4/3/2/1 conservé');
  recomputePoolPoints(loaded, mk);
  check(old.points[old.playerIds[0]] === 4, 'ancien groupe : barème conservé au recalcul');
  // les groupes restants se saisissent en points
  const next = loaded.waves[0].groups[1];
  scoreGroup(loaded, c, next.id, { scores: ladder(next.playerIds, 30, 10) });
  core.commit(loaded, c);
  check(computeWaveStandings(loaded).find((s) => s.playerId === next.playerIds[0])?.points === 30, 'nouveau groupe : points saisis');
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
