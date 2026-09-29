/**
 * Vérification de la logique des rondes suisses, SANS base de données.
 *
 * La base locale est celle de production : la logique du tournoi est donc
 * isolée dans des fonctions pures (backend/src/games/tournament/core.ts et
 * swiss.ts), et ce script les fait tourner sur des milliers de tournois
 * aléatoires (graine fixe, rejouable). Branché dans `npm run lint`.
 *
 *   npx tsx scripts/check-tournament.ts          # vérification complète
 *   npx tsx scripts/check-tournament.ts --seed 7 # une autre graine
 */

import * as core from '../backend/src/games/tournament/core.js';
import { computeStandings, decideMatch, pairKey, pairingHistory, pseudoKey } from '../backend/src/games/tournament/swiss.js';
import {
  DEFAULT_TOURNAMENT_CONFIG,
  type TournamentConfig,
  type TournamentMatch,
  type TournamentState,
} from '../backend/src/games/tournament/types.js';

// ---------------------------------------------------------------------------
// Outillage
// ---------------------------------------------------------------------------

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

const seedArg = process.argv.indexOf('--seed');
const SEED = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20260929;
const rand = mulberry32(SEED);

let failures = 0;
let checks = 0;
function check(cond: boolean, message: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    if (failures <= 25) console.error(`  ECHEC : ${message}`);
  }
}

function cfgWith(patch: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    ...DEFAULT_TOURNAMENT_CONFIG,
    ...patch,
    match: { ...DEFAULT_TOURNAMENT_CONFIG.match, ...(patch.match ?? {}) },
    points: { ...DEFAULT_TOURNAMENT_CONFIG.points, ...(patch.points ?? {}) },
  };
}

let clock = Date.parse('2026-10-01T19:00:00Z');
function ctx(cfg: TournamentConfig): core.CoreCtx {
  clock += 60_000;
  return { cfg, now: clock, rng: rand };
}

function addPlayers(state: TournamentState, cfg: TournamentConfig, n: number, prefix = 'J'): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `${prefix}${state.rosterSeq + 1}`;
    core.addPlayer(state, ctx(cfg), { playerId: id, pseudo: id, key: pseudoKey(id), device: 'mobile' });
    ids.push(id);
  }
  return ids;
}

/** couplage parfait sans revanche possible ? (force brute, petits effectifs) */
function rematchFreeExists(players: string[], met: Map<string, Set<string>>): boolean {
  if (players.length === 0) return true;
  const [first, ...rest] = players;
  for (let j = 0; j < rest.length; j += 1) {
    if (met.get(first)?.has(rest[j])) continue;
    if (rematchFreeExists([...rest.slice(0, j), ...rest.slice(j + 1)], met)) return true;
  }
  return false;
}

function anyByeAllowsRematchFree(players: string[], met: Map<string, Set<string>>, byes: Map<string, number>): boolean {
  if (players.length % 2 === 0) return rematchFreeExists(players, met);
  const minByes = Math.min(...players.map((p) => byes.get(p) ?? 0));
  return players
    .filter((p) => (byes.get(p) ?? 0) === minByes)
    .some((b) => rematchFreeExists(players.filter((p) => p !== b), met));
}

function randomWinner(): 'a' | 'b' | null {
  const r = rand();
  return r < 0.42 ? 'a' : r < 0.84 ? 'b' : null;
}

/** joue une partie « auto » entre a (blancs ou noirs) et b */
function playAutoGame(state: TournamentState, cfg: TournamentConfig, m: TournamentMatch, refSeq: { n: number }): void {
  const round = core.currentRound(state);
  if (!round || !m.b) return;
  const aWhite = rand() < 0.5;
  const w = aWhite ? m.a : m.b;
  const bk = aWhite ? m.b : m.a;
  const winner = randomWinner();
  const winnerColor = winner === null ? null : (winner === 'a') === aWhite ? 'w' : 'b';
  refSeq.n += 1;
  core.recordExternalGame(state, ctx(cfg), {
    ref: `chess-${refSeq.n}`,
    whiteKey: state.roster[w].key,
    blackKey: state.roster[bk].key,
    winner: winnerColor,
    reason: winnerColor ? 'checkmate' : 'draw_agreed',
    createdAt: Date.parse(round.startedAt) + 1_000,
  });
}

