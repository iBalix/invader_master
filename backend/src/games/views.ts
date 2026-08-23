/**
 * Vues d'état filtrées par rôle.
 *
 * Règle d'or : la vue publique (joueurs, écrans) ne contient JAMAIS la bonne
 * réponse avant la révélation, ni les verdicts IA. Le GM a tout.
 */

import { nextDifficultyFor } from './battleFlow.js';
import type { PlayerRow, QuestionSnapshot, SessionRow } from './types.js';

function ms(iso: string | null): number | null {
  return iso ? new Date(iso).getTime() : null;
}

const QUESTION_VISIBLE_STATUSES = ['question', 'locked', 'reveal'];
// battle : la question reste affichée pendant la vérification (habillage
// suspense), mais la bonne réponse n'arrive toujours qu'avec runtime.reveal
const BATTLE_QUESTION_VISIBLE_STATUSES = ['question', 'locked', 'verdict', 'reveal'];

function publicQuestion(session: SessionRow): Record<string, unknown> | null {
  const q = session.question_order[session.current_question_index];
  if (!q) return null;
  const base = {
    index: session.current_question_index,
    total: session.question_order.length,
    type: q.type,
    difficulty: q.difficulty,
    points: q.points,
    theme: q.theme,
  };
  const visible =
    session.mode === 'battle' ? BATTLE_QUESTION_VISIBLE_STATUSES : QUESTION_VISIBLE_STATUSES;
  if (!visible.includes(session.status)) {
    // pendant l'annonce : catégorie/difficulté/points seulement
    return base;
  }
  return {
    ...base,
    question: q.question,
    answers: q.type === 'qcm' ? q.answers : undefined,
    musicUrl: q.musicUrl,
    videoYoutube: q.videoYoutube,
    imageQuestionUrl: q.imageQuestionUrl,
    imageAnswerUrl: session.status === 'reveal' ? q.imageAnswerUrl : undefined,
  };
}

function publicStandings(session: SessionRow): unknown {
  let standings = session.runtime.standings;
  if (!standings) return undefined;
  // Les scores ne sont visibles que si la config l'autorise, ou sur le
  // classement final (cinématique terminée / fin de partie / récompenses).
  const cine = session.runtime.cinematic;
  const finalReveal =
    session.status === 'end' ||
    session.status === 'rewards' ||
    (session.status === 'cinematic' && (cine?.step ?? 0) >= 6);
  const showScores = session.config.showScores || finalReveal;
  // Anti-spoiler cinématique : tant que le suspense court (steps 0..5), seuls
  // les rangs du top 5 DÉJÀ dévoilés sortent (step 1 = 5e, step 2 = 4e, ...).
  // Sans ce filtre, un client curieux lirait tout le podium dès le tambour.
  if (session.status === 'cinematic' && (cine?.step ?? 0) < 6) {
    const revealedFrom = 6 - (cine?.step ?? 0);
    standings = standings.filter((s) => s.position >= revealedFrom && s.position <= 5);
  }
  return standings.map((s) => ({
    pseudo: s.pseudo,
    position: s.position,
    positionChange: s.positionChange,
    device: s.device,
    score: showScores ? s.score : undefined,
  }));
}

/** bloc battle de la vue publique : jamais de verdict provisoire ni de bonne réponse */
function publicBattle(session: SessionRow, players: PlayerRow[]): Record<string, unknown> | undefined {
  const b = session.runtime.battle;
  if (session.mode !== 'battle' || !b) return undefined;
  // le compteur public de survivants est DÉRIVÉ des statuts persistés en DB :
  // pendant le verdict, la salle voit le compte d'avant validation GM
  const survivorCount = players.filter((p) => p.status === 'active').length;
  return {
    roundNumber: b.roundNumber,
    isFinal: b.isFinal,
    // numero de la question DANS la manche (les ecrans ne doivent jamais
    // afficher l'index global : la finale repart a 1)
    questionInRound: b.roundQuestionCount,
    survivorCount,
    finalSize: session.config.finalSize ?? 10,
    verdictPending: session.status === 'verdict',
    reveal: session.status === 'reveal' ? b.reveal : undefined,
    roundResult: session.status === 'round_end' ? b.roundResult : undefined,
    generalStandings:
      session.status === 'round_end' || session.status === 'end'
        ? b.generalStandings
        : undefined,
    finalStandings: session.status === 'end' ? b.finalStandings : undefined,
    winner: session.status === 'end' ? b.winner ?? null : undefined,
  };
}

