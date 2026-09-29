/**
 * Test de bout en bout du tournoi, DANS ce process, sur la vraie base.
 *
 * Des bots s'inscrivent à des tournois de TEST et jouent de vraies parties
 * d'échecs (création, join, prêts, abandon, nulle, mat du berger, revanche).
 * On vérifie que tout remonte sans intervention : résultats, exempt qui
 * attend un joueur libéré, fin de ronde, rattrapage sans double compte,
 * ronde 2 sans revanche, départ (forfait) et retour, corrections du GM, fin
 * et libération, match au meilleur des 3, aller-retour au barème par partie.
 *
 *   npm run e2e:tournament        (≈ 70 s)
 *
 * ATTENTION : le .env local pointe sur la base de PRODUCTION.
 * - Les tournois sont en testMode : ni écrans, ni tables de prod (la prod
 *   ignore les tournois de test). Ils sont clos à la fin, même en cas d'échec.
 * - Les parties des bots (pseudos ZZ*) passent quelques secondes dans le
 *   lobby des vraies tables : lancer bar fermé.
 * - Ne pas faire tourner un backend local en même temps : son pont échecs
 *   traiterait les mêmes parties.
 */

import '../backend/src/config/env.js';
import { supabaseAdmin } from '../backend/src/config/supabase.js';
import { findPlayerByToken, loadSession } from '../backend/src/games/engine.js';
import {
  createTournamentSession,
  joinTournament,
  leaveTournament,
  rejoinTournament,
  tournamentGmAction,
} from '../backend/src/games/tournament/tournamentFlow.js';
import { chessGameContext, lookupParticipant, reconcileOnce } from '../backend/src/games/tournament/chessBridge.js';
import { TOURNAMENT_SCOPE } from '../backend/src/games/tournament/registry.js';
import {
  tournamentStateOf,
  type TournamentMatch,
  type TournamentState,
} from '../backend/src/games/tournament/types.js';
import {
  chessGmAction,
  chessPlayerAction,
  createChessSession,
  joinChessSession,
  playChessMove,
} from '../backend/src/games/chess/chessFlow.js';
import { buildChessPublicState } from '../backend/src/games/chess/chessViews.js';
import type { PlayerRow, SessionRow } from '../backend/src/games/types.js';

// ---------------------------------------------------------------------------
// Outillage
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** compte à rebours des échecs après les deux « prêt » (3 s) */
const COUNTDOWN_MS = 3_600;

let failures = 0;
function check(cond: boolean, msg: string): void {
  console.log(`${cond ? '  OK    ' : '  ECHEC '}${msg}`);
  if (!cond) failures += 1;
}

const tournaments: string[] = [];
const chessGames: string[] = [];

async function newTournament(config: Record<string, unknown>): Promise<string> {
  const s = await createTournamentSession({ registrationMin: 60, ...config, testMode: true });
  tournaments.push(s.id);
  return s.id;
}

async function load(id: string): Promise<{ session: SessionRow; st: TournamentState }> {
  const session = await loadSession(id);
  if (!session) throw new Error(`session ${id} introuvable`);
  return { session, st: tournamentStateOf(session) };
}

function roundOf(st: TournamentState, n: number) {
  const r = st.rounds.find((x) => x.number === n);
  if (!r) throw new Error(`ronde ${n} absente`);
  return r;
}

function findMatch(st: TournamentState, id: string): TournamentMatch | undefined {
  return st.rounds.flatMap((r) => r.matches).find((m) => m.id === id);
}

async function waitMatch(tid: string, matchId: string, timeoutMs = 12_000): Promise<TournamentMatch> {
  const t0 = Date.now();
  for (;;) {
    const m = findMatch((await load(tid)).st, matchId);
    if (m && (m.status === 'done' || m.status === 'cancelled')) return m;
    if (Date.now() - t0 > timeoutMs) throw new Error(`match ${matchId} jamais décidé (${m?.status})`);
    await sleep(400);
  }
}

const pairOf = (m: TournamentMatch) => [m.a, m.b].sort().join('|');
const whiteOf = (m: TournamentMatch) => (m.colorA === 'b' ? m.b : m.a) as string;
const winnerOf = (m: TournamentMatch) => (m.result === 'a' ? m.a : m.result === 'b' ? m.b : null);

type Outcome = 'white' | 'black' | 'draw' | 'mate_black';

