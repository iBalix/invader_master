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
import { broadcast } from './realtime.js';
import { computeReveal } from './scoring.js';
import {
  AFK_MISS_LIMIT,
  ANSWER_GRACE_MS,
  AUDIO_PREROLL_MS,
  DEFAULT_CONFIG,
  DIFFICULTY_POINTS,
  JOKER_DRAW_BASE,
  JOKER_DRAW_SLOPE,
  JOKER_HAND_MAX,
  JOKER_TYPES,
  JOKER_WEIGHTS,
  REVEAL_MIN_MS,
  type AnswerRow,
  type JokerAward,
  type JokerPlay,
  type JokerType,
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

/**
 * Taper une reponse au clavier (nombre ou texte) prend plus de temps que
 * toucher une case de QCM : 20 s pour un QCM, 30 s pour les deux autres types
 * (retour de la premiere soiree : 25 s etaient trop courtes pour taper).
 */
const NON_QCM_EXTRA_MS = 10_000;

/**
 * Fenetres STRICTES par type, sans rallonge media. Les +10 s audio et +2 s
 * image herites du legacy gonflaient le chrono en douce : une question libre
 * avec extrait partait a 35 s au lieu des 25 annoncees. L'extrait audio se
 * joue PENDANT la fenetre (on repond en ecoutant), l'image s'affiche
 * instantanement, et la video a sa propre phase plein ecran avant la question.
 */
export function questionWindowMs(q: QuestionSnapshot, config: SessionConfig): number {
  return (
    config.questionMs +
    (q.type !== 'qcm' ? NON_QCM_EXTRA_MS : 0) +
    // l'extrait joue SEUL pendant AUDIO_PREROLL_MS avant que la question ne
    // s'affiche : on rend ce temps au joueur, sinon le preroll mangerait le
    // chrono (pattern du timer +10 s d'invader_table)
    (q.musicUrl ? AUDIO_PREROLL_MS : 0)
  );
}

/**
 * Duree de la phase 'media' : l'extrait video plein ecran. La duree vient du
 * spec (`ID?time=X&duration=Y`), plus un battement pour le demarrage du
 * lecteur et la fin propre. Le lecteur est precharge pendant l'annonce, donc
 * le battement reste court.
 */
const MEDIA_TAIL_MS = 1200;

function mediaWindowMs(q: QuestionSnapshot): number {
  const m = q.videoYoutube?.match(/duration=(\d+)/);
  return (m ? parseInt(m[1], 10) * 1000 : 15000) + MEDIA_TAIL_MS;
}

function currentQuestion(session: SessionRow): QuestionSnapshot | null {
  return session.question_order[session.current_question_index] ?? null;
}

// ---------------------------------------------------------------------------
// Transitions automatiques (synchrone, enregistrées dans l'engine)
// ---------------------------------------------------------------------------

/**
 * Décompte de reprise après une pause. Reprendre renvoyait sur l'écran d'avant :
 * quand la pause avait été prise depuis un `reveal`, la salle se reprenait
 * l'animation de fin de la question déjà jouée, sans comprendre pourquoi. On
 * reste donc sur l'écran de pause et on annonce la reprise, puis on enchaîne
 * directement sur la question suivante.
 */
const RESUME_COUNTDOWN_MS = 5000;

const CINEMATIC_INTRO_MS = 3800; // roulement de tambour
const CINEMATIC_STEP_MS = 4500; // une place dévoilée
const REWARD_STEP_MS = 6000;

function quizAdvance(session: SessionRow): boolean {
  const q = currentQuestion(session);
  switch (session.status) {
    case 'announce': {
      if (!q) return false;
      // Question video : la salle regarde d'abord l'extrait plein ecran, la
      // fenetre de reponse (et son chrono) n'ouvre qu'apres.
      if (q.videoYoutube) {
        setPhase(session, 'media', mediaWindowMs(q));
        return true;
      }
      setPhase(session, 'question', questionWindowMs(q, session.config));
      return true;
    }
    case 'media': {
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
    case 'resuming': {
      // le décompte est écoulé : on enchaîne sur la question suivante
      goAnnounce(session, session.current_question_index + 1, session.runtime.special ?? null);
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

  // Un seul run PROJO actif à la fois (quiz/battle s'excluent mutuellement).
  // Les jeux de tables (chess, ...) vivent en parallèle : jamais fauchés ici.
  await endActiveSessions(['quiz', 'battle']);

  return insertSession({
    mode: 'quiz',
    status: 'lobby',
    quizId,
    config,
    questionOrder: snapshots,
    runtime: {},
    // base du compte a rebours indicatif du lobby (20 min) sur les ecrans
    phaseStartedAt: new Date().toISOString(),
  });
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

// ---------------------------------------------------------------------------
// Jokers
// ---------------------------------------------------------------------------

/** main courante d'un joueur, defensif sur les vieux jsonb {qdLeft} */
function handOf(p: PlayerRow): JokerType[] {
  const jokers = p.bonuses?.jokers;
  return Array.isArray(jokers) ? jokers.filter((j): j is JokerType => JOKER_TYPES.includes(j)) : [];
}

/** tirage pondere d'un type de joker */
function drawJokerType(): JokerType {
  const total = JOKER_TYPES.reduce((acc, t) => acc + JOKER_WEIGHTS[t], 0);
  let r = Math.random() * total;
  for (const t of JOKER_TYPES) {
    r -= JOKER_WEIGHTS[t];
    if (r < 0) return t;
  }
  return JOKER_TYPES[JOKER_TYPES.length - 1];
}

/**
 * Tirages de jokers a la revelation.
 *
 * Chaque joueur correct avec de la place en main tente sa chance, ponderee par
 * sa position AVANT la question (percentile 0 = leader, 1 = dernier) : les
 * derniers gagnent jusqu'a 6x plus souvent, c'est l'anti-decrochage. Le tirage
 * est fait ICI, cote serveur : la roue affichee chez le joueur n'est que du
 * theatre qui s'arrete sur le resultat deja connu.
 *
 * Renvoie les awards ; les mains sont mutees sur les objets `players` passes,
 * a charge de l'appelant de les persister (applyReveal les ecrit dans le meme
 * batch que les scores).
 */
function drawRevealJokers(
  players: PlayerRow[],
  correctIds: Set<string>,
): JokerAward[] {
  const awards: JokerAward[] = [];
  // classement AVANT la question : les scores charges n'incluent pas encore
  // les points de la question en cours de revelation
  const ordre = [...players].sort((a, b) => b.score - a.score);
  const pct = new Map<string, number>();
  ordre.forEach((p, i) => pct.set(p.id, ordre.length > 1 ? i / (ordre.length - 1) : 0));

  for (const p of players) {
    if (!correctIds.has(p.id)) continue;
    const main = handOf(p);
    if (main.length >= JOKER_HAND_MAX) continue;
    const chance = JOKER_DRAW_BASE + JOKER_DRAW_SLOPE * (pct.get(p.id) ?? 0);
    if (Math.random() >= chance) continue;
    const type = drawJokerType();
    p.bonuses = { ...p.bonuses, jokers: [...main, type] };
    awards.push({ playerId: p.id, pseudo: p.pseudo, type, source: 'draw' });
  }
  return awards;
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
  const allInIds = new Set(
    (session.runtime.jokerPlays?.[String(qi)] ?? [])
      .filter((x) => x.type === 'all_in')
      .map((x) => x.playerId),
  );

  const computed = computeReveal({
    question: q,
    answers,
    players: active,
    allInPlayerIds: allInIds,
    special: session.runtime.special ?? null,
    config: session.config,
    questionWindowMs: questionWindowMs(q, session.config),
    verdicts: session.runtime.judge?.verdicts ?? {},
  });

  // Tirage des jokers gagnes : ponderation par le classement AVANT la question
  // (les scores charges sont pre-reveal). Mute p.bonuses, persiste plus bas
  // dans le meme batch que les scores. Les dons GM s'ajouteront pendant le
  // reveal via l'action give-joker.
  const correctIds = new Set(
    active.filter((p) => computed.perPlayer[p.id]?.correct).map((p) => p.id),
  );
  const awards = drawRevealJokers(active, correctIds);

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
  const awardedIds = new Set(awards.map((a) => a.playerId));
  const playerWrites = active
    .filter(
      (p) =>
        (computed.perPlayer[p.id] && !alreadyJudged.has(p.id)) ||
        // un joueur deja credite par une tentative interrompue peut quand meme
        // avoir gagne un joker a CE passage : sa main doit etre persistee
        awardedIds.has(p.id),
    )
    .map((p) => {
      const r = computed.perPlayer[p.id];
      if (alreadyJudged.has(p.id) || !r) {
        return supabaseAdmin.from('game_players').update({ bonuses: p.bonuses }).eq('id', p.id);
      }
      // Compteur de non-reponses consecutives. lastMissQi est le garde-fou
      // d'idempotence : un non-repondant n'a AUCUNE ligne game_answers, donc
      // jamais de alreadyJudged ; si ce reveal est rejoue apres un crash
      // partiel, sans le marqueur la meme question compterait deux fois.
      const missed = !r.answered;
      const missStreak = !missed
        ? 0
        : p.stats.lastMissQi === qi
          ? (p.stats.missStreak ?? 0)
          : (p.stats.missStreak ?? 0) + 1;
      // Spread impératif : le litteral nu perdait manualPoints (points GM) et
      // roundBonusPoints a chaque reveal.
      const stats = {
        ...p.stats,
        strike: r.correct ? (p.stats.strike ?? 0) + 1 : 0,
        bestStrike: Math.max(p.stats.bestStrike ?? 0, r.correct ? (p.stats.strike ?? 0) + 1 : 0),
        correctCount: (p.stats.correctCount ?? 0) + (r.correct ? 1 : 0),
        answerCount: (p.stats.answerCount ?? 0) + (r.answered ? 1 : 0),
        totalTimeMs: (p.stats.totalTimeMs ?? 0) + (r.correct && r.elapsedMs ? r.elapsedMs : 0),
        missStreak,
        lastMissQi: missed ? qi : null,
      };
      // Ejection AFK dans le MEME update (atomique par ligne) : le joueur sort
      // des actifs (classement, percentile jokers, comptages) et son pseudo
      // est libere facon route leave, pour qu'il puisse revenir sous le meme
      // nom via un nouveau join.
      const ejecte = missStreak >= AFK_MISS_LIMIT;
      return supabaseAdmin
        .from('game_players')
        .update({
          score: p.score + r.delta,
          stats,
          bonuses: p.bonuses,
          ...(ejecte ? { status: 'afk', pseudo_norm: `${p.pseudo_norm}:afk:${p.id}` } : {}),
        })
        .eq('id', p.id);
    });

  const results = await Promise.all([...answerWrites, ...playerWrites]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;

  if (awards.length > 0) {
    session.runtime.jokerAwards = session.runtime.jokerAwards ?? {};
    session.runtime.jokerAwards[String(qi)] = awards;
    computed.reveal.jokerAwards = awards.map((a) => ({ pseudo: a.pseudo, type: a.type }));
  }
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

  // Rembourse les jokers joues sur la question (re-ajout plafonne) et revoque
  // ceux gagnes a sa revelation (retrait d'une instance si encore en main).
  // Best effort, comme l'ancien remboursement : un joker gagne PUIS joue sur
  // une autre question n'est pas retrace.
  const plays = session.runtime.jokerPlays?.[String(qi)] ?? [];
  const awards = session.runtime.jokerAwards?.[String(qi)] ?? [];
  const parJoueur = new Map<string, { rendre: JokerType[]; retirer: JokerType[] }>();
  for (const pl of plays) {
    const e = parJoueur.get(pl.playerId) ?? { rendre: [], retirer: [] };
    e.rendre.push(pl.type);
    parJoueur.set(pl.playerId, e);
  }
  for (const aw of awards) {
    const e = parJoueur.get(aw.playerId) ?? { rendre: [], retirer: [] };
    e.retirer.push(aw.type);
    parJoueur.set(aw.playerId, e);
  }
  await Promise.all(
    [...parJoueur.entries()].map(async ([playerId, e]) => {
      const { data: p } = await supabaseAdmin
        .from('game_players')
        .select('bonuses')
        .eq('id', playerId)
        .maybeSingle();
      if (!p) return;
      let main: JokerType[] = Array.isArray((p.bonuses as { jokers?: JokerType[] })?.jokers)
        ? [...((p.bonuses as { jokers: JokerType[] }).jokers)]
        : [];
      for (const t of e.retirer) {
        const i = main.indexOf(t);
        if (i >= 0) main.splice(i, 1);
      }
      for (const t of e.rendre) {
        if (main.length < JOKER_HAND_MAX) main.push(t);
      }
      await supabaseAdmin
        .from('game_players')
        .update({ bonuses: { jokers: main } })
        .eq('id', playerId);
    }),
  );
  if (session.runtime.jokerPlays) delete session.runtime.jokerPlays[String(qi)];
  if (session.runtime.jokerAwards) delete session.runtime.jokerAwards[String(qi)];

  // Supprime les réponses de la question
  await supabaseAdmin
    .from('game_answers')
    .delete()
    .eq('session_id', session.id)
    .eq('question_index', qi);

  // Si la question avait été révélée : reconstruit scores et stats depuis zéro
  if (wasRevealed) {
    await rebuildPlayersFromAnswers(session, qi);
  }
  session.runtime.judge = undefined;
  session.runtime.special = null;
}

/**
 * @param rolledBackQi index de la question annulee/rejouee, pour rendre leur
 * miss aux joueurs qui ne lui avaient pas repondu (une non-reponse ne laisse
 * aucune trace dans game_answers, le compteur n'est donc pas reconstructible :
 * on le corrige via le marqueur lastMissQi). Les joueurs deja passes 'afk' ne
 * sont PAS restaures : le retour se fait par un nouveau join, et restaurer le
 * pseudo_norm risquerait un doublon si le pseudo a ete repris.
 */
async function rebuildPlayersFromAnswers(session: SessionRow, rolledBackQi?: number): Promise<void> {
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
      // la question annulée avait compté un miss pour ce joueur : on le rend
      const missAnnule =
        rolledBackQi !== undefined &&
        p.status === 'active' &&
        p.stats.lastMissQi === rolledBackQi;
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
            ...(missAnnule
              ? { missStreak: Math.max(0, (p.stats.missStreak ?? 0) - 1), lastMissQi: null }
              : {}),
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

/**
 * La revelation dure au moins REVEAL_MIN_MS : chaque joueur y vit une sequence
 * personnelle (verdict -> serie -> jokers). Passer a la suite avant la fin la
 * court-circuiterait sur 40 telephones d'un coup. La console GM affiche un
 * compte a rebours sur le bouton, ce 409 est le filet cote serveur.
 */
function assertRevealDone(session: SessionRow): void {
  if (session.status !== 'reveal' || !session.phase_started_at) return;
  const debut = new Date(session.phase_started_at).getTime();
  if (Date.now() < debut + REVEAL_MIN_MS) {
    throw Object.assign(new Error('error_reveal_sequence'), { httpStatus: 409 });
  }
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
        assertRevealDone(session);
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
        assertRevealDone(session);
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
        assertRevealDone(session);
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
        assertStatus(session, ['lobby', 'rules', 'reveal', 'leaderboard', 'resuming'], action);
        // Depuis 'resuming', la pause sert à ANNULER le décompte : l'écran de
        // retour doit rester celui d'avant la pause, pas le décompte lui-même.
        if (session.status !== 'resuming') session.previous_status = session.status;
        setPhase(session, 'pause', null);
        break;
      }
      case 'resume': {
        assertStatus(session, ['pause'], action);
        session.previous_status = null;
        // Reste-t-il une question à jouer ? Si oui, on annonce la reprise et
        // l'advancer enchaînera tout seul (cf. RESUME_COUNTDOWN_MS).
        if (session.current_question_index + 1 < session.question_order.length) {
          // La question spéciale choisie pendant la pause doit survivre au
          // décompte : on la range là où goAnnounce ira la relire.
          session.runtime.special = params.special ?? null;
          setPhase(session, 'resuming', RESUME_COUNTDOWN_MS);
          break;
        }
        // Plus rien à jouer (pause prise après la dernière question) : il n'y a
        // pas de suite à décompter, on rend simplement l'écran précédent.
        setPhase(session, session.runtime.standings ? 'leaderboard' : 'lobby', null);
        break;
      }
      case 'resume-back': {
        // Retour à l'écran d'avant sans rien lancer : l'échappatoire de
        // l'animateur qui a mis en pause pour montrer le classement ou les
        // règles et veut juste y revenir.
        assertStatus(session, ['pause'], action);
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
      case 'skip-media': {
        // l'animateur ecourte l'extrait : la fenetre de reponse ouvre tout de suite
        assertStatus(session, ['media'], action);
        const q = currentQuestion(session);
        if (!q) throw Object.assign(new Error('Aucune question courante'), { httpStatus: 409 });
        setPhase(session, 'question', questionWindowMs(q, session.config));
        break;
      }
      case 'cancel-question': {
        assertStatus(session, ['announce', 'media', 'question', 'locked', 'reveal'], action);
        await rollbackQuestion(session);
        session.runtime.reveal = { cancelled: true, answeredCount: 0, results: {} };
        setPhase(session, 'reveal', null);
        break;
      }
      case 'replay-question': {
        assertStatus(session, ['announce', 'media', 'question', 'locked', 'reveal'], action);
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
        // priorite a la ligne ACTIVE : un joueur afk qui a rejoint sous le
        // meme pseudo a deux lignes, et l'ancienne (afk, plus vieille) prenait
        // les points du GM a la place de la nouvelle
        const target =
          players.find((p) => p.pseudo === params.pseudo && p.status === 'active') ??
          players.find((p) => p.pseudo === params.pseudo);
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
      case 'give-joker': {
        // Don manuel : a tout le monde, ou a un joueur precis. Fenetre = fin de
        // question (reveal / leaderboard), juste avant de lancer la suivante.
        assertStatus(session, ['reveal', 'leaderboard'], action);
        const players = await loadPlayers(session.id);
        const actifs = players.filter((p) => p.status === 'active');
        const cibles = params.playerId
          ? actifs.filter((p) => p.id === params.playerId)
          : actifs;
        if (params.playerId && cibles.length === 0) {
          throw Object.assign(new Error('Joueur introuvable'), { httpStatus: 404 });
        }
        const qi = String(session.current_question_index);
        const dons: JokerAward[] = [];
        await Promise.all(
          cibles.map(async (p) => {
            const main = handOf(p);
            if (main.length >= JOKER_HAND_MAX) return; // main pleine : saute
            const type = drawJokerType();
            const { error } = await supabaseAdmin
              .from('game_players')
              .update({ bonuses: { jokers: [...main, type] } })
              .eq('id', p.id);
            if (!error) dons.push({ playerId: p.id, pseudo: p.pseudo, type, source: 'gm' });
          }),
        );
        if (dons.length > 0) {
          session.runtime.jokerAwards = session.runtime.jokerAwards ?? {};
          session.runtime.jokerAwards[qi] = [
            ...(session.runtime.jokerAwards[qi] ?? []),
            ...dons,
          ];
          // le JOUEUR lit reveal.jokerAwards au 3e temps de sa sequence : sans
          // cet ajout, un don fait pendant la revelation ne declencherait pas
          // sa roue de tirage. (Le projecteur, lui, n'annonce plus les jokers.)
          if (session.runtime.reveal) {
            session.runtime.reveal.jokerAwards = [
              ...(session.runtime.reveal.jokerAwards ?? []),
              ...dons.map((d) => ({ pseudo: d.pseudo, type: d.type })),
            ];
          }
          markDirty(session);
          void broadcast(session.id, 'joker', {
            kind: 'award',
            awards: dons.map((d) => ({ pseudo: d.pseudo, type: d.type, playerId: d.playerId })),
          });
        }
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
      bonuses: { jokers: [] },
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

/**
 * Jouer un joker.
 *
 * Fenetre : annonce OU question (l'ancien quitte-ou-double n'acceptait que
 * l'annonce ; le 50/50 et l'avis du public n'ont de sens qu'une fois les
 * reponses affichees). Idempotent par type : rejouer le meme type sur la meme
 * question renvoie les donnees deja produites, sans reconsommer.
 *
 * Ordre des ecritures : runtime d'abord (sous mutex, sauve par withSession),
 * update du stock ensuite. Les deux ne sont pas transactionnels : dans ce sens,
 * un echec entre les deux laisse au pire un joker gratuit — jamais un joker
 * consomme sans effet, ce que faisait l'ancien ordre.
 */
/**
 * Repartition en direct des reponses, pour le joker « avis du public ».
 *
 * Appelee UNIQUEMENT pour un joueur ayant arme ce joker, pendant la question :
 * une requete par rafraichissement de ce joueur-la, pas pour la salle entiere.
 * C'est ce qui rend le joker vivant (les barres montent pendant que les autres
 * repondent) alors qu'il a ete engage a l'aveugle pendant l'annonce.
 */
export async function audienceCounts(
  session: SessionRow,
  questionIndex: number,
): Promise<{ counts: number[]; total: number }> {
  const q = currentQuestion(session);
  const reponses = await loadAnswers(session.id, questionIndex);
  const counts = new Array(q?.answers.length ?? 4).fill(0) as number[];
  for (const a of reponses) {
    const c = a.answer.choice;
    if (typeof c === 'number' && c >= 0 && c < counts.length) counts[c] += 1;
  }
  return { counts, total: reponses.length };
}

export async function playJoker(
  sessionId: string,
  player: PlayerRow,
  questionIndex: number,
  type: JokerType,
): Promise<{ jokers: JokerType[]; data?: Record<string, unknown> }> {
  let mainApres: JokerType[] = handOf(player);
  let dataOut: Record<string, unknown> | undefined;
  let dejaJoue = false;

  await withSession(sessionId, async (session) => {
    // un joueur ejecte (afk) ou retire garde parfois l'app ouverte : il ne
    // doit plus pouvoir engager de joker
    if (player.status !== 'active') {
      throw Object.assign(new Error('error_not_active'), { httpStatus: 409 });
    }
    // FENETRE UNIQUE : l'annonce, avant que la question s'affiche. Tous les
    // jokers s'engagent a l'aveugle, c'est ce qui en fait des paris et non des
    // aides de derniere seconde. Une fois la question lancee, plus rien.
    if (session.status !== 'announce' || session.current_question_index !== questionIndex) {
      throw Object.assign(new Error('error_bonus_window_closed'), { httpStatus: 409 });
    }
    const q = currentQuestion(session);
    if ((type === 'fifty' || type === 'audience') && q?.type !== 'qcm') {
      throw Object.assign(new Error('error_joker_type'), { httpStatus: 409 });
    }

    const key = String(questionIndex);
    const list = session.runtime.jokerPlays?.[key] ?? [];
    const existante = list.find((x) => x.playerId === player.id && x.type === type);
    if (existante) {
      // deja joue : idempotent, on restitue les memes donnees
      dejaJoue = true;
      dataOut = existante.data;
      return;
    }

    const main = handOf(player);
    const idx = main.indexOf(type);
    if (idx < 0) {
      throw Object.assign(new Error('error_no_joker'), { httpStatus: 409 });
    }

    // donnees propres au joker, produites cote serveur
    let data: Record<string, unknown> | undefined;
    if (type === 'fifty' && q) {
      const faux = q.answers.map((_, i) => i).filter((i) => i !== q.correctIndex);
      // 2 mauvaises reponses au hasard parmi les fausses
      for (let i = faux.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [faux[i], faux[j]] = [faux[j], faux[i]];
      }
      data = { removed: faux.slice(0, 2).sort((a, b) => a - b) };
    } else if (type === 'audience') {
      // Rien a calculer ici : le joker s'arme AVANT la question, personne n'a
      // encore repondu. La repartition est produite en direct pendant la
      // question (cf. audienceCounts), le joueur voit donc la salle voter au
      // lieu d'un cliche fige.
      data = { armed: true };
    }

    const play: JokerPlay = { playerId: player.id, pseudo: player.pseudo, type, data };
    session.runtime.jokerPlays = session.runtime.jokerPlays ?? {};
    session.runtime.jokerPlays[key] = [...list, play];
    markDirty(session);

    mainApres = [...main.slice(0, idx), ...main.slice(idx + 1)];
    const { error } = await supabaseAdmin
      .from('game_players')
      .update({ bonuses: { jokers: mainApres } })
      .eq('id', player.id);
    if (error) throw error;
    dataOut = data;
  });

  if (!dejaJoue) {
    await broadcast(sessionId, 'joker', { kind: 'play', pseudo: player.pseudo, type });
  }
  return { jokers: mainApres, data: dataOut };
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
  const allIn = (session.runtime.jokerPlays?.[String(qi)] ?? []).some(
    (x) => x.playerId === player.id && x.type === 'all_in',
  );

  const { error } = await supabaseAdmin.from('game_answers').insert({
    session_id: sessionId,
    player_id: player.id,
    question_index: qi,
    answer,
    elapsed_ms: elapsedMs,
    bonus: allIn ? 'all_in' : null,
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
