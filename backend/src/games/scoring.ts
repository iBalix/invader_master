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
import { SPEED_BONUS, STREAK_BONUS_FROM } from './types.js';

interface ComputeInput {
  question: QuestionSnapshot;
  answers: AnswerRow[]; // réponses de la question courante
  players: PlayerRow[]; // joueurs actifs
  /** joueurs ayant arme le joker all-in sur cette question */
  allInPlayerIds: Set<string>;
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
  const { question: q, answers, players, allInPlayerIds, special, config, verdicts } = input;
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

  // Bonus vitesse : les QCM corrects les plus rapides (temps client plausible)
  // se partagent SPEED_BONUS, 2 points pour le premier puis 1. Avant : un seul
  // gagnant a +1 ; a 40 joueurs c'etait invisible, le podium fait vivre trois
  // personnes par question sans diluer la prime du plus rapide.
  const rapides: Array<{ playerId: string; pseudo: string; elapsed: number }> = [];

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

      // Joker all-in : x3 si correct, -points de la question si faux.
      // Applique seulement si le joueur a REPONDU : une deconnexion n'est pas
      // une erreur, on ne punit pas l'absence.
      if (allInPlayerIds.has(player.id)) {
        points = correct ? points * 3 : -q.points;
      }

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
        rapides.push({ playerId: player.id, pseudo: player.pseudo, elapsed: a.elapsed_ms as number });
      }
    }

    // Serie de bonnes reponses : +1 a partir de la STREAK_BONUS_FROM-ieme
    // consecutive. Le strike d'AVANT la question vit dans player.stats.strike ;
    // applyReveal persiste ensuite exactement la meme regle (strike remis a 0
    // si pas correct, y compris sans reponse : s'abstenir ne protege pas la
    // serie, sinon on esquiverait les questions dures pour la garder).
    const strikeAvant = player.stats.strike ?? 0;
    const streak = correct ? strikeAvant + 1 : 0;
    const streakBonus = correct && streak >= STREAK_BONUS_FROM;
    if (streakBonus) points += 1;

    if (a) perAnswer[player.id] = { isCorrect: correct, points };

    results[player.pseudo] = {
      answered,
      correct,
      points,
      allIn: allInPlayerIds.has(player.id),
      streak,
      streakBefore: strikeAvant,
      streakBonus,
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

  // Applique le bonus vitesse place par place. Egalite parfaite de temps :
  // l'ordre d'inscription tranche, comme avant pour le gagnant unique.
  rapides.sort((x, y) => x.elapsed - y.elapsed);
  const fastestTop = rapides.slice(0, SPEED_BONUS.length);
  fastestTop.forEach((r, place) => {
    const prime = SPEED_BONUS[place];
    results[r.pseudo].points += prime;
    perPlayer[r.playerId].delta += prime;
    if (perAnswer[r.playerId]) perAnswer[r.playerId].points += prime;
  });

  estimationEntries.sort((a, b) => a.gap - b.gap);

  const reveal: RevealData = {
    answeredCount: answers.length,
    results,
    percents,
    fastestTop: fastestTop.map((r, place) => ({
      pseudo: r.pseudo,
      elapsedMs: r.elapsed,
      bonus: SPEED_BONUS[place],
    })),
    fastest: fastestTop[0]?.pseudo ?? null,
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
