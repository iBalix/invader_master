/**
 * Machine à états du mode BATTLE ROYALE.
 *
 * Cycle d'une manche :
 *   lobby ⇄ rules
 *     │ start-round (ou start-final depuis round_end)
 *     ▼
 *   round_intro ─auto─► announce ─auto─► question ─auto─► locked ─auto grâce─► verdict
 *     ▲                                                                          │ GM édite
 *   round_end ◄── end-round ── reveal ◄── show-results (seule écriture DB) ◄─────┘
 *   tout état ── stop ──► closing ─auto (fondu)─► end (ended_at posé ici)
 *
 * Principes :
 * - question_order est un journal append-only : un snapshot ajouté à chaque
 *   tirage (les réponses sont mélangées au tirage, used_at posé en base).
 *   Exception : en partie de test (`config.testMode`), used_at n'est PAS posé,
 *   l'exclusion ne vaut que pour la session. Cf. drawNextQuestion.
 * - Le verdict est PROVISOIRE : rien n'est persisté avant show-results, le
 *   GM corrige (bonne réponse / ressusciter / repêchage) avant que la salle
 *   ne voie un compte de survivants faux.
 * - Bonne réponse = +1 point, y compris pour les éliminés (hors finale).
 * - Fin de manche : bonus 25/20/18 puis dégressif jusqu'au 20e, rang partagé
 *   par groupe d'élimination, survivants tous rang 1.
 * - Finale : top `finalSize` du général ; classement final = ordre
 *   d'élimination inversé, ex aequo départagés au temps de la question fatale.
 */

import { supabaseAdmin } from '../config/supabase.js';
import {
  endActiveSessions,
  generatePlayerToken,
  insertSession,
  loadPlayers,
  loadSession,
  markDirty,
  registerAdvancer,
  setPhase,
  validatePseudo,
  withSession,
} from './engine.js';
import { switchScreensToDefault } from './screens.js';
import { broadcast } from './realtime.js';
import { ensureQuestionStock } from '../services/battleQuestionGen.js';
import {
  DEFAULT_BATTLE_CONFIG,
  type AnswerRow,
  type BattleEliminatedEntry,
  type BattleQueueItem,
  type BattleRuntime,
  type BattleStandingEntry,
  type BattleVerdictPending,
  type PlayerRow,
  type QuestionSnapshot,
  type SessionConfig,
  type SessionRow,
} from './types.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** bonus de fin de manche par rang (index 0 = rang 1), 0 au-delà du 20e */
export const ROUND_BONUS = [25, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/** paliers d'animation "PLUS QUE X !" */
const MILESTONES = [20, 10, 5, 3];

/** durée d'affichage du reveal de victoire avant l'écran final automatique */
const VICTORY_REVEAL_MS = 6000;

/** taille cible de la file d'aperçu GM par difficulté */
const QUEUE_TARGET = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function battle(session: SessionRow): BattleRuntime {
  if (!session.runtime.battle) {
    throw Object.assign(new Error('Session battle sans runtime battle'), { httpStatus: 500 });
  }
  return session.runtime.battle;
}

function currentQuestion(session: SessionRow): QuestionSnapshot | null {
  return session.question_order[session.current_question_index] ?? null;
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { httpStatus: status });
}

