/**
 * Calcul des résultats d'une question à la révélation.
 * Pur (pas d'accès DB) : testable et réutilisable par le mode battle.
 */

import type {
  AnswerRow,
  FreeTextVerdict,
  PlayerResult,
  PlayerRow,
  QuestionSnapshot,
  RevealData,
  SessionConfig,
  SpecialQuestion,
} from './types.js';

interface ComputeInput {
  question: QuestionSnapshot;
  answers: AnswerRow[]; // réponses de la question courante
  players: PlayerRow[]; // joueurs actifs
  qdPlayerIds: Set<string>;
  special: SpecialQuestion | null;
  config: SessionConfig;
  questionWindowMs: number; // fenêtre réelle de la question (plausibilité vitesse)
  verdicts: Record<string, FreeTextVerdict>; // free_text : playerId -> verdict
}

export interface ComputedReveal {
  reveal: RevealData;
  /** par playerId : correct/points pour persister sur game_answers */
  perAnswer: Record<string, { isCorrect: boolean; points: number }>;
  /** par playerId : delta de score + stats mises à jour */
  perPlayer: Record<
    string,
    { delta: number; correct: boolean; answered: boolean; elapsedMs: number | null }
  >;
}

function isPlausibleElapsed(elapsed: number | null, windowMs: number): boolean {
  return elapsed !== null && elapsed >= 150 && elapsed <= windowMs + 3000;
}

export function computeReveal(input: ComputeInput): ComputedReveal {
  const { question: q, answers, players, qdPlayerIds, special, config, verdicts } = input;
  const byPlayer = new Map(answers.map((a) => [a.player_id, a]));
  const results: Record<string, PlayerResult> = {};
  const perAnswer: ComputedReveal['perAnswer'] = {};
  const perPlayer: ComputedReveal['perPlayer'] = {};

  // Répartition QCM en %
  let percents: number[] | undefined;
  if (q.type === 'qcm') {
    const counts = new Array(q.answers.length).fill(0);
    for (const a of answers) {
      const c = a.answer.choice;
      if (typeof c === 'number' && c >= 0 && c < counts.length) counts[c] += 1;
    }
    const total = answers.length || 1;
    percents = counts.map((n) => Math.round((n / total) * 100));
  }

  // Tiers d'estimation triés par écart croissant
  const tiers = (q.estimationScoring ?? [])
    .slice()
    .sort((a, b) => a.maxGap - b.maxGap);

  // Bonus vitesse : le plus rapide des bons répondeurs QCM (temps client plausible)
  let fastest: { playerId: string; pseudo: string; elapsed: number } | null = null;

  const estimationEntries: Array<{ pseudo: string; value: number; gap: number; points: number }> =
    [];

  for (const player of players) {
    const a = byPlayer.get(player.id);
    const answered = Boolean(a);
    let correct = false;
    let points = 0;
    let value: string | number | undefined;
    let gap: number | undefined;

    if (a) {
      if (q.type === 'qcm') {
        correct = a.answer.choice === q.correctIndex;
        points = correct ? q.points : 0;
        value = typeof a.answer.choice === 'number' ? a.answer.choice : undefined;
      } else if (q.type === 'estimation') {
        const num = typeof a.answer.number === 'number' ? a.answer.number : NaN;
        value = Number.isFinite(num) ? num : undefined;
        if (Number.isFinite(num) && q.expectedNumber !== null) {
          gap = Math.abs(num - q.expectedNumber);
          const tier = tiers.find((t) => (gap as number) <= t.maxGap);
          if (tier) {
            correct = true;
            points = tier.points;
          }
        }
      } else {
        // free_text
        value = typeof a.answer.text === 'string' ? a.answer.text : undefined;
        const verdict = verdicts[player.id];
        correct = Boolean(verdict?.accepted);
        points = correct ? q.points : 0;
      }

      // Question spéciale GM
      if (special === 'double') points *= 2;
      if (special === 'quitte_double' && q.type === 'qcm' && !correct) points = -2;

      // Quitte ou double joueur : x2 si correct, rien sinon
      if (qdPlayerIds.has(player.id) && correct) points *= 2;

      // Top estimations : points APRÈS multiplicateurs, pour rester cohérent
      // avec les points réellement crédités (reveal.results)
      if (q.type === 'estimation' && typeof value === 'number' && gap !== undefined) {
        estimationEntries.push({ pseudo: player.pseudo, value, gap, points });
      }

      // Bonus vitesse (QCM uniquement)
      if (
        q.type === 'qcm' &&
        config.speedBonus &&
        correct &&
        isPlausibleElapsed(a.elapsed_ms, input.questionWindowMs)
      ) {
        if (!fastest || (a.elapsed_ms as number) < fastest.elapsed) {
          fastest = { playerId: player.id, pseudo: player.pseudo, elapsed: a.elapsed_ms as number };
        }
      }

      perAnswer[player.id] = { isCorrect: correct, points };
    }

    results[player.pseudo] = {
      answered,
      correct,
      points,
      qd: qdPlayerIds.has(player.id),
      value,
      gap,
    };
    perPlayer[player.id] = {
      delta: points,
      correct,
      answered,
      elapsedMs: a?.elapsed_ms ?? null,
    };
  }

  // Applique le +1 vitesse
  if (fastest) {
    results[fastest.pseudo].points += 1;
    perPlayer[fastest.playerId].delta += 1;
    perAnswer[fastest.playerId].points += 1;
  }

  estimationEntries.sort((a, b) => a.gap - b.gap);

  const reveal: RevealData = {
    answeredCount: answers.length,
    results,
    percents,
    fastest: fastest?.pseudo ?? null,
    special,
    ...(q.type === 'qcm'
      ? { correctIndex: q.correctIndex, correctAnswer: q.answers[q.correctIndex] }
      : {}),
    ...(q.type === 'estimation' && q.expectedNumber !== null
      ? { expectedNumber: q.expectedNumber, bestEstimations: estimationEntries.slice(0, 5) }
      : {}),
    ...(q.type === 'free_text' && q.expectedAnswer
      ? { expectedAnswer: q.expectedAnswer }
      : {}),
  };

  return { reveal, perAnswer, perPlayer };
}
