/**
 * Machine à états du mode QUIZ.
 *
 * Cycle : lobby → (rules) → announce → question → locked → reveal
 *         → leaderboard / cinematic → ... → rewards → end
 * Les transitions announce→question et question→locked sont automatiques
 * (timestamps serveur) ; le reste est piloté par le gamemaster.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { judgeFreeText } from './aiJudge.js';
import {
  generateJoinCode,
  generatePlayerToken,
  loadPlayers,
  loadSession,
  markDirty,
  registerAdvancer,
  setPhase,
  validatePseudo,
  withSession,
} from './engine.js';
import { broadcast } from './realtime.js';
import { computeReveal } from './scoring.js';
import {
  ANSWER_GRACE_MS,
  AUDIO_EXTRA_MS,
  DEFAULT_CONFIG,
  DIFFICULTY_POINTS,
  IMAGE_EXTRA_MS,
  VIDEO_EXTRA_BASE_MS,
  type AnswerRow,
  type PlayerRow,
  type QuestionSnapshot,
  type RewardsData,
  type SessionConfig,
  type SessionRow,
  type SpecialQuestion,
  type StandingEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export function questionWindowMs(q: QuestionSnapshot, config: SessionConfig): number {
  let ms = config.questionMs;
  if (q.musicUrl) ms += AUDIO_EXTRA_MS;
  if (q.imageQuestionUrl) ms += IMAGE_EXTRA_MS;
  if (q.videoYoutube) {
    const m = q.videoYoutube.match(/duration=(\d+)/);
    ms += (m ? parseInt(m[1], 10) * 1000 : 15000) + VIDEO_EXTRA_BASE_MS;
  }
  return ms;
}

function currentQuestion(session: SessionRow): QuestionSnapshot | null {
  return session.question_order[session.current_question_index] ?? null;
}

// ---------------------------------------------------------------------------
// Transitions automatiques (synchrone, enregistrées dans l'engine)
// ---------------------------------------------------------------------------

const CINEMATIC_INTRO_MS = 3800; // roulement de tambour
const CINEMATIC_STEP_MS = 4500; // une place dévoilée
const REWARD_STEP_MS = 6000;

function quizAdvance(session: SessionRow): boolean {
  const q = currentQuestion(session);
  switch (session.status) {
    case 'announce': {
      if (!q) return false;
      setPhase(session, 'question', questionWindowMs(q, session.config));
      return true;
    }
    case 'question': {
      // la vraie deadline de la question devient le début du locked : la grâce
      // de réponse (ANSWER_GRACE_MS) reste exacte même si cette transition est
      // appliquée en retard (rattrapage paresseux, timer mort)
      const deadline = session.phase_ends_at;
      setPhase(session, 'locked', null);
      if (deadline) session.phase_started_at = deadline;
      if (q?.type === 'free_text') {
        session.runtime.judge = { running: true, verdicts: {} };
        queueJudging(session.id, session.current_question_index);
      }
      return true;
    }
    case 'cinematic': {
      const cine = session.runtime.cinematic;
      if (!cine) return false;
      // étapes : 0=intro tambour, 1..5 = 5e,4e,3e,2e,1er, 6 = classement complet
      if (cine.step >= 6) {
        session.phase_ends_at = null;
        markDirty(session);
        return true;
      }
      cine.step += 1;
      // saute les places sans joueur (parties à moins de 5 joueurs)
      while (cine.step >= 1 && cine.step <= 5 && 6 - cine.step > cine.ranks.length) {
        cine.step += 1;
      }
      const isLast = cine.step >= 6;
      setPhase(session, 'cinematic', isLast ? null : CINEMATIC_STEP_MS);
      return true;
    }
    case 'rewards': {
      const rewards = session.runtime.rewards;
      if (!rewards) return false;
      if (rewards.revealed >= 4) {
        session.phase_ends_at = null;
        markDirty(session);
        return true;
      }
      rewards.revealed += 1;
      setPhase(session, 'rewards', rewards.revealed >= 4 ? null : REWARD_STEP_MS);
      return true;
    }
    default:
      return false;
  }
}

registerAdvancer('quiz', quizAdvance);

function queueJudging(sessionId: string, questionIndex: number): void {
  setTimeout(async () => {
    try {
      const { data } = await supabaseAdmin
        .from('game_answers')
        .select('player_id, answer')
        .eq('session_id', sessionId)
        .eq('question_index', questionIndex);
      const players = await loadPlayers(sessionId);
      const pseudoById = new Map(players.map((p) => [p.id, p.pseudo]));
      await withSession(sessionId, async (session) => {
        const q = currentQuestion(session);
        if (!q || q.type !== 'free_text' || session.current_question_index !== questionIndex) {
          return;
        }
        // idempotence : ne juge que si un jugement est encore attendu (un
        // double-scheduling ou un job obsolète ne doit ni recoûter un appel
        // OpenAI ni écraser un état déjà rendu)
        if (session.runtime.judge?.running !== true) return;
        const entries = ((data as Array<{ player_id: string; answer: { text?: string } }>) ?? [])
          .filter((a) => pseudoById.has(a.player_id))
          .map((a) => ({ playerId: a.player_id, text: a.answer.text ?? '' }));
        const verdicts = await judgeFreeText(q.question, q.expectedAnswer ?? '', entries);
        // les verdicts déjà tranchés par le GM priment sur l'IA
        for (const [pid, v] of Object.entries(session.runtime.judge?.verdicts ?? {})) {
          if (v.source === 'gm') verdicts[pid] = v;
        }
        session.runtime.judge = { running: false, verdicts };
        markDirty(session);
      });
    } catch (err) {
      console.error('[quiz] judging error', err);
      await withSession(sessionId, async (session) => {
        if (session.runtime.judge) {
          session.runtime.judge.running = false;
          markDirty(session);
        }
      }).catch(() => undefined);
    }
  }, 10);
}

// ---------------------------------------------------------------------------
// Création de session
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function createQuizSession(
  quizId: string,
  configPatch: Partial<SessionConfig> = {},
): Promise<SessionRow> {
  const { data: quiz, error: quizError } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single();
  if (quizError || !quiz) {
    throw Object.assign(new Error('Quiz introuvable'), { httpStatus: 404 });
  }

  const { data: links, error: linkError } = await supabaseAdmin
    .from('quiz_questions')
    .select('question_id, position, questions(*)')
    .eq('quiz_id', quizId)
    .order('position');
  if (linkError) throw linkError;

  const snapshots: QuestionSnapshot[] = [];
  for (const link of (links ?? []) as unknown as Array<{ questions: Record<string, unknown> | null }>) {
    const q = link.questions;
    if (!q) continue;
    const type = ((q.type as string) ?? 'qcm') as QuestionSnapshot['type'];
    const rawDifficulty = q.difficulty;
    const difficulty = Array.isArray(rawDifficulty)
      ? ((rawDifficulty[0] as string) ?? 'Moyen')
      : ((rawDifficulty as string) ?? 'Moyen');
    const pointsOverride = q.points_override as number | null;
    // Estimation : le bareme reel vient des paliers, pas de la difficulte.
    // On expose le MEILLEUR palier pour que l'annonce ne sous-vende pas la
    // question (le joueur mise son quitte-ou-double sur cette valeur).
    const tiers = (q.estimation_scoring as Array<{ points?: number }> | null) ?? null;
    const bestTier =
      type === 'estimation' && Array.isArray(tiers) && tiers.length > 0
        ? Math.max(...tiers.map((t) => Number(t.points) || 0))
        : null;
    const points = pointsOverride ?? bestTier ?? DIFFICULTY_POINTS[difficulty] ?? 2;

    // QCM : mélange des réponses figé pour la session
    let answers = (q.answers as string[]) ?? [];
    let correctIndex = (q.correct_answer_index as number) ?? 0;
    if (type === 'qcm' && answers.length > 0) {
      const correctAnswer = answers[correctIndex];
      answers = shuffle(answers);
      correctIndex = answers.indexOf(correctAnswer);
    }

    snapshots.push({
      id: q.id as string,
      type,
      question: (q.question as string) ?? '',
      answers,
      correctIndex,
      difficulty,
      points,
      theme: (q.theme as string) ?? null,
      helpAnimator: (q.help_animator as string) ?? null,
      musicUrl: (q.music_url as string) ?? null,
      videoYoutube: (q.video_youtube as string) ?? null,
      imageQuestionUrl: (q.image_question_url as string) ?? null,
      imageAnswerUrl: (q.image_answer_url as string) ?? null,
      expectedAnswer: (q.expected_answer as string) ?? null,
      expectedNumber: q.expected_number !== null && q.expected_number !== undefined
        ? Number(q.expected_number)
        : null,
      estimationScoring: (q.estimation_scoring as QuestionSnapshot['estimationScoring']) ?? null,
    });
  }

  if (snapshots.length === 0) {
    throw Object.assign(new Error('Ce quiz ne contient aucune question'), { httpStatus: 400 });
  }

  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    musicUrl: (quiz.background_music_url as string) ?? DEFAULT_CONFIG.musicUrl,
    pauseText: (quiz.pause_promotional_text as string) ?? DEFAULT_CONFIG.pauseText,
    endWinnerText: (quiz.end_winner_text as string) ?? DEFAULT_CONFIG.endWinnerText,
    endTextFinal: (quiz.end_text_final as string) ?? DEFAULT_CONFIG.endTextFinal,
    ...configPatch,
    // le nom du quiz voyage dans la config (affichages)
    quizName: quiz.name as string,
  };

  // Un seul run actif à la fois : on clôt les sessions actives précédentes
  await supabaseAdmin
    .from('game_sessions')
    .update({ ended_at: new Date().toISOString(), status: 'end' })
    .is('ended_at', null);

  // join_code unique (retry sur collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .insert({
        mode: 'quiz',
        status: 'lobby',
        join_code: joinCode,
        quiz_id: quizId,
        config,
        question_order: snapshots,
        current_question_index: -1,
        runtime: {},
        state_version: 1,
      })
      .select('*')
      .single();
    if (!error) return data as SessionRow;
    if (!`${error.message}`.includes('duplicate')) throw error;
  }
  throw new Error('Impossible de générer un code de session unique');
}

// ---------------------------------------------------------------------------
// Reveal (calcul des scores)
// ---------------------------------------------------------------------------

async function loadAnswers(sessionId: string, questionIndex: number): Promise<AnswerRow[]> {
  const { data, error } = await supabaseAdmin
    .from('game_answers')
    .select('*')
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex);
  if (error) throw error;
  return (data as AnswerRow[]) ?? [];
}

async function applyReveal(session: SessionRow): Promise<void> {
  const q = currentQuestion(session);
  if (!q) throw Object.assign(new Error('Pas de question courante'), { httpStatus: 409 });
  const qi = session.current_question_index;
  const [answers, players] = await Promise.all([
    loadAnswers(session.id, qi),
    loadPlayers(session.id),
  ]);
  const active = players.filter((p) => p.status === 'active');
  const qdIds = new Set((session.runtime.qd?.[String(qi)] ?? []).map((x) => x.playerId));

  const computed = computeReveal({
    question: q,
    answers,
    players: active,
    qdPlayerIds: qdIds,
    special: session.runtime.special ?? null,
    config: session.config,
    questionWindowMs: questionWindowMs(q, session.config),
    verdicts: session.runtime.judge?.verdicts ?? {},
  });

  // Idempotence : si une tentative précédente a été interrompue entre les
  // écritures et le saveSession, les réponses déjà jugées (points_awarded posé)
  // ne sont ni réécrites ni recréditées au joueur (pas de double crédit).
  const alreadyJudged = new Set(
    answers.filter((a) => a.points_awarded !== null).map((a) => a.player_id),
  );

  // Persiste les réponses jugées (en parallèle : pas de N+1 sous le mutex)
  const answerWrites = answers
    .filter((a) => !alreadyJudged.has(a.player_id) && computed.perAnswer[a.player_id])
    .map((a) => {
      const res = computed.perAnswer[a.player_id];
      return supabaseAdmin
        .from('game_answers')
        .update({
          is_correct: res.isCorrect,
          points_awarded: res.points,
          ai_verdict: session.runtime.judge?.verdicts?.[a.player_id] ?? null,
        })
        .eq('id', a.id);
    });

  // Met à jour scores + stats joueurs (strike compris). Les joueurs déjà
  // crédités (alreadyJudged) sont sautés ; ceux qui n'ont pas répondu ont un
  // delta 0 et des stats idempotentes (strike remis à 0).
  const playerWrites = active
    .filter((p) => computed.perPlayer[p.id] && !alreadyJudged.has(p.id))
    .map((p) => {
      const r = computed.perPlayer[p.id];
      const stats = {
        strike: r.correct ? (p.stats.strike ?? 0) + 1 : 0,
        bestStrike: Math.max(p.stats.bestStrike ?? 0, r.correct ? (p.stats.strike ?? 0) + 1 : 0),
        correctCount: (p.stats.correctCount ?? 0) + (r.correct ? 1 : 0),
        answerCount: (p.stats.answerCount ?? 0) + (r.answered ? 1 : 0),
        totalTimeMs: (p.stats.totalTimeMs ?? 0) + (r.correct && r.elapsedMs ? r.elapsedMs : 0),
      };
      return supabaseAdmin
        .from('game_players')
        .update({ score: p.score + r.delta, stats })
        .eq('id', p.id);
    });

  const results = await Promise.all([...answerWrites, ...playerWrites]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;

  session.runtime.reveal = computed.reveal;
  session.runtime.judge = undefined;
  setPhase(session, 'reveal', null);
}

// ---------------------------------------------------------------------------
// Rollback (annuler / rejouer une question)
// ---------------------------------------------------------------------------

async function rollbackQuestion(session: SessionRow): Promise<void> {
  const qi = session.current_question_index;
  const wasRevealed = session.status === 'reveal' && !session.runtime.reveal?.cancelled;

  // Rembourse les quitte-ou-double de la question (en parallèle)
  const activations = session.runtime.qd?.[String(qi)] ?? [];
  await Promise.all(
    activations.map(async (act) => {
      const { data: p } = await supabaseAdmin
        .from('game_players')
        .select('bonuses')
        .eq('id', act.playerId)
        .maybeSingle();
      if (p) {
        const bonuses = { ...(p.bonuses as { qdLeft?: number }) };
        bonuses.qdLeft = (bonuses.qdLeft ?? 0) + 1;
        await supabaseAdmin.from('game_players').update({ bonuses }).eq('id', act.playerId);
      }
    }),
  );
  if (session.runtime.qd) delete session.runtime.qd[String(qi)];

  // Supprime les réponses de la question
  await supabaseAdmin
    .from('game_answers')
    .delete()
    .eq('session_id', session.id)
    .eq('question_index', qi);

  // Si la question avait été révélée : reconstruit scores et stats depuis zéro
  if (wasRevealed) {
    await rebuildPlayersFromAnswers(session);
  }
  session.runtime.judge = undefined;
  session.runtime.special = null;
}

async function rebuildPlayersFromAnswers(session: SessionRow): Promise<void> {
  const players = await loadPlayers(session.id);
  const { data } = await supabaseAdmin
    .from('game_answers')
    .select('player_id, question_index, is_correct, points_awarded, elapsed_ms')
    .eq('session_id', session.id)
    .not('points_awarded', 'is', null)
    .order('question_index');
  const rows = (data ?? []) as Array<{
    player_id: string;
    question_index: number;
    is_correct: boolean;
    points_awarded: number;
    elapsed_ms: number | null;
  }>;
  const byPlayer = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }
  await Promise.all(
    players.map((p) => {
      const list = byPlayer.get(p.id) ?? [];
      let score = 0;
      let strike = 0;
      let bestStrike = 0;
      let correctCount = 0;
      let totalTimeMs = 0;
      // Le strike se reconstruit sur la séquence des questions RÉPONDUES jugées ;
      // approximation fidèle au comportement courant.
      for (const r of list) {
        score += r.points_awarded;
        if (r.is_correct) {
          strike += 1;
          bestStrike = Math.max(bestStrike, strike);
          correctCount += 1;
          totalTimeMs += r.elapsed_ms ?? 0;
        } else {
          strike = 0;
        }
      }
      // Les points manuels du GM sont stockés dans stats.manualPoints
      const manual = (p.stats as { manualPoints?: number }).manualPoints ?? 0;
      return supabaseAdmin
        .from('game_players')
        .update({
          score: score + manual,
          stats: {
            ...p.stats,
            strike,
            bestStrike,
            correctCount,
            answerCount: list.length,
            totalTimeMs,
          },
        })
        .eq('id', p.id);
    }),
  );
}

// ---------------------------------------------------------------------------
// Classements, récompenses, fin
// ---------------------------------------------------------------------------

export function buildStandings(session: SessionRow, players: PlayerRow[]): StandingEntry[] {
  const last = session.runtime.lastStandings ?? {};
  const sorted = players
    .filter((p) => p.status === 'active')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.stats.correctCount ? a.stats.totalTimeMs / a.stats.correctCount : Infinity;
      const tb = b.stats.correctCount ? b.stats.totalTimeMs / b.stats.correctCount : Infinity;
      return ta - tb;
    });
  return sorted.map((p, i) => ({
    pseudo: p.pseudo,
    score: p.score,
    position: i + 1,
    positionChange: last[p.pseudo] ? last[p.pseudo] - (i + 1) : 0,
    device: p.device,
  }));
}

function computeRewards(session: SessionRow, players: PlayerRow[]): RewardsData {
  const total = session.question_order.length;
  const active = players.filter((p) => p.status === 'active');
  const participated = active.filter((p) => (p.stats.answerCount ?? 0) >= total * 0.7);

  const fastestCandidates = active.filter((p) => (p.stats.correctCount ?? 0) >= Math.max(2, total * 0.3));
  const fastest = fastestCandidates
    .map((p) => ({ pseudo: p.pseudo, avgMs: p.stats.totalTimeMs / p.stats.correctCount }))
    .sort((a, b) => a.avgMs - b.avgMs)[0] ?? null;

  const ratioSorted = participated
    .filter((p) => (p.stats.answerCount ?? 0) > 0)
    .map((p) => ({
      pseudo: p.pseudo,
      correct: p.stats.correctCount ?? 0,
      answered: p.stats.answerCount ?? 0,
      ratio: (p.stats.correctCount ?? 0) / (p.stats.answerCount ?? 1),
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const strike = active
    .map((p) => ({ pseudo: p.pseudo, strike: p.stats.bestStrike ?? 0 }))
    .sort((a, b) => b.strike - a.strike)[0] ?? null;

  return {
    fastest,
    bestRatio: ratioSorted[0]
      ? { pseudo: ratioSorted[0].pseudo, correct: ratioSorted[0].correct, answered: ratioSorted[0].answered }
      : null,
    bestStrike: strike && strike.strike >= 2 ? strike : null,
    bonnetDane: ratioSorted.length > 1
      ? {
          pseudo: ratioSorted[ratioSorted.length - 1].pseudo,
          correct: ratioSorted[ratioSorted.length - 1].correct,
          answered: ratioSorted[ratioSorted.length - 1].answered,
        }
      : null,
    revealed: 0,
  };
}

// ---------------------------------------------------------------------------
// Actions gamemaster
// ---------------------------------------------------------------------------

export interface ActionParams {
  special?: SpecialQuestion | null;
  pseudo?: string;
  points?: number;
  playerId?: string;
  accepted?: boolean;
  config?: Partial<SessionConfig>;
}

function assertStatus(session: SessionRow, allowed: SessionRow['status'][], action: string): void {
  if (!allowed.includes(session.status)) {
    throw Object.assign(
      new Error(`Action "${action}" impossible depuis l'état "${session.status}"`),
      { httpStatus: 409 },
    );
  }
}

function goAnnounce(session: SessionRow, index: number, special: SpecialQuestion | null): void {
  if (index >= session.question_order.length) {
    throw Object.assign(new Error('Plus de questions dans ce quiz'), { httpStatus: 409 });
  }
  session.current_question_index = index;
  session.runtime.special = special ?? null;
  session.runtime.reveal = undefined;
  session.runtime.judge = undefined;
  setPhase(session, 'announce', session.config.announceMs);
}

export async function gmAction(
  sessionId: string,
  action: string,
  params: ActionParams = {},
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.ended_at && action !== 'stop') {
      throw Object.assign(new Error('Session terminée'), { httpStatus: 409 });
    }
    switch (action) {
      case 'rules': {
        assertStatus(session, ['lobby', 'rules'], action);
        setPhase(session, session.status === 'rules' ? 'lobby' : 'rules', null);
        break;
      }
      case 'start': {
        assertStatus(session, ['lobby', 'rules'], action);
        session.started_at = session.started_at ?? new Date().toISOString();
        goAnnounce(session, 0, params.special ?? null);
        break;
      }
      case 'next': {
        assertStatus(session, ['reveal', 'leaderboard', 'cinematic'], action);
        goAnnounce(session, session.current_question_index + 1, params.special ?? null);
        break;
      }
      case 'reveal': {
        assertStatus(session, ['question', 'locked'], action);
        if (session.runtime.judge?.running) {
          throw Object.assign(new Error('Jugement IA en cours, réessaie dans un instant'), {
            httpStatus: 409,
          });
        }
        // Reponse libre revelee EN AVANCE (pendant la question) : le jugement IA
        // n'a pas encore ete lance par la transition question->locked. Sans ce
        // passage force, toutes les reponses seraient comptees fausses.
        const revealQ = currentQuestion(session);
        if (
          session.status === 'question' &&
          revealQ?.type === 'free_text' &&
          !session.runtime.judge
        ) {
          // on verrouille et on lance le jugement : le GM revele au clic suivant
          // (l'UI affiche "Jugement IA en cours"). Pas d'exception ici, sinon la
          // mutation serait perdue et le job de jugement abandonne.
          setPhase(session, 'locked', null);
          session.runtime.judge = { running: true, verdicts: {} };
          queueJudging(session.id, session.current_question_index);
          break;
        }
        await applyReveal(session);
        break;
      }
      case 'leaderboard': {
        assertStatus(session, ['reveal', 'cinematic', 'rewards'], action);
        const players = await loadPlayers(session.id);
        const standings = buildStandings(session, players);
        session.runtime.standings = standings;
        session.runtime.lastStandings = Object.fromEntries(
          standings.map((s) => [s.pseudo, s.position]),
        );
        setPhase(session, 'leaderboard', null);
        break;
      }
      case 'cinematic': {
        assertStatus(session, ['reveal', 'leaderboard'], action);
        const players = await loadPlayers(session.id);
        const standings = buildStandings(session, players);
        session.runtime.standings = standings;
        session.runtime.lastStandings = Object.fromEntries(
          standings.map((s) => [s.pseudo, s.position]),
        );
        session.runtime.cinematic = { step: 0, ranks: standings.slice(0, 5) };
        setPhase(session, 'cinematic', CINEMATIC_INTRO_MS);
        break;
      }
      case 'pause': {
        assertStatus(session, ['lobby', 'rules', 'reveal', 'leaderboard'], action);
        session.previous_status = session.status;
        setPhase(session, 'pause', null);
        break;
      }
      case 'resume': {
        assertStatus(session, ['pause'], action);
        // fallback sûr : un 'reveal' sans runtime.reveal serait incohérent
        const target =
          (session.previous_status as SessionRow['status'] | null) ??
          (session.runtime.standings ? 'leaderboard' : 'lobby');
        setPhase(session, target, null);
        session.previous_status = null;
        break;
      }
      case 'resume-next': {
        assertStatus(session, ['pause'], action);
        session.previous_status = null;
        goAnnounce(session, session.current_question_index + 1, params.special ?? null);
        break;
      }
      case 'cancel-question': {
        assertStatus(session, ['announce', 'question', 'locked', 'reveal'], action);
        await rollbackQuestion(session);
        session.runtime.reveal = { cancelled: true, answeredCount: 0, results: {} };
        setPhase(session, 'reveal', null);
        break;
      }
      case 'replay-question': {
        assertStatus(session, ['announce', 'question', 'locked', 'reveal'], action);
        await rollbackQuestion(session);
        goAnnounce(session, session.current_question_index, params.special ?? null);
        break;
      }
      case 'rewards': {
        assertStatus(session, ['reveal', 'leaderboard', 'cinematic'], action);
        const players = await loadPlayers(session.id);
        session.runtime.rewards = computeRewards(session, players);
        setPhase(session, 'rewards', REWARD_STEP_MS);
        break;
      }
      case 'end': {
        assertStatus(session, ['reveal', 'leaderboard', 'cinematic', 'rewards'], action);
        const players = await loadPlayers(session.id);
        const standings = buildStandings(session, players);
        session.runtime.standings = standings;
        const winner = standings[0]?.pseudo ?? '?';
        session.runtime.endTexts = {
          winnerText: session.config.endWinnerText.replace(/#winner#|#pseudo_top1#/g, winner),
          endText: session.config.endTextFinal,
        };
        setPhase(session, 'end', null);
        break;
      }
      case 'stop': {
        session.ended_at = new Date().toISOString();
        setPhase(session, 'end', null);
        break;
      }
      case 'give-points': {
        const players = await loadPlayers(session.id);
        const target = players.find((p) => p.pseudo === params.pseudo);
        if (!target || typeof params.points !== 'number') {
          throw Object.assign(new Error('Joueur introuvable'), { httpStatus: 404 });
        }
        const stats = { ...target.stats } as PlayerRow['stats'] & { manualPoints?: number };
        stats.manualPoints = (stats.manualPoints ?? 0) + params.points;
        await supabaseAdmin
          .from('game_players')
          .update({ score: target.score + params.points, stats })
          .eq('id', target.id);
        markDirty(session);
        break;
      }
      case 'kick': {
        if (!params.playerId) throw Object.assign(new Error('playerId requis'), { httpStatus: 400 });
        await supabaseAdmin
          .from('game_players')
          .update({ status: 'removed' })
          .eq('id', params.playerId)
          .eq('session_id', session.id);
        markDirty(session);
        break;
      }
      case 'verdict': {
        assertStatus(session, ['locked'], action);
        if (!session.runtime.judge || !params.playerId) {
          throw Object.assign(new Error('Pas de jugement en cours'), { httpStatus: 409 });
        }
        session.runtime.judge.verdicts[params.playerId] = {
          accepted: Boolean(params.accepted),
          source: 'gm',
        };
        markDirty(session);
        break;
      }
      case 'set-config': {
        session.config = { ...session.config, ...(params.config ?? {}) };
        markDirty(session);
        break;
      }
      default:
        throw Object.assign(new Error(`Action inconnue: ${action}`), { httpStatus: 400 });
    }
    return session;
  });
}

// ---------------------------------------------------------------------------
// Actions joueurs (routes publiques)
// ---------------------------------------------------------------------------

export async function joinSession(
  session: SessionRow,
  pseudo: string,
  device: string,
): Promise<PlayerRow> {
  const validationError = validatePseudo(pseudo);
  if (validationError) {
    throw Object.assign(new Error(validationError), { httpStatus: 400 });
  }
  const trimmed = pseudo.trim();
  const { data, error } = await supabaseAdmin
    .from('game_players')
    .insert({
      session_id: session.id,
      pseudo: trimmed,
      pseudo_norm: trimmed.toLowerCase(),
      device: device || 'mobile',
      player_token: generatePlayerToken(),
      bonuses: { qdLeft: session.config.qdPerPlayer },
      stats: { strike: 0, bestStrike: 0, correctCount: 0, answerCount: 0, totalTimeMs: 0 },
    })
    .select('*')
    .single();
  if (error) {
    if (`${error.message}`.includes('duplicate') || error.code === '23505') {
      throw Object.assign(new Error('error_player_already_exists'), { httpStatus: 409 });
    }
    throw error;
  }
  // bump version + broadcast (compteur joueurs sur les écrans)
  await withSession(session.id, async (s) => {
    markDirty(s);
  });
  await broadcast(session.id, 'player-joined', { pseudo: trimmed });
  return data as PlayerRow;
}

export async function activateBonus(
  sessionId: string,
  player: PlayerRow,
  questionIndex: number,
): Promise<{ qdLeft: number }> {
  let qdLeft = 0;
  await withSession(sessionId, async (session) => {
    if (session.status !== 'announce' || session.current_question_index !== questionIndex) {
      throw Object.assign(new Error('error_bonus_window_closed'), { httpStatus: 409 });
    }
    const key = String(questionIndex);
    const list = session.runtime.qd?.[key] ?? [];
    if (list.some((x) => x.playerId === player.id)) {
      qdLeft = player.bonuses.qdLeft ?? 0;
      return; // déjà activé : idempotent
    }
    if ((player.bonuses.qdLeft ?? 0) <= 0) {
      throw Object.assign(new Error('error_no_bonus_left'), { httpStatus: 409 });
    }
    qdLeft = (player.bonuses.qdLeft ?? 0) - 1;
    await supabaseAdmin
      .from('game_players')
      .update({ bonuses: { ...player.bonuses, qdLeft } })
      .eq('id', player.id);
    session.runtime.qd = session.runtime.qd ?? {};
    session.runtime.qd[key] = [...list, { playerId: player.id, pseudo: player.pseudo }];
    markDirty(session);
  });
  await broadcast(sessionId, 'bonus', { pseudo: player.pseudo, type: 'quitte_double' });
  return { qdLeft };
}

export async function submitAnswer(
  sessionId: string,
  player: PlayerRow,
  questionIndex: number,
  answer: { choice?: number; number?: number; text?: string },
  elapsedMs: number | null,
): Promise<{ recorded: boolean; already: boolean }> {
  const session = await loadSession(sessionId);
  if (!session) throw Object.assign(new Error('Session introuvable'), { httpStatus: 404 });

  if (player.status !== 'active') {
    throw Object.assign(new Error('error_not_active'), { httpStatus: 409 });
  }
  if (session.current_question_index !== questionIndex) {
    throw Object.assign(new Error('error_wrong_question'), { httpStatus: 409 });
  }
  // Fenêtre calculée sur les timestamps PERSISTÉS (pas d'advanceIfDue sur une
  // copie jetable : effets de bord + deadline élastique si le timer est mort) :
  // - statut 'question' : jusqu'à la deadline réelle + grâce réseau
  // - statut 'locked' : phase_started_at porte la deadline réelle de la question
  const now = Date.now();
  const phaseEnds = session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null;
  const inWindow =
    (session.status === 'question' &&
      (phaseEnds === null || now <= phaseEnds + ANSWER_GRACE_MS)) ||
    (session.status === 'locked' &&
      session.phase_started_at !== null &&
      now - new Date(session.phase_started_at).getTime() <= ANSWER_GRACE_MS);
  if (!inWindow) {
    throw Object.assign(new Error('error_timeout'), { httpStatus: 409 });
  }

  const qi = session.current_question_index;
  const qd = (session.runtime.qd?.[String(qi)] ?? []).some((x) => x.playerId === player.id);

  const { error } = await supabaseAdmin.from('game_answers').insert({
    session_id: sessionId,
    player_id: player.id,
    question_index: qi,
    answer,
    elapsed_ms: elapsedMs,
    bonus: qd ? 'quitte_double' : null,
  });
  if (error) {
    if (error.code === '23505') return { recorded: true, already: true };
    throw error;
  }

  // compteur de réponses pour les écrans + feed GM (sans indication de justesse
  // sur le channel public)
  const { count } = await supabaseAdmin
    .from('game_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_index', qi);
  await broadcast(sessionId, 'answered', { qi, count: count ?? 0, pseudo: player.pseudo });

  return { recorded: true, already: false };
}
