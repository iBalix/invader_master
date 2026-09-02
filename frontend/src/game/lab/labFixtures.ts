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
  type JokerType,
  type PublicState,
  type RevealData,
  type You,
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

export interface LabScenario {
  cle: string;
  groupe: 'Joueur' | 'Projecteur';
  label: string;
  description: string;
  state: () => PublicState;
  you?: () => You;
  /** boutons « Aller a » dedies (ms depuis phaseStartedAt) ; sinon defauts du groupe */
  sauts?: Array<[string, number]>;
  /** bandeau d'ejection sur l'ecran d'inscription (scenario AFK) */
  joinNotice?: string;
}

export const SCENARIOS: LabScenario[] = [
  {
    cle: 'regles',
    groupe: 'Joueur',
    label: 'Règles (titre + 9 chapitres)',
    description: "7 s par chapitre, puis ça se fige sur l'attente.",
    state: () => baseState({ status: 'rules' }),
    you: () => baseYou({}),
  },
  {
    cle: 'annonce',
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
    label: 'Éjection AFK (inscription)',
    description: "L'écran que voit un joueur retiré pour inactivité.",
    state: () => baseState({ status: 'question', phaseEndsAt: serverNow() + 20000, question: QUESTION_QCM }),
    joinNotice: 'Tu as été retiré de la partie après 5 questions sans réponse. Rejoins quand tu veux !',
  },
  {
    cle: 'question-fifty',
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
    label: 'Roue de tirage seule',
    description: 'Le composant JokerWheel, en boucle.',
    state: () => baseState({ status: 'lobby' }),
    you: () => baseYou({}),
  },
  {
    cle: 'pause-joueur',
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Joueur',
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
    groupe: 'Projecteur',
    label: 'Règles (projo)',
    description: 'La même séquence que les joueurs, en grand.',
    state: () => baseState({ status: 'rules' }),
  },
  {
    cle: 'projo-media',
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
    label: 'Révélation (projo)',
    description: 'Barres → réponse → podium ⚡ → podium 🔥.',
    state: () => baseState({ status: 'reveal', question: QUESTION_QCM, reveal: revealBase() }),
  },
  {
    cle: 'projo-reveal-image',
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
    groupe: 'Projecteur',
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
];

export type { JokerType };
