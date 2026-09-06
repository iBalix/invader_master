/**
 * Client du moteur de jeu : API publiques (sans auth), realtime Supabase,
 * synchronisation d'horloge et identité joueur persistée.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

export const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (miroir des vues backend)
// ---------------------------------------------------------------------------

export type QuizStatus =
  | 'lobby' | 'rules' | 'announce' | 'media' | 'question' | 'locked' | 'reveal'
  | 'leaderboard' | 'cinematic' | 'pause' | 'resuming' | 'rewards' | 'end'
  // statuts battle
  | 'round_intro' | 'verdict' | 'round_end' | 'closing';

export type QuestionType = 'qcm' | 'estimation' | 'free_text';

// ---------------------------------------------------------------------------
// Jokers
// ---------------------------------------------------------------------------

export type JokerType = 'all_in' | 'audience' | 'fifty';

/**
 * Catalogue unique des jokers : joueur, projecteur, regles, console GM et
 * laboratoire consomment tous CE tableau. Une reformulation se fait ici.
 */
export const JOKER_DEFS: Record<
  JokerType,
  { label: string; emoji: string; couleur: string; ombre: string; description: string }
> = {
  all_in: {
    label: 'All-In',
    emoji: '🎰',
    couleur: '#FF2BD6',
    ombre: 'rgba(255, 43, 214, 0.45)',
    description: 'Points x3 si tu as bon... mais tu perds la valeur de la question si tu as faux.',
  },
  audience: {
    label: 'Avis du public',
    emoji: '📊',
    couleur: '#33E2FF',
    ombre: 'rgba(51, 226, 255, 0.45)',
    description: 'Montre ce que les autres ont déjà répondu. QCM uniquement.',
  },
  fifty: {
    label: '50/50',
    emoji: '✂️',
    couleur: '#5ED9A1',
    ombre: 'rgba(94, 217, 161, 0.45)',
    description: 'Retire deux mauvaises réponses. QCM uniquement.',
  },
};

export const JOKER_TYPES: JokerType[] = ['all_in', 'audience', 'fifty'];

/** jokers en main au maximum (miroir du backend) */
export const JOKER_HAND_MAX = 2;

/** la serie rapporte +1 a partir de cette longueur (miroir du backend) */
export const STREAK_BONUS_FROM = 5;
/** miroir du backend : bonus de rapidite par place (1er, 2e, 3e) */
export const SPEED_BONUS = [2, 1, 1];

/** ce que J'AI joue sur la question courante, restitue apres refresh */
export interface JokerPlayYou {
  type: JokerType;
  data: { removed?: number[]; counts?: number[]; total?: number } | null;
}

export interface PublicQuestion {
  index: number;
  total: number;
  type: QuestionType;
  difficulty: string;
  points: number;
  theme: string | null;
  question?: string;
  answers?: string[];
  musicUrl?: string | null;
  videoYoutube?: string | null;
  imageQuestionUrl?: string | null;
  imageAnswerUrl?: string | null;
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  points: number;
  allIn: boolean;
  /** serie apres cette question (0 si cassee) */
  streak: number;
  /** serie AVANT cette question, pour afficher "serie de N brisee" */
  streakBefore: number;
  /** true si la serie a rapporte son +1 */
  streakBonus: boolean;
  value?: string | number;
  gap?: number;
}

export interface RevealData {
  cancelled?: boolean;
  correctIndex?: number;
  correctAnswer?: string;
  expectedNumber?: number;
  expectedAnswer?: string;
  percents?: number[];
  answeredCount: number;
  results: Record<string, PlayerResult>;
  /** podium des 3 QCM corrects les plus rapides, +1 chacun */
  fastestTop?: Array<{ pseudo: string; elapsedMs: number; bonus: number }>;
  fastest?: string | null;
  /** jokers gagnes a cette revelation (tirage + dons GM) */
  jokerAwards?: Array<{ pseudo: string; type: JokerType }>;
  bestEstimations?: Array<{ pseudo: string; value: number; gap: number; points: number }>;
  special?: string | null;
}

