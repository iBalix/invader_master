/**
 * Routes gamemaster du moteur de jeu (auth admin/salarie).
 * Montées sur /api/game.
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { supabaseAdmin } from '../config/supabase.js';
import { isAdvanceDue, loadPlayers, loadSession, withSession } from '../games/engine.js';
import { createQuizSession, gmAction, type ActionParams } from '../games/quizFlow.js';
import { switchScreensToGame } from '../games/screens.js';
// import à effet de bord indispensable : enregistre l'advancer 'battle'
import {
  battleGmAction,
  createBattleSession,
  type BattleActionParams,
} from '../games/battleFlow.js';
// idem : enregistre l'advancer 'chess'
import { chessGmAction } from '../games/chess/chessFlow.js';
import { buildChessPublicState } from '../games/chess/chessViews.js';
// idem : enregistre l'advancer 'blackjack'
import { bjGmAction } from '../games/blackjack/bjFlow.js';
import { buildBjPublicState } from '../games/blackjack/bjViews.js';
// idem : enregistre l'advancer 'flappybar'
import { flapGmAction } from '../games/flappybar/flapFlow.js';
import { buildFlapPublicState } from '../games/flappybar/flapViews.js';
import { buildGmState } from '../games/views.js';
// idem : enregistre l'advancer 'tournament' (et l'écouteur des parties d'échecs)
import {
  clearProjectorForQuiz,
  createTournamentSession,
  tournamentGmAction,
  type TournamentActionParams,
} from '../games/tournament/tournamentFlow.js';
import '../games/tournament/chessBridge.js';
import { buildTournamentGmState, type LiveGameInfo } from '../games/tournament/tournamentViews.js';
import { tournamentConfigOf, tournamentStateOf } from '../games/tournament/types.js';
import type { SessionRow } from '../games/types.js';

export const gameSessionRoutes = Router();

gameSessionRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

function httpError(res: Parameters<Parameters<typeof gameSessionRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[game]', err);
  res.status(status).json({ status: 'error', message });
}

/**
 * Tournoi : état des parties d'échecs en cours (dernier coup), pour l'alerte
 * « partie figée » de la console. Lu à la volée, jamais stocké : écrire
 * l'heure du dernier coup dans le tournoi le ferait diffuser à chaque coup.
 */
async function liveGamesInfo(session: SessionRow): Promise<Record<string, LiveGameInfo>> {
  const st = tournamentStateOf(session);
  const round = st.rounds[st.rounds.length - 1];
  const refs = (round?.matches ?? []).map((m) => m.live?.ref).filter((r): r is string => Boolean(r));
  if (refs.length === 0) return {};
  const { data } = await supabaseAdmin
    .from('game_sessions')
    .select('id, status, phase_started_at, moves:runtime->chess->moves')
    .in('id', refs);
  const out: Record<string, LiveGameInfo> = {};
  for (const row of (data ?? []) as Array<{ id: string; status: string; phase_started_at: string | null; moves: unknown }>) {
    out[row.id] = {
      status: row.status,
      lastMoveAt: row.phase_started_at ? Date.parse(row.phase_started_at) : null,
      moves: Array.isArray(row.moves) ? row.moves.length : 0,
    };
  }
  return out;
}

/**
 * Sessions récentes. Filtres : ?mode=quiz|battle|tournament, ?active=1 (non
 * closes), ?limit= (1 à 50, défaut 20).
 *
 * Sans filtre de mode, chaque partie et chaque revanche d'échecs (et de
 * blackjack, de Flappy Bar) prend une place dans les 20 dernières : un soir
 * chargé, la console ne retrouvait plus la session qu'elle pilotait.
 */