// ---------------------------------------------------------------------------
// 1. Décisions de match et barèmes
// ---------------------------------------------------------------------------

function match(games: Array<'a' | 'b' | null>, kind: TournamentMatch['kind'] = 'normal'): TournamentMatch {
  return {
    id: 'x',
    round: 1,
    board: 1,
    a: 'A',
    b: 'B',
    kind,
    colorA: 'w',
    games: games.map((w) => ({ winner: w, source: 'gm' as const, ref: null, reason: null, colorA: null, at: '' })),
    live: null,
    status: 'pending',
    result: null,
    points: { a: 0, b: 0 },
    gmLocked: false,
    rematch: false,
    decidedAt: null,
  };
}

function checkDecisions(): void {
  const bo1 = cfgWith();
  check(decideMatch(match(['a']), bo1).result === 'a', 'BO1 gagné par a');
  check(decideMatch(match([null]), bo1).result === 'draw', 'BO1 nul');
  check(JSON.stringify(decideMatch(match(['b']), bo1).points) === '{"a":0,"b":2}', 'BO1 : 0 / 2 points');
  check(JSON.stringify(decideMatch(match([null]), bo1).points) === '{"a":1,"b":1}', 'nul : 1 / 1 point');

  const bo3 = cfgWith({ match: { games: 3, decide: 'best_of', scoring: 'match' } });
  check(!decideMatch(match(['a']), bo3).decided, 'BO3 pas décidé à 1-0');
  check(decideMatch(match(['a', 'a']), bo3).result === 'a', 'BO3 décidé à 2-0');
  check(!decideMatch(match(['a', 'b']), bo3).decided, 'BO3 pas décidé à 1-1');
  check(decideMatch(match(['a', null, null]), bo3).result === 'a', 'BO3 : 2-1 en demi-points après 3 parties');
  check(decideMatch(match([null, null, null]), bo3).result === 'draw', 'BO3 : trois nulles = match nul');
  check(!decideMatch(match([null, 'a']), bo3).decided, 'BO3 : 1,5-0,5 ne suffit pas (majorité > 1,5)');

  const all2 = cfgWith({ match: { games: 2, decide: 'all', scoring: 'match' } });
  check(!decideMatch(match(['a']), all2).decided, 'aller-retour pas décidé après 1 partie');
  check(decideMatch(match(['a', 'b']), all2).result === 'draw', 'aller-retour 1-1 = nul');
  check(decideMatch(match(['a', null]), all2).result === 'a', 'aller-retour 1,5-0,5');

  const perGame = cfgWith({ match: { games: 2, decide: 'all', scoring: 'game' } });
  check(JSON.stringify(decideMatch(match(['a', 'a']), perGame).points) === '{"a":4,"b":0}', 'barème par partie : 2 + 2');
  check(JSON.stringify(decideMatch(match(['a', null]), perGame).points) === '{"a":3,"b":1}', 'barème par partie : 2 + 1 / 0 + 1');

  check(JSON.stringify(decideMatch(match(['b'], 'floater'), bo1).points) === '{"a":0,"b":0}', 'partie bonus : rien pour b');
  check(JSON.stringify(decideMatch(match(['a'], 'floater'), bo1).points) === '{"a":2,"b":0}', 'partie bonus : a marque');

  check(pseudoKey('  Élodie  Martin ') === 'elodie martin', 'clé de pseudo : accents, casse, espaces');
}

// ---------------------------------------------------------------------------
// 2. Tournois aléatoires complets
// ---------------------------------------------------------------------------