export interface StandingEntry {
  pseudo: string;
  position: number;
  positionChange: number;
  device: string;
  score?: number;
}

export interface RewardsData {
  fastest: { pseudo: string; avgMs: number } | null;
  bestRatio: { pseudo: string; correct: number; answered: number } | null;
  bestStrike: { pseudo: string; strike: number } | null;
  bonnetDane: { pseudo: string; correct: number; answered: number } | null;
  revealed: number;
}

// --- battle royale ---

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
  milestone: number | null;
  correctPseudos: string[];
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

export interface PublicBattle {
  roundNumber: number;
  isFinal: boolean;
  /** numero de la question dans la manche courante (repart a 1 en finale) */
  questionInRound?: number;
  survivorCount: number;
  finalSize: number;
  verdictPending: boolean;
  reveal?: BattleRevealData;
  roundResult?: BattleRoundResult;
  generalStandings?: BattleStandingEntry[];
  finalStandings?: BattleStandingEntry[];
  winner?: { playerId: string; pseudo: string } | null;
}

export interface YouBattle {
  generalRank: number | null;
  eliminatedThisRound: boolean;
  roundRank: number | null;
  isFinalist: boolean;
  isSpectator: boolean;
  isFinal: boolean;
  roundNumber: number;
}

export interface PublicState {
  id: string;
  joinCode: string;
  mode: string;
  status: QuizStatus;
  quizName: string;
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  config: {
    announceMs: number;
    questionMs: number;
    showScores: boolean;
    wifiSsid: string;
    wifiPassword: string;
    pauseText: string;
    musicUrl: string | null;
    musicVolume?: number;
    sfxVolume?: number;
    mediaVolume?: number;
    /** battle : rotation du classement de fin de manche (projecteur) */
    standingsPageMs?: number;
  };
  playerCount: number;
  /** joueurs inscrits (survivants + eliminés), pour les ecrans d'appel */
  participantCount?: number;
  players: Array<{ pseudo: string; device: string }>;
  question: PublicQuestion | null;
  /** jokers joues sur la question courante */
  jokerFeed: Array<{ pseudo: string; type: JokerType }>;
  special: string | null;
  judging: boolean;
  reveal?: RevealData;
  standings?: StandingEntry[];
  cinematic?: { step: number };
  rewards?: RewardsData;
  endTexts?: { winnerText: string; endText: string };
  battle?: PublicBattle;
  ended: boolean;
}

export interface You {
  playerId: string;
  pseudo: string;
  score: number;
  status: string;
  jokers: JokerType[];
  jokerPlays: JokerPlayYou[];
  answered: boolean;
  strike: number;
  battle?: YouBattle;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

/**
 * `timeoutMs` : delai maximum au-dela duquel la requete est abandonnee.
 *
 * A n'utiliser que sur les appels dont l'appelant sait REESSAYER. L'abandon
 * leve une AbortError, pas une ApiError : les appelants qui distinguent les
 * deux (cf. l'envoi de reponse dans PlayerApp) la traitent donc comme un
 * incident reseau et relancent, au lieu de la prendre pour une erreur metier.
 */
async function request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    data?: T;
    items?: T;
    message?: string;
  };
  if (!res.ok || body.status === 'error') {
    throw new ApiError(body.message ?? `Erreur ${res.status}`, res.status);
  }
  return (body.data ?? body.items) as T;
}

/** delai maximum d'un envoi de reponse (le joueur reessaie ensuite) */
const ANSWER_TIMEOUT_MS = 5000;

