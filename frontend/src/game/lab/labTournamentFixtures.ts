/**
 * Fabriques d'états factices du TOURNOI pour le laboratoire (/game-lab).
 *
 * Aucun appel API. Les rondes, résultats et classements sont fabriqués ici,
 * avec les règles du backend (points, V/N/D, Buchholz) recopiées en simplifié :
 * ce n'est pas la logique officielle (elle vit dans
 * backend/src/games/tournament/swiss.ts), juste de quoi remplir les écrans de
 * façon plausible. `anchor` fixe l'horloge de la scène : les séquences
 * (tirage, podium, rotation) se jouent en vrai à partir de là.
 */

import type {
  TGame,
  TMatch,
  TournamentGmState,
  TournamentPublicState,
  TPlayer,
  TRound,
  TStanding,
  TWave,
  TWaveGroup,
} from '../tournament/tournamentTypes';
import type { ChessPublicState } from '../../tables/games/chess/lib/chessTypes';
import { drawDuration } from '../tournament/screen/rotation';

/** la ronde courante a fini son tirage pile à `anchor` : la rotation démarre */
function afterDraw(state: TournamentPublicState, anchor: number): TournamentPublicState {
  const round = state.rounds[state.rounds.length - 1];
  if (round) round.startedAt = anchor - drawDuration(round) - 1;
  return state;
}

const PSEUDOS = [
  'Marco', 'Léa', 'Sam', 'Nina', 'Hugo', 'Emma', 'Tom', 'Julie',
  'Alex', 'Zoé', 'Max', 'Lily', 'Nico', 'Eva', 'Paul', 'Mia',
  'Théo', 'Jade', 'Louis', 'Anna', 'Rémi', 'Clara', 'Yanis', 'Manon',
  'Enzo', 'Inès', 'Adam', 'Sarah', 'Noah', 'Camille', 'Lucas', 'Alice',
  'Gab', 'Chloé', 'Kevin', 'Marie', 'Bastien', 'Elsa', 'Jules', 'Roxane',
];

const POINTS = { win: 2, draw: 1, loss: 0, forfeit: 2, bye: 2 };

function players(n: number, anchor: number): TPlayer[] {
  return PSEUDOS.slice(0, n).map((pseudo, i) => ({
    id: `p${i + 1}`,
    pseudo,
    status: 'active',
    seq: i + 1,
    joinedAt: anchor - (n - i) * 45_000,
  }));
}

type Outcome = 'a' | 'b' | 'draw' | 'pending' | 'playing' | 'forfeit_a';

function game(winner: 'a' | 'b' | null, at: number, ref: string | null = null): TGame {
  return { winner, source: 'auto', reason: winner ? 'checkmate' : 'draw_agreed', colorA: 'w', ref, at };
}

function match(round: number, board: number, a: string, b: string, outcome: Outcome, at: number, kind: TMatch['kind'] = 'normal'): TMatch {
  const done = outcome === 'a' || outcome === 'b' || outcome === 'draw' || outcome === 'forfeit_a';
  const result = done ? (outcome === 'draw' ? 'draw' : outcome) : null;
  const pts =
    outcome === 'a' || outcome === 'forfeit_a'
      ? { a: POINTS.win, b: POINTS.loss }
      : outcome === 'b'
        ? { a: POINTS.loss, b: POINTS.win }
        : outcome === 'draw'
          ? { a: POINTS.draw, b: POINTS.draw }
          : { a: 0, b: 0 };
  const games: TGame[] =
    outcome === 'a' ? [game('a', at)] : outcome === 'b' ? [game('b', at)] : outcome === 'draw' ? [game(null, at)] : [];
  return {
    id: `r${round}${kind === 'floater' ? 'f' : 'm'}${board}`,
    round,
    board,
    a,
    b,
    kind,
    colorA: board % 2 === 1 ? 'w' : 'b',
    status: done ? 'done' : outcome === 'playing' ? 'playing' : 'pending',
    result: result as TMatch['result'],
    points: kind === 'floater' ? { a: pts.a, b: 0 } : pts,
    score: {
      a: games.reduce((s, g) => s + (g.winner === 'a' ? 1 : g.winner === null ? 0.5 : 0), 0),
      b: games.reduce((s, g) => s + (g.winner === 'b' ? 1 : g.winner === null ? 0.5 : 0), 0),
    },
    games,
    live: outcome === 'playing' ? { ref: `lab-chess-${round}-${board}`, since: new Date(at).toISOString() } : null,
    gmLocked: false,
    rematch: false,
    decidedAt: done ? at : null,
  };
}