export function buildPublicState(
  session: SessionRow,
  players: PlayerRow[],
): Record<string, unknown> {
  const active = players.filter((p) => p.status === 'active');
  const qi = session.current_question_index;
  const cfg = session.config;
  return {
    id: session.id,
    joinCode: session.join_code,
    mode: session.mode,
    status: session.status,
    quizName: cfg.quizName ?? 'Quiz',
    v: session.state_version,
    serverNow: Date.now(),
    phaseStartedAt: ms(session.phase_started_at),
    phaseEndsAt: ms(session.phase_ends_at),
    currentQuestionIndex: qi,
    totalQuestions: session.question_order.length,
    config: {
      announceMs: cfg.announceMs,
      questionMs: cfg.questionMs,
      qdPerPlayer: cfg.qdPerPlayer,
      showScores: cfg.showScores,
      wifiSsid: cfg.wifiSsid,
      wifiPassword: cfg.wifiPassword,
      pauseText: cfg.pauseText,
      musicUrl: cfg.musicUrl,
      // Remonté pour que la console affiche sans ambiguïté qu'on est en partie
      // de test. Le champ est whitelisté ici, pas déversé : ne pas remplacer ce
      // bloc par un spread de cfg, il contient des textes de pilotage.
      testMode: cfg.testMode === true,
    },
    playerCount: active.length,
    // en battle, tout le monde est "eliminated" entre deux manches : l'ecran bar
    // doit annoncer les PARTICIPANTS, pas les seuls survivants du moment
    participantCount: players.filter((p) => p.status !== 'removed').length,
    players: active.map((p) => ({ pseudo: p.pseudo, device: p.device })),
    question: publicQuestion(session),
    qdFeed: (session.runtime.qd?.[String(qi)] ?? []).map((x) => x.pseudo),
    special: session.runtime.special ?? null,
    judging: session.runtime.judge?.running ?? false,
    reveal: session.status === 'reveal' ? session.runtime.reveal : undefined,
    standings: publicStandings(session),
    cinematic: session.status === 'cinematic' ? { step: session.runtime.cinematic?.step ?? 0 } : undefined,
    rewards: session.status === 'rewards' ? session.runtime.rewards : undefined,
    endTexts: session.status === 'end' ? session.runtime.endTexts : undefined,
    battle: publicBattle(session, players),
    ended: Boolean(session.ended_at),
  };
}

export function buildYou(
  session: SessionRow,
  player: PlayerRow,
  answered: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    playerId: player.id,
    pseudo: player.pseudo,
    score: player.score,
    status: player.status,
    qdLeft: player.bonuses.qdLeft ?? 0,
    qdActive: (session.runtime.qd?.[String(session.current_question_index)] ?? []).some(
      (x) => x.playerId === player.id,
    ),
    answered,
    strike: player.stats.strike ?? 0,
  };
  const b = session.runtime.battle;
  if (session.mode === 'battle' && b) {
    const myElimination = b.eliminationGroups
      .flat()
      .find((e) => e.playerId === player.id);
    base.battle = {
      // place au général (dispo après la première fin de manche)
      generalRank:
        b.generalStandings?.find((s) => s.playerId === player.id)?.position ?? null,
      eliminatedThisRound: Boolean(myElimination),
      // place de manche partagée du groupe d'élimination
      roundRank: myElimination?.rank ?? null,
      isFinalist: b.isFinal && player.status !== 'spectator' && player.status !== 'waiting',
      isSpectator: player.status === 'spectator',
      isFinal: b.isFinal,
      roundNumber: b.roundNumber,
    };
  }
  return base;
}

