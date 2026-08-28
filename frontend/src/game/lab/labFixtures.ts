/**
 * Fabriques d'états factices pour le laboratoire (/game-lab).
 *
 * AUCUN appel API : tout est fabriqué ici, avec des pseudos et des scores
 * plausibles, pour monter chaque écran du quiz dans l'état exact qu'on veut
 * regarder. `phaseStartedAt` est calé sur serverNow() au moment de la demande,
 * donc les séquences cadencées (règles, post-reveal) se jouent en vrai.
 */

import {
  serverNow,
  type JokerType,
  type PublicState,
  type RevealData,
  type You,
} from '../lib/gameClient';

const PSEUDOS = [
  'Marco', 'Léa', 'Sam', 'Nina', 'Hugo', 'Emma', 'Tom', 'Julie',
  'Alex', 'Zoé', 'Max', 'Lily', 'Nico', 'Eva', 'Paul', 'Mia',
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

function revealBase(): RevealData {
  const results: RevealData['results'] = {};
  PSEUDOS.forEach((p, i) => {
    const correct = i % 3 !== 0;
    results[p] = {
      answered: true,
      correct,
      points: correct ? 2 : 0,
      allIn: false,
      streak: correct ? (i % 5) + 1 : 0,
      streakBefore: i % 5,
      streakBonus: false,
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
      { pseudo: 'Léa', elapsedMs: 1840 },
      { pseudo: 'Toi', elapsedMs: 2120 },
      { pseudo: 'Max', elapsedMs: 2480 },
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
}

export const SCENARIOS: LabScenario[] = [
  {
    cle: 'regles',
    groupe: 'Joueur',
    label: 'Règles (8 chapitres)',
    description: 'La séquence boucle, chaque chapitre dure 8 s.',
    state: () => baseState({ status: 'rules' }),
    you: () => baseYou({}),
  },
  {
    cle: 'annonce',
    groupe: 'Joueur',
    label: 'Annonce + jokers',
    description: 'Fenêtre des jokers ouverte, deux en main.',
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
    description: 'Grille de réponses, jokers jouables en bas.',
    state: () =>
      baseState({
        status: 'question',
        phaseEndsAt: serverNow() + 23000,
        question: QUESTION_QCM,
      }),
    you: () => baseYou({ jokers: ['fifty', 'audience'] }),
  },
  {
    cle: 'question-fifty',
    groupe: 'Joueur',
    label: 'Question + 50/50 joué',
    description: 'Deux mauvaises réponses barrées.',
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
    description: 'Jauges de répartition sur les choix.',
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
        { pseudo: 'Toi', elapsedMs: 1710 },
        { pseudo: 'Léa', elapsedMs: 1840 },
        { pseudo: 'Max', elapsedMs: 2480 },
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
          score: 30 - i * 2,
        })),
      }),
    you: () => baseYou({}),
  },
  // --- projecteur ---
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
    cle: 'projo-reveal',
    groupe: 'Projecteur',
    label: 'Révélation (projo)',
    description: 'Barres → réponse → podium ⚡ → gains 🎁.',
    state: () => {
      const r = revealBase();
      r.jokerAwards = [
        { pseudo: 'Nina', type: 'fifty' },
        { pseudo: 'Hugo', type: 'audience' },
        { pseudo: 'Emma', type: 'all_in' },
        { pseudo: 'Tom', type: 'fifty' },
      ];
      r.results.Léa.streakBonus = true;
      r.results.Léa.streak = 6;
      return baseState({ status: 'reveal', question: QUESTION_QCM, reveal: r });
    },
  },
  {
    cle: 'projo-classement',
    groupe: 'Projecteur',
    label: 'Classement (projo)',
    description: 'Podium + colonnes.',
    state: () =>
      baseState({
        status: 'leaderboard',
        standings: PSEUDOS.map((p, i) => ({
          pseudo: p,
          position: i + 1,
          positionChange: i === 1 ? 2 : i === 4 ? -1 : 0,
          device: 'mobile',
          score: 34 - i * 2,
        })),
      }),
  },
];

export type { JokerType };