/** classement simplifié (points, V/N/D, Buchholz), miroir approximatif du backend */
function standings(list: TPlayer[], rounds: TRound[]): TStanding[] {
  const rows = new Map<string, TStanding & { opp: string[] }>();
  for (const p of list) {
    rows.set(p.id, {
      playerId: p.id, pseudo: p.pseudo, rank: 0, tied: false, points: 0, wins: 0, draws: 0, losses: 0,
      played: 0, buchholz: 0, adjustment: 0, byes: 0, status: p.status, opp: [],
    });
  }
  for (const r of rounds) {
    for (const m of r.matches) {
      if (m.status !== 'done' || !m.result) continue;
      const ra = rows.get(m.a);
      if (m.kind === 'bye') {
        if (ra) { ra.points += m.points.a; ra.byes += 1; }
        continue;
      }
      if (!m.b) continue;
      const rb = rows.get(m.b);
      const aw = m.result === 'a' || m.result === 'forfeit_a';
      const bw = m.result === 'b' || m.result === 'forfeit_b';
      if (ra) { ra.points += m.points.a; ra.played++; if (aw) ra.wins++; else if (bw) ra.losses++; else ra.draws++; ra.opp.push(m.b); }
      if (rb && m.kind === 'normal') { rb.points += m.points.b; rb.played++; if (bw) rb.wins++; else if (aw) rb.losses++; else rb.draws++; rb.opp.push(m.a); }
    }
  }
  for (const r of rows.values()) r.buchholz = r.opp.reduce((s, o) => s + (rows.get(o)?.points ?? 0), 0);
  const sorted = [...rows.values()].sort((x, y) => y.points - x.points || y.buchholz - x.buchholz || y.wins - x.wins);
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    const same = prev && prev.points === r.points && prev.buchholz === r.buchholz && prev.wins === r.wins;
    r.rank = same ? prev.rank : i + 1;
    r.tied = Boolean(same);
  });
  return sorted.map(({ opp: _o, ...row }) => row);
}

function base(over: Partial<TournamentPublicState>, anchor: number): TournamentPublicState {
  return {
    id: 'lab-tournoi',
    joinCode: 'ECHC',
    mode: 'tournament',
    status: 'playing',
    v: 1,
    serverNow: anchor,
    createdAt: anchor - 40 * 60_000,
    startedAt: anchor - 30 * 60_000,
    phaseStartedAt: anchor,
    phaseEndsAt: null,
    ended: false,
    title: "Tournoi d'échecs du jeudi",
    format: 'swiss',
    formatLabel: 'Rondes suisses',
    game: 'chess',
    gameLabel: 'Échecs',
    config: {
      registrationMin: 10,
      lateJoin: true,
      plannedRounds: 5,
      match: { games: 1, decide: 'best_of', scoring: 'match' },
      points: POINTS,
      byePolicy: 'floater',
      groupSize: 2,
      placementPoints: [4, 3, 2, 1],
      poolWinPoints: 1,
      grouping: 'swiss',
      parallelSlots: 1,
      display: { standingsMs: 8_000, roundMs: 8_000, liveMs: 45_000 },
      wifiSsid: 'INVADER BAR',
      wifiPassword: 'retrogaming',
      texts: { winner: 'Bravo #winner#, champion des échecs du jeudi !' },
      testMode: false,
    },
    phase: 'round',
    waitingForPlayers: false,
    players: [],
    playerCount: 0,
    standings: [],
    rounds: [],
    currentRound: null,
    waves: [],
    bracket: null,
    bracketWinnerId: null,
    feed: [],
    pin: null,
    finishedAt: null,
    closeReason: null,
    ...over,
  };
}

/** deux rondes jouées, la 3e en cours : 13 joueurs (un exempt) */
function midTournament(anchor: number, currentAt: number, n = 13, allDone = false): TournamentPublicState {
  const list = players(n, anchor);
  const id = (i: number) => list[i].id;
  const t1 = anchor - 50 * 60_000;
  const t2 = anchor - 25 * 60_000;
  const r1: TRound = {
    number: 1, startedAt: t1, finishedAt: t1 + 20 * 60_000, waiting: null, byePlayer: id(12),
    matches: [
      match(1, 1, id(0), id(1), 'a', t1 + 9e5), match(1, 2, id(2), id(3), 'b', t1 + 8e5),
      match(1, 3, id(4), id(5), 'a', t1 + 7e5), match(1, 4, id(6), id(7), 'draw', t1 + 1e6),
      match(1, 5, id(8), id(9), 'a', t1 + 6e5), match(1, 6, id(10), id(11), 'b', t1 + 5e5),
      match(1, 7, id(12), id(1), 'a', t1 + 1.1e6, 'floater'),
    ].slice(0, n >= 13 ? 7 : 6),
  };
  const r2: TRound = {
    number: 2, startedAt: t2, finishedAt: t2 + 20 * 60_000, waiting: null, byePlayer: n % 2 ? id(11) : null,
    matches: [
      match(2, 1, id(0), id(3), 'a', t2 + 9e5), match(2, 2, id(4), id(8), 'draw', t2 + 8e5),
      match(2, 3, id(12), id(6), 'b', t2 + 7e5), match(2, 4, id(11), id(7), 'a', t2 + 6e5),
      match(2, 5, id(1), id(2), 'a', t2 + 5e5), match(2, 6, id(5), id(9), 'b', t2 + 4e5),
    ],
  };
  // résultats de la ronde en cours : dans le PASSÉ de la scène (sinon la
  // rotation les prendrait pour des parties « tout juste finies »)
  const past = (d: number) => anchor - 150_000 + d / 10;
  const r3Matches: TMatch[] = [
    match(3, 1, id(0), id(6), allDone ? 'a' : 'playing', past(2e5)),
    match(3, 2, id(11), id(1), allDone ? 'draw' : 'a', past(3e5)),
    match(3, 3, id(9), id(4), allDone ? 'b' : 'playing', past(4e5)),
    match(3, 4, id(3), id(2), allDone ? 'a' : 'draw', past(2.5e5)),
    match(3, 5, id(8), id(7), allDone ? 'b' : 'pending', past(5e5)),
    match(3, 6, id(5), id(10), allDone ? 'a' : 'b', past(1.5e5)),
  ];
  if (allDone && n % 2) r3Matches.push(match(3, 7, id(12), id(1), 'a', past(7e5), 'floater'));
  const r3: TRound = {
    number: 3, startedAt: currentAt, finishedAt: allDone ? currentAt + 9e5 : null,
    waiting: allDone || n % 2 === 0 ? null : id(12), byePlayer: n % 2 ? id(12) : null,
    matches: r3Matches,
  };
  const rounds = [r1, r2, r3];
  return base(
    {
      players: list,
      playerCount: list.length,
      standings: standings(list, rounds),
      rounds,
      currentRound: 3,
      phase: allDone ? 'round_done' : 'round',
      feed: [
        { seq: 1, kind: 'result', text: `${list[11].pseudo} bat ${list[1].pseudo}`, at: currentAt + 3e5 },
      ],
    },
    anchor,
  );
}

