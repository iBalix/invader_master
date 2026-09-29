/**
 * Tournoi (gestionnaire d'événements) : types du module.
 *
 * Un tournoi est une session du moteur commun (mode 'tournament'). Comme aux
 * échecs, les statuts de session restent lobby / playing / end : la
 * sous-phase (inscriptions, ronde en cours, fin de ronde, final) vit dans
 * runtime.tournament.phase. Un statut inconnu rendrait muet tout bundle
 * resté en cache (leçon des échecs).
 *
 * L'état est AUTONOME : l'advancer du moteur est synchrone et ne peut pas
 * lire game_players. Le roster porte donc tout ce qu'il faut pour apparier.
 * game_players ne sert qu'au jeton du téléphone et à l'unicité du pseudo.
 */

import { DEFAULT_CONFIG, type SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Configuration (figée à la création depuis le modèle)
// ---------------------------------------------------------------------------

export type TournamentFormat = 'swiss';
export type TournamentGameId = 'chess';
/** best_of : le match s'arrête dès qu'un joueur a la majorité ; all : toutes les parties */
export type MatchDecide = 'best_of' | 'all';
/** barème appliqué au résultat du match, ou à chaque partie */
export type MatchScoring = 'match' | 'game';
/** floater : l'exempt attend un joueur libéré ; points : il est crédité d'office */
export type ByePolicy = 'floater' | 'points';

export interface TournamentPoints {
  win: number;
  draw: number;
  loss: number;
  /** victoire par forfait (adversaire parti avant de jouer) */
  forfeit: number;
  /** exempt crédité d'office (politique 'points' ou exempt accordé par le GM) */
  bye: number;
}

export interface TournamentConfig {
  title: string;
  templateId: string | null;
  templateName: string | null;
  format: TournamentFormat;
  game: TournamentGameId;
  /** compte à rebours avant la ronde 1, en minutes */
  registrationMin: number;
  /** inscription possible pendant le tournoi (entrée à la ronde suivante) */
  lateJoin: boolean;
  /** affichage « Ronde 2/5 », n'arrête rien */
  plannedRounds: number | null;
  match: { games: number; decide: MatchDecide; scoring: MatchScoring };
  points: TournamentPoints;
  byePolicy: ByePolicy;
  /** rotation du projecteur : classement, matchs de la ronde, match en direct */
  display: { standingsMs: number; roundMs: number; liveMs: number };
  wifiSsid: string;
  wifiPassword: string;
  texts: { winner: string };
  /**
   * Tournoi de TEST : ni bascule des écrans, ni /current, ni blocage du quiz,
   * et invisible pour les tables de production (cf. TOURNAMENT_SCOPE).
   */
  testMode: boolean;
}

export const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  title: 'Tournoi',
  templateId: null,
  templateName: null,
  format: 'swiss',
  game: 'chess',
  registrationMin: 10,
  lateJoin: true,
  plannedRounds: null,
  match: { games: 1, decide: 'best_of', scoring: 'match' },
  points: { win: 2, draw: 1, loss: 0, forfeit: 2, bye: 2 },
  byePolicy: 'floater',
  display: { standingsMs: 30_000, roundMs: 30_000, liveMs: 180_000 },
  wifiSsid: DEFAULT_CONFIG.wifiSsid,
  wifiPassword: DEFAULT_CONFIG.wifiPassword,
  texts: { winner: 'Bravo #winner# !' },
  testMode: false,
};

// ---------------------------------------------------------------------------
// État (runtime.tournament)
// ---------------------------------------------------------------------------

export type TournamentPhase = 'registration' | 'round' | 'round_done' | 'final';
export type RosterStatus = 'active' | 'left' | 'excluded';
export type Side = 'a' | 'b';
export type ChessSide = 'w' | 'b';

export interface RosterEntry {
  pseudo: string;
  /** pseudo sans accents, casse ni espaces multiples : c'est lui qu'on compare */
  key: string;
  status: RosterStatus;
  joinedAt: string;
  /** ordre d'inscription, dernier critère de départage */
  seq: number;
  device: string;
  /** inscrit par le GM, sans téléphone : un téléphone peut le reprendre */
  gmAdded?: boolean;
}

export type MatchKind = 'normal' | 'bye' | 'floater';
export type MatchStatus = 'pending' | 'playing' | 'done' | 'cancelled';
export type MatchResult = 'a' | 'b' | 'draw' | 'forfeit_a' | 'forfeit_b' | 'bye' | 'cancelled';