function assertStatus(session: SessionRow, allowed: SessionRow['status'][], action: string): void {
  if (!allowed.includes(session.status)) {
    throw httpError(`Action "${action}" impossible depuis l'état "${session.status}"`, 409);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** difficulté de la prochaine question (n = numéro dans la manche, 1-based) */
export function nextDifficultyFor(isFinal: boolean, n: number): string {
  if (isFinal) return n <= 3 ? 'Moyen' : 'Difficile';
  if (n <= 3) return 'Facile';
  if (n <= 8) return 'Moyen';
  return 'Difficile';
}

function graceMs(config: SessionConfig): number {
  return config.graceMs ?? 4000;
}

/** un joueur peut-il marquer des points sur une bonne réponse ? */
function canScore(player: PlayerRow, isFinal: boolean): boolean {
  if (player.status === 'active') return true;
  if (player.status === 'eliminated' && !isFinal) return true;
  return false;
}

async function loadAnswers(sessionId: string, questionIndex: number): Promise<AnswerRow[]> {
  const { data, error } = await supabaseAdmin
    .from('game_answers')
    .select('*')
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex);
  if (error) throw error;
  return (data as AnswerRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// File de tirage
// ---------------------------------------------------------------------------

async function refillQueue(session: SessionRow, difficulty: string): Promise<void> {
  const b = battle(session);
  const queue = b.queue[difficulty] ?? [];
  if (queue.length >= QUEUE_TARGET) return;

  const excluded = new Set([
    ...b.excludedIds,
    ...Object.values(b.queue).flat().map((q) => q.id),
  ]);

  const { data, error } = await supabaseAdmin
    .from('battle_questions')
    .select('id, question, answers, correct_answer_index, difficulty, theme, help_story')
    .eq('difficulty', difficulty)
    .is('used_at', null)
    .limit(60);
  if (error) throw error;

  const candidates = shuffle((data ?? []).filter((q) => !excluded.has(q.id)));
  for (const q of candidates) {
    if (queue.length >= QUEUE_TARGET) break;
    queue.push({
      id: q.id,
      question: q.question,
      answers: q.answers,
      correctIndex: q.correct_answer_index,
      difficulty: q.difficulty,
      theme: q.theme,
      helpStory: q.help_story,
    });
  }
  b.queue[difficulty] = queue;
  markDirty(session);
}

/** tire la prochaine question : consomme la file, marque used_at, ajoute le snapshot */
async function drawNextQuestion(session: SessionRow): Promise<void> {
  const b = battle(session);
  const n = b.roundQuestionCount + 1;
  const difficulty = nextDifficultyFor(b.isFinal, n);
  await refillQueue(session, difficulty);

  const item = b.queue[difficulty]?.shift();
  if (!item) {
    throw httpError(
      `Plus de questions ${difficulty} disponibles (stock épuisé, réinitialise les questions utilisées ou génère-en)`,
      409,
    );
  }

  if (session.config.testMode) {
    // Partie de test : on ne touche pas a la base. L'exclusion est portee par
    // la session, via le meme mecanisme que le retrait manuel de la file.
    // Indispensable : `used_at` restant null, sans cette ligne la question
    // pourrait ressortir au prochain refill de la MEME partie de test.
    b.excludedIds.push(item.id);
  } else {
    // consommation non destructive et définitive
    await supabaseAdmin
      .from('battle_questions')
      .update({ used_at: new Date().toISOString() })
      .eq('id', item.id);
  }

  // snapshot : réponses mélangées une fois pour toutes
  const correctAnswer = item.answers[item.correctIndex];
  const answers = shuffle(item.answers);
  session.question_order.push({
    id: item.id,
    type: 'qcm',
    question: item.question,
    answers,
    correctIndex: answers.indexOf(correctAnswer),
    difficulty: item.difficulty,
    points: 1,
    theme: item.theme,
    helpAnimator: item.helpStory,
    musicUrl: null,
    videoYoutube: null,
    imageQuestionUrl: null,
    imageAnswerUrl: null,
    expectedAnswer: null,
    expectedNumber: null,
    estimationScoring: null,
  });
  session.current_question_index = session.question_order.length - 1;
  b.roundQuestionCount = n;
  markDirty(session);

  // maintien du stock en tâche de fond
  void ensureQuestionStock().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Création de session
// ---------------------------------------------------------------------------

export async function createBattleSession(
  configPatch: Partial<SessionConfig> = {},
): Promise<SessionRow> {
  const config: SessionConfig = { ...DEFAULT_BATTLE_CONFIG, ...configPatch };

  const runtime = {
    battle: {
      roundNumber: 0,
      roundQuestionCount: 0,
      isFinal: false,
      queue: {},
      excludedIds: [],
      eliminationGroups: [],
    } satisfies BattleRuntime,
  };

  // Un seul run PROJO actif à la fois (quiz/battle s'excluent mutuellement).
  // Les jeux de tables (chess, ...) vivent en parallèle : jamais fauchés ici.
  await endActiveSessions(['quiz', 'battle']);

  const session = await insertSession({
    mode: 'battle',
    status: 'lobby',
    config,
    runtime,
  });
  void ensureQuestionStock().catch(() => undefined);
  return session;
}

// ---------------------------------------------------------------------------
// Transitions automatiques
// ---------------------------------------------------------------------------

function battleAdvance(session: SessionRow): boolean {
  const b = session.runtime.battle;
  if (!b) return false;
  switch (session.status) {
    case 'round_intro': {
      setPhase(session, 'announce', session.config.announceMs);
      return true;
    }
    case 'announce': {
      setPhase(session, 'question', session.config.questionMs);
      queueBotAnswers(session.id, session.current_question_index);
      return true;
    }
    case 'question': {
      // le locked EST la fenêtre de grâce ; sa deadline reste exacte même si
      // la transition est appliquée en retard (même principe que le quiz)
      const deadline = session.phase_ends_at;
      setPhase(session, 'locked', graceMs(session.config));
      if (deadline) {
        const deadlineMs = new Date(deadline).getTime();
        session.phase_started_at = deadline;
        session.phase_ends_at = new Date(deadlineMs + graceMs(session.config)).toISOString();
      }
      return true;
    }
    case 'locked': {
      setPhase(session, 'verdict', null);
      b.verdict = {
        computing: true,
        questionIndex: session.current_question_index,
        pending: [],
        correctPlayerIds: [],
        correctPseudos: [],
        answeredCount: 0,
        survivorsBefore: 0,
        repechage: false,
      };
      queueVerdict(session.id, session.current_question_index);
      return true;
    }
    case 'reveal': {
      // victoire de finale : le reveal expire tout seul vers l'écran final
      if (!b.victoryPending) return false;
      b.victoryPending = false;
      setPhase(session, 'end', null);
      return true;
    }
    case 'closing': {
      session.ended_at = new Date().toISOString();
      setPhase(session, 'end', null);
      // a la fin du fondu promis aux joueurs, pas au clic stop : sinon Edge
      // serait tue en plein fondu sur le projecteur
      switchScreensToDefault('battle end');
      return true;
    }
    default:
      return false;
  }
}

registerAdvancer('battle', battleAdvance);

// ---------------------------------------------------------------------------
// Verdict provisoire (job async, pattern queueJudging)
// ---------------------------------------------------------------------------

function queueVerdict(sessionId: string, questionIndex: number): void {
  setTimeout(async () => {
    try {
      const [answers, players] = await Promise.all([
        loadAnswers(sessionId, questionIndex),
        loadPlayers(sessionId),
      ]);
      await withSession(sessionId, async (session) => {
        const b = session.runtime.battle;
        const q = currentQuestion(session);
        if (
          !b ||
          !q ||
          session.status !== 'verdict' ||
          session.current_question_index !== questionIndex ||
          b.verdict?.computing !== true
        ) {
          return;
        }
        const byPlayer = new Map(answers.map((a) => [a.player_id, a]));
        const active = players.filter((p) => p.status === 'active');

        const pending: BattleVerdictPending[] = [];
        for (const p of active) {
          const a = byPlayer.get(p.id);
          const choice = typeof a?.answer.choice === 'number' ? a.answer.choice : null;
          if (a && choice === q.correctIndex) continue; // survit
          pending.push({
            playerId: p.id,
            pseudo: p.pseudo,
            reason: a ? 'wrong' : 'timeout',
            choice,
            elapsedMs: a?.elapsed_ms ?? null,
            overturned: null,
          });
        }

        const correct = players.filter((p) => {
          const a = byPlayer.get(p.id);
          return a && a.answer.choice === q.correctIndex && canScore(p, b.isFinal);
        });

        b.verdict = {
          computing: false,
          questionIndex,
          pending,
          correctPlayerIds: correct.map((p) => p.id),
          correctPseudos: correct.map((p) => p.pseudo),
          answeredCount: answers.length,
          survivorsBefore: active.length,
          repechage: false,
        };
        markDirty(session);
      });
    } catch (err) {
      console.error('[battle] verdict error', err);
      await withSession(sessionId, async (session) => {
        const v = session.runtime.battle?.verdict;
        if (v?.computing) {
          v.computing = false;
          markDirty(session);
        }
      }).catch(() => undefined);
    }
  }, 10);
}

// ---------------------------------------------------------------------------
// Bots (outil GM : peupler une partie de test)
// ---------------------------------------------------------------------------

function queueBotAnswers(sessionId: string, questionIndex: number): void {
  setTimeout(async () => {
    try {
      const session = await loadSession(sessionId);
      if (!session || session.current_question_index !== questionIndex) return;
      const b = session.runtime.battle;
      const q = currentQuestion(session);
      if (!b || !q) return;
      const players = await loadPlayers(sessionId);
      const bots = players.filter(
        (p) => p.device === 'bot' && canScore(p, b.isFinal),
      );
      if (bots.length === 0) return;
      const accuracy = session.config.botAccuracy ?? 0.3;

      for (const bot of bots) {
        const delay = 1500 + Math.random() * 8000;
        setTimeout(async () => {
          try {
            const s = await loadSession(sessionId);
            if (
              !s ||
              s.current_question_index !== questionIndex ||
              (s.status !== 'question' && s.status !== 'locked')
            ) {
              return;
            }
            const correct = Math.random() < accuracy;
            const wrongChoices = q.answers.map((_, i) => i).filter((i) => i !== q.correctIndex);
            const choice = correct
              ? q.correctIndex
              : wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
            const { error } = await supabaseAdmin.from('game_answers').insert({
              session_id: sessionId,
              player_id: bot.id,
              question_index: questionIndex,
              answer: { choice },
              elapsed_ms: Math.round(delay),
              bonus: null,
            });
            if (error && error.code !== '23505') throw error;
            const { count } = await supabaseAdmin
              .from('game_answers')
              .select('id', { count: 'exact', head: true })
              .eq('session_id', sessionId)
              .eq('question_index', questionIndex);
            await broadcast(sessionId, 'answered', {
              qi: questionIndex,
              count: count ?? 0,
              pseudo: bot.pseudo,
            });
          } catch (err) {
            console.error('[battle] bot answer error', err);
          }
        }, delay);
      }
    } catch (err) {
      console.error('[battle] bots error', err);
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Classements
// ---------------------------------------------------------------------------

function sortForStandings(players: PlayerRow[]): PlayerRow[] {
  return players.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.stats.totalTimeMs ?? 0) - (b.stats.totalTimeMs ?? 0);
  });
}

/** classement général cumulé (tous joueurs non retirés, spectateurs inclus) */
function buildGeneralStandings(session: SessionRow, players: PlayerRow[]): BattleStandingEntry[] {
  const b = battle(session);
  const finalSize = session.config.finalSize ?? 10;
  const last = b.lastGeneralPositions ?? {};
  const ranked = sortForStandings(players.filter((p) => p.status !== 'removed'));
  let qualifiedCount = 0;
  return ranked.map((p, i) => {
    const qualified = p.status !== 'spectator' && qualifiedCount < finalSize;
    if (qualified) qualifiedCount += 1;
    return {
      playerId: p.id,
      pseudo: p.pseudo,
      score: p.score,
      position: i + 1,
      positionChange: last[p.pseudo] ? last[p.pseudo] - (i + 1) : 0,
      qualifiedForFinal: qualified,
      isSpectator: p.status === 'spectator',
      device: p.device,
    };
  });
}

/**
 * Classement final : survivant(s) rang 1, puis groupes d'élimination de la
 * finale inversés, ex aequo départagés au temps de réponse (rangs individuels).
 * Les non-finalistes suivent, dans l'ordre du général.
 */
function computeFinalStandings(session: SessionRow, players: PlayerRow[]): BattleStandingEntry[] {
  const b = battle(session);
  const byId = new Map(players.map((p) => [p.id, p]));
  const ordered: Array<{ player: PlayerRow }> = [];

  const survivors = sortForStandings(players.filter((p) => p.status === 'active'));
  for (const p of survivors) ordered.push({ player: p });

  for (const group of [...b.eliminationGroups].reverse()) {
    const sorted = group
      .slice()
      .sort((a, c) => (a.elapsedMs ?? Infinity) - (c.elapsedMs ?? Infinity));
    for (const e of sorted) {
      const p = byId.get(e.playerId);
      if (p) ordered.push({ player: p });
    }
  }

  const placedIds = new Set(ordered.map((o) => o.player.id));
  const rest = sortForStandings(
    players.filter((p) => p.status !== 'removed' && !placedIds.has(p.id)),
  );
  for (const p of rest) ordered.push({ player: p });

  return ordered.map((o, i) => ({
    playerId: o.player.id,
    pseudo: o.player.pseudo,
    score: o.player.score,
    position: i + 1,
    positionChange: 0,
    qualifiedForFinal: !placedIds.has(o.player.id) ? false : true,
    isSpectator: o.player.status === 'spectator',
    device: o.player.device,
  }));
}

/** reconstruit scores + stats depuis game_answers (+ manuels + bonus de manche) */
async function rebuildBattlePlayers(session: SessionRow): Promise<void> {
  const players = await loadPlayers(session.id);
  const { data } = await supabaseAdmin
    .from('game_answers')
    .select('player_id, is_correct, points_awarded, elapsed_ms')
    .eq('session_id', session.id)
    .not('points_awarded', 'is', null);
  const rows = (data ?? []) as Array<{
    player_id: string;
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
      let correctCount = 0;
      let totalTimeMs = 0;
      for (const r of list) {
        score += r.points_awarded;
        if (r.is_correct) {
          correctCount += 1;
          totalTimeMs += r.elapsed_ms ?? 0;
        }
      }
      const manual = p.stats.manualPoints ?? 0;
      const roundBonus = p.stats.roundBonusPoints ?? 0;
      return supabaseAdmin
        .from('game_players')
        .update({
          score: score + manual + roundBonus,
          stats: {
            ...p.stats,
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
// show-results : la SEULE écriture DB d'une question battle
// ---------------------------------------------------------------------------

async function applyShowResults(session: SessionRow): Promise<void> {
  const b = battle(session);
  const v = b.verdict;
  const q = currentQuestion(session);
  if (!v || v.computing) throw httpError('Vérification en cours, réessaie dans un instant', 409);
  if (!q || v.questionIndex !== session.current_question_index) {
    throw httpError('Verdict obsolète', 409);
  }
  const qi = session.current_question_index;
  const [answers, players] = await Promise.all([loadAnswers(session.id, qi), loadPlayers(session.id)]);
  const byId = new Map(players.map((p) => [p.id, p]));

  // verdicts GM appliqués
  const correctIds = new Set(v.correctPlayerIds);
  for (const p of v.pending) {
    if (p.overturned === 'correct') correctIds.add(p.playerId);
  }
  const effectiveEliminated = v.repechage
    ? []
    : v.pending.filter((p) => !p.overturned);

  // persiste les réponses jugées (idempotent : déjà jugées sautées)
  const alreadyJudged = new Set(
    answers.filter((a) => a.points_awarded !== null).map((a) => a.player_id),
  );
  const answerWrites = answers
    .filter((a) => !alreadyJudged.has(a.player_id))
    .map((a) => {
      const isCorrect = correctIds.has(a.player_id);
      return supabaseAdmin
        .from('game_answers')
        .update({ is_correct: isCorrect, points_awarded: isCorrect ? 1 : 0 })
        .eq('id', a.id);
    });

  // scores + stats des répondants
  const playerWrites: Array<PromiseLike<{ error: unknown }>> = [];
  for (const a of answers) {
    if (alreadyJudged.has(a.player_id)) continue;
    const p = byId.get(a.player_id);
    if (!p) continue;
    const isCorrect = correctIds.has(a.player_id);
    playerWrites.push(
      supabaseAdmin
        .from('game_players')
        .update({
          score: p.score + (isCorrect ? 1 : 0),
          stats: {
            ...p.stats,
            correctCount: (p.stats.correctCount ?? 0) + (isCorrect ? 1 : 0),
            answerCount: (p.stats.answerCount ?? 0) + 1,
            totalTimeMs: (p.stats.totalTimeMs ?? 0) + (isCorrect ? a.elapsed_ms ?? 0 : 0),
          },
        })
        .eq('id', p.id),
    );
  }

  // Joueurs marqués "bonne réponse" par le GM alors qu'ils n'ont AUCUNE réponse
  // enregistrée (cas terrain : l'écran du joueur n'a jamais affiché la question).
  // On matérialise une réponse attribuée par le GM : le point est crédité, et
  // l'idempotence comme le rollback (qui rejouent game_answers) restent exacts.
  const answeredIds = new Set(answers.map((a) => a.player_id));
  const gmCredited = v.pending.filter(
    (p) => p.overturned === 'correct' && !answeredIds.has(p.playerId),
  );
  for (const entry of gmCredited) {
    const p = byId.get(entry.playerId);
    if (!p) continue;
    playerWrites.push(
      supabaseAdmin.from('game_answers').upsert(
        {
          session_id: session.id,
          player_id: p.id,
          question_index: qi,
          answer: { gm: true },
          elapsed_ms: null,
          bonus: 'gm_correct',
          is_correct: true,
          points_awarded: 1,
        },
        { onConflict: 'session_id,player_id,question_index' },
      ),
    );
    playerWrites.push(
      supabaseAdmin
        .from('game_players')
        .update({
          score: p.score + 1,
          stats: {
            ...p.stats,
            correctCount: (p.stats.correctCount ?? 0) + 1,
            answerCount: (p.stats.answerCount ?? 0) + 1,
          },
        })
        .eq('id', p.id),
    );
  }

  // éliminations
  const survivorsAfter = v.survivorsBefore - effectiveEliminated.length;
  const groupRank = survivorsAfter + 1;
  if (effectiveEliminated.length > 0) {
    const ids = effectiveEliminated.map((p) => p.playerId);
    playerWrites.push(
      supabaseAdmin.from('game_players').update({ status: 'eliminated' }).in('id', ids),
    );
    const group: BattleEliminatedEntry[] = effectiveEliminated.map((p) => ({
      playerId: p.playerId,
      pseudo: p.pseudo,
      elapsedMs: p.elapsedMs,
      rank: groupRank,
    }));
    b.eliminationGroups.push(group);
  }

  const results = await Promise.all([...answerWrites, ...playerWrites]);
  const failed = results.find((r) => (r as { error: unknown }).error);
  if (failed && (failed as { error: unknown }).error) throw (failed as { error: Error }).error;

  // palier franchi (le plus bas atteint, jamais rejoué)
  const crossed = MILESTONES.filter(
    (t) => v.survivorsBefore > t && survivorsAfter <= t && b.lastMilestone !== t,
  );
  const milestone = crossed.length > 0 ? Math.min(...crossed) : null;
  if (milestone !== null) b.lastMilestone = milestone;

  b.reveal = {
    correctIndex: q.correctIndex,
    correctAnswer: q.answers[q.correctIndex],
    answeredCount: v.answeredCount,
    eliminated: effectiveEliminated.map((p) => ({ pseudo: p.pseudo, reason: p.reason })),
    repechage: v.repechage,
    survivorsBefore: v.survivorsBefore,
    survivorsAfter,
    milestone,
    correctPseudos: players.filter((p) => correctIds.has(p.id)).map((p) => p.pseudo),
  };
  b.verdict = undefined;

  // finale jouée : classement final précalculé, l'advancer enchaînera sur end
  if (b.isFinal && survivorsAfter <= 1) {
    const refreshed = await loadPlayers(session.id);
    const finalStandings = computeFinalStandings(session, refreshed);
    b.finalStandings = finalStandings;
    const winner = finalStandings[0] ?? null;
    b.winner = winner ? { playerId: winner.playerId, pseudo: winner.pseudo } : null;
    b.victoryPending = true;
    b.reveal.victory = true;
    session.runtime.endTexts = {
      winnerText: session.config.endWinnerText.replace(/#winner#|#pseudo_top1#/g, winner?.pseudo ?? '?'),
      endText: session.config.endTextFinal,
    };
    setPhase(session, 'reveal', VICTORY_REVEAL_MS);
  } else {
    setPhase(session, 'reveal', null);
  }
}

// ---------------------------------------------------------------------------
// Fin de manche
// ---------------------------------------------------------------------------

async function applyEndRound(session: SessionRow): Promise<void> {
  const b = battle(session);
  const players = await loadPlayers(session.id);
  const participants = players.filter(
    (p) => p.status === 'active' || p.status === 'eliminated',
  );
  const byId = new Map(participants.map((p) => [p.id, p]));

  // rangs de manche : survivants rang 1 (partagé), puis groupes inversés
  const rankOf = new Map<string, number>();
  const survivors = participants.filter((p) => p.status === 'active');
  for (const p of survivors) rankOf.set(p.id, 1);
  let currentRank = survivors.length + 1;
  for (const group of [...b.eliminationGroups].reverse()) {
    for (const e of group) {
      if (byId.has(e.playerId)) rankOf.set(e.playerId, currentRank);
    }
    currentRank += group.length;
  }

  // bonus persistés (score + cumul roundBonusPoints pour les rebuilds)
  const writes: Array<PromiseLike<{ error: unknown }>> = [];
  const entries: Array<{ pseudo: string; rank: number; bonus: number; survived: boolean }> = [];
  for (const p of participants) {
    const rank = rankOf.get(p.id);
    if (!rank) continue;
    const bonus = ROUND_BONUS[rank - 1] ?? 0;
    entries.push({ pseudo: p.pseudo, rank, bonus, survived: p.status === 'active' });
    // maj locale pour construire le général sans refetch
    p.score += bonus;
    p.stats.roundBonusPoints = (p.stats.roundBonusPoints ?? 0) + bonus;
    if (bonus > 0) {
      writes.push(
        supabaseAdmin
          .from('game_players')
          .update({ score: p.score, stats: p.stats })
          .eq('id', p.id),
      );
    }
  }
  const results = await Promise.all(writes);
  const failed = results.find((r) => (r as { error: unknown }).error);
  if (failed && (failed as { error: unknown }).error) throw (failed as { error: Error }).error;

  entries.sort((a, c) => a.rank - c.rank);
  b.roundResult = { roundNumber: b.roundNumber, entries };

  const standings = buildGeneralStandings(session, players);
  b.generalStandings = standings;
  b.lastGeneralPositions = Object.fromEntries(standings.map((s) => [s.pseudo, s.position]));
  b.reveal = undefined;
  setPhase(session, 'round_end', null);
}

// ---------------------------------------------------------------------------
// Rollback (annuler / rejouer)
// ---------------------------------------------------------------------------

/**
 * Annule les effets de la question courante.
 * - avant show-results : rien n'est persisté, on jette les réponses.
 * - après show-results : réactive le groupe éliminé, retire le groupe,
 *   reconstruit les scores depuis game_answers.
 * La question reste consommée (used_at) ; roundQuestionCount recule seulement
 * si `forgetQuestion` (annulation sèche, pas un replay).
 */
async function rollbackQuestion(session: SessionRow, forgetQuestion: boolean): Promise<void> {
  const b = battle(session);
  const qi = session.current_question_index;
  const wasRevealed = session.status === 'reveal' && !b.reveal?.cancelled;

  if (wasRevealed) {
    // retire le dernier groupe d'élimination (celui de cette question)
    const lastGroup = b.eliminationGroups[b.eliminationGroups.length - 1];
    const lastReveal = b.reveal;
    if (lastGroup && lastReveal && lastGroup.length === lastReveal.eliminated.length) {
      b.eliminationGroups.pop();
      await supabaseAdmin
        .from('game_players')
        .update({ status: 'active' })
        .in('id', lastGroup.map((e) => e.playerId));
    }
    // annule une éventuelle victoire de finale
    if (b.victoryPending || b.finalStandings) {
      b.victoryPending = false;
      b.finalStandings = undefined;
      b.winner = null;
      session.runtime.endTexts = undefined;
    }
    if (lastReveal?.milestone != null && b.lastMilestone === lastReveal.milestone) {
      b.lastMilestone = null;
    }
  }

  await supabaseAdmin
    .from('game_answers')
    .delete()
    .eq('session_id', session.id)
    .eq('question_index', qi);

  if (wasRevealed) {
    await rebuildBattlePlayers(session);
  }

  b.verdict = undefined;
  b.reveal = undefined;
  if (forgetQuestion) {
    b.roundQuestionCount = Math.max(0, b.roundQuestionCount - 1);
  }
  markDirty(session);
}

// ---------------------------------------------------------------------------
// Actions gamemaster
// ---------------------------------------------------------------------------

export interface BattleActionParams {
  pseudo?: string;
  points?: number;
  playerId?: string;
  config?: Partial<SessionConfig>;
  count?: number;
  difficulty?: string;
  questionId?: string;
  from?: number;
  to?: number;
}

/** remet en jeu les éliminés + intègre les waiting, reset les compteurs de manche */
function resetRoundState(session: SessionRow): void {
  const b = battle(session);
  b.roundNumber += 1;
  b.roundQuestionCount = 0;
  b.eliminationGroups = [];
  b.lastMilestone = null;
  b.verdict = undefined;
  b.reveal = undefined;
  b.roundResult = undefined;
  markDirty(session);
}

export async function battleGmAction(
  sessionId: string,
  action: string,
  params: BattleActionParams = {},
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.ended_at && action !== 'stop') {
      throw httpError('Session terminée', 409);
    }
    const b = battle(session);
    switch (action) {
      case 'rules': {
        assertStatus(session, ['lobby', 'rules'], action);
        setPhase(session, session.status === 'rules' ? 'lobby' : 'rules', null);
        break;
      }
      case 'start-round': {
        assertStatus(session, ['lobby', 'rules', 'round_end'], action);
        if (b.isFinal) throw httpError('La finale est en cours, plus de manche normale', 409);
        session.started_at = session.started_at ?? new Date().toISOString();
        await supabaseAdmin
          .from('game_players')
          .update({ status: 'active' })
          .eq('session_id', session.id)
          .in('status', ['eliminated', 'waiting']);
        resetRoundState(session);
        await drawNextQuestion(session);
        setPhase(session, 'round_intro', session.config.roundIntroMs ?? 5000);
        break;
      }
      case 'start-final': {
        assertStatus(session, ['round_end'], action);
        const standings = b.generalStandings;
        if (!standings) throw httpError('Classement général indisponible', 409);
        const finalSize = session.config.finalSize ?? 10;
        const contenders = standings.filter((s) => !s.isSpectator);
        if (contenders.length < 2) {
          throw httpError('Pas assez de joueurs pour une finale (2 minimum)', 409);
        }
        const finalists = contenders.slice(0, finalSize).map((s) => s.playerId);
        const others = contenders.slice(finalSize).map((s) => s.playerId);
        await supabaseAdmin
          .from('game_players')
          .update({ status: 'active' })
          .in('id', finalists);
        if (others.length > 0) {
          await supabaseAdmin
            .from('game_players')
            .update({ status: 'spectator' })
            .in('id', others);
        }
        b.isFinal = true;
        resetRoundState(session);
        await drawNextQuestion(session);
        setPhase(session, 'round_intro', session.config.roundIntroMs ?? 5000);
        break;
      }
      case 'next': {
        assertStatus(session, ['reveal'], action);
        if (b.victoryPending) throw httpError('La finale est jouée', 409);
        await drawNextQuestion(session);
        setPhase(session, 'announce', session.config.announceMs);
        break;
      }
      case 'show-results': {
        assertStatus(session, ['verdict'], action);
        await applyShowResults(session);
        break;
      }
      case 'verdict-mark-correct':
      case 'verdict-revive':
      case 'verdict-reset': {
        assertStatus(session, ['verdict'], action);
        const v = b.verdict;
        if (!v || v.computing) throw httpError('Vérification en cours', 409);
        const entry = v.pending.find((p) => p.playerId === params.playerId);
        if (!entry) throw httpError('Joueur absent des éliminés provisoires', 404);
        entry.overturned =
          action === 'verdict-mark-correct' ? 'correct' : action === 'verdict-revive' ? 'revived' : null;
        markDirty(session);
        break;
      }
      case 'verdict-revive-group': {
        assertStatus(session, ['verdict'], action);
        const v = b.verdict;
        if (!v || v.computing) throw httpError('Vérification en cours', 409);
        v.repechage = !v.repechage;
        markDirty(session);
        break;
      }
      case 'verdict-end-round-tie': {
        assertStatus(session, ['verdict'], action);
        const v = b.verdict;
        if (!v || v.computing) throw httpError('Vérification en cours', 409);
        if (b.isFinal) throw httpError('Impossible en finale (le temps départage)', 409);
        const effective = v.repechage ? [] : v.pending.filter((p) => !p.overturned);
        if (effective.length < v.survivorsBefore) {
          throw httpError('Il reste des survivants : ce choix ne vaut que pour un zéro survivant', 409);
        }
        // tous éliminés au rang 1 partagé (groupe final de la manche), puis
        // fin de manche immédiate : le barème donne bien le rang 1 au groupe
        await applyShowResults(session);
        if (b.reveal) b.reveal.endRoundTie = true;
        await applyEndRound(session);
        break;
      }
      case 'end-round': {
        assertStatus(session, ['reveal'], action);
        if (b.isFinal) throw httpError('La finale se termine à un survivant', 409);
        await applyEndRound(session);
        break;
      }
      case 'pause': {
        assertStatus(session, ['lobby', 'rules', 'reveal', 'round_end'], action);
        session.previous_status = session.status;
        setPhase(session, 'pause', null);
        break;
      }
      case 'resume': {
        assertStatus(session, ['pause'], action);
        const target =
          (session.previous_status as SessionRow['status'] | null) ??
          (b.generalStandings ? 'round_end' : 'lobby');
        setPhase(session, target, null);
        session.previous_status = null;
        break;
      }
      case 'cancel-question': {
        assertStatus(session, ['announce', 'question', 'locked', 'verdict', 'reveal'], action);
        await rollbackQuestion(session, true);
        b.reveal = {
          cancelled: true,
          answeredCount: 0,
          eliminated: [],
          repechage: false,
          survivorsBefore: 0,
          survivorsAfter: 0,
          milestone: null,
          correctPseudos: [],
        };
        setPhase(session, 'reveal', null);
        break;
      }
      case 'replay-question': {
        assertStatus(session, ['announce', 'question', 'locked', 'verdict', 'reveal'], action);
        await rollbackQuestion(session, false);
        setPhase(session, 'announce', session.config.announceMs);
        break;
      }
      case 'stop': {
        if (session.status === 'closing') break; // déjà en fondu
        setPhase(session, 'closing', session.config.fadeOutMs ?? 5000);
        break;
      }
      case 'give-points': {
        const players = await loadPlayers(session.id);
        const target = players.find((p) => p.pseudo === params.pseudo);
        if (!target || typeof params.points !== 'number') {
          throw httpError('Joueur introuvable', 404);
        }
        const stats = { ...target.stats };
        stats.manualPoints = (stats.manualPoints ?? 0) + params.points;
        await supabaseAdmin
          .from('game_players')
          .update({ score: target.score + params.points, stats })
          .eq('id', target.id);
        markDirty(session);
        break;
      }
      case 'kick': {
        if (!params.playerId) throw httpError('playerId requis', 400);
        await supabaseAdmin
          .from('game_players')
          .update({ status: 'removed' })
          .eq('id', params.playerId)
          .eq('session_id', session.id);
        // retiré aussi d'un éventuel verdict en cours
        if (b.verdict) {
          b.verdict.pending = b.verdict.pending.filter((p) => p.playerId !== params.playerId);
          b.verdict.correctPlayerIds = b.verdict.correctPlayerIds.filter(
            (id) => id !== params.playerId,
          );
          if (b.verdict.survivorsBefore > 0) b.verdict.survivorsBefore -= 1;
        }
        markDirty(session);
        break;
      }
      case 'set-config': {
        session.config = { ...session.config, ...(params.config ?? {}) };
        markDirty(session);
        break;
      }
      case 'add-bots': {
        if (b.isFinal) throw httpError('Inscriptions closes pendant la finale', 409);
        const count = Math.min(50, Math.max(1, Math.floor(params.count ?? 1)));
        const players = await loadPlayers(session.id);
        const existing = new Set(players.map((p) => p.pseudo_norm));
        const status = b.roundNumber === 0 || session.status === 'lobby' || session.status === 'rules'
          ? 'active'
          : 'waiting';
        const rows = [] as Array<Record<string, unknown>>;
        let n = 1;
        while (rows.length < count && n < 500) {
          const pseudo = `BOT ${n}`;
          n += 1;
          if (existing.has(pseudo.toLowerCase())) continue;
          rows.push({
            session_id: session.id,
            pseudo,
            pseudo_norm: pseudo.toLowerCase(),
            device: 'bot',
            player_token: generatePlayerToken(),
            status,
            bonuses: { jokers: [] },
            stats: { strike: 0, bestStrike: 0, correctCount: 0, answerCount: 0, totalTimeMs: 0 },
          });
        }
        const { error } = await supabaseAdmin.from('game_players').insert(rows);
        if (error) throw error;
        markDirty(session);
        break;
      }
      case 'remove-bots': {
        const players = await loadPlayers(session.id);
        const bots = players.filter((p) => p.device === 'bot');
        await Promise.all(
          bots.map((p) =>
            supabaseAdmin
              .from('game_players')
              .update({ status: 'removed', pseudo_norm: `${p.pseudo_norm}:bot:${p.id}` })
              .eq('id', p.id),
          ),
        );
        markDirty(session);
        break;
      }
      case 'queue-reorder': {
        const difficulty = params.difficulty ?? '';
        const list = b.queue[difficulty];
        const from = params.from ?? -1;
        const to = params.to ?? -1;
        if (!list || from < 0 || from >= list.length || to < 0 || to >= list.length) {
          throw httpError('Réordonnancement invalide', 400);
        }
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
        markDirty(session);
        break;
      }
      case 'queue-remove': {
        const difficulty = params.difficulty ?? '';
        const list = b.queue[difficulty];
        if (!list || !params.questionId) throw httpError('Retrait invalide', 400);
        const idx = list.findIndex((q) => q.id === params.questionId);
        if (idx === -1) throw httpError('Question absente de la file', 404);
        list.splice(idx, 1);
        b.excludedIds.push(params.questionId);
        await refillQueue(session, difficulty);
        markDirty(session);
        break;
      }
      default:
        throw httpError(`Action inconnue: ${action}`, 400);
    }
    return session;
  });
}

// ---------------------------------------------------------------------------
// Actions joueurs
// ---------------------------------------------------------------------------

export async function joinBattleSession(
  session: SessionRow,
  pseudo: string,
  device: string,
): Promise<PlayerRow> {
  const b = session.runtime.battle;
  if (!b) throw httpError('Session battle invalide', 500);
  if (b.isFinal) {
    throw httpError('error_registrations_closed', 409);
  }
  const validationError = validatePseudo(pseudo);
  if (validationError) throw httpError(validationError, 400);
  const trimmed = pseudo.trim();

  // en cours de manche : le retardataire attend la manche suivante
  const status =
    b.roundNumber === 0 || session.status === 'lobby' || session.status === 'rules'
      ? 'active'
      : 'waiting';

  const { data, error } = await supabaseAdmin
    .from('game_players')
    .insert({
      session_id: session.id,
      pseudo: trimmed,
      pseudo_norm: trimmed.toLowerCase(),
      device: device || 'mobile',
      player_token: generatePlayerToken(),
      status,
      bonuses: { jokers: [] },
      stats: { strike: 0, bestStrike: 0, correctCount: 0, answerCount: 0, totalTimeMs: 0 },
    })
    .select('*')
    .single();
  if (error) {
    if (`${error.message}`.includes('duplicate') || error.code === '23505') {
      throw httpError('error_player_already_exists', 409);
    }
    throw error;
  }
  await withSession(session.id, async (s) => {
    markDirty(s);
  });
  await broadcast(session.id, 'player-joined', { pseudo: trimmed });
  return data as PlayerRow;
}

export async function submitBattleAnswer(
  sessionId: string,
  player: PlayerRow,
  questionIndex: number,
  answer: { choice?: number; number?: number; text?: string },
  elapsedMs: number | null,
): Promise<{ recorded: boolean; already: boolean }> {
  const session = await loadSession(sessionId);
  if (!session) throw httpError('Session introuvable', 404);
  const b = session.runtime.battle;
  if (!b) throw httpError('Session battle invalide', 500);

  // éligibilité : actifs toujours ; éliminés hors finale (+1 possible) ;
  // waiting et spectator jamais
  const eligible =
    player.status === 'active' || (player.status === 'eliminated' && !b.isFinal);
  if (!eligible) throw httpError('error_not_active', 409);

  if (session.current_question_index !== questionIndex) {
    throw httpError('error_wrong_question', 409);
  }
  // fenêtre : question jusqu'à la deadline, puis locked = grâce (timestamps
  // persistés, le locked porte la deadline réelle)
  const now = Date.now();
  const phaseEnds = session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null;
  const inWindow =
    (session.status === 'question' && (phaseEnds === null || now <= phaseEnds)) ||
    (session.status === 'locked' && (phaseEnds === null || now <= phaseEnds));
  if (!inWindow) throw httpError('error_timeout', 409);

  const { error } = await supabaseAdmin.from('game_answers').insert({
    session_id: sessionId,
    player_id: player.id,
    question_index: questionIndex,
    answer,
    elapsed_ms: elapsedMs,
    bonus: null,
  });
  if (error) {
    if (error.code === '23505') return { recorded: true, already: true };
    throw error;
  }

  const { count } = await supabaseAdmin
    .from('game_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex);
  await broadcast(sessionId, 'answered', { qi: questionIndex, count: count ?? 0, pseudo: player.pseudo });

  return { recorded: true, already: false };
}