async function finishGame(chessId: string, white: PlayerRow, black: PlayerRow, outcome: Outcome): Promise<void> {
  await chessPlayerAction(chessId, white, 'ready');
  await chessPlayerAction(chessId, black, 'ready');
  await sleep(COUNTDOWN_MS);
  if (outcome === 'white') await chessPlayerAction(chessId, black, 'resign');
  if (outcome === 'black') await chessPlayerAction(chessId, white, 'resign');
  if (outcome === 'draw') {
    await chessPlayerAction(chessId, white, 'draw-offer');
    await chessPlayerAction(chessId, black, 'draw-accept');
  }
  if (outcome === 'mate_black') {
    // mat du berger inversé : f3 e5 g4 Dh4#
    const moves: Array<[PlayerRow, string, string]> = [
      [white, 'f2', 'f3'],
      [black, 'e7', 'e5'],
      [white, 'g2', 'g4'],
      [black, 'd8', 'h4'],
    ];
    for (const [ply, [p, from, to]] of moves.entries()) {
      await playChessMove(chessId, p, { ply, from, to });
    }
  }
}

/** vraie partie d'échecs entre les deux joueurs d'un match, couleurs conseillées */
async function play(
  tid: string,
  m: TournamentMatch,
  outcome: Outcome,
): Promise<{ chessId: string; white: PlayerRow; black: PlayerRow }> {
  const { st } = await load(tid);
  const wId = whiteOf(m);
  const bId = (wId === m.a ? m.b : m.a) as string;
  const created = await createChessSession({
    pseudo: st.roster[wId].pseudo,
    device: 'e2e',
    clock: { initialMinutes: 5, incrementSeconds: 0 },
    color: 'w',
    theme: 'neon',
    ai: null,
  });
  chessGames.push(created.session.id);
  const joined = await joinChessSession(created.session.id, st.roster[bId].pseudo, 'e2e');
  await finishGame(created.session.id, created.player, joined.player, outcome);
  return { chessId: created.session.id, white: created.player, black: joined.player };
}