export interface MatchGame {
  /** null = partie nulle */
  winner: Side | null;
  source: 'auto' | 'gm';
  /** id de la partie d'échecs (null pour une saisie GM) */
  ref: string | null;
  /** raison de fin côté jeu (checkmate, resign...) */
  reason: string | null;
  /** couleur réellement jouée par a (équilibre des couleurs des rondes suivantes) */
  colorA: ChessSide | null;
  at: string;
}

export interface TournamentMatch {
  /** r2m3 (normal), r2f1 (bonus de l'exempt), r2b (exempt crédité) */
  id: string;
  round: number;
  /** numéro affiché (« Match 3 ») */
  board: number;
  a: string;
  b: string | null;
  kind: MatchKind;
  /** couleur conseillée de a (le joueur blanc crée la partie) */
  colorA: ChessSide | null;
  games: MatchGame[];
  /** partie en cours (alimente le projecteur) */
  live: { ref: string; since: string } | null;
  status: MatchStatus;
  result: MatchResult | null;
  points: { a: number; b: number };
  /** résultat posé par le GM : les remontées automatiques sont ignorées */
  gmLocked: boolean;
  /** revanche imposée faute d'autre solution (signalée au GM) */
  rematch: boolean;
  decidedAt: string | null;
}

export interface TournamentRound {
  number: number;
  startedAt: string;
  finishedAt: string | null;
  /** exempt qui attend encore son adversaire (politique floater) */
  waiting: string | null;
  /** exempt de la ronde, même après attribution (rotation des exemptions) */
  byePlayer: string | null;
  matches: TournamentMatch[];
}

export interface ScoreAdjustment {
  delta: number;
  reason: string;
  at: string;
}

export interface StandingRow {
  playerId: string;
  pseudo: string;
  rank: number;
  /** ex æquo complet avec la ligne précédente (même rang affiché « = ») */
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

export type FeedKind = 'result' | 'join' | 'floater' | 'round' | 'leave' | 'final';

export interface FeedEntry {
  seq: number;
  kind: FeedKind;
  text: string;
  at: string;
  matchId?: string;
}

export type CloseReason = 'close' | 'abort' | 'final_ttl' | 'preempted' | 'idle';

export interface IgnoredGame {
  ref: string;
  reason: string;
  at: string;
}

export interface TournamentState {
  phase: TournamentPhase;
  roster: Record<string, RosterEntry>;
  rosterSeq: number;
  rounds: TournamentRound[];
  adjustments: Record<string, ScoreAdjustment[]>;
  standings: StandingRow[];
  /** parties déjà comptées (idempotence des remontées) */
  countedRefs: string[];
  /** parties annulées ou réécrites par le GM : jamais recomptées */
  voidRefs: string[];
  /** remontées écartées (match déjà décidé, verrou GM...), pour l'historique */
  ignored: IgnoredGame[];
  feed: FeedEntry[];
  feedSeq: number;
  /** vue imposée au projecteur par le GM */
  pin: { view: 'standings' | 'round' | 'match'; matchId: string | null; until: string } | null;
  /** compte à rebours écoulé avec moins de 2 joueurs : on attend le GM */
  waitingForPlayers: boolean;
  lastMutationAt: string;
  finishedAt: string | null;
  closeReason: CloseReason | null;
}

export function tournamentStateOf(session: SessionRow): TournamentState {
  const state = (session.runtime as { tournament?: TournamentState }).tournament;
  if (!state) {
    throw Object.assign(new Error('Session sans état tournoi'), { httpStatus: 500 });
  }
  return state;
}

export function tournamentConfigOf(session: SessionRow): TournamentConfig {
  return session.config as unknown as TournamentConfig;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const TOURNAMENT_MAX_PLAYERS = 64;
/** le podium reste à l'écran, puis les écrans reviennent seuls à leur défaut */
export const TOURNAMENT_FINAL_TTL_MS = 30 * 60_000;
/** tournoi oublié : clos par le réconciliateur après cette durée sans mutation */
export const TOURNAMENT_IDLE_TTL_MS = 12 * 60 * 60_000;
/** borne de calcul du retour arrière des appariements */
export const PAIRING_STEP_LIMIT = 50_000;
export const FEED_MAX = 12;
export const IGNORED_MAX = 40;
/** rattrapage des résultats d'échecs manqués (redéploiement, conflit) */
export const RECONCILE_INTERVAL_MS = 20_000;

export function httpErr(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}
