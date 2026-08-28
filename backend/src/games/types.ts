/**
 * Moteur de jeu — types partagés (modes quiz / battle / chess)
 */

export type GameMode = 'quiz' | 'battle' | 'chess' | 'blackjack';

export type QuizStatus =
  | 'lobby'
  | 'rules'
  | 'announce'
  | 'question'
  | 'locked'
  | 'reveal'
  | 'leaderboard'
  | 'cinematic'
  | 'pause'
  | 'rewards'
  | 'end';

export type BattleStatus =
  | 'lobby'
  | 'rules'
  | 'round_intro'
  | 'announce'
  | 'question'
  | 'locked'
  | 'verdict'
  | 'reveal'
  | 'round_end'
  | 'pause'
  | 'closing'
  | 'end';

/** échecs : pas de phases de questions, 3 états suffisent (le détail vit dans runtime.chess) */
export type ChessSessionStatus = 'lobby' | 'playing' | 'end';

/** blackjack : phases d'une manche, le détail vit dans runtime.blackjack */
export type BlackjackStatus =
  | 'lobby'
  | 'intro'
  | 'betting'
  | 'dealing'
  | 'acting'
  | 'dealer'
  | 'payout'
  | 'end';

export type GameStatus = QuizStatus | BattleStatus | ChessSessionStatus | BlackjackStatus;

export type QuestionType = 'qcm' | 'estimation' | 'free_text';

export interface EstimationTier {
  maxGap: number;
  points: number;
}

/** Snapshot d'une question figé dans game_sessions.question_order au démarrage */
export interface QuestionSnapshot {
  id: string;
  type: QuestionType;
  question: string;
  answers: string[];
  correctIndex: number;
  difficulty: string; // Facile | Moyen | Difficile
  /** points effectifs : points_override ?? barème difficulté */
  points: number;
  theme: string | null;
  helpAnimator: string | null;
  musicUrl: string | null;
  videoYoutube: string | null; // format legacy "ID?time=SS&duration=SS"
  imageQuestionUrl: string | null;
  imageAnswerUrl: string | null;
  expectedAnswer: string | null;
  expectedNumber: number | null;
  estimationScoring: EstimationTier[] | null;
}

export interface SessionConfig {
  announceMs: number;
  questionMs: number;
  /** HERITE, plus utilise : l'ancien stock de quitte-ou-double. Conserve pour les sessions en base. */
  qdPerPlayer?: number;
  speedBonus: boolean;
  /**
   * Afficher les scores pendant la partie, et pas seulement les positions.
   *
   * A `true` par defaut depuis le retour terrain : un classement sans points ne
   * dit pas si l'ecart se joue a 1 ou a 20, et la salle decroche. Le suspense se
   * fabrique par la cinematique de fin, pas en cachant les chiffres.
   */
  showScores: boolean;
  musicUrl: string | null;
  /**
   * Volumes du projecteur, pilotes par le mixer de la console GM (0 a 1).
   *
   * Ils DOIVENT rester declares ici et whitelistes dans buildPublicState.
   * Avant, ils n'existaient qu'au frontend : la console les enregistrait bien en
   * base (set-config fait un spread), mais la vue publique les filtrait, donc
   * l'ecran projo lisait un `?? 0.35` eternel. Resultat, le mixer ne faisait
   * rien du tout et la console reaffichait 35/80 a chaque rechargement.
   */
  musicVolume: number;
  sfxVolume: number;
  /**
   * Volume du media DE LA QUESTION : extrait de blindtest et clip YouTube.
   *
   * Canal distinct de musicVolume, qui ne pilote que la musique d'ambiance.
   * L'extrait etait joue par un <audio> nu, donc a 100 % sans reglage possible,
   * alors que c'est precisement le son que la salle ecoute.
   */
  mediaVolume: number;
  wifiSsid: string;
  wifiPassword: string;
  pauseText: string;
  endWinnerText: string;
  endTextFinal: string;
  /** nom du quiz, injecté à la création de session (affichages) */
  quizName?: string;
  // --- champs battle (présents seulement en mode battle) ---
  /** grâce de réponse après la fin de question (retour terrain : 4 s) */
  graceMs?: number;
  /** durée de l'écran "MANCHE N" */
  roundIntroMs?: number;
  /** durée d'une page de classement général (rotation hors top 3) */
  standingsPageMs?: number;
  /** durée du fondu de fin (stop) */
  fadeOutMs?: number;
  /** taille de la finale (top N du général) */
  finalSize?: number;
  /** proportion de bonnes réponses des bots */
  botAccuracy?: number;
  /**
   * Partie de TEST : aucune question n'est consommée en base.
   *
   * En battle, une question posée est definitivement retiree du stock
   * (`battle_questions.used_at`). Une repetition de test brulait donc du stock
   * pour de bon, et le seul recours etait de tout remettre en circulation, ce
   * qui ressuscitait aussi les questions des vraies soirees. Avec ce drapeau,
   * la question n'est exclue que pour la duree de la session.
   */
  testMode?: boolean;
}

