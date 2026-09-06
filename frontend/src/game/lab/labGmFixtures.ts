/**
 * États factices de la CONSOLE ANIMATEUR, pour le laboratoire.
 *
 * C'est la surface la moins testée du parc et pourtant celle que l'animateur
 * tient en main toute la soirée, dans le noir, avec un micro dans l'autre.
 * Elle ne pouvait jusqu'ici se regarder qu'en lançant une vraie partie.
 *
 * Les corps de console (`BattleGmBody`) ne font aucun appel réseau : ils
 * reçoivent l'état et une fonction d'action. Le laboratoire leur passe ces
 * fixtures et une action sans effet.
 */

import type { GmState } from '../../pages/BattleLivePage';

const PSEUDOS = [
  'Marco', 'Léa', 'Sam', 'Nina', 'Hugo', 'Emma', 'Tom', 'Julie',
  'Alex', 'Zoé', 'Max', 'Lily', 'Nico', 'Eva', 'Paul', 'Mia',
];

function joueurs(): GmState['gm']['players'] {
  return PSEUDOS.map((pseudo, i) => ({
    id: `lab-${i}`,
    pseudo,
    device: i % 4 === 0 ? 'table' : 'mobile',
    score: Math.max(1, 62 - i * 3 + (i % 3)),
    status: i < 9 ? 'active' : i < 14 ? 'eliminated' : 'waiting',
    stats: { correctCount: 12 - (i % 5), answerCount: 14 },
  }));
}

function file(): GmState['gm']['battle'] extends null ? never : NonNullable<GmState['gm']['battle']>['queue'] {
  const item = (id: string, question: string, difficulty: string) => ({
    id,
    question,
    answers: ['Réponse A', 'Réponse B', 'Réponse C', 'Réponse D'],
    correctIndex: 1,
    difficulty,
    theme: 'Cinéma',
    helpStory: "L'anecdote que l'animateur lit à voix haute pendant la révélation.",
  });
  return {
    Facile: [item('f1', 'Quelle est la capitale de l’Italie ?', 'Facile')],
    Moyen: [
      item('m1', 'Quel réalisateur a signé « Le Voyage de Chihiro » ?', 'Moyen'),
      item('m2', 'En quelle année sort la première PlayStation ?', 'Moyen'),
    ],
    Difficile: [item('d1', 'Quel est le plus long fleuve d’Asie ?', 'Difficile')],
  };
}

function classement(n = PSEUDOS.length) {
  return PSEUDOS.slice(0, n).map((pseudo, i) => ({
    playerId: `lab-${i}`,
    pseudo,
    score: Math.max(1, 96 - i * 4 + (i % 3)),
    position: i + 1,
    qualifiedForFinal: i < 10,
    isSpectator: false,
  }));
}

function base(over: Partial<GmState> = {}, battleOver: Record<string, unknown> = {}): GmState {
  const now = Date.now();
  return {
    id: 'lab',
    joinCode: 'LAB1',
    mode: 'battle',
    status: 'reveal',
    quizName: 'Battle Royale',
    serverNow: now,
    phaseStartedAt: now,
    phaseEndsAt: null,
    currentQuestionIndex: 12,
    playerCount: 9,
    config: { musicVolume: 0.35, sfxVolume: 0.8, mediaVolume: 0.9, wifiSsid: 'INVADER BAR', testMode: true },
    ...over,
    gm: {
      currentQuestion: {
        question: 'Quel réalisateur a signé « Le Voyage de Chihiro » ?',
        answers: ['Isao Takahata', 'Hayao Miyazaki', 'Mamoru Hosoda', 'Makoto Shinkai'],
        correctIndex: 1,
        difficulty: 'Moyen',
        theme: 'Cinéma',
        helpAnimator: "Le film a remporté l'Oscar du meilleur film d'animation en 2003.",
      },
      players: joueurs(),
      battle: {
        roundNumber: 2,
        roundQuestionCount: 5,
        isFinal: false,
        nextDifficulty: 'Moyen',
        verdict: null,
        queue: file(),
        eliminatedCount: 5,
        waitingCount: 2,
        spectatorCount: 0,
        botCount: 3,
        reveal: null,
        roundResult: null,
        generalStandings: null,
        finalStandings: null,
        winner: null,
        victoryPending: false,
        ...battleOver,
      },
    },
  } as GmState;
}