export function buildGmState(
  session: SessionRow,
  players: PlayerRow[],
): Record<string, unknown> {
  const pub = buildPublicState(session, players);
  const q = session.question_order[session.current_question_index] ?? null;
  const next = session.question_order[session.current_question_index + 1] ?? null;
  const gmQuestion = (snap: QuestionSnapshot | null) =>
    snap
      ? {
          type: snap.type,
          question: snap.question,
          answers: snap.answers,
          correctIndex: snap.correctIndex,
          correctAnswer: snap.type === 'qcm' ? snap.answers[snap.correctIndex] : undefined,
          expectedAnswer: snap.expectedAnswer,
          expectedNumber: snap.expectedNumber,
          estimationScoring: snap.estimationScoring,
          difficulty: snap.difficulty,
          points: snap.points,
          theme: snap.theme,
          helpAnimator: snap.helpAnimator,
          musicUrl: snap.musicUrl,
          videoYoutube: snap.videoYoutube,
          imageQuestionUrl: snap.imageQuestionUrl,
        }
      : null;

  return {
    ...pub,
    gm: {
      currentQuestion: gmQuestion(q),
      nextQuestion: gmQuestion(next),
      verdicts: session.runtime.judge?.verdicts ?? {},
      judgeRunning: session.runtime.judge?.running ?? false,
      players: players.map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        device: p.device,
        score: p.score,
        status: p.status,
        qdLeft: p.bonuses.qdLeft ?? 0,
        stats: p.stats,
        joinedAt: p.joined_at,
      })),
      // classement GM : toujours avec les scores
      standings: session.runtime.standings,
      special: session.runtime.special ?? null,
      previousStatus: session.previous_status,
      startedAt: session.started_at,
      battle: gmBattle(session, players),
    },
  };
}

/** bloc battle de la vue GM : verdict éditable, file de tirage, classements */
function gmBattle(session: SessionRow, players: PlayerRow[]): Record<string, unknown> | undefined {
  const b = session.runtime.battle;
  if (session.mode !== 'battle' || !b) return undefined;
  const verdict = b.verdict
    ? {
        computing: b.verdict.computing,
        pending: b.verdict.pending,
        correctPseudos: b.verdict.correctPseudos,
        answeredCount: b.verdict.answeredCount,
        survivorsBefore: b.verdict.survivorsBefore,
        repechage: b.verdict.repechage,
        // survivants effectifs si le GM valide en l'état
        survivorsAfter: b.verdict.repechage
          ? b.verdict.survivorsBefore
          : b.verdict.survivorsBefore - b.verdict.pending.filter((p) => !p.overturned).length,
      }
    : null;
  return {
    roundNumber: b.roundNumber,
    roundQuestionCount: b.roundQuestionCount,
    isFinal: b.isFinal,
    nextDifficulty: nextDifficultyFor(b.isFinal, b.roundQuestionCount + 1),
    verdict,
    queue: b.queue,
    excludedCount: b.excludedIds.length,
    eliminatedCount: players.filter((p) => p.status === 'eliminated').length,
    waitingCount: players.filter((p) => p.status === 'waiting').length,
    spectatorCount: players.filter((p) => p.status === 'spectator').length,
    botCount: players.filter((p) => p.device === 'bot').length,
    reveal: b.reveal ?? null,
    roundResult: b.roundResult ?? null,
    generalStandings: b.generalStandings ?? null,
    finalStandings: b.finalStandings ?? null,
    winner: b.winner ?? null,
    victoryPending: b.victoryPending ?? false,
  };
}