function lobby(anchor: number, n: number, over: Partial<TournamentPublicState> = {}): TournamentPublicState {
  const list = players(n, anchor);
  return base(
    {
      status: 'lobby',
      phase: 'registration',
      players: list,
      playerCount: list.length,
      standings: standings(list, []),
      phaseStartedAt: anchor - 2.5 * 60_000,
      phaseEndsAt: anchor + 7 * 60_000 + 32_000,
      startedAt: null,
      ...over,
    },
    anchor,
  );
}

/** 40 joueurs, ronde 4 en cours : le cas le plus chargé des écrans */
function bigTournament(anchor: number): TournamentPublicState {
  const list = players(40, anchor);
  const rounds: TRound[] = [];
  for (let r = 1; r <= 4; r++) {
    const start = anchor - (5 - r) * 25 * 60_000;
    const matches: TMatch[] = [];
    for (let i = 0; i < 20; i++) {
      const a = list[(i * 2 + r) % 40].id;
      const b = list[(i * 2 + r + 1 + r * 2) % 40].id;
      const outcomes: Outcome[] = ['a', 'b', 'draw', 'a', 'b'];
      const o = r < 4 ? outcomes[(i + r) % 5] : i < 7 ? outcomes[i % 5] : i < 14 ? 'playing' : 'pending';
      matches.push(match(r, i + 1, a, b, o, start + (i + 3) * 60_000));
    }
    rounds.push({ number: r, startedAt: start, finishedAt: r < 4 ? start + 22 * 60_000 : null, waiting: null, byePlayer: null, matches });
  }
  return base({ players: list, playerCount: 40, standings: standings(list, rounds), rounds, currentRound: 4 }, anchor);
}

function finalState(anchor: number): TournamentPublicState {
  const s = midTournament(anchor, anchor - 20 * 60_000, 13, true);
  return {
    ...s,
    status: 'end',
    phase: 'final',
    finishedAt: anchor,
    phaseStartedAt: anchor,
    phaseEndsAt: anchor + 30 * 60_000,
  };
}

// ---------------------------------------------------------------------------
// Partie d'échecs factice (match en direct)
// ---------------------------------------------------------------------------

/** partie italienne jouée jusqu'au 11e coup */
const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4', 'b1c3', 'f6e4', 'e1g1', 'e4c3', 'b2c3', 'b4c3', 'd1b3', 'c3a1', 'c4f7'];