export interface LabGmScenario {
  cle: string;
  label: string;
  description: string;
  state: () => GmState;
}

export const GM_BATTLE: LabGmScenario[] = [
  {
    cle: 'gm-br-lobby',
    label: 'Salle d’attente',
    description: 'Avant le lancement : règles, manche 1, pause.',
    state: () => base({ status: 'lobby', playerCount: 16 }, { roundNumber: 0, roundQuestionCount: 0 }),
  },
  {
    cle: 'gm-br-question',
    label: 'Question en cours',
    description: 'Le chrono tourne, annuler et rejouer sont là.',
    state: () =>
      base({ status: 'question', phaseEndsAt: Date.now() + 15000 }),
  },
  {
    cle: 'gm-br-verdict',
    label: 'Verdict à corriger',
    description: 'Le panneau central : quatre éliminations provisoires.',
    state: () =>
      base(
        { status: 'verdict' },
        {
          verdict: {
            computing: false,
            pending: [
              { playerId: 'lab-3', pseudo: 'Nina', reason: 'wrong', choice: 0, elapsedMs: 4210, overturned: null },
              { playerId: 'lab-6', pseudo: 'Tom', reason: 'wrong', choice: 3, elapsedMs: 6890, overturned: null },
              { playerId: 'lab-7', pseudo: 'Julie', reason: 'timeout', choice: null, elapsedMs: null, overturned: null },
              { playerId: 'lab-8', pseudo: 'Alex', reason: 'wrong', choice: 2, elapsedMs: 8120, overturned: null },
            ],
            correctPseudos: ['Marco', 'Léa', 'Sam', 'Hugo', 'Emma'],
            answeredCount: 9,
            survivorsBefore: 9,
            survivorsAfter: 5,
            repechage: false,
          },
        },
      ),
  },
  {
    cle: 'gm-br-verdict-zero',
    label: 'Verdict : zéro survivant',
    description: 'Les deux issues proposées, repêchage ou co-vainqueurs.',
    state: () =>
      base(
        { status: 'verdict' },
        {
          verdict: {
            computing: false,
            pending: [
              { playerId: 'lab-0', pseudo: 'Marco', reason: 'wrong', choice: 0, elapsedMs: 3100, overturned: null },
              { playerId: 'lab-1', pseudo: 'Léa', reason: 'wrong', choice: 2, elapsedMs: 5400, overturned: null },
              { playerId: 'lab-2', pseudo: 'Sam', reason: 'timeout', choice: null, elapsedMs: null, overturned: null },
            ],
            correctPseudos: [],
            answeredCount: 3,
            survivorsBefore: 3,
            survivorsAfter: 0,
            repechage: false,
          },
        },
      ),
  },
  {
    cle: 'gm-br-reveal',
    label: 'Révélation verrouillée',
    description: 'Le bouton attend la fin de la séquence.',
    state: () =>
      base(
        { status: 'reveal', phaseStartedAt: Date.now() },
        {
          reveal: {
            correctAnswer: 'Hayao Miyazaki',
            eliminated: [
              { pseudo: 'Nina', reason: 'wrong' },
              { pseudo: 'Tom', reason: 'wrong' },
              { pseudo: 'Julie', reason: 'timeout' },
            ],
            repechage: false,
            survivorsBefore: 9,
            survivorsAfter: 6,
            milestone: null,
          },
        },
      ),
  },
  {
    cle: 'gm-br-fin-manche',
    label: 'Fin de manche',
    description: 'Classement général, manche suivante ou finale.',
    state: () =>
      base({ status: 'round_end' }, {
        generalStandings: classement(),
        roundResult: {
          roundNumber: 2,
          entries: PSEUDOS.slice(0, 12).map((pseudo, i) => ({
            pseudo,
            rank: i + 1,
            bonus: [25, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9][i] ?? 0,
            survived: i === 0,
          })),
        },
      }),
  },
  {
    cle: 'gm-br-fin',
    label: 'Fin de partie',
    description: 'Le classement FINAL, pas celui d’avant la finale.',
    state: () =>
      base({ status: 'end' }, {
        isFinal: true,
        winner: { pseudo: 'Marco' },
        generalStandings: classement(),
        finalStandings: classement(10),
      }),
  },
];