function simulateTournament(n: number, cfg: TournamentConfig, withChurn: boolean): void {
  const state = core.createInitialState(clock);
  addPlayers(state, cfg, n);
  const refSeq = { n: 0 };
  const maxRounds = Math.min(7, Math.max(1, n - 1));

  for (let r = 1; r <= maxRounds; r += 1) {
    // arrivées et départs entre les rondes
    if (withChurn && r > 1) {
      if (rand() < 0.3) addPlayers(state, cfg, 1, 'L');
      const active = core.activeIds(state);
      if (rand() < 0.2 && active.length > 3) {
        core.leavePlayer(state, ctx(cfg), active[Math.floor(rand() * active.length)], 'self');
      }
    }
    const eligible = core.activeIds(state);
    if (eligible.length < 2) break;
    const before = pairingHistory(state);
    const round = core.startRound(state, ctx(cfg));

    // a. chacun au plus une fois, l'exempt hors des matchs
    const seen = new Map<string, number>();
    for (const m of round.matches) {
      if (m.kind === 'bye') continue;
      for (const p of [m.a, m.b]) if (p) seen.set(p, (seen.get(p) ?? 0) + 1);
    }
    check([...seen.values()].every((c) => c === 1), `n=${n} r=${r} : un joueur apparié deux fois`);
    const byeId = round.byePlayer;
    check(eligible.length % 2 === 0 ? byeId === null : byeId !== null, `n=${n} r=${r} : exempt incohérent`);
    if (byeId) check(!seen.has(byeId), `n=${n} r=${r} : l'exempt joue un match normal`);
    check(
      eligible.every((p) => seen.has(p) || p === byeId),
      `n=${n} r=${r} : un joueur actif n'est pas apparié`,
    );

    // b. exempt parmi les moins exemptés
    if (byeId) {
      const minByes = Math.min(...eligible.map((p) => before.byes.get(p) ?? 0));
      check((before.byes.get(byeId) ?? 0) === minByes, `n=${n} r=${r} : exempt qui a déjà été exempté alors que d'autres non`);
    }

    // c. pas de revanche évitable (force brute jusqu'à 10 joueurs)
    const rematches = round.matches.filter(
      (m) => m.kind === 'normal' && m.b && before.met.get(m.a)?.has(m.b),
    ).length;
    if (rematches > 0 && eligible.length <= 10) {
      check(
        !anyByeAllowsRematchFree(eligible, before.met, before.byes),
        `n=${n} r=${r} : revanche alors qu'un appariement sans revanche existait`,
      );
    }
    check(
      round.matches.filter((m) => m.rematch).length === rematches,
      `n=${n} r=${r} : revanches non signalées au GM`,
    );

    // jouer la ronde (ordre aléatoire, parfois un départ en cours de ronde)
    let guard = 0;
    while (state.phase === 'round' && guard < 200) {
      guard += 1;
      const open = round.matches.filter((m) => m.status === 'pending' || m.status === 'playing');
      if (open.length === 0) {
        // exempt sans adversaire possible : le GM accorde l'exempt
        if (round.waiting) core.grantBye(state, ctx(cfg));
        continue;
      }
      const m = open[Math.floor(rand() * open.length)];
      if (withChurn && rand() < 0.03 && m.b) {
        core.leavePlayer(state, ctx(cfg), rand() < 0.5 ? m.a : m.b, 'self');
        continue;
      }
      if (rand() < 0.05) {
        core.setMatchResult(state, ctx(cfg), m.id, rand() < 0.5 ? 'a' : 'draw');
      } else {
        playAutoGame(state, cfg, m, refSeq);
      }
    }
    check(state.phase === 'round_done', `n=${n} r=${r} : la ronde ne se termine pas (${state.phase})`);

    // d. partie bonus : jamais de points pour l'adversaire attribué
    for (const m of round.matches) {
      if (m.kind === 'floater') {
        check(m.points.b === 0, `n=${n} r=${r} : points donnés à l'adversaire de l'exempt`);
        check(m.a === byeId, `n=${n} r=${r} : la partie bonus n'est pas celle de l'exempt`);
      }
    }
  }

  // e. classement : somme des points = matchs + ajustements, ordre décroissant
  const standings = computeStandings(state);
  const expected = new Map<string, number>();
  for (const round of state.rounds) {
    for (const m of round.matches) {
      if (m.status !== 'done') continue;
      expected.set(m.a, (expected.get(m.a) ?? 0) + m.points.a);
      if (m.b && m.kind === 'normal') expected.set(m.b, (expected.get(m.b) ?? 0) + m.points.b);
    }
  }
  for (const row of standings) {
    check(Math.abs((expected.get(row.playerId) ?? 0) + row.adjustment - row.points) < 1e-9, `n=${n} : points de ${row.pseudo} incohérents`);
  }
  for (let i = 1; i < standings.length; i += 1) {
    const a = standings[i - 1];
    const b = standings[i];
    if (a.status !== 'excluded' && b.status !== 'excluded') {
      check(a.points >= b.points, `n=${n} : classement pas trié par points`);
    }
  }
  // f. un résultat compté ne l'est jamais deux fois
  check(new Set(state.countedRefs).size === state.countedRefs.length, `n=${n} : partie comptée deux fois`);

  // g. correction d'une ronde passée : le classement suit
  const first = state.rounds[0]?.matches.find((m) => m.kind === 'normal' && m.status === 'done' && m.b);
  if (first && first.b) {
    core.setMatchResult(state, ctx(cfg), first.id, 'forfeit_b');
    const after = computeStandings(state).find((r) => r.playerId === first.b);
    check(first.result === 'forfeit_b' && first.gmLocked, `n=${n} : correction GM non appliquée`);
    check(after !== undefined && after.wins >= 1, `n=${n} : correction GM absente du classement`);
  }
}

