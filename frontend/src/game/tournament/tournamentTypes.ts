/**
 * Tournoi : types miroir de la vue publique (backend/src/games/tournament/
 * tournamentViews.ts). Toute la vue voyage dans le signal 'sync' : écrans et
 * téléphones peignent directement l'instantané reçu.
 */

export type TournamentPhase =
  | 'registration'
  | 'round'
  | 'round_done'
  | 'wave'
  | 'wave_done'
  | 'barrage'
  | 'bracket'
  | 'final';
export type WaveGrouping = 'swiss' | 'random';
export type BracketSeeding = 'seeded' | 'random';
export type RosterStatus = 'active' | 'left' | 'excluded';
export type ChessSide = 'w' | 'b';
export type Side = 'a' | 'b';
export type MatchKind = 'normal' | 'bye' | 'floater';
export type MatchStatus = 'pending' | 'playing' | 'done' | 'cancelled';
export type MatchResult = 'a' | 'b' | 'draw' | 'forfeit_a' | 'forfeit_b' | 'bye' | 'cancelled';

export interface TPlayer {
  id: string;
  pseudo: string;
  status: RosterStatus;
  seq: number;
  joinedAt: number | null;
}

export interface TStanding {
  playerId: string;
  pseudo: string;
  rank: number;
  tied: boolean;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  buchholz: number;
  adjustment: number;
  byes: number;
  status: RosterStatus;
}

export interface TGame {
  winner: Side | null;
  source: 'auto' | 'gm';
  reason: string | null;
  colorA: ChessSide | null;
  ref: string | null;
  at: number | null;
}

export interface TMatch {
  id: string;
  round: number;
  board: number;
  a: string;
  b: string | null;
  kind: MatchKind;
  colorA: ChessSide | null;
  status: MatchStatus;
  result: MatchResult | null;
  points: { a: number; b: number };
  score: { a: number; b: number };
  games: TGame[];
  live: { ref: string; since: string } | null;
  gmLocked: boolean;
  rematch: boolean;
  decidedAt: number | null;
}

export interface TRound {
  number: number;
  startedAt: number | null;
  finishedAt: number | null;
  waiting: string | null;
  byePlayer: string | null;
  matches: TMatch[];
}

export interface TWaveGroup {
  id: string;
  wave: number;
  board: number;
  playerIds: string[];
  status: 'queued' | 'playing' | 'done';
  places: string[] | null;
  points: Record<string, number>;
  counts: boolean;
  scoredAt: number | null;
}

export interface TWave {
  number: number;
  kind: 'pool' | 'barrage';
  startedAt: number | null;
  finishedAt: number | null;
  grouping: WaveGrouping;
  parallel: number;
  sitOuts: string[];
  groups: TWaveGroup[];
}

export interface TBracketMatch {
  id: string;
  round: 'qf' | 'sf' | 'semi' | 'final';
  board: number;
  label: string;
  playerIds: string[];
  status: 'waiting' | 'pending' | 'done';
  places: string[] | null;
  loserGames: 0 | 1 | 2 | null;
  scoredAt: number | null;
}

export interface TBracket {
  seeding: BracketSeeding;
  startedAt: number | null;
  seeds: string[];
  matches: TBracketMatch[];
}

export interface TFeed {
  seq: number;
  kind: 'result' | 'join' | 'floater' | 'round' | 'leave' | 'final';
  text: string;
  at: number | null;
  matchId?: string;
}

export interface TournamentConfigView {
  registrationMin: number;
  lateJoin: boolean;
  plannedRounds: number | null;
  match: { games: number; decide: 'best_of' | 'all'; scoring: 'match' | 'game' };
  points: { win: number; draw: number; loss: number; forfeit: number; bye: number };
  byePolicy: 'floater' | 'points';
  groupSize: number;
  placementPoints: number[];
  poolWinPoints: number;
  grouping: WaveGrouping;
  parallelSlots: number;
  display: { standingsMs: number; roundMs: number; liveMs: number };
  wifiSsid: string;
  wifiPassword: string;
  texts: { winner: string };
  testMode: boolean;
}

export interface TournamentPublicState {
  id: string;
  joinCode: string;
  mode: 'tournament';
  status: 'lobby' | 'playing' | 'end';
  v: number;
  serverNow: number;
  createdAt: number | null;
  startedAt: number | null;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  ended: boolean;
  title: string;
  format: string;
  formatLabel: string;
  game: string;
  gameLabel: string;
  config: TournamentConfigView;
  phase: TournamentPhase;
  waitingForPlayers: boolean;
  players: TPlayer[];
  playerCount: number;
  standings: TStanding[];
  rounds: TRound[];
  currentRound: number | null;
  waves: TWave[];
  bracket: TBracket | null;
  bracketWinnerId: string | null;
  feed: TFeed[];
  pin: { view: 'standings' | 'round' | 'match'; matchId: string | null; until: number | null } | null;
  finishedAt: number | null;
  closeReason: string | null;
}