async function playerOf(chessId: string, pseudo: string): Promise<PlayerRow> {
  const { data } = await supabaseAdmin
    .from('game_players')
    .select('player_token')
    .eq('session_id', chessId)
    .eq('pseudo', pseudo)
    .maybeSingle();
  const p = await findPlayerByToken(chessId, (data as { player_token?: string } | null)?.player_token);
  if (!p) throw new Error(`${pseudo} absent de la partie ${chessId}`);
  return p;
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

async function scenarioSwiss(): Promise<void> {
  console.log('== 5 joueurs : exempt, nulle, mat, ronde 2, départ, corrections, fin');
  const tid = await newTournament({ title: 'ZZ E2E suisse' });
  const byId = new Map<string, PlayerRow>();
  for (let i = 1; i <= 5; i += 1) {
    const { player } = await joinTournament(tid, `ZZE${i}`, 'e2e');
    byId.set(player.id, player);
  }
  let dup = '';
  try {
    await joinTournament(tid, 'zzé1', 'e2e');
  } catch (err) {
    dup = (err as Error).message;
  }
  check(dup.includes('already_exists'), 'pseudo en double refusé (casse et accents ignorés)');

  await tournamentGmAction(tid, 'start-now');
  let { st } = await load(tid);
  const r1 = roundOf(st, 1);
  const normals = r1.matches.filter((m) => m.kind === 'normal');
  check(st.phase === 'round' && normals.length === 2 && r1.waiting !== null, 'ronde 1 : 2 matchs, un exempt en attente');
  const waiting = r1.waiting as string;

  const first = normals[0];
  const lk = await lookupParticipant('chess', st.roster[first.a].pseudo.toLowerCase(), st.roster[normals[1].a].pseudo);
  check(lk?.hint === 'play' && lk.player.exact === false, 'lookup des tables : joueur trouvé malgré la casse');
  check(lk?.opponentCheck?.counts === false, 'lookup : mauvais adversaire signalé (ne comptera pas)');

  const g1 = await play(tid, first, 'white');
  const m1 = await waitMatch(tid, first.id);
  check(m1.status === 'done' && winnerOf(m1) === whiteOf(m1), 'match 1 remonté seul, victoire des blancs');
  const ctx1 = await chessGameContext(g1.chessId);
  check(ctx1?.counted === true && ctx1.match?.decided === true, 'contexte de la partie : comptée, match décidé');
  ({ st } = await load(tid));
  const floater = roundOf(st, 1).matches.find((m) => m.kind === 'floater');
  check(
    floater !== undefined && floater.a === waiting && [m1.a, m1.b].includes(floater.b as string),
    "l'exempt reçoit un joueur du premier match terminé",
  );

  await play(tid, normals[1], 'draw');
  const m2 = await waitMatch(tid, normals[1].id);
  check(m2.result === 'draw' && m2.points.a === 1 && m2.points.b === 1, 'nulle : 1 point chacun');

  if (floater) {
    await play(tid, floater, 'mate_black');
    const mf = await waitMatch(tid, floater.id);
    check(mf.status === 'done' && mf.points.b === 0, "partie bonus (mat) : rien pour l'adversaire attribué");
  }
  const after1 = await load(tid);
  st = after1.st;
  check(st.phase === 'round_done', 'fin de ronde actée quand tous les matchs sont joués');

  await reconcileOnce();
  const again = await load(tid);
  check(
    JSON.stringify(again.st.standings) === JSON.stringify(st.standings) &&
      again.session.state_version === after1.session.state_version,
    'rattrapage : rien de recompté, aucune écriture inutile',
  );

  await tournamentGmAction(tid, 'next-round');
  ({ st } = await load(tid));
  const r2 = roundOf(st, 2);
  const met = new Set(roundOf(st, 1).matches.filter((m) => m.b).map(pairOf));
  const n2 = r2.matches.filter((m) => m.kind === 'normal');
  check(n2.length === 2 && n2.every((m) => !met.has(pairOf(m))), 'ronde 2 sans revanche');
  check(r2.waiting !== null && r2.waiting !== waiting, 'exempt différent en ronde 2');

  const leaving = n2[0];
  const leaver = byId.get(leaving.a) as PlayerRow;
  await leaveTournament(tid, leaver);
  ({ st } = await load(tid));
  const mLeft = findMatch(st, leaving.id);
  check(mLeft?.result === 'forfeit_b' && mLeft.points.b === 2, 'départ avant de jouer : forfait, 2 points pour l’adversaire');
  const floater2 = roundOf(st, 2).matches.find((m) => m.kind === 'floater');
  if (met.has(pairOf({ ...leaving, a: r2.waiting as string }))) {
    check(floater2 === undefined, "l'adversaire libéré a déjà joué l'exempt : on attend le match suivant");
  } else {
    check(floater2?.a === r2.waiting && floater2.b === leaving.b, "le forfait libère l'adversaire pour l'exempt");
  }
  await rejoinTournament(tid, leaver);
  ({ st } = await load(tid));
  check(st.roster[leaver.id].status === 'active', 'retour dans le tournoi (joue à la ronde suivante)');

  // l'adversaire de l'exempt peut n'arriver qu'après le match suivant
  for (let guard = 0; guard < 4; guard += 1) {
    const next = roundOf((await load(tid)).st, 2).matches.find((x) => x.status === 'pending');
    if (!next) break;
    await play(tid, next, 'black');
    await waitMatch(tid, next.id);
  }
  ({ st } = await load(tid));
  const fl2 = roundOf(st, 2).matches.filter((m) => m.kind === 'floater');
  check(st.phase === 'round_done' && fl2.length === 1 && fl2[0].status === 'done', 'ronde 2 terminée, exempt servi');

  const before = JSON.stringify(st.standings);
  await tournamentGmAction(tid, 'set-match-result', { matchId: m1.id, result: m1.result === 'a' ? 'b' : 'a' });
  ({ st } = await load(tid));
  check(JSON.stringify(st.standings) !== before && findMatch(st, m1.id)?.gmLocked === true, 'correction GM de la ronde 1 : classement recalculé');
  const someone = [...byId.values()][2];
  const pointsBefore = st.standings.find((x) => x.playerId === someone.id)?.points ?? 0;
  await tournamentGmAction(tid, 'adjust-score', { playerId: someone.id, delta: 3, reason: 'e2e' });
  ({ st } = await load(tid));
  check(st.standings.find((x) => x.playerId === someone.id)?.points === pointsBefore + 3, 'ajustement de score : +3');
  await tournamentGmAction(tid, 'rename-player', { playerId: someone.id, pseudo: 'ZZE3bis' });
  ({ st } = await load(tid));
  check(st.roster[someone.id].pseudo === 'ZZE3bis', 'renommage d’un joueur');

  await tournamentGmAction(tid, 'finish');
  const fin = await load(tid);
  check(fin.st.phase === 'final' && fin.session.status === 'end' && !fin.session.ended_at, 'podium : écrans encore occupés');
  const closed = await tournamentGmAction(tid, 'close');
  check(Boolean(closed.ended_at) && tournamentStateOf(closed).closeReason === 'close', 'clôture : tournoi libéré');
}

async function scenarioBestOf3(): Promise<void> {
  console.log('== meilleur des 3 : la revanche compte comme 2e partie');
  const tid = await newTournament({ title: 'ZZ E2E BO3', match: { games: 3, decide: 'best_of', scoring: 'match' } });
  await joinTournament(tid, 'ZZB1', 'e2e');
  await joinTournament(tid, 'ZZB2', 'e2e');
  await tournamentGmAction(tid, 'start-now');
  const m = roundOf((await load(tid)).st, 1).matches[0];

  const g = await play(tid, m, 'white');
  await sleep(1_500);
  let cur = findMatch((await load(tid)).st, m.id) as TournamentMatch;
  check(cur.games.length === 1 && cur.status === 'pending', '1-0 : match pas encore décidé');

  await chessPlayerAction(g.chessId, g.white, 'rematch');
  const s = await chessPlayerAction(g.chessId, g.black, 'rematch');
  const rematchId = buildChessPublicState(s).rematch.sessionId;
  check(rematchId !== null, 'revanche créée sur la dalle');
  if (!rematchId) return;
  chessGames.push(rematchId);
  await sleep(1_500);
  cur = findMatch((await load(tid)).st, m.id) as TournamentMatch;
  check(cur.live?.ref === rematchId, 'la revanche est suivie comme partie 2');
  // couleurs inversées : l'ancien noir a les blancs et abandonne
  const newWhite = await playerOf(rematchId, g.black.pseudo);
  const newBlack = await playerOf(rematchId, g.white.pseudo);
  await finishGame(rematchId, newWhite, newBlack, 'black');
  const done = await waitMatch(tid, m.id);
  check(
    done.games.length === 2 && winnerOf(done) === whiteOf(m) && done.points.a + done.points.b === 2,
    'BO3 gagné 2-0 par le même joueur, 2 points',
  );

  const g3 = await play(tid, m, 'black');
  await sleep(1_500);
  const ctx3 = await chessGameContext(g3.chessId);
  check(ctx3?.counted === false && ctx3.reason === 'match_decided', 'partie jouée après la décision : ignorée');
  await tournamentGmAction(tid, 'abort');
}

async function scenarioHomeAway(): Promise<void> {
  console.log('== aller-retour, barème par partie');
  const tid = await newTournament({ title: 'ZZ E2E AR', match: { games: 2, decide: 'all', scoring: 'game' } });
  await joinTournament(tid, 'ZZA1', 'e2e');
  await joinTournament(tid, 'ZZA2', 'e2e');
  await tournamentGmAction(tid, 'start-now');
  const m = roundOf((await load(tid)).st, 1).matches[0];
  await play(tid, m, 'draw');
  await sleep(1_500);
  await play(tid, m, 'white');
  const done = await waitMatch(tid, m.id);
  const pts = [done.points.a, done.points.b].sort((x, y) => x - y);
  check(done.games.length === 2 && pts[0] === 1 && pts[1] === 3, 'nulle (1+1) puis victoire (2+0) : 3 / 1');
  await tournamentGmAction(tid, 'abort');
}

// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  for (const id of chessGames) {
    const s = await loadSession(id).catch(() => null);
    if (s && s.status !== 'end') await chessGmAction(id, 'terminate').catch(() => undefined);
  }
  for (const id of tournaments) {
    const s = await loadSession(id).catch(() => null);
    if (s && !s.ended_at) await tournamentGmAction(id, 'abort').catch(() => undefined);
  }
}