// ---------------------------------------------------------------------------
// 3. Scénarios ciblés
// ---------------------------------------------------------------------------

function scenarioFloater(): void {
  const cfg = cfgWith();
  const state = core.createInitialState(clock);
  addPlayers(state, cfg, 5);
  const round = core.startRound(state, ctx(cfg));
  const x = round.waiting;
  check(x !== null && round.byePlayer === x, 'impair : un exempt attend');
  const first = round.matches.find((m) => m.kind === 'normal') as TournamentMatch;
  const refSeq = { n: 100 };
  playAutoGame(state, cfg, first, refSeq);
  const floater = round.matches.find((m) => m.kind === 'floater');
  check(floater !== undefined, 'un adversaire est attribué au premier match terminé');
  check(floater !== undefined && [first.a, first.b].includes(floater.b), "l'adversaire vient du match terminé");
  check(round.waiting === null, "l'exempt n'attend plus");
  // l'adversaire attribué part : la partie bonus est annulée, l'exempt réattend
  if (floater && floater.b) {
    core.leavePlayer(state, ctx(cfg), floater.b, 'self');
    check(floater.status === 'cancelled' && round.waiting === x, "départ de l'adversaire attribué : l'exempt attend à nouveau");
  }
  // les autres matchs finissent : le suivant reçoit un adversaire
  for (const m of round.matches.filter((mm) => mm.kind === 'normal' && mm.status === 'pending')) {
    playAutoGame(state, cfg, m, refSeq);
  }
  const floaters = round.matches.filter((m) => m.kind === 'floater' && m.status !== 'cancelled');
  check(floaters.length === 1, "réattribution de l'exempt au match suivant");
  for (const m of floaters) playAutoGame(state, cfg, m, refSeq);
  check(state.phase === 'round_done', 'ronde finie avec la partie bonus');
}