export const gameApi = {
  current: () =>
    request<{ sessionId: string; joinCode: string; mode: string; gameStatus: string } | null>(
      '/public/game/current',
    ),
  state: (idOrCode: string, playerToken?: string) =>
    request<{ state: PublicState; you: You | null }>(
      `/public/game/${encodeURIComponent(idOrCode)}/state${
        playerToken ? `?playerToken=${encodeURIComponent(playerToken)}` : ''
      }`,
    ),
  join: (idOrCode: string, body: { pseudo?: string; device?: string; playerToken?: string }) =>
    request<{ playerToken: string; you: You; sessionId: string }>(
      `/public/game/${encodeURIComponent(idOrCode)}/join`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  leave: (idOrCode: string, playerToken: string) =>
    request<{ left: boolean }>(`/public/game/${encodeURIComponent(idOrCode)}/leave`, {
      method: 'POST',
      body: JSON.stringify({ playerToken }),
    }),
  answer: (
    idOrCode: string,
    body: {
      playerToken: string;
      questionIndex: number;
      answer: { choice?: number; number?: number; text?: string };
      elapsedMs: number | null;
    },
  ) =>
    request<{ recorded: boolean; already: boolean }>(
      `/public/game/${encodeURIComponent(idOrCode)}/answer`,
      { method: 'POST', body: JSON.stringify(body) },
      // Sans borne, une requete qui pend laissait le joueur bloque sur « envoi »
      // pour le reste de la question : l'interface refuse un nouvel envoi tant
      // que celui-ci n'a pas rendu la main, et le retry ne se declenchait pas
      // (il ne reagit qu'aux erreurs 500 / 0, pas a une requete sans fin).
      // 5 s : tres au-dessus d'un envoi normal (~100 a 500 ms), meme dans la
      // ruee de fin de question, et assez court pour laisser une seconde
      // tentative aboutir dans la grace serveur.
      ANSWER_TIMEOUT_MS,
    ),
  joker: (
    idOrCode: string,
    body: { playerToken: string; questionIndex: number; type: JokerType },
  ) =>
    request<{ jokers: JokerType[]; data?: { removed?: number[]; counts?: number[]; total?: number } }>(
      `/public/game/${encodeURIComponent(idOrCode)}/joker`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

// ---------------------------------------------------------------------------
// Identité joueur (localStorage)
// ---------------------------------------------------------------------------

const IDENTITY_KEY = 'invader_game_identity';

export interface PlayerIdentity {
  sessionId: string;
  playerToken: string;
  pseudo: string;
}

export function loadIdentity(): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as PlayerIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: PlayerIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}

// ---------------------------------------------------------------------------
// Instant d'affichage d'une question (sessionStorage)
// ---------------------------------------------------------------------------

const SHOWN_AT_KEY = 'invader_game_shown_at';

interface ShownMark {
  sessionId: string;
  questionIndex: number;
  at: number;
}

/**
 * Instant où la question a été affichée pour la première fois, persisté.
 *
 * POURQUOI : `elapsedMs` est mesuré côté client, volontairement, pour que le
 * bonus de rapidité soit insensible à la latence réseau. Mais la référence
 * vivait dans un `useRef` remis à zéro à chaque montage du composant. Un
 * joueur qui quitte l'écran et revient produisait donc un `elapsedMs`
 * minuscule, que le serveur accepte comme plausible (`scoring.ts`, entre
 * 150 ms et la fenêtre + 3 s). Il raflait le +1 du plus rapide, la mention
 * « plus rapide » et les départages au temps en finale.
 *
 * Depuis qu'on peut sortir de la partie pour consulter la carte et revenir,
 * la faille devient triviale à exploiter : on persiste donc la référence.
 *
 * Horloge murale (`Date.now`) et non `performance.now` : cette dernière est
 * relative au chargement de la page, donc incomparable après un rechargement.
 * Sur la durée d'une question, un saut d'horloge système est un risque
 * théorique face à une triche qui, elle, serait systématique.
 */
export function questionShownAt(sessionId: string, questionIndex: number): number {
  try {
    const raw = sessionStorage.getItem(SHOWN_AT_KEY);
    if (raw) {
      const mark = JSON.parse(raw) as ShownMark;
      if (mark.sessionId === sessionId && mark.questionIndex === questionIndex) {
        return mark.at;
      }
    }
  } catch {
    /* stockage indisponible : on retombe sur l'instant courant */
  }
  const at = Date.now();
  try {
    const mark: ShownMark = { sessionId, questionIndex, at };
    sessionStorage.setItem(SHOWN_AT_KEY, JSON.stringify(mark));
  } catch {
    /* ignore */
  }
  return at;
}

// ---------------------------------------------------------------------------
// Horloge serveur : offset estimé via les réponses state (rtt/2)
// ---------------------------------------------------------------------------

let clockOffset = 0;
let bestRtt = Infinity;

export function updateClock(serverNow: number, t0: number, t1: number): void {
  const rtt = t1 - t0;
  // on garde l'échantillon au meilleur rtt (le plus fiable), avec un
  // rafraîchissement progressif pour absorber la dérive
  if (rtt <= bestRtt * 1.5) {
    bestRtt = Math.min(bestRtt, rtt);
    clockOffset = serverNow - (t0 + t1) / 2;
  }
}

export function serverNow(): number {
  return Date.now() + clockOffset;
}

// ---------------------------------------------------------------------------
// Realtime Supabase
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

export interface GameEvent {
  event: string;
  payload: Record<string, unknown>;
}

export function subscribeToGame(
  sessionId: string,
  onEvent: (e: GameEvent) => void,
): () => void {
  const client = getSupabase();
  if (!client) return () => undefined;
  const channel: RealtimeChannel = client
    .channel(`game:${sessionId}`)
    .on('broadcast', { event: '*' }, (msg) => {
      onEvent({ event: msg.event, payload: (msg.payload ?? {}) as Record<string, unknown> });
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Chronologie de la revelation, PARTAGEE projecteur / joueurs
// ---------------------------------------------------------------------------

/**
 * Ces constantes vivent ici, et pas dans chaque ecran, pour une raison de fond :
 * le projecteur doit garder l'exclusivite de la revelation. Si les joueurs
 * affichaient la bonne reponse avant la fin de l'animation, la salle
 * l'apprendrait par les telephones voisins et tout le suspense tomberait.
 * Un seul jeu de valeurs, donc, et REVEAL_JOUEUR_MS toujours apres
 * REVEAL_REPONSE_MS.
 *
 * Toutes sont comptees depuis `phaseStartedAt` (horloge serveur) et non depuis
 * le montage du composant : un ecran qui arrive en retard reprend la sequence au
 * bon endroit au lieu de la rejouer depuis le debut.
 */

/** duree de montee de la barre la PLUS haute ; les autres vont a la meme vitesse */
export const REVEAL_BARRES_MS = 3000;
/**
 * Le son de suspense (answers_reveal.mp3, herite d'invader_table) part ici,
 * une fois les pourcentages lus, et la bonne reponse tombe exactement 1646 ms
 * plus tard : c'est le delai d'origine, mesure dans le legacy, celui que la
 * salle connait par coeur.
 */
export const REVEAL_SUSPENSE_MS = 4400;
/** la bonne reponse se detache sur le projecteur (= SUSPENSE + 1646, legacy) */
export const REVEAL_REPONSE_MS = REVEAL_SUSPENSE_MS + 1646;
/** les joueurs decouvrent le verdict : jamais avant le projecteur */
export const REVEAL_JOUEUR_MS = 6600;
/** le podium des 3 plus rapides est annonce (marches devoilees 3e, 2e puis 1er) */
export const REVEAL_RAPIDE_MS = 7800;
/** delais internes du podium par place [1er, 2e, 3e] : le 1er se fait desirer */
export const PODIUM_DELAIS_S = [2.2, 0.9, 0];

/**
 * Sequence personnelle post-reveal cote joueur. Trois temps, en seuils depuis
 * phaseStartedAt : verdict (des REVEAL_JOUEUR_MS), puis la serie, puis les
 * jokers (recap de main + roue de tirage si gain). Le backend garantit que la
 * phase reveal dure au moins REVEAL_MIN_MS : le GM ne peut pas la couper.
 */
export const SEQ_SERIE_MS = 10200;
export const SEQ_JOKERS_MS = 13000;
/**
 * Apres les jokers, l'ecran d'attente. La sequence personnelle est finie ; si
 * l'animateur parle et ne lance pas la suite, les joueurs restaient figes sur
 * leur main de jokers sans savoir si c'etait normal. Le seuil laisse a la roue
 * d'un gain (lancee a SEQ_JOKERS_MS, ~5,3 s) le temps de finir son tour.
 */
export const SEQ_ATTENTE_MS = 20800;
/** miroir du backend : duree minimale de la phase reveal */
export const REVEAL_MIN_MS = 16000;
/** projecteur : duree d'affichage de l'image de reponse, avant les podiums */
export const REVEAL_IMAGE_MS = 3500;
/** projecteur : les podiums (vitesse puis series) */
export const REVEAL_SERIE_MS = 11600;
/**
 * Mentions speciales (fin de partie) : le pseudo pop a la revelation (pas
 * serveur, 6 s par mention), la valeur du record arrive ce delai apres, en
 * second temps de lecture : d'abord QUI, puis COMBIEN.
 */
export const MENTION_VALEUR_MS = 900;

// ---------------------------------------------------------------------------
// Mise en scene de la question
// ---------------------------------------------------------------------------

/**
 * La question s'affiche seule, puis les reponses arrivent en fondu, toutes
 * ensemble : la salle lit l'enonce avant de se jeter sur les choix. 3 s (2 s
 * a l'origine, un poil court en soiree). Ce temps est pris sur la fenetre de
 * reponse : le backend ne connait pas ce delai, le chrono reste celui de la
 * config.
 */
export const QUESTION_REPONSES_MS = 3000;
/**
 * Question audio : l'extrait joue SEUL pendant ce temps (ecran « extrait en
 * cours »), puis la question apparait et l'extrait continue. Comportement
 * herite d'invader_table (10 s a l'epoque, 5 s ici). Le backend allonge la
 * fenetre de reponse d'autant.
 */
export const AUDIO_PREROLL_MS = 5000;
/** legacy : l'extrait ducke au reveal remonte ce delai apres la bonne reponse */
export const AUDIO_REMONTEE_MS = 3500;

// ---------------------------------------------------------------------------
// Battle royale : mise en scene
// ---------------------------------------------------------------------------

/**
 * TOUS ces seuils se comparent a `ecoule = serverNow() - phaseStartedAt`,
 * jamais a un minuteur lance au montage : un ecran qui recharge en pleine
 * sequence retombe au bon endroit, et une page non peinte ne fige rien. C'est
 * la lecon des barres du reveal du quiz, ou une animation cadencee sur le
 * montage restait bloquee sur le PC du projecteur.
 */

/** intro de manche : nuage de categories, puis de pseudos, puis le numero */
export const BR_INTRO_PSEUDOS_MS = 4600;
export const BR_INTRO_MANCHE_MS = 8600;
/** duree totale de l'intro, miroir de config.roundIntroMs cote serveur */
export const BR_INTRO_MS = 12000;

/** annonce : le decompte 3-2-1 occupe les trois dernieres secondes */
export const BR_DECOMPTE_MS = 3000;

/** revelation : la reponse, les elimines un par un, le compte, puis le palier */
export const BR_REVEAL_REPONSE_MS = 600;
export const BR_REVEAL_ELIMINES_MS = 2200;
/** un nom toutes les 550 ms, cadence du legacy */
export const BR_REVEAL_PAS_MS = 550;
export const BR_REVEAL_COMPTE_MS = 5200;
/** prise d'ecran plein cadre du palier (TOP 20 / 10 / 5 / 3) */
export const BR_PALIER_MS = 6800;
export const BR_PALIER_DUREE_MS = 4200;

/** miroirs du backend : le GM ne peut pas couper la revelation avant la fin */
export const BR_REVEAL_MIN_MS = 7000;
export const BR_REVEAL_MIN_PALIER_MS = 11500;

// ---------------------------------------------------------------------------
// Compteurs d'attente (purement indicatifs, le GM garde la main)
// ---------------------------------------------------------------------------

export const LOBBY_COUNTDOWN_MS = 20 * 60_000;
export const PAUSE_COUNTDOWN_MS = 15 * 60_000;
