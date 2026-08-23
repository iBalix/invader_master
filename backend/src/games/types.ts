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
  /** nombre de quitte-ou-double par joueur pour la partie */
  qdPerPlayer: number;
  speedBonus: boolean;
  /** afficher les scores pendant la partie (sinon positions seulement) */
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
  qdPerPlayer: 2,
  speedBonus: true,
  showScores: false,
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
  qdPerPlayer: 0,
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

export interface QdActivation {
  playerId: string;
  pseudo: string;
}

export interface FreeTextVerdict {
  accepted: boolean;
  source: 'exact' | 'fuzzy' | 'ai' | 'gm' | 'none';
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  points: number;
  qd: boolean;
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
  fastest?: string | null;
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
  /** activations quitte-ou-double par index de question */
  qd?: Record<string, QdActivation[]>;
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
  bonuses: { qdLeft: number };
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