export const DEFAULT_CONFIG: SessionConfig = {
  announceMs: 8000,
  questionMs: 23000,
  speedBonus: true,
  showScores: true,
  // valeurs de depart du mixer projo : celles que l'ecran appliquait en dur
  musicVolume: 0.35,
  sfxVolume: 0.8,
  mediaVolume: 0.9,
  musicUrl: null,
  wifiSsid: 'INVADER BAR',
  wifiPassword: '',
  pauseText: 'Le Top 3 bénéficie de -10% au bar !',
  endWinnerText: 'Félicitations à #winner# qui remporte un Cocktail signature !',
  endTextFinal: 'Merci à tous et à très vite au Invader !',
};

export const DEFAULT_BATTLE_CONFIG: SessionConfig = {
  ...DEFAULT_CONFIG,
  announceMs: 6000,
  questionMs: 15000,
  speedBonus: false,
  quizName: 'Battle Royale',
  graceMs: 4000,
  roundIntroMs: 5000,
  standingsPageMs: 10000,
  fadeOutMs: 5000,
  finalSize: 10,
  botAccuracy: 0.3,
};

export type SpecialQuestion = 'double' | 'quitte_double' | 'shot' | 'goodies';

// ---------------------------------------------------------------------------
// Jokers
//
// Trois jokers, gagnes en jouant (tirage a la revelation, pondere par la
// position au classement : les derniers gagnent plus souvent) ou donnes par le
// GM. Remplacent l'ancien "quitte ou double" unique, qui ne faisait rien perdre
// sur une mauvaise reponse et n'etait donc pas une decision.
//
// Les constantes ci-dessous sont LES reglages d'equilibrage, valides par
// simulation Monte-Carlo (40 joueurs, 30 questions, ~115 jokers par partie avec
// le profil retenu). A ajuster ici apres les premieres soirees, rien d'autre a
// toucher.
// ---------------------------------------------------------------------------

export type JokerType = 'all_in' | 'audience' | 'fifty';

export const JOKER_TYPES: JokerType[] = ['all_in', 'audience', 'fifty'];

/** jokers en main au maximum ; au-dela, plus de tirage */
export const JOKER_HAND_MAX = 2;
/** chance de tirage par bonne reponse = BASE + SLOPE x percentile (0 = leader, 1 = dernier) */
export const JOKER_DRAW_BASE = 0.05;
export const JOKER_DRAW_SLOPE = 0.25;
/** ponderation des types au tirage : le plus doux est le plus frequent */
export const JOKER_WEIGHTS: Record<JokerType, number> = { fifty: 40, audience: 30, all_in: 30 };

/**
 * Serie de bonnes reponses : a partir de la STREAK_BONUS_FROM-ieme consecutive,
 * chaque bonne reponse rapporte +1. Pas un joker : toujours actif.
 */
export const STREAK_BONUS_FROM = 5;

/**
 * Duree minimale de la phase reveal. Cote joueur, une sequence personnelle
 * (verdict -> serie -> jokers) se joue apres la revelation ; le GM ne peut pas
 * lancer la suite avant la fin, sinon la question suivante court-circuite la
 * sequence. La console affiche un compte a rebours sur le bouton.
 */
export const REVEAL_MIN_MS = 12_000;

/** un joker joue sur une question */
export interface JokerPlay {
  playerId: string;
  pseudo: string;
  type: JokerType;
  /**
   * donnees propres au joker, restituees au joueur apres un refresh :
   * fifty -> { removed: number[] } ; audience -> { counts: number[]; total: number }
   */
  data?: Record<string, unknown>;
}

