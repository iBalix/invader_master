/**
 * Fabriques d'états factices pour le laboratoire (/game-lab).
 *
 * AUCUN appel API : tout est fabriqué ici, avec des pseudos et des scores
 * plausibles, pour monter chaque écran du quiz dans l'état exact qu'on veut
 * regarder. `phaseStartedAt` est calé sur serverNow() au moment de la demande,
 * donc les séquences cadencées (règles, post-reveal) se jouent en vrai.
 */

import extraitDemoUrl from '../assets/answers-reveal.mp3';
import {
  AUDIO_PREROLL_MS,
  QUESTION_REPONSES_MS,
  serverNow,
  type BattleRevealData,
  type BattleStandingEntry,
  type JokerType,
  type PublicBattle,
  type PublicState,
  type RevealData,
  type You,
  type YouBattle,
} from '../lib/gameClient';

/**
 * 40 pseudos : l'effectif d'une vraie soiree pleine. C'est volontairement le
 * cas le plus dur (classement, podiums, feed), pas un echantillon confortable.
 */
const PSEUDOS = [
  'Marco', 'Léa', 'Sam', 'Nina', 'Hugo', 'Emma', 'Tom', 'Julie',
  'Alex', 'Zoé', 'Max', 'Lily', 'Nico', 'Eva', 'Paul', 'Mia',
  'Théo', 'Jade', 'Louis', 'Anna', 'Rémi', 'Clara', 'Yanis', 'Manon',
  'Enzo', 'Inès', 'Adam', 'Sarah', 'Noah', 'Camille', 'Lucas', 'Alice',
  'Gab', 'Chloé', 'Kevin', 'Marie', 'Bastien', 'Elsa', 'Jules', 'Roxane',
];

function baseState(over: Partial<PublicState>): PublicState {
  return {
    id: 'lab',
    joinCode: 'LAB1',
    mode: 'quiz',
    status: 'lobby',
    quizName: 'Quiz du laboratoire',
    v: 1,
    serverNow: serverNow(),
    phaseStartedAt: serverNow(),
    phaseEndsAt: null,
    currentQuestionIndex: 4,
    totalQuestions: 30,
    config: {
      announceMs: 8000,
      questionMs: 23000,
      showScores: true,
      wifiSsid: 'INVADER BAR',
      wifiPassword: '',
      pauseText: 'Le Top 3 bénéficie de -10% au bar !',
      musicUrl: null,
    },
    playerCount: PSEUDOS.length,
    players: PSEUDOS.map((p) => ({ pseudo: p, device: 'mobile' })),
    question: null,
    jokerFeed: [],
    special: null,
    judging: false,
    ended: false,
    ...over,
  };
}

function baseYou(over: Partial<You>): You {
  return {
    playerId: 'lab-you',
    pseudo: 'Toi',
    score: 12,
    status: 'active',
    jokers: ['fifty', 'audience'],
    jokerPlays: [],
    answered: false,
    strike: 2,
    ...over,
  };
}

const QUESTION_QCM = {
  index: 4,
  total: 30,
  type: 'qcm' as const,
  difficulty: 'Moyen',
  points: 2,
  theme: 'Jeux vidéo rétro',
  question: 'Quelle console a vu naître The Legend of Zelda ?',
  answers: ['Master System', 'NES', 'Game Boy', 'PC Engine'],
};

/** series en cours plausibles : quelques gros scores, beaucoup de petits */
const SERIES = [7, 6, 5, 4, 4, 3, 3, 3, 2, 2];

function revealBase(): RevealData {
  const results: RevealData['results'] = {};
  PSEUDOS.forEach((p, i) => {
    const correct = i % 3 !== 0;
    const serie = correct ? (SERIES[i] ?? (i % 3) + 1) : 0;
    results[p] = {
      answered: i % 7 !== 5,
      correct,
      points: correct ? 2 : 0,
      allIn: false,
      streak: serie,
      streakBefore: Math.max(0, serie - 1),
      streakBonus: serie >= 5,
      value: correct ? 1 : 0,
    };
  });
  return {
    answeredCount: PSEUDOS.length,
    results,
    percents: [12, 58, 20, 10],
    correctIndex: 1,
    correctAnswer: 'NES',
    fastestTop: [
      { pseudo: 'Léa', elapsedMs: 1840, bonus: 2 },
      { pseudo: 'Toi', elapsedMs: 2120, bonus: 1 },
      { pseudo: 'Max', elapsedMs: 2480, bonus: 1 },
    ],
    fastest: 'Léa',
    special: null,
  };
}

/** les deux moteurs de soiree : le quiz (blindtest compris) et la battle */
export type LabJeu = 'quiz' | 'battle';
/** les trois surfaces d'une soiree : le telephone, l'ecran, la console */
export type LabSurface = 'joueur' | 'projo' | 'gm';

export const JEUX: Array<{ cle: LabJeu; label: string; emoji: string }> = [
  { cle: 'quiz', label: 'Quiz & Blindtest', emoji: '🎬' },
  { cle: 'battle', label: 'Battle Royale', emoji: '⚔️' },
];