gameSessionRoutes.get('/', async (req, res) => {
  try {
    const mode = typeof req.query.mode === 'string' ? req.query.mode : null;
    const activeOnly = req.query.active === '1' || req.query.active === 'true';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50);
    let query = supabaseAdmin
      .from('game_sessions')
      .select('id, mode, status, join_code, quiz_id, current_question_index, created_at, started_at, ended_at, config')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (mode) query = query.eq('mode', mode);
    if (activeOnly) query = query.is('ended_at', null);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      status: 'success',
      items: (data ?? []).map((s) => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        joinCode: s.join_code,
        quizId: s.quiz_id,
        quizName:
          (s.config as { quizName?: string })?.quizName ??
          (s.mode === 'tournament' ? (s.config as { title?: string })?.title ?? null : null),
        testMode: (s.config as { testMode?: boolean })?.testMode === true,
        currentQuestionIndex: s.current_question_index,
        createdAt: s.created_at,
        startedAt: s.started_at,
        endedAt: s.ended_at,
      })),
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Créer une session (quiz par défaut, battle avec mode: 'battle') */
gameSessionRoutes.post('/', async (req, res) => {
  try {
    const { mode, quizId, config, force } = req.body as {
      mode?: string;
      quizId?: string;
      config?: ActionParams['config'];
      force?: boolean;
    };
    // tournoi : branche AVANT les replis quiz (un mode inconnu exigeait un quizId)
    if (mode === 'tournament') {
      const created = await createTournamentSession(config ?? {}, { force: force === true });
      if (!tournamentConfigOf(created).testMode) {
        switchScreensToGame(`tournament ${created.id.slice(0, 8)}`);
      }
      res.json({ status: 'success', data: { id: created.id, joinCode: created.join_code } });
      return;
    }
    if (mode !== 'battle' && !quizId) {
      res.status(400).json({ status: 'error', message: 'quizId requis' });
      return;
    }
    // un vrai tournoi occupe les écrans : 409 sauf confirmation explicite
    await clearProjectorForQuiz(force === true);
    const session =
      mode === 'battle'
        ? await createBattleSession(config ?? {})
        : await createQuizSession(quizId as string, config ?? {});
    // ICI et pas dans createXSession : endActiveSessions a deja tourne avant
    // insertSession, donc une seule bascule des postes par lancement
    switchScreensToGame(`${session.mode} ${session.id.slice(0, 8)}`);
    res.json({ status: 'success', data: { id: session.id, joinCode: session.join_code } });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet vue GM */
gameSessionRoutes.get('/:id/state', async (req, res) => {
  try {
    let session = await loadSession(req.params.id);
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    // rattrapage paresseux : les transitions dues s'appliquent (et se
    // persistent) dans withSession ; jamais d'advance sur une copie jetable
    if (isAdvanceDue(session)) {
      session = await withSession(session.id, async (s) => s);
    }
    if (session.mode === 'tournament') {
      res.json({ status: 'success', data: buildTournamentGmState(session, await liveGamesInfo(session)) });
      return;
    }
    // échecs / blackjack / flappy bar : rien de secret, la vue publique suffit au staff
    if (session.mode === 'chess') {
      res.json({ status: 'success', data: buildChessPublicState(session) });
      return;
    }
    if (session.mode === 'blackjack') {
      res.json({ status: 'success', data: buildBjPublicState(session) });
      return;
    }
    if (session.mode === 'flappybar') {
      res.json({ status: 'success', data: buildFlapPublicState(session) });
      return;
    }
    const players = await loadPlayers(session.id);
    res.json({ status: 'success', data: buildGmState(session, players) });
  } catch (err) {
    httpError(res, err);
  }
});

/** Réponses en direct de la question courante (feed GM, avec justesse) */
gameSessionRoutes.get('/:id/answers', async (req, res) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    const qi = req.query.questionIndex !== undefined
      ? parseInt(req.query.questionIndex as string, 10)
      : session.current_question_index;
    const [{ data: answers, error }, players] = await Promise.all([
      supabaseAdmin
        .from('game_answers')
        .select('player_id, answer, elapsed_ms, bonus, is_correct, points_awarded, created_at')
        .eq('session_id', session.id)
        .eq('question_index', qi)
        .order('created_at'),
      loadPlayers(session.id),
    ]);
    if (error) throw error;
    const q = session.question_order[qi];
    const pseudoById = new Map(players.map((p) => [p.id, p.pseudo]));
    res.json({
      status: 'success',
      items: (answers ?? []).map((a) => {
        // justesse live pour le GM (avant révélation, QCM/estimation seulement)
        let liveCorrect: boolean | null = a.is_correct;
        if (liveCorrect === null && q) {
          if (q.type === 'qcm' && typeof (a.answer as { choice?: number }).choice === 'number') {
            liveCorrect = (a.answer as { choice: number }).choice === q.correctIndex;
          }
        }
        return {
          pseudo: pseudoById.get(a.player_id) ?? '?',
          playerId: a.player_id,
          answer: a.answer,
          elapsedMs: a.elapsed_ms,
          bonus: a.bonus,
          correct: liveCorrect,
          points: a.points_awarded,
        };
      }),
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Action de pilotage (dispatch par mode de session) */
gameSessionRoutes.post('/:id/action', async (req, res) => {
  try {
    const { action, params } = req.body as {
      action?: string;
      params?: ActionParams & BattleActionParams;
    };
    if (!action) {
      res.status(400).json({ status: 'error', message: 'action requise' });
      return;
    }
    const existing = await loadSession(req.params.id);
    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    if (existing.mode === 'tournament') {
      const session = await tournamentGmAction(
        existing.id,
        action,
        (params ?? {}) as unknown as TournamentActionParams,
      );
      res.json({ status: 'success', data: buildTournamentGmState(session, await liveGamesInfo(session)) });
      return;
    }
    if (existing.mode === 'chess') {
      // seule action staff sur une partie d'échecs : la terminer de force
      const session = await chessGmAction(existing.id, action);
      res.json({ status: 'success', data: buildChessPublicState(session) });
      return;
    }
    if (existing.mode === 'blackjack') {
      const session = await bjGmAction(existing.id, action);
      res.json({ status: 'success', data: buildBjPublicState(session) });
      return;
    }
    if (existing.mode === 'flappybar') {
      // seule action staff : terminer la partie (la manche en cours est classée)
      const session = await flapGmAction(existing.id, action);
      res.json({ status: 'success', data: buildFlapPublicState(session) });
      return;
    }
    const session =
      existing.mode === 'battle'
        ? await battleGmAction(existing.id, action, params ?? {})
        : await gmAction(existing.id, action, params ?? {});
    const players = await loadPlayers(session.id);
    res.json({ status: 'success', data: buildGmState(session, players) });
  } catch (err) {
    httpError(res, err);
  }
});