/** un joker gagne (tirage a la revelation, ou don du GM) */
export interface JokerAward {
  playerId: string;
  pseudo: string;
  type: JokerType;
  source: 'draw' | 'gm';
}

export interface FreeTextVerdict {
  accepted: boolean;
  source: 'exact' | 'fuzzy' | 'ai' | 'gm' | 'none';
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  points: number;
  /** joker all-in arme sur cette question */
  allIn: boolean;
  /** serie de bonnes reponses APRES cette question (0 si cassee) */
  streak: number;
  /** true si la serie a rapporte le +1 (>= STREAK_BONUS_FROM) */
  streakBonus: boolean;
  /** valeur donnée (estimation / texte) pour affichage */
  value?: string | number;
  gap?: number;
}

export interface RevealData {
  cancelled?: boolean;
  correctIndex?: number;
  correctAnswer?: string;
  expectedNumber?: number;
  expectedAnswer?: string;
  /** répartition des réponses QCM en % (index -> %) */
  percents?: number[];
  answeredCount: number;
  results: Record<string, PlayerResult>; // clé = pseudo
  /**
   * Podium de rapidite : les 3 QCM corrects les plus rapides, +1 chacun.
   * `fastest` reste servi (= fastestTop[0]) pour les consommateurs annexes.
   */
  fastestTop?: Array<{ pseudo: string; elapsedMs: number }>;
  fastest?: string | null;
  /** jokers gagnes a cette revelation (tirages + dons GM), pour le projecteur */
  jokerAwards?: Array<{ pseudo: string; type: JokerType }>;
  /** top estimations [{pseudo, value, gap, points}] */
  bestEstimations?: Array<{ pseudo: string; value: number; gap: number; points: number }>;
  special?: SpecialQuestion | null;
}

export interface StandingEntry {
  pseudo: string;
  score: number;
  position: number;
  positionChange: number; // >0 = monte
  device: string;
}

export interface RewardsData {
  fastest: { pseudo: string; avgMs: number } | null;
  bestRatio: { pseudo: string; correct: number; answered: number } | null;
  bestStrike: { pseudo: string; strike: number } | null;
  bonnetDane: { pseudo: string; correct: number; answered: number } | null;
  revealed: number; // nombre de mentions déjà dévoilées (auto-avance)
}

// ---------------------------------------------------------------------------
// Runtime battle royale
// ---------------------------------------------------------------------------

/** élément de la file de tirage (snapshot propre, réponses non mélangées) */
export interface BattleQueueItem {
  id: string; // battle_questions.id
  question: string;
  answers: string[];
  correctIndex: number;
  difficulty: string;
  theme: string;
  helpStory: string;
}

export interface BattleEliminatedEntry {
  playerId: string;
  pseudo: string;
  /** temps de réponse sur la question fatale (tiebreak finale), null = timeout */
  elapsedMs: number | null;
  /** place de manche partagée du groupe (survivants après + 1) */
  rank: number;
}

export interface BattleVerdictPending {
  playerId: string;
  pseudo: string;
  reason: 'wrong' | 'timeout';
  choice: number | null;
  elapsedMs: number | null;
  /** décision GM : 'correct' = bonne réponse (survit + point), 'revived' = repêché (survit sans point) */
  overturned?: 'correct' | 'revived' | null;
}

export interface BattleRevealData {
  cancelled?: boolean;
  correctIndex?: number;
  correctAnswer?: string;
  answeredCount: number;
  eliminated: Array<{ pseudo: string; reason: 'wrong' | 'timeout' }>;
  repechage: boolean;
  endRoundTie?: boolean;
  survivorsBefore: number;
  survivorsAfter: number;
  /** palier franchi à cette question (20/10/5/3), pour le bandeau "PLUS QUE X !" */
  milestone: number | null;
  correctPseudos: string[];
  /** finale gagnée : l'advancer enchaîne automatiquement sur end */
  victory?: boolean;
}

export interface BattleStandingEntry {
  playerId: string;
  pseudo: string;
  score: number;
  position: number;
  positionChange: number;
  qualifiedForFinal: boolean;
  isSpectator: boolean;
  device: string;
}

export interface BattleRoundResult {
  roundNumber: number;
  entries: Array<{ pseudo: string; rank: number; bonus: number; survived: boolean }>;
}