function scenarioLeaveAndDraw(): void {
  const cfg = cfgWith();
  const state = core.createInitialState(clock);
  const ids = addPlayers(state, cfg, 4);
  // départ pendant les inscriptions : retiré du roster
  const gone = core.leavePlayer(state, ctx(cfg), ids[3], 'self');
  check(gone && !state.roster[ids[3]], 'départ pendant les inscriptions : joueur retiré');
  addPlayers(state, cfg, 1);
  const round = core.startRound(state, ctx(cfg));
  const m = round.matches[0];
  core.leavePlayer(state, ctx(cfg), m.a, 'self');
  check(m.result === 'forfeit_b' && m.points.b === cfg.points.forfeit, 'départ avant de jouer : forfait');
  // partie avant le tirage : ne compte pas
  const other = round.matches[1];
  if (other?.b) {
    const out = core.recordExternalGame(state, ctx(cfg), {
      ref: 'old-game',
      whiteKey: state.roster[other.a].key,
      blackKey: state.roster[other.b].key,
      winner: 'w',
      reason: 'resign',
      createdAt: Date.parse(round.startedAt) - 10_000,
    });
    check(!out.counted && out.reason === 'before_draw', 'partie créée avant le tirage : ignorée');
    // partie entre joueurs non appariés : ignorée
    const out2 = core.recordExternalGame(state, ctx(cfg), {
      ref: 'friendly',
      whiteKey: state.roster[other.a].key,
      blackKey: state.roster[m.b as string].key,
      winner: null,
      reason: 'draw_agreed',
      createdAt: Date.parse(round.startedAt) + 10_000,
    });
    check(!out2.counted && out2.reason === 'not_paired', 'amicale entre joueurs non appariés : ignorée');
    // vraie partie, puis la même remontée deux fois : comptée une fois
    const input = {
      ref: 'real-1',
      whiteKey: state.roster[other.b].key,
      blackKey: state.roster[other.a].key,
      winner: 'w' as const,
      reason: 'checkmate',
      createdAt: Date.parse(round.startedAt) + 20_000,
    };
    const r1 = core.recordExternalGame(state, ctx(cfg), input);
    const r2 = core.recordExternalGame(state, ctx(cfg), input);
    check(r1.counted && !r2.counted, 'remontée idempotente');
    check(other.result === 'b', 'les couleurs sont bien rapportées au bon joueur');
    // GM : reset puis résultat imposé, la partie annulée ne revient jamais
    core.setMatchResult(state, ctx(cfg), other.id, 'reset');
    const r3 = core.recordExternalGame(state, ctx(cfg), input);
    check(!r3.counted, 'partie annulée par le GM : jamais recomptée');
    core.setMatchResult(state, ctx(cfg), other.id, 'draw');
    check(other.gmLocked && other.result === 'draw', 'résultat imposé par le GM');
  }
  check(state.phase === 'round_done', 'ronde terminée après forfait + saisie GM');
  // ajustement GM
  core.adjustScore(state, ctx(cfg), ids[0], 3, 'bonus');
  const row = computeStandings(state).find((r) => r.playerId === ids[0]);
  check(row !== undefined && row.adjustment === 3, 'ajustement GM appliqué');
  core.finishTournament(state, ctx(cfg));
  check(state.phase === 'final', 'fin du tournoi');
}

function scenarioByePoints(): void {
  const cfg = cfgWith({ byePolicy: 'points' });
  const state = core.createInitialState(clock);
  addPlayers(state, cfg, 3);
  const round = core.startRound(state, ctx(cfg));
  const bye = round.matches.find((m) => m.kind === 'bye');
  check(bye !== undefined && bye.points.a === cfg.points.bye && bye.status === 'done', 'exempt crédité d\'office');
  check(round.waiting === null, "politique 'points' : personne n'attend");
}

function scenarioNoRematchSmall(): void {
  // 4 joueurs, 3 rondes : un tournoi toutes rondes sans aucune revanche
  const cfg = cfgWith();
  const state = core.createInitialState(clock);
  addPlayers(state, cfg, 4);
  const refSeq = { n: 500 };
  for (let r = 0; r < 3; r += 1) {
    const round = core.startRound(state, ctx(cfg));
    for (const m of round.matches) playAutoGame(state, cfg, m, refSeq);
  }
  const pairs = new Set<string>();
  let dup = false;
  for (const round of state.rounds) {
    for (const m of round.matches) {
      if (!m.b) continue;
      const k = pairKey(m.a, m.b);
      if (pairs.has(k)) dup = true;
      pairs.add(k);
    }
  }
  check(!dup && pairs.size === 6, '4 joueurs, 3 rondes : chacun rencontre chacun une fois');
}

// ---------------------------------------------------------------------------

const started = Date.now();
checkDecisions();
scenarioFloater();
scenarioLeaveAndDraw();
scenarioByePoints();
scenarioNoRematchSmall();

const configs: TournamentConfig[] = [
  cfgWith(),
  cfgWith({ byePolicy: 'points' }),
  cfgWith({ match: { games: 3, decide: 'best_of', scoring: 'match' } }),
  cfgWith({ match: { games: 2, decide: 'all', scoring: 'game' } }),
];
let simulated = 0;
for (let i = 0; i < 1200; i += 1) {
  const n = 2 + Math.floor(rand() * 39);
  simulateTournament(n, configs[i % configs.length], i % 3 === 0);
  simulated += 1;
}

const ms = Date.now() - started;
if (failures > 0) {
  console.error(`[check-tournament] ${failures} échec(s) sur ${checks} vérifications (graine ${SEED})`);
  process.exit(1);
}
console.log(`[check-tournament] OK : ${checks} vérifications, ${simulated} tournois simulés en ${ms} ms (graine ${SEED})`);