async function main(): Promise<void> {
  if (TOURNAMENT_SCOPE !== 'test') {
    console.error(`[tournament-e2e] TOURNAMENT_SCOPE=${TOURNAMENT_SCOPE} : ce test ne tourne qu'en périmètre « test ».`);
    process.exit(2);
  }
  // un autre tournoi de test ouvert fausserait le pont échecs (un seul suivi)
  const { data: open } = await supabaseAdmin
    .from('game_sessions')
    .select('id, config')
    .eq('mode', 'tournament')
    .is('ended_at', null);
  const busy = ((open ?? []) as Array<{ id: string; config: { testMode?: boolean; title?: string } }>).filter(
    (r) => r.config?.testMode === true,
  );
  if (busy.length > 0) {
    console.error(`[tournament-e2e] tournoi de test encore ouvert : ${busy.map((r) => `${r.config.title} (${r.id})`).join(', ')}`);
    process.exit(2);
  }
  const t0 = Date.now();
  try {
    await scenarioSwiss();
    await scenarioBestOf3();
    await scenarioHomeAway();
  } catch (err) {
    failures += 1;
    console.error('  ERREUR', err);
  } finally {
    await cleanup();
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n[tournament-e2e] ${failures === 0 ? 'OK' : `${failures} échec(s)`} en ${secs} s`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