export function labChessState(white: string, black: string, anchor: number, ended = false): ChessPublicState {
  return {
    id: 'lab-chess',
    joinCode: 'LABC',
    mode: 'chess',
    status: ended ? 'end' : 'playing',
    v: 1,
    serverNow: anchor,
    phaseStartedAt: anchor,
    phaseEndsAt: null,
    startedAt: anchor - 9 * 60_000,
    endedAt: ended ? anchor : null,
    config: { clock: { initialMs: 10 * 60_000, incrementMs: 5000 }, theme: 'neon', creatorColor: 'w', ai: null },
    seats: { w: { pseudo: white, device: 'TABLE03-1' }, b: { pseudo: black, device: 'TABLE03-2' } },
    fen: '',
    moves: MOVES,
    lastMove: { from: 'c4', to: 'f7' },
    turn: 'b',
    clocks: { wMs: 6 * 60_000 + 12_000, bMs: 4 * 60_000 + 48_000, running: !ended },
    drawOffer: null,
    ready: null,
    check: true,
    rematch: { offers: { w: false, b: false }, sessionId: null },
    result: ended ? { winner: 'w', reason: 'resign' } : null,
    ended,
  };
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

export type TournamentLabSurface = 'projo' | 'bar' | 'joueur' | 'gm' | 'table';

export interface TournamentLabScenario {
  cle: string;
  surface: TournamentLabSurface;
  label: string;
  description: string;
  /** état à l'instant `anchor` (horloge de la scène) */
  state: (anchor: number) => TournamentPublicState;
  /** joueur incarné sur le téléphone (null = écran d'inscription) */
  you?: string | null;
  tab?: 'moi' | 'classement' | 'matchs';
  /** boutons « Aller à » (ms ajoutées à l'horloge de la scène) */
  sauts?: Array<[string, number]>;
}

function waveGroup(wave: number, board: number, ids: string[], status: TWaveGroup['status'], counts = true): TWaveGroup {
  return {
    id: `w${wave}g${board}`,
    wave,
    board,
    playerIds: ids,
    status,
    places: null,
    points: {},
    counts,
    scoredAt: null,
    claims: [],
  };
}

function ranked(list: TPlayer[], points: number[]): TStanding[] {
  return list.map((p, i) => ({
    playerId: p.id,
    pseudo: p.pseudo,
    rank: i + 1,
    tied: false,
    points: points[i] ?? 0,
    wins: points[i] ? 1 : 0,
    draws: 0,
    losses: 0,
    played: points[i] ? 1 : 0,
    buchholz: 0,
    adjustment: 0,
    byes: 0,
    status: p.status,
  }));
}

/** salve MK : 10 joueurs, 2 groupes en cours et 1 en file */
function mkWave(anchor: number): TournamentPublicState {
  const list = players(10, anchor);
  const id = (i: number) => list[i].id;
  const wave: TWave = {
    number: 2,
    kind: 'pool',
    startedAt: anchor - 60_000,
    finishedAt: null,
    grouping: 'swiss',
    parallel: 2,
    sitOuts: [],
    groups: [
      waveGroup(2, 1, [id(0), id(3), id(6), id(8)], 'playing'),
      waveGroup(2, 2, [id(1), id(4), id(7)], 'playing'),
      waveGroup(2, 3, [id(2), id(5), id(9)], 'queued'),
    ],
  };
  return base(
    {
      title: 'Tournoi Mario Kart',
      format: 'waves',
      formatLabel: 'Salves',
      game: 'mariokart',
      gameLabel: 'Mario Kart',
      joinCode: 'KART',
      phase: 'wave',
      players: list,
      playerCount: list.length,
      standings: ranked(list, [8, 7, 6, 5, 4, 4, 3, 2, 1, 0]),
      waves: [wave],
      config: {
        registrationMin: 10,
        lateJoin: true,
        plannedRounds: 3,
        match: { games: 1, decide: 'best_of', scoring: 'match' },
        points: POINTS,
        byePolicy: 'floater',
        groupSize: 4,
        placementPoints: [4, 3, 2, 1],
        poolWinPoints: 1,
        grouping: 'swiss',
        parallelSlots: 2,
        display: { standingsMs: 8_000, roundMs: 8_000, liveMs: 45_000 },
        wifiSsid: 'INVADER BAR',
        wifiPassword: 'retrogaming',
        texts: { winner: 'Bravo #winner#, champion Mario Kart !' },
        testMode: false,
      },
    },
    anchor,
  );
}

function mkWaiting(anchor: number): TournamentPublicState {
  const s = mkWave(anchor);
  const group = s.waves[0]?.groups[0];
  if (group) {
    group.claims = [
      { playerId: group.playerIds[1], places: [...group.playerIds].reverse(), loserGames: null, at: anchor - 20_000 },
      { playerId: 'p1', places: [...group.playerIds], loserGames: null, at: anchor },
    ];
  }
  return s;
}

function mkConflict(anchor: number): TournamentPublicState {
  const s = mkWave(anchor);
  const group = s.waves[0]?.groups[0];
  if (!group) return s;
  const reversed = [...group.playerIds].reverse();
  group.claims = [
    { playerId: group.playerIds[1], places: reversed, loserGames: null, at: anchor - 20_000 },
    { playerId: group.playerIds[0], places: [...group.playerIds], loserGames: null, at: anchor },
  ];
  return s;
}

function mkSemis(anchor: number): TournamentPublicState {
  const s = mkWave(anchor);
  const id = (i: number) => s.players[i].id;
  s.phase = 'bracket';
  s.waves[0].groups = s.waves[0].groups.map((g) => ({ ...g, status: 'done', places: g.playerIds, scoredAt: anchor }));
  s.bracket = {
    seeding: 'seeded',
    startedAt: anchor,
    seeds: s.players.slice(0, 8).map((p) => p.id),
    matches: [
      { id: 'bk-s1', round: 'semi', board: 1, label: 'Demi-finale A', playerIds: [id(0), id(2), id(5), id(7)], status: 'pending', places: null, loserGames: null, scoredAt: null, claims: [] },
      { id: 'bk-s2', round: 'semi', board: 2, label: 'Demi-finale B', playerIds: [id(1), id(3), id(4), id(6)], status: 'pending', places: null, loserGames: null, scoredAt: null, claims: [] },
      { id: 'bk-f', round: 'final', board: 1, label: 'Finale', playerIds: [], status: 'waiting', places: null, loserGames: null, scoredAt: null, claims: [] },
    ],
  };
  return s;
}

function mkWinner(anchor: number): TournamentPublicState {
  const s = mkSemis(anchor);
  s.phase = 'final';
  s.ended = false;
  s.status = 'end';
  s.finishedAt = anchor;
  s.bracketWinnerId = s.players[0].id;
  const finale = s.bracket?.matches.find((m) => m.round === 'final');
  if (finale) {
    finale.playerIds = s.players.slice(0, 4).map((p) => p.id);
    finale.places = s.players.slice(0, 4).map((p) => p.id);
    finale.status = 'done';
  }
  return s;
}

/** Smash : 5 joueurs, 1 match en cours, 1 en file, 1 assis */
function sbWave(anchor: number): TournamentPublicState {
  const list = players(5, anchor);
  const id = (i: number) => list[i].id;
  const s = base(
    {
      title: 'Tournoi Smash Bros',
      format: 'waves',
      formatLabel: 'Salves',
      game: 'smash',
      gameLabel: 'Smash Bros',
      joinCode: 'SMSH',
      phase: 'wave',
      players: list,
      playerCount: 5,
      standings: ranked(list, [2, 1, 1, 0, 0]),
      waves: [
        {
          number: 3,
          kind: 'pool',
          startedAt: anchor - 30_000,
          finishedAt: null,
          grouping: 'swiss',
          parallel: 1,
          sitOuts: [id(4)],
          groups: [waveGroup(3, 1, [id(0), id(3)], 'playing'), waveGroup(3, 2, [id(1), id(2)], 'queued')],
        },
      ],
    },
    anchor,
  );
  s.config = { ...s.config, groupSize: 2, parallelSlots: 1, poolWinPoints: 1, plannedRounds: 4 };
  return s;
}

function sbBracket(anchor: number): TournamentPublicState {
  const list = players(8, anchor);
  const id = (i: number) => list[i].id;
  const pair = (board: number, a: number, b: number, label: string) => ({
    id: `bk-q${board}`,
    round: 'qf' as const,
    board,
    label,
    playerIds: [id(a), id(b)],
    status: 'pending' as const,
    places: null,
    loserGames: null,
    scoredAt: null,
    claims: [],
  });
  const s = base(
    {
      title: 'Tournoi Smash Bros',
      format: 'waves',
      formatLabel: 'Salves',
      game: 'smash',
      gameLabel: 'Smash Bros',
      joinCode: 'SMSH',
      phase: 'bracket',
      players: list,
      playerCount: 8,
      standings: ranked(list, [4, 3, 3, 2, 2, 1, 1, 0]),
      bracket: {
        seeding: 'seeded',
        startedAt: anchor,
        seeds: list.map((p) => p.id),
        matches: [
          pair(1, 0, 7, '1er contre 8e'),
          pair(2, 1, 6, '2e contre 7e'),
          pair(3, 2, 5, '3e contre 6e'),
          pair(4, 3, 4, '4e contre 5e'),
          { id: 'bk-sf1', round: 'sf', board: 1, label: 'Demi-finale', playerIds: [], status: 'waiting', places: null, loserGames: null, scoredAt: null, claims: [] },
          { id: 'bk-sf2', round: 'sf', board: 2, label: 'Demi-finale', playerIds: [], status: 'waiting', places: null, loserGames: null, scoredAt: null, claims: [] },
          { id: 'bk-f', round: 'final', board: 1, label: 'Finale', playerIds: [], status: 'waiting', places: null, loserGames: null, scoredAt: null, claims: [] },
        ],
      },
    },
    anchor,
  );
  s.config = { ...s.config, groupSize: 2, parallelSlots: 2, poolWinPoints: 1 };
  return s;
}

/** MK : inscriptions ouvertes (console et écrans) */
function mkLobby(anchor: number): TournamentPublicState {
  const s = mkWave(anchor);
  return {
    ...s,
    status: 'lobby',
    phase: 'registration',
    waves: [],
    standings: ranked(s.players, []),
    startedAt: null,
    phaseStartedAt: anchor - 2 * 60_000,
    phaseEndsAt: anchor + 4 * 60_000 + 12_000,
  };
}

/** MK : salve 2 terminée, le GM choisit la suite (salve, barrage, tableau) */
function mkDone(anchor: number): TournamentPublicState {
  const s = mkWave(anchor);
  s.phase = 'wave_done';
  s.waves[0].finishedAt = anchor;
  s.waves[0].groups = s.waves[0].groups.map((g) => ({
    ...g,
    status: 'done',
    places: g.playerIds,
    scoredAt: anchor,
    points: Object.fromEntries(g.playerIds.map((id, i) => [id, s.config.placementPoints[i] ?? 0])),
  }));
  return s;
}

/** Smash : quarts, un joueur a proposé son résultat */
function sbBracketClaim(anchor: number): TournamentPublicState {
  const s = sbBracket(anchor);
  const m = s.bracket?.matches[0];
  if (m) m.claims = [{ playerId: m.playerIds[0], places: [m.playerIds[0], m.playerIds[1]], loserGames: 1, at: anchor - 15_000 }];
  const done = s.bracket?.matches[1];
  if (done) {
    done.status = 'done';
    done.places = [done.playerIds[1], done.playerIds[0]];
    done.loserGames = 2;
    done.scoredAt = anchor - 60_000;
  }
  return s;
}

const DRAW_SAUTS: Array<[string, number]> = [
  ['Titre', 0],
  ['Matchs', 6_000],
  ['Tout', 14_000],
];

export const TOURNAMENT_SURFACES: Array<{ cle: TournamentLabSurface; label: string }> = [
  { cle: 'projo', label: 'Projecteur' },
  { cle: 'bar', label: 'TV du bar' },
  { cle: 'joueur', label: 'Téléphone' },
  { cle: 'gm', label: 'Game Master' },
  { cle: 'table', label: 'Tables (échecs)' },
];

export const TOURNAMENT_SCENARIOS: TournamentLabScenario[] = [
  // ---- projecteur
  { cle: 't-projo-lobby', surface: 'projo', label: 'Inscriptions', description: '18 inscrits, compte à rebours', state: (a) => lobby(a, 18) },
  { cle: 't-projo-lobby-vide', surface: 'projo', label: 'Inscriptions (vide)', description: 'Personne encore', state: (a) => lobby(a, 0) },
  { cle: 't-projo-attente', surface: 'projo', label: 'En attente de joueurs', description: 'Compte à zéro, 1 inscrit', state: (a) => lobby(a, 1, { waitingForPlayers: true, phaseEndsAt: null }) },
  {
    cle: 't-projo-tirage', surface: 'projo', label: 'Tirage de la ronde 3', description: 'Matchs révélés un par un + exempt',
    state: (a) => {
      const s = midTournament(a, a, 13);
      const r = s.rounds[2];
      r.matches = r.matches.map((m) => ({ ...m, status: 'pending', result: null, games: [], live: null, points: { a: 0, b: 0 }, score: { a: 0, b: 0 } }));
      r.waiting = 'p13';
      return s;
    },
    sauts: DRAW_SAUTS,
  },
  {
    cle: 't-projo-rotation', surface: 'projo', label: 'Rotation de ronde', description: 'Classement, matchs, direct (vrai tempo)',
    state: (a) => afterDraw(midTournament(a, a, 13), a),
    sauts: [['Classement', 0], ['Matchs', 8_500], ['Direct 1', 16_500], ['Direct 2', 61_500]],
  },
  {
    cle: 't-projo-40', surface: 'projo', label: '40 joueurs', description: 'Classement et matchs sur deux pages',
    state: (a) => afterDraw(bigTournament(a), a),
    sauts: [['Classement 1', 0], ['Classement 2', 8_500], ['Matchs 1', 16_500], ['Matchs 2', 24_500], ['Direct', 32_500]],
  },
  {
    cle: 't-projo-fin-ronde', surface: 'projo', label: 'Fin de ronde', description: 'Résultats et classement, attente du GM',
    state: (a) => {
      const s = midTournament(a, a - 20 * 60_000, 13, true);
      s.rounds[2].finishedAt = a;
      return s;
    },
    sauts: [['Résultats', 0], ['Classement', 8_500]],
  },
  { cle: 't-projo-final', surface: 'projo', label: 'Podium final', description: '3e, 2e puis 1er', state: (a) => finalState(a), sauts: [['3e', 1_600], ['2e', 4_100], ['1er', 8_100], ['Classement', 17_000]] },
  // ---- TV du bar
  { cle: 't-bar-inscriptions', surface: 'bar', label: 'Inscriptions', description: 'QR + compte à rebours', state: (a) => lobby(a, 18) },
  { cle: 't-bar-ronde', surface: 'bar', label: 'Tournoi en cours', description: 'QR pour la ronde suivante', state: (a) => midTournament(a, a - 60_000, 13) },
  { cle: 't-bar-final', surface: 'bar', label: 'Podium', description: 'Le QR laisse place au podium', state: (a) => finalState(a) },
  // ---- téléphone
  { cle: 't-tel-inscription', surface: 'joueur', label: 'Inscription', description: 'Saisie du pseudo', state: (a) => lobby(a, 18), you: null },
  { cle: 't-tel-inscrit', surface: 'joueur', label: 'Inscrit', description: 'Compte à rebours', state: (a) => lobby(a, 18), you: 'p5' },
  { cle: 't-tel-blancs', surface: 'joueur', label: 'Match à jouer (blancs)', description: 'Crée la partie', state: (a) => midTournament(a, a - 60_000, 13), you: 'p9' },
  { cle: 't-tel-noirs', surface: 'joueur', label: 'Match à jouer (noirs)', description: 'Rejoins la partie', state: (a) => midTournament(a, a - 60_000, 13), you: 'p8' },
  { cle: 't-tel-encours', surface: 'joueur', label: 'Partie en cours', description: 'Bonne chance !', state: (a) => midTournament(a, a - 60_000, 13), you: 'p1' },
  { cle: 't-tel-exempt', surface: 'joueur', label: 'Exempt', description: 'Attend un joueur libéré', state: (a) => midTournament(a, a - 60_000, 13), you: 'p13' },
  {
    cle: 't-tel-bonus', surface: 'joueur', label: 'Partie bonus', description: "Adversaire attribué à l'exempt",
    state: (a) => {
      const s = midTournament(a, a - 60_000, 13);
      const r = s.rounds[2];
      r.waiting = null;
      r.matches.push(match(3, 7, 'p13', 'p2', 'pending', a, 'floater'));
      return s;
    },
    you: 'p2',
  },
  { cle: 't-tel-resultat', surface: 'joueur', label: 'Match gagné', description: 'Attente de la fin de ronde', state: (a) => midTournament(a, a - 60_000, 13), you: 'p12' },
  {
    cle: 't-tel-retard', surface: 'joueur', label: 'Arrivé en cours', description: 'Joue à la ronde suivante',
    state: (a) => {
      const s = midTournament(a, a - 60_000, 13);
      s.players.push({ id: 'p99', pseudo: 'Toi', status: 'active', seq: 99, joinedAt: a });
      s.standings = standings(s.players, s.rounds);
      s.playerCount += 1;
      return s;
    },
    you: 'p99',
  },
  {
    cle: 't-tel-parti', surface: 'joueur', label: 'A quitté', description: 'Peut revenir',
    state: (a) => {
      const s = midTournament(a, a - 60_000, 13);
      s.players = s.players.map((p) => (p.id === 'p4' ? { ...p, status: 'left' } : p));
      s.standings = standings(s.players, s.rounds);
      return s;
    },
    you: 'p4',
  },
  { cle: 't-tel-classement', surface: 'joueur', label: 'Onglet classement', description: 'Top 8 + ma ligne', state: (a) => bigTournament(a), you: 'p30', tab: 'classement' },
  { cle: 't-tel-matchs', surface: 'joueur', label: 'Onglet mes matchs', description: 'Historique', state: (a) => midTournament(a, a - 60_000, 13), you: 'p1', tab: 'matchs' },
  { cle: 't-tel-final', surface: 'joueur', label: 'Final', description: 'Rang et podium', state: (a) => finalState(a), you: 'p4' },
  // ---- console
  { cle: 't-gm-inscriptions', surface: 'gm', label: 'Inscriptions', description: 'Démarrer, ajouter du temps', state: (a) => lobby(a, 18) },
  { cle: 't-gm-ronde', surface: 'gm', label: 'Ronde en cours', description: 'Matchs, exempt, alertes', state: (a) => midTournament(a, a - 60_000, 13) },
  { cle: 't-gm-fin-ronde', surface: 'gm', label: 'Fin de ronde', description: 'Ronde suivante ou fin', state: (a) => midTournament(a, a - 20 * 60_000, 13, true) },
  { cle: 't-gm-final', surface: 'gm', label: 'Podium', description: 'Libérer les écrans', state: (a) => finalState(a) },
  { cle: 't-gm-formulaire', surface: 'gm', label: 'Nouvel événement', description: 'Formulaire de config', state: (a) => lobby(a, 0) },
  // ---- Mario Kart / Smash
  { cle: 't-projo-mk-salve', surface: 'projo', label: 'MK salve et file', description: '2 courses en cours, 1 groupe à suivre', state: (a) => mkWave(a) },
  { cle: 't-projo-mk-demies', surface: 'projo', label: 'MK demies', description: 'Deux groupes de 4, finale à venir', state: (a) => mkSemis(a) },
  { cle: 't-projo-mk-vainqueur', surface: 'projo', label: 'MK vainqueur', description: 'Trophée', state: (a) => mkWinner(a) },
  { cle: 't-bar-mk-salve', surface: 'bar', label: 'MK salve', description: 'Groupes, file et QR', state: (a) => mkWave(a) },
  { cle: 't-projo-sb-salve', surface: 'projo', label: 'Smash salve', description: '1 match, 1 en file, 1 assis', state: (a) => sbWave(a) },
  { cle: 't-projo-sb-quarts', surface: 'projo', label: 'Smash quarts', description: '1 contre 8, 2 contre 7, 3 contre 6, 4 contre 5', state: (a) => sbBracket(a) },
  { cle: 't-gm-mk-salve', surface: 'gm', label: 'MK saisie', description: 'Ordre des arrivées et file', state: (a) => mkWave(a) },
  { cle: 't-gm-mk-conflit', surface: 'gm', label: 'MK saisies contradictoires', description: 'Deux ordres, la dernière est en bas, le GM tranche', state: (a) => mkConflict(a) },
  { cle: 't-tel-mk-groupe', surface: 'joueur', label: 'MK mon groupe', description: 'Le joueur saisit l’ordre de son groupe', state: (a) => mkWave(a), you: 'p1' },
  { cle: 't-tel-mk-file', surface: 'joueur', label: 'MK en file', description: 'Pas de saisie tant que le groupe n’est pas sur la piste', state: (a) => mkWave(a), you: 'p3' },
  { cle: 't-tel-mk-attente', surface: 'joueur', label: 'MK en attente', description: 'Proposition envoyée, une autre ne concorde pas, l’animateur tranche', state: (a) => mkWaiting(a), you: 'p1' },
  { cle: 't-tel-sb-vainqueur', surface: 'joueur', label: 'Smash vainqueur', description: 'Le joueur propose qui a gagné la poule', state: (a) => sbWave(a), you: 'p1' },
  { cle: 't-tel-sb-assis', surface: 'joueur', label: 'Smash assis', description: 'Le joueur impair ne saisit rien cette salve', state: (a) => sbWave(a), you: 'p5' },
  { cle: 't-tel-sb-elim', surface: 'joueur', label: 'Smash 3-0', description: 'Élimination : vainqueur puis 3-0, 3-1 ou 3-2', state: (a) => sbBracket(a), you: 'p1' },
  { cle: 't-gm-lanceur', surface: 'gm', label: 'Lanceur', description: 'Trois lancements, modèles, événements passés', state: (a) => lobby(a, 0) },
  { cle: 't-gm-mk-inscriptions', surface: 'gm', label: 'MK inscriptions', description: 'Compte à rebours, réglages de salve', state: (a) => mkLobby(a) },
  { cle: 't-gm-mk-suite', surface: 'gm', label: 'MK fin de salve', description: 'Salve suivante, barrage ou phase finale', state: (a) => mkDone(a) },
  { cle: 't-gm-sb-tableau', surface: 'gm', label: 'Smash tableau', description: 'Quarts, une proposition à valider', state: (a) => sbBracketClaim(a) },
  { cle: 't-projo-mk-classement', surface: 'projo', label: 'MK fin de salve', description: 'Classement après la salve', state: (a) => mkDone(a) },
  { cle: 't-bar-sb-tableau', surface: 'bar', label: 'Smash tableau', description: 'Tableau sur la TV du comptoir', state: (a) => sbBracketClaim(a) },
  { cle: 't-bar-mk-vainqueur', surface: 'bar', label: 'MK vainqueur', description: 'Champion sur la TV du comptoir', state: (a) => mkWinner(a) },
  // ---- tables
  { cle: 't-table-pastilles', surface: 'table', label: 'Pastilles tournoi', description: 'Modales, partie, récap', state: (a) => midTournament(a, a - 60_000, 13) },
];

/** vue console : état public + bloc GM plausible */
export function labGmState(state: TournamentPublicState): TournamentGmState {
  const round = state.rounds[state.rounds.length - 1];
  const liveInfo: TournamentGmState['gm']['liveInfo'] = {};
  for (const m of round?.matches ?? []) {
    if (m.live) liveInfo[m.live.ref] = { status: 'playing', lastMoveAt: Date.now() - (m.board === 3 ? 13 * 60_000 : 40_000), moves: 18 + m.board };
  }
  const alerts: string[] = [];
  if (state.phase === 'round' && round?.waiting) {
    alerts.push(`${state.players.find((p) => p.id === round.waiting)?.pseudo ?? '?'} est exempt : il recevra un joueur du premier match terminé.`);
  }
  if (state.phase === 'round' && round?.matches.some((m) => m.board === 3 && m.live)) {
    alerts.push('Partie figée : Zoé contre Hugo, dernier coup il y a 13 min.');
  }
  const wave = state.waves[state.waves.length - 1];
  if (wave) {
    const file = wave.groups.filter((g) => g.status === 'queued').length;
    if (file > 0) alerts.push(`${file} groupe${file > 1 ? 's' : ''} en file : ils s’affichent « à suivre » sur les écrans.`);
    if (wave.sitOuts.length > 0) alerts.push('Un joueur ne joue pas cette salve. Il marque 0 et revient à la suivante.');
    for (const g of wave.groups) {
      if (g.places || g.status !== 'playing' || g.claims.length === 0) continue;
      const last = g.claims[g.claims.length - 1];
      const name = state.players.find((p) => p.id === last.playerId)?.pseudo ?? '?';
      const letter = String.fromCharCode(64 + g.board);
      const sig = (c: (typeof g.claims)[number]) => c.places.join(',');
      const conflict = g.claims.some((c) => sig(c) !== sig(g.claims[0]));
      alerts.push(
        conflict
          ? `Saisies contradictoires sur le groupe ${letter}. Dernière proposition : ${name}. À trancher.`
          : `${name} a saisi le groupe ${letter}. À valider.`,
      );
    }
  }
  if (state.phase === 'bracket' && state.bracket) {
    for (const m of state.bracket.matches) {
      if (m.places || m.status !== 'pending' || m.claims.length === 0) continue;
      const last = m.claims[m.claims.length - 1];
      const name = state.players.find((p) => p.id === last.playerId)?.pseudo ?? '?';
      alerts.push(`${name} a saisi ${m.label.toLowerCase()}. À valider.`);
    }
  }
  return {
    ...state,
    gm: {
      roster: state.players.map((p, i) => ({ id: p.id, pseudo: p.pseudo, status: p.status, device: i === 5 ? 'gm' : 'mobile', gmAdded: i === 5, joinedAt: p.joinedAt })),
      adjustments: state.phase === 'registration' ? {} : { p3: [{ delta: 1, reason: 'fair-play', at: new Date().toISOString() }] },
      ignored: [],
      countedGames: state.rounds.reduce((s, r) => s + r.matches.filter((m) => m.games.length > 0).length, 0),
      liveInfo,
      alerts,
      lastMutationAt: Date.now(),
      templateId: null,
    },
  };
}