export interface BattleRuntime {
  roundNumber: number; // 0 avant la première manche
  roundQuestionCount: number;
  isFinal: boolean;
  /** file de tirage par difficulté (aperçu + réordonnancement GM) */
  queue: Record<string, BattleQueueItem[]>;
  /** ids retirés de la file par le GM : ne pas re-piocher cette session */
  excludedIds: string[];
  /** un groupe par question résolue de la manche courante (append-only) */
  eliminationGroups: BattleEliminatedEntry[][];
  verdict?: {
    computing: boolean;
    questionIndex: number;
    pending: BattleVerdictPending[];
    correctPlayerIds: string[];
    correctPseudos: string[];
    answeredCount: number;
    survivorsBefore: number;
    repechage: boolean;
  };
  reveal?: BattleRevealData;
  /** dernier palier déjà annoncé (évite de rejouer un bandeau) */
  lastMilestone?: number | null;
  roundResult?: BattleRoundResult;
  generalStandings?: BattleStandingEntry[];
  lastGeneralPositions?: Record<string, number>; // pseudo -> position (flèches)
  /** classement final précalculé quand la finale se termine */
  finalStandings?: BattleStandingEntry[];
  winner?: { playerId: string; pseudo: string } | null;
  /** posé par show-results quand la finale est jouée : reveal → end automatique */
  victoryPending?: boolean;
}

/** runtime jsonb de game_sessions */
export interface SessionRuntime {
  /** jokers joues, par index de question */
  jokerPlays?: Record<string, JokerPlay[]>;
  /** jokers gagnes, par index de question (tirage du reveal + dons GM) */
  jokerAwards?: Record<string, JokerAward[]>;
  /** question spéciale GM pour la question en cours */
  special?: SpecialQuestion | null;
  reveal?: RevealData;
  standings?: StandingEntry[];
  lastStandings?: Record<string, number>; // pseudo -> position (pour flèches)
  cinematic?: { step: number; ranks: StandingEntry[] };
  judge?: {
    running: boolean;
    verdicts: Record<string, FreeTextVerdict>; // clé = playerId
  };
  rewards?: RewardsData;
  endTexts?: { winnerText: string; endText: string };
  /** état du mode battle (absent en mode quiz) */
  battle?: BattleRuntime;
}

export interface SessionRow {
  id: string;
  mode: GameMode;
  status: GameStatus;
  previous_status: string | null;
  join_code: string;
  quiz_id: string | null;
  config: SessionConfig;
  question_order: QuestionSnapshot[];
  current_question_index: number;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  runtime: SessionRuntime;
  state_version: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface PlayerStats {
  strike: number;
  bestStrike: number;
  correctCount: number;
  answerCount: number;
  totalTimeMs: number; // cumul elapsed_ms des bonnes réponses (tiebreak)
  /** points donnés à la main par le GM (préservés par les rebuilds) */
  manualPoints?: number;
  /** battle : cumul des bonus de fin de manche (préservés par les rollbacks) */
  roundBonusPoints?: number;
}

export interface PlayerRow {
  id: string;
  session_id: string;
  pseudo: string;
  pseudo_norm: string;
  device: string;
  player_token: string;
  score: number;
  /** spectator : battle uniquement, non qualifié pour la finale (définitif) */
  status: 'active' | 'eliminated' | 'waiting' | 'removed' | 'spectator';
  /** main de jokers (JOKER_HAND_MAX au plus). Les vieux jsonb {qdLeft} sont ignores. */
  bonuses: { jokers?: JokerType[] };
  stats: PlayerStats;
  joined_at: string;
  last_seen_at: string;
}

export interface AnswerRow {
  id: string;
  session_id: string;
  player_id: string;
  question_index: number;
  answer: { choice?: number; number?: number; text?: string };
  elapsed_ms: number | null;
  bonus: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
  ai_verdict: FreeTextVerdict | null;
  created_at: string;
}

export const DIFFICULTY_POINTS: Record<string, number> = {
  Facile: 1,
  Moyen: 2,
  Difficile: 3,
};

/** tolérance réseau sur la deadline de réponse (ms) */
export const ANSWER_GRACE_MS = 2500;
/** délai additionnel par média (ms), hérité du legacy */
export const AUDIO_EXTRA_MS = 10000;
export const IMAGE_EXTRA_MS = 2000;
export const VIDEO_EXTRA_BASE_MS = 2000;