export interface TournamentYou {
  playerId: string;
  pseudo: string;
  status: RosterStatus;
}

export interface LiveGameInfo {
  status: string;
  lastMoveAt: number | null;
  moves: number;
}

export interface TournamentGmState extends TournamentPublicState {
  gm: {
    roster: Array<{ id: string; pseudo: string; status: RosterStatus; device: string; gmAdded: boolean; joinedAt: number | null }>;
    adjustments: Record<string, Array<{ delta: number; reason: string; at: string }>>;
    ignored: Array<{ ref: string; reason: string; at: string }>;
    countedGames: number;
    liveInfo: Record<string, LiveGameInfo>;
    alerts: string[];
    lastMutationAt: number | null;
    templateId: string | null;
  };
}

/** config complète telle qu'enregistrée dans un modèle (formulaire de la console) */
export interface TournamentConfigInput {
  title: string;
  format: 'swiss' | 'waves';
  game: 'chess' | 'mariokart' | 'smash';
  registrationMin: number;
  lateJoin: boolean;
  plannedRounds: number | null;
  match: { games: number; decide: 'best_of' | 'all'; scoring: 'match' | 'game' };
  points: { win: number; draw: number; loss: number; forfeit: number; bye: number };
  byePolicy: 'floater' | 'points';
  groupSize: number;
  placementPoints: number[];
  poolWinPoints: number;
  grouping: WaveGrouping;
  parallelSlots: number;
  display: { standingsMs: number; roundMs: number; liveMs: number };
  wifiSsid: string;
  wifiPassword: string;
  texts: { winner: string };
  testMode: boolean;
}

export const DEFAULT_TOURNAMENT_INPUT: TournamentConfigInput = {
  title: 'Tournoi d\'échecs',
  format: 'swiss',
  game: 'chess',
  registrationMin: 10,
  lateJoin: true,
  plannedRounds: null,
  match: { games: 1, decide: 'best_of', scoring: 'match' },
  points: { win: 2, draw: 1, loss: 0, forfeit: 2, bye: 2 },
  byePolicy: 'floater',
  groupSize: 2,
  placementPoints: [4, 3, 2, 1],
  poolWinPoints: 1,
  grouping: 'swiss',
  parallelSlots: 1,
  display: { standingsMs: 8_000, roundMs: 8_000, liveMs: 45_000 },
  wifiSsid: 'INVADER BAR',
  wifiPassword: '',
  texts: { winner: 'Bravo #winner# !' },
  testMode: false,
};

/** trois lancements d'un geste. Le détail reste modifiable ensuite sur la console. */
export const LAUNCH_PRESETS: Array<{ id: string; label: string; name: string; detail: string; config: TournamentConfigInput }> = [
  {
    id: 'chess',
    label: "Lancement tournoi d'échecs",
    name: "Tournoi d'échecs",
    detail: 'Rondes suisses, résultats remontés des tables. Projecteur et TV du comptoir ensemble.',
    config: { ...DEFAULT_TOURNAMENT_INPUT, title: "Tournoi d'échecs" },
  },
  {
    id: 'mk',
    label: 'Lancement tournoi Mario Kart',
    name: 'Tournoi Mario Kart',
    detail: 'Groupes de 4 max (3 s’il le faut), barème 4/3/2/1, 2 courses en même temps.',
    config: {
      ...DEFAULT_TOURNAMENT_INPUT,
      title: 'Tournoi Mario Kart',
      format: 'waves',
      game: 'mariokart',
      plannedRounds: 3,
      groupSize: 4,
      placementPoints: [4, 3, 2, 1],
      grouping: 'swiss',
      parallelSlots: 2,
      points: { win: 4, draw: 3, loss: 2, forfeit: 1, bye: 0 },
    },
  },
  {
    id: 'sb',
    label: 'Lancement tournoi Smash Bros',
    name: 'Tournoi Smash Bros',
    detail: 'Matchs à 2, 1 point par victoire en poules. 3-0, 3-1 ou 3-2 seulement en phase finale.',
    config: {
      ...DEFAULT_TOURNAMENT_INPUT,
      title: 'Tournoi Smash Bros',
      format: 'waves',
      game: 'smash',
      plannedRounds: 3,
      groupSize: 2,
      poolWinPoints: 1,
      grouping: 'swiss',
      parallelSlots: 2,
      points: { win: 1, draw: 0, loss: 0, forfeit: 1, bye: 0 },
    },
  },
];

export interface CompetitionTemplate {
  id: string;
  name: string;
  mode: string;
  config: Partial<TournamentConfigInput>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}