export const SURFACES: Array<{ cle: LabSurface; label: string }> = [
  { cle: 'joueur', label: 'Joueur' },
  { cle: 'projo', label: 'Projecteur' },
  { cle: 'gm', label: 'Game Master' },
];

export interface LabScenario {
  cle: string;
  jeu: LabJeu;
  surface: LabSurface;
  label: string;
  description: string;
  state: () => PublicState;
  you?: () => You;
  /** boutons « Aller a » dedies (ms depuis phaseStartedAt) ; sinon defauts de la surface */
  sauts?: Array<[string, number]>;
  /** bandeau d'ejection sur l'ecran d'inscription (scenario AFK) */
  joinNotice?: string;
  /** sequence de regles : active le selecteur de chapitre */
  regles?: LabJeu;
}

/**
 * Battle royale : meme moteur, autre rythme. Les fixtures posent un effectif
 * plausible de milieu de soiree (40 inscrits, une vingtaine de survivants) :
 * c'est la que les ecrans sont les plus charges.
 */
function baseBattle(over: Partial<PublicState>, battleOver: Partial<PublicBattle> = {}): PublicState {
  const base = baseState({
    mode: 'battle',
    quizName: 'Battle Royale',
    config: {
      announceMs: 6000,
      questionMs: 15000,
      showScores: true,
      wifiSsid: 'INVADER BAR',
      wifiPassword: '',
      pauseText: 'Le Top 3 bénéficie de -10% au bar !',
      musicUrl: null,
      standingsPageMs: 10000,
    },
    ...over,
  });
  return {
    ...base,
    battle: {
      roundNumber: 2,
      isFinal: false,
      questionInRound: 5,
      survivorCount: 18,
      finalSize: 10,
      verdictPending: false,
      ...battleOver,
    },
  };
}

function baseYouBattle(over: Partial<You> = {}, battleOver: Partial<YouBattle> = {}): You {
  return baseYou({
    jokers: [],
    jokerPlays: [],
    score: 34,
    ...over,
    battle: {
      generalRank: 7,
      eliminatedThisRound: false,
      roundRank: null,
      isFinalist: false,
      isSpectator: false,
      isFinal: false,
      roundNumber: 2,
      ...battleOver,
    },
  });
}

/** classement general plausible : les scores cumulent points et bonus de manche */
function standingsBattle(n = PSEUDOS.length): BattleStandingEntry[] {
  return PSEUDOS.slice(0, n).map((pseudo, i) => ({
    playerId: `lab-${i}`,
    pseudo,
    score: Math.max(1, 96 - i * 4 + (i % 3)),
    position: i + 1,
    positionChange: i % 5 === 0 ? 2 : i % 7 === 0 ? -1 : 0,
    qualifiedForFinal: i < 10,
    isSpectator: false,
    device: i % 4 === 0 ? 'table' : 'mobile',
  }));
}

/** une revelation battle type : quatre elimines, la salle passe de 18 a 14 */
function revealBattle(): BattleRevealData {
  return {
    correctIndex: 1,
    correctAnswer: 'Hayao Miyazaki',
    answeredCount: 17,
    eliminated: [
      { pseudo: 'Nina', reason: 'wrong' },
      { pseudo: 'Tom', reason: 'wrong' },
      { pseudo: 'Julie', reason: 'timeout' },
      { pseudo: 'Alex', reason: 'wrong' },
    ],
    repechage: false,
    survivorsBefore: 18,
    survivorsAfter: 14,
    milestone: null,
    correctPseudos: PSEUDOS.slice(0, 14),
  };
}

const QUESTION_BATTLE = {
  index: 12,
  total: 12,
  type: 'qcm' as const,
  difficulty: 'Moyen',
  points: 1,
  theme: 'Cinéma',
  question: 'Quel réalisateur a signé « Le Voyage de Chihiro » ?',
  answers: ['Isao Takahata', 'Hayao Miyazaki', 'Mamoru Hosoda', 'Makoto Shinkai'],
};

