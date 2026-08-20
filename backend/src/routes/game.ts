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
// import à effet de bord indispensable : enregistre l'advancer 'battle'
import {
  battleGmAction,
  createBattleSession,
  type BattleActionParams,
} from '../games/battleFlow.js';
// idem : enregistre l'advancer 'chess'
import { chessGmAction } from '../games/chess/chessFlow.js';
import { buildChessPublicState } from '../games/chess/chessViews.js';
import { buildGmState } from '../games/views.js';

export const gameSessionRoutes = Router();

gameSessionRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

function httpError(res: Parameters<Parameters<typeof gameSessionRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[game]', err);
  res.status(status).json({ status: 'error', message });
}

/** Sessions récentes */
gameSessionRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .select('id, mode, status, join_code, quiz_id, current_question_index, created_at, started_at, ended_at, config')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({
      status: 'success',
      items: (data ?? []).map((s) => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        joinCode: s.join_code,
        quizId: s.quiz_id,
        quizName: (s.config as { quizName?: string })?.quizName ?? null,
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
    const { mode, quizId, config } = req.body as {
      mode?: string;
      quizId?: string;
      config?: ActionParams['config'];
    };
    if (mode === 'battle') {
      const session = await createBattleSession(config ?? {});
      res.json({ status: 'success', data: { id: session.id, joinCode: session.join_code } });
      return;
    }
    if (!quizId) {
      res.status(400).json({ status: 'error', message: 'quizId requis' });
      return;
    }
    const session = await createQuizSession(quizId, config ?? {});
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
    // échecs : rien de secret, la vue publique suffit au staff
    if (session.mode === 'chess') {
      res.json({ status: 'success', data: buildChessPublicState(session) });
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
    if (existing.mode === 'chess') {
      // seule action staff sur une partie d'échecs : la terminer de force
      const session = await chessGmAction(existing.id, action);
      res.json({ status: 'success', data: buildChessPublicState(session) });
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