export const SCENARIOS: LabScenario[] = [
  {
    cle: 'regles',
    jeu: 'quiz',
    surface: 'joueur',
    regles: 'quiz',
    label: 'Règles (titre + 9 chapitres)',
    description: "7 s par chapitre, puis ça se fige sur l'attente.",
    state: () => baseState({ status: 'rules' }),
    you: () => baseYou({}),
  },
  {
    cle: 'annonce',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Annonce + jokers',
    description: "Seule fenêtre de jeu des jokers, avant la question.",
    state: () =>
      baseState({
        status: 'announce',
        phaseEndsAt: serverNow() + 8000,
        question: { ...QUESTION_QCM, question: undefined, answers: undefined },
        jokerFeed: [
          { pseudo: 'Léa', type: 'all_in' },
          { pseudo: 'Max', type: 'fifty' },
        ],
      }),
    you: () => baseYou({ jokers: ['all_in', 'fifty'] }),
  },
  {
    cle: 'question',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question QCM',
    description: "L'énoncé d'abord, les réponses en fondu à 3 s.",
    sauts: [
      ['Question', 500],
      ['Réponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 23000,
        question: QUESTION_QCM,
      }),
    you: () => baseYou({ jokers: ['fifty', 'audience'] }),
  },
  {
    cle: 'question-audio',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question audio (pré-roll)',
    description: "5 s d'extrait seul, puis question, puis réponses.",
    sauts: [
      ['Extrait', 1000],
      ['Question', AUDIO_PREROLL_MS + 400],
      ['Réponses', AUDIO_PREROLL_MS + QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 28000,
        question: { ...QUESTION_QCM, question: 'Quel jeu utilise ce thème musical ?', musicUrl: extraitDemoUrl },
      }),
    you: () => baseYou({ jokers: ['fifty'] }),
  },
  {
    cle: 'question-estimation',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question estimation',
    description: 'Saisie du nombre, 30 s de fenêtre.',
    sauts: [
      ['Question', 500],
      ['Réponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 30000,
        question: {
          ...QUESTION_QCM,
          type: 'estimation',
          answers: undefined,
          question: 'En quelle année est sortie la Super Nintendo en Europe ?',
        },
      }),
    you: () => baseYou({ jokers: ['all_in'] }),
  },
  {
    cle: 'question-libre',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question réponse libre',
    description: 'Champ texte, 30 s de fenêtre.',
    sauts: [
      ['Question', 500],
      ['Réponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 30000,
        question: {
          ...QUESTION_QCM,
          type: 'free_text',
          answers: undefined,
          question: 'Quel studio a créé la série Zelda ?',
        },
      }),
    you: () => baseYou({}),
  },
  {
    cle: 'ejection-afk',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Éjection AFK (inscription)',
    description: "L'écran que voit un joueur retiré pour inactivité.",
    state: () => baseState({ status: 'question', phaseEndsAt: serverNow() + 20000, question: QUESTION_QCM }),
    joinNotice: 'Tu as été retiré de la partie après 5 questions sans réponse. Rejoins quand tu veux !',
  },
  {
    cle: 'question-fifty',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question + 50/50 armé',
    description: 'Joué à l’annonce : deux mauvaises réponses barrées.',
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 23000,
        question: QUESTION_QCM,
      }),
    you: () =>
      baseYou({
        jokers: [],
        jokerPlays: [{ type: 'fifty', data: { removed: [0, 3] } }],
      }),
  },
  {
    cle: 'question-audience',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question + avis du public',
    description: 'Répartition en direct, elle monte pendant la question.',
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 23000,
        question: QUESTION_QCM,
      }),
    you: () =>
      baseYou({
        jokers: [],
        jokerPlays: [{ type: 'audience', data: { counts: [3, 14, 5, 2], total: 24 } }],
      }),
  },
  {
    cle: 'question-allin',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Question + All-In armé',
    description: 'Le bandeau ×3 pulse sous la question.',
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 23000,
        question: QUESTION_QCM,
      }),
    you: () => baseYou({ jokers: [], jokerPlays: [{ type: 'all_in', data: null }] }),
  },
  {
    cle: 'seq-serie-monte',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Séquence : série qui monte',
    description: 'Verdict → série 5/5 avec +1 → jokers.',
    state: () => {
      const r = revealBase();
      r.results.Toi = {
        answered: true, correct: true, points: 4, allIn: false,
        streak: 5, streakBefore: 4, streakBonus: true, value: 1,
      };
      r.fastestTop = [
        { pseudo: 'Toi', elapsedMs: 1710, bonus: 2 },
        { pseudo: 'Léa', elapsedMs: 1840, bonus: 1 },
        { pseudo: 'Max', elapsedMs: 2480, bonus: 1 },
      ];
      r.fastest = 'Toi';
      return baseState({ status: 'reveal', question: QUESTION_QCM, reveal: r });
    },
    you: () => baseYou({ strike: 5, jokers: ['fifty'] }),
  },
  {
    cle: 'seq-serie-casse',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Séquence : série brisée',
    description: 'Mauvaise réponse, série de 4 perdue.',
    state: () => {
      const r = revealBase();
      r.results.Toi = {
        answered: true, correct: false, points: 0, allIn: false,
        streak: 0, streakBefore: 4, streakBonus: false, value: 0,
      };
      return baseState({ status: 'reveal', question: QUESTION_QCM, reveal: r });
    },
    you: () => baseYou({ strike: 0 }),
  },
  {
    cle: 'seq-joker-gagne',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Séquence : joker gagné (roue)',
    description: 'La roue tourne au temps 3 de la séquence.',
    state: () => {
      const r = revealBase();
      r.results.Toi = {
        answered: true, correct: true, points: 2, allIn: false,
        streak: 2, streakBefore: 1, streakBonus: false, value: 1,
      };
      r.jokerAwards = [
        { pseudo: 'Toi', type: 'all_in' },
        { pseudo: 'Nina', type: 'fifty' },
        { pseudo: 'Hugo', type: 'audience' },
      ];
      return baseState({ status: 'reveal', question: QUESTION_QCM, reveal: r });
    },
    you: () => baseYou({ jokers: ['fifty', 'all_in'], strike: 2 }),
  },
  {
    cle: 'seq-allin-perdu',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Séquence : All-In perdu',
    description: 'Mauvaise réponse avec All-In armé : −2.',
    state: () => {
      const r = revealBase();
      r.results.Toi = {
        answered: true, correct: false, points: -2, allIn: true,
        streak: 0, streakBefore: 2, streakBonus: false, value: 0,
      };
      return baseState({ status: 'reveal', question: QUESTION_QCM, reveal: r });
    },
    you: () => baseYou({ strike: 0, jokers: [] }),
  },
  {
    cle: 'roue',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Roue de tirage seule',
    description: 'Le composant JokerWheel, en boucle.',
    state: () => baseState({ status: 'lobby' }),
    you: () => baseYou({}),
  },
  {
    cle: 'pause-joueur',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Pause (joueur)',
    description: 'Invitation au bar + promo du soir.',
    state: () =>
      baseState({
        status: 'pause',
        config: {
          announceMs: 8000,
          questionMs: 23000,
          showScores: true,
          wifiSsid: 'INVADER BAR',
          wifiPassword: '',
          pauseText: 'Le Top 3 a -10% sur une boisson !',
          musicUrl: null,
        },
      }),
    you: () => baseYou({}),
  },
  {
    cle: 'reprise-joueur',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Reprise après pause (joueur)',
    description: 'Le décompte qui fait relever la tête avant la question.',
    state: () =>
      baseState({
        status: 'resuming',
        phaseStartedAt: serverNow(),
        phaseEndsAt: serverNow() + 5000,
      }),
    you: () => baseYou({}),
  },
  {
    cle: 'classement-joueur',
    jeu: 'quiz',
    surface: 'joueur',
    label: 'Classement (joueur)',
    description: "L'écran d'attente pendant le classement.",
    state: () =>
      baseState({
        status: 'leaderboard',
        standings: PSEUDOS.slice(0, 12).map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: i === 2 ? 3 : i === 5 ? -2 : 0,
          device: 'mobile',
          score: Math.max(1, 44 - i * 3),
        })),
      }),
    you: () => baseYou({}),
  },
  // --- projecteur ---
  {
    cle: 'projo-regles',
    jeu: 'quiz',
    surface: 'projo',
    regles: 'quiz',
    label: 'Règles (projo)',
    description: 'La même séquence que les joueurs, en grand.',
    state: () => baseState({ status: 'rules' }),
  },
  {
    cle: 'projo-media',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Extrait vidéo (projo)',
    description: 'La vidéo plein écran avant la question, fondu au noir à la fin.',
    state: () =>
      baseState({
        status: 'media',
        phaseStartedAt: serverNow(),
        // extrait court : la fin (et son fondu) se verifient sans attendre
        phaseEndsAt: serverNow() + 9200,
        question: {
          index: 4,
          total: 30,
          type: 'qcm',
          difficulty: 'Difficile',
          points: 4,
          theme: 'QCM · vidéo',
          videoYoutube: 'hoHUIN0bX-c?time=0&duration=8',
        } as PublicState['question'],
      }),
  },
  {
    cle: 'projo-reprise',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Reprise après pause (projo)',
    description: 'On garde le décor de la pause, seul le bloc central décompte.',
    state: () =>
      baseState({
        status: 'resuming',
        phaseStartedAt: serverNow(),
        phaseEndsAt: serverNow() + 5000,
        config: {
          announceMs: 8000,
          questionMs: 23000,
          showScores: true,
          wifiSsid: 'INVADER BAR',
          wifiPassword: '',
          pauseText: 'Le Top 3 a -10% sur une boisson !',
          musicUrl: null,
        },
      }),
  },
  {
    cle: 'projo-pause',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Pause (projo)',
    description: 'Les pseudos dérivent, le message reste lisible.',
    state: () =>
      baseState({
        status: 'pause',
        config: {
          announceMs: 8000,
          questionMs: 23000,
          showScores: true,
          wifiSsid: 'INVADER BAR',
          wifiPassword: '',
          pauseText: 'Le Top 3 a -10% sur une boisson !',
          musicUrl: null,
        },
      }),
  },
  {
    cle: 'bar-permanent',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Écran bar BAR01/02',
    description: 'Page permanente des TV du bar pendant la partie.',
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 20000,
        question: QUESTION_QCM,
        config: {
          announceMs: 8000,
          questionMs: 23000,
          showScores: true,
          wifiSsid: 'INVADER BAR',
          wifiPassword: 'invader2026',
          pauseText: '',
          musicUrl: null,
        },
      }),
  },
  {
    cle: 'projo-lobby',
    jeu: 'quiz',
    surface: 'projo',
    label: "Salle d'attente (projo)",
    description: 'Deux étapes empilées, un seul QR.',
    state: () =>
      baseState({
        status: 'lobby',
        currentQuestionIndex: -1,
        config: {
          announceMs: 8000,
          questionMs: 23000,
          showScores: true,
          wifiSsid: 'INVADER BAR',
          wifiPassword: 'invader2026',
          pauseText: '',
          musicUrl: null,
        },
      }),
  },
  {
    cle: 'projo-annonce',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Annonce (projo)',
    description: 'Compte à rebours + chips jokers.',
    state: () =>
      baseState({
        status: 'announce',
        phaseEndsAt: serverNow() + 8000,
        question: { ...QUESTION_QCM, question: undefined, answers: undefined },
        jokerFeed: [
          { pseudo: 'Léa', type: 'all_in' },
          { pseudo: 'Max', type: 'fifty' },
          { pseudo: 'Nina', type: 'audience' },
        ],
      }),
  },
  {
    cle: 'projo-annonce-audio',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Annonce audio (projo)',
    description: 'Le bandeau « extrait audio » qui prépare la salle.',
    state: () =>
      baseState({
        status: 'announce',
        phaseEndsAt: serverNow() + 8000,
        question: { ...QUESTION_QCM, question: undefined, answers: undefined, musicUrl: extraitDemoUrl },
      }),
  },
  {
    cle: 'projo-annonce-video',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Annonce vidéo (projo)',
    description: 'Le bandeau « vidéo », avec une question spéciale en plus.',
    state: () =>
      baseState({
        status: 'announce',
        phaseEndsAt: serverNow() + 8000,
        special: 'double',
        question: {
          ...QUESTION_QCM,
          question: undefined,
          answers: undefined,
          videoYoutube: 'M7lc1UVf-VE?time=10&duration=30',
        },
      }),
  },
  {
    cle: 'projo-question',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Question QCM (projo)',
    description: "L'énoncé d'abord, les réponses en fondu à 3 s.",
    sauts: [
      ['Question', 500],
      ['Réponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 20000,
        question: QUESTION_QCM,
      }),
  },
  {
    cle: 'projo-question-audio',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Question audio (projo)',
    description: "Pré-roll 5 s « écoute bien », l'extrait continue ensuite.",
    sauts: [
      ['Extrait', 1000],
      ['Question', AUDIO_PREROLL_MS + 400],
      ['Réponses', AUDIO_PREROLL_MS + QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 28000,
        question: { ...QUESTION_QCM, question: 'Quel jeu utilise ce thème musical ?', musicUrl: extraitDemoUrl },
      }),
  },
  {
    cle: 'projo-video',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Question vidéo (projo)',
    description: 'FullscreenVideo réel : vérifier les caches du titre YouTube.',
    state: () =>
      baseState({
        status: 'media',
        phaseEndsAt: serverNow() + 31000,
        question: {
          ...QUESTION_QCM,
          question: 'De quel jeu vient cette cinématique ?',
          videoYoutube: 'M7lc1UVf-VE?time=10&duration=30',
        },
      }),
  },
  {
    cle: 'projo-reveal',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Révélation (projo)',
    description: 'Barres → réponse → podium ⚡ → podium 🔥.',
    state: () => baseState({ status: 'reveal', question: QUESTION_QCM, reveal: revealBase() }),
  },
  {
    cle: 'projo-reveal-image',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Révélation + image (projo)',
    description: "L'image occupe la place des podiums, puis s'efface.",
    state: () => {
      const r = revealBase();
      return baseState({
        status: 'reveal',
        question: {
          ...QUESTION_QCM,
          question:
            'Dans quel jeu culte de 1998 incarne-t-on un héros muet armé d’un pied-de-biche, coincé dans un complexe de recherche ?',
          imageAnswerUrl:
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#1b1040"/><text x="50%" y="50%" fill="#7ef" font-size="42" font-family="sans-serif" text-anchor="middle">IMAGE DE RÉPONSE</text></svg>',
            ),
        },
        reveal: r,
      });
    },
  },
  {
    cle: 'projo-reveal-estimation',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Révélation estimation (projo)',
    description: 'Pas de bonus vitesse : les séries prennent tout.',
    state: () => {
      const r = revealBase();
      r.correctIndex = undefined;
      r.correctAnswer = undefined;
      r.expectedNumber = 1998;
      r.percents = undefined;
      r.fastestTop = [];
      r.bestEstimations = [
        { pseudo: 'Léa', value: 1998, gap: 0, points: 3 },
        { pseudo: 'Sam', value: 1996, gap: 2, points: 2 },
        { pseudo: 'Nina', value: 2001, gap: 3, points: 1 },
      ];
      return baseState({
        status: 'reveal',
        question: {
          ...QUESTION_QCM,
          type: 'estimation',
          answers: undefined,
          question: 'En quelle année est sortie la PlayStation 1 au Japon ?',
          musicUrl: extraitDemoUrl,
        },
        reveal: r,
      });
    },
  },
  {
    cle: 'projo-classement-moyen',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Classement (projo) · 18 joueurs',
    description: 'Podium plein + 2 colonnes, soirée normale.',
    state: () =>
      baseState({
        status: 'leaderboard',
        standings: PSEUDOS.slice(0, 18).map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: i === 1 ? 2 : i === 4 ? -1 : 0,
          device: 'mobile',
          score: Math.max(1, 46 - i * 2),
        })),
      }),
  },
  {
    cle: 'projo-classement',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Classement (projo) · 40 joueurs',
    description: 'Podium compact + 4 colonnes, salle pleine.',
    state: () =>
      baseState({
        status: 'leaderboard',
        standings: PSEUDOS.map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: i === 1 ? 2 : i === 4 ? -1 : 0,
          device: 'mobile',
          score: Math.max(1, 62 - i * 3 + (i % 3)),
        })),
      }),
  },
  {
    cle: 'projo-fin-animee',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Fin de partie (projo, animée)',
    description: 'La vraie séquence aux vrais timings : cinématique, récompenses, fin. ~60 s en boucle.',
    state: () =>
      baseState({
        status: 'cinematic',
        cinematic: { step: 0 },
        standings: PSEUDOS.map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: 0,
          device: 'mobile',
          score: Math.max(1, 62 - i * 3 + (i % 3)),
        })),
      }),
  },
  {
    cle: 'projo-classement-final',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Classement final (projo)',
    description: 'Fin de cinématique : le classement complet, scores dévoilés.',
    state: () =>
      baseState({
        status: 'cinematic',
        cinematic: { step: 6 },
        standings: PSEUDOS.map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: i === 1 ? 2 : i === 4 ? -1 : 0,
          device: 'mobile',
          score: Math.max(1, 62 - i * 3 + (i % 3)),
        })),
      }),
  },
  {
    cle: 'projo-mentions',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Mentions spéciales (projo)',
    description: 'Les 4 mentions dévoilées, la valeur du record dans la case.',
    state: () =>
      baseState({
        status: 'rewards',
        rewards: {
          revealed: 4,
          fastest: { pseudo: 'Léa', avgMs: 3120 },
          bestRatio: { pseudo: 'Marco', correct: 18, answered: 20 },
          bestStrike: { pseudo: 'Sam', strike: 9 },
          bonnetDane: { pseudo: 'Tom', correct: 3, answered: 19 },
        },
      }),
  },
  {
    cle: 'projo-fin',
    jeu: 'quiz',
    surface: 'projo',
    label: 'Écran de fin (projo)',
    description: 'Gagnant, podium et texte de fin, confettis.',
    state: () =>
      baseState({
        status: 'end',
        endTexts: {
          winnerText: 'Félicitations à Marco qui remporte un Cocktail signature !',
          endText: 'Rendez-vous mercredi pour le quiz Séries cultes !',
        },
        standings: PSEUDOS.slice(0, 12).map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: 0,
          device: 'mobile',
          score: Math.max(1, 46 - i * 3),
        })),
      }),
  },

  // -------------------------------------------------------------------------
  // BATTLE ROYALE — joueur
  // -------------------------------------------------------------------------
  {
    cle: 'br-lobby',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Salle d\u2019attente',
    description: 'Inscrit, en attente du lancement de la manche 1.',
    state: () => baseBattle({ status: 'lobby' }, { roundNumber: 0, survivorCount: 0 }),
    you: () => baseYouBattle({ score: 0 }, { generalRank: null, roundNumber: 0 }),
  },
  {
    cle: 'br-regles',
    jeu: 'battle',
    surface: 'joueur',
    label: 'R\u00e8gles (t\u00e9l\u00e9phone)',
    description: 'La s\u00e9quence tutorielle battle, chapitre par chapitre.',
    regles: 'battle',
    state: () => baseBattle({ status: 'rules' }, { roundNumber: 0, survivorCount: 0 }),
    you: () => baseYouBattle({ score: 0 }, { generalRank: null, roundNumber: 0 }),
  },
  {
    cle: 'br-question',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Question (en vie)',
    description: 'QCM \u00e0 15 s, le joueur est encore survivant.',
    sauts: [
      ['Question', 500],
      ['R\u00e9ponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseBattle({ status: 'question', phaseEndsAt: serverNow() + 15000, question: QUESTION_BATTLE }),
    you: () => baseYouBattle(),
  },
  {
    cle: 'br-question-elimine',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Question (\u00e9limin\u00e9)',
    description: 'Bandeau \u00ab continue pour les points bonus \u00bb.',
    state: () =>
      baseBattle({ status: 'question', phaseEndsAt: serverNow() + 15000, question: QUESTION_BATTLE }),
    you: () =>
      baseYouBattle({ status: 'eliminated' }, { eliminatedThisRound: true, roundRank: 19 }),
  },
  {
    cle: 'br-verdict',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Verdict en suspens',
    description: 'L\u2019animateur v\u00e9rifie, la salle retient son souffle.',
    state: () =>
      baseBattle({ status: 'verdict', question: QUESTION_BATTLE }, { verdictPending: true }),
    you: () => baseYouBattle({ answered: true }),
  },
  {
    cle: 'br-reveal-survie',
    jeu: 'battle',
    surface: 'joueur',
    label: 'R\u00e9v\u00e9lation : je survis',
    description: 'Bonne r\u00e9ponse, +1 point, toujours en vie.',
    state: () =>
      baseBattle({ status: 'reveal', question: QUESTION_BATTLE }, { survivorCount: 14, reveal: revealBattle() }),
    you: () => baseYouBattle({ answered: true, score: 35 }),
  },
  {
    cle: 'br-reveal-elimine',
    jeu: 'battle',
    surface: 'joueur',
    label: 'R\u00e9v\u00e9lation : je tombe',
    description: 'Mauvaise r\u00e9ponse, \u00e9limination et place de manche.',
    state: () =>
      baseBattle({ status: 'reveal', question: QUESTION_BATTLE }, { survivorCount: 14, reveal: revealBattle() }),
    you: () =>
      baseYouBattle({ answered: true, status: 'eliminated' }, { eliminatedThisRound: true, roundRank: 15 }),
  },
  {
    cle: 'br-reveal-repechage',
    jeu: 'battle',
    surface: 'joueur',
    label: 'R\u00e9v\u00e9lation : rep\u00eachage',
    description: 'Tout le monde tombait, l\u2019animateur rep\u00eache.',
    state: () =>
      baseBattle(
        { status: 'reveal', question: QUESTION_BATTLE },
        { survivorCount: 18, reveal: { ...revealBattle(), eliminated: [], repechage: true, survivorsAfter: 18 } },
      ),
    you: () => baseYouBattle({ answered: true }),
  },
  {
    cle: 'br-fin-manche',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Fin de manche',
    description: 'Place de la manche, bonus et rang au g\u00e9n\u00e9ral.',
    state: () =>
      baseBattle(
        { status: 'round_end' },
        {
          survivorCount: 1,
          generalStandings: standingsBattle(),
          roundResult: {
            roundNumber: 2,
            entries: PSEUDOS.slice(0, 20).map((pseudo, i) => ({
              pseudo,
              rank: i + 1,
              bonus: [25, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1][i] ?? 0,
              survived: i === 0,
            })),
          },
        },
      ),
    you: () => baseYouBattle({ score: 58 }, { roundRank: 4, generalRank: 4 }),
  },
  {
    cle: 'br-spectateur',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Spectateur (finale)',
    description: 'Hors top 10 : la finale se regarde.',
    state: () =>
      baseBattle({ status: 'question', phaseEndsAt: serverNow() + 15000, question: QUESTION_BATTLE }, { isFinal: true, survivorCount: 6, questionInRound: 3 }),
    you: () =>
      baseYouBattle({ status: 'spectator' }, { isSpectator: true, isFinal: true, generalRank: 14 }),
  },
  {
    cle: 'br-attente-manche',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Inscrit en cours de manche',
    description: 'Entre en jeu \u00e0 la manche suivante.',
    state: () =>
      baseBattle({ status: 'question', phaseEndsAt: serverNow() + 15000, question: QUESTION_BATTLE }),
    you: () => baseYouBattle({ status: 'waiting', score: 0 }, { generalRank: null }),
  },
  {
    cle: 'br-fin',
    jeu: 'battle',
    surface: 'joueur',
    label: 'Fin de partie',
    description: 'Le vainqueur et la place finale.',
    state: () =>
      baseBattle(
        { status: 'end', endTexts: { winnerText: 'F\u00e9licitations \u00e0 Marco !', endText: '\u00c0 mercredi pour la revanche !' } },
        { isFinal: true, survivorCount: 1, finalStandings: standingsBattle(10), winner: { playerId: 'lab-0', pseudo: 'Marco' } },
      ),
    you: () => baseYouBattle({ score: 118 }, { isFinal: true, isFinalist: true, generalRank: 3 }),
  },

  // -------------------------------------------------------------------------
  // BATTLE ROYALE — projecteur
  // -------------------------------------------------------------------------
  {
    cle: 'br-projo-lobby',
    jeu: 'battle',
    surface: 'projo',
    label: 'Salle d\u2019attente (projo)',
    description: 'Deux \u00e9tapes, un QR, compte \u00e0 rebours.',
    state: () => baseBattle({ status: 'lobby' }, { roundNumber: 0, survivorCount: 0 }),
  },
  {
    cle: 'br-projo-regles',
    jeu: 'battle',
    surface: 'projo',
    label: 'R\u00e8gles (projo)',
    description: 'La s\u00e9quence tutorielle battle sur grand \u00e9cran.',
    regles: 'battle',
    state: () => baseBattle({ status: 'rules' }, { roundNumber: 0, survivorCount: 0 }),
  },
  {
    cle: 'br-projo-intro',
    jeu: 'battle',
    surface: 'projo',
    label: 'Intro de manche',
    description: 'Cat\u00e9gories, pseudos, num\u00e9ro de manche.',
    sauts: [
      ['Cat\u00e9gories', 800],
      ['Pseudos', 5200],
      ['Manche', 9200],
    ],
    state: () =>
      baseBattle({ status: 'round_intro', phaseEndsAt: serverNow() + 12000 }, { survivorCount: 40 }),
  },
  {
    cle: 'br-projo-intro-finale',
    jeu: 'battle',
    surface: 'projo',
    label: 'Intro de finale',
    description: 'Les dix finalistes annonc\u00e9s.',
    sauts: [
      ['Cat\u00e9gories', 800],
      ['Finalistes', 5200],
      ['Finale', 9200],
    ],
    state: () =>
      baseBattle(
        { status: 'round_intro', phaseEndsAt: serverNow() + 12000 },
        { isFinal: true, survivorCount: 10, roundNumber: 4, generalStandings: standingsBattle(12) },
      ),
  },
  {
    cle: 'br-projo-annonce',
    jeu: 'battle',
    surface: 'projo',
    label: 'Annonce + d\u00e9compte',
    description: 'Cat\u00e9gorie, difficult\u00e9, puis 3-2-1.',
    sauts: [
      ['Cat\u00e9gorie', 500],
      ['D\u00e9compte', 3200],
    ],
    state: () =>
      baseBattle({ status: 'announce', phaseEndsAt: serverNow() + 6000, question: QUESTION_BATTLE }),
  },
  {
    cle: 'br-projo-question',
    jeu: 'battle',
    surface: 'projo',
    label: 'Question (projo)',
    description: 'Chrono 15 s, compteur de survivants.',
    sauts: [
      ['Question', 500],
      ['R\u00e9ponses', QUESTION_REPONSES_MS + 400],
    ],
    state: () =>
      baseBattle({ status: 'question', phaseEndsAt: serverNow() + 15000, question: QUESTION_BATTLE }),
  },
  {
    cle: 'br-projo-verdict',
    jeu: 'battle',
    surface: 'projo',
    label: 'Verdict (projo)',
    description: 'Suspense pendant que l\u2019animateur v\u00e9rifie.',
    state: () =>
      baseBattle({ status: 'verdict', question: QUESTION_BATTLE }, { verdictPending: true }),
  },
  {
    cle: 'br-projo-reveal',
    jeu: 'battle',
    surface: 'projo',
    label: 'R\u00e9v\u00e9lation (projo)',
    description: 'R\u00e9ponse, \u00e9limin\u00e9s un par un, survivants.',
    sauts: [
      ['R\u00e9ponse', 600],
      ['\u00c9limin\u00e9s', 2600],
      ['Survivants', 6000],
    ],
    state: () =>
      baseBattle({ status: 'reveal', question: QUESTION_BATTLE }, { survivorCount: 14, reveal: revealBattle() }),
  },
  {
    cle: 'br-projo-palier',
    jeu: 'battle',
    surface: 'projo',
    label: 'Palier TOP 10',
    description: 'La prise d\u2019\u00e9cran plein cadre du legacy.',
    sauts: [
      ['R\u00e9ponse', 600],
      ['\u00c9limin\u00e9s', 2600],
      ['Palier', 7000],
    ],
    state: () =>
      baseBattle(
        { status: 'reveal', question: QUESTION_BATTLE },
        {
          survivorCount: 10,
          reveal: { ...revealBattle(), milestone: 10, survivorsBefore: 13, survivorsAfter: 10 },
          generalStandings: standingsBattle(12),
        },
      ),
  },
  {
    cle: 'br-projo-repechage',
    jeu: 'battle',
    surface: 'projo',
    label: 'Rep\u00eachage (projo)',
    description: '\u00c9galit\u00e9 : personne ne tombe.',
    state: () =>
      baseBattle(
        { status: 'reveal', question: QUESTION_BATTLE },
        { survivorCount: 18, reveal: { ...revealBattle(), eliminated: [], repechage: true, survivorsAfter: 18 } },
      ),
  },
  {
    cle: 'br-projo-victoire',
    jeu: 'battle',
    surface: 'projo',
    label: 'Victoire (projo)',
    description: 'Dernier survivant de la finale.',
    state: () =>
      baseBattle(
        { status: 'reveal', question: QUESTION_BATTLE },
        {
          isFinal: true,
          survivorCount: 1,
          reveal: { ...revealBattle(), eliminated: [{ pseudo: 'L\u00e9a', reason: 'wrong' }], survivorsBefore: 2, survivorsAfter: 1, victory: true },
          winner: { playerId: 'lab-0', pseudo: 'Marco' },
        },
      ),
  },
  {
    cle: 'br-projo-fin-manche',
    jeu: 'battle',
    surface: 'projo',
    label: 'Fin de manche (projo)',
    description: 'Top 10 qualifi\u00e9 et peloton pagin\u00e9.',
    state: () =>
      baseBattle({ status: 'round_end' }, { survivorCount: 1, generalStandings: standingsBattle() }),
  },
  {
    cle: 'br-projo-pause',
    jeu: 'battle',
    surface: 'projo',
    label: 'Pause (projo)',
    description: 'Pseudos qui d\u00e9rivent et compte \u00e0 rebours.',
    state: () => baseBattle({ status: 'pause' }, { survivorCount: 18 }),
  },
  {
    cle: 'br-projo-fondu',
    jeu: 'battle',
    surface: 'projo',
    label: 'Fondu de fin',
    description: 'Les cinq secondes avant le retour \u00e0 l\u2019accueil.',
    state: () => baseBattle({ status: 'closing' }, { survivorCount: 1 }),
  },
  {
    cle: 'br-projo-fin',
    jeu: 'battle',
    surface: 'projo',
    label: '\u00c9cran de fin (projo)',
    description: 'Vainqueur, classement final, confettis.',
    state: () =>
      baseBattle(
        { status: 'end', endTexts: { winnerText: 'F\u00e9licitations \u00e0 Marco qui remporte un Cocktail signature !', endText: 'Rendez-vous mercredi pour la revanche !' } },
        { isFinal: true, survivorCount: 1, finalStandings: standingsBattle(20), winner: { playerId: 'lab-0', pseudo: 'Marco' } },
      ),
  },
];

export type { JokerType };
