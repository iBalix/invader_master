/**
 * Routes publiques du moteur de jeu (joueurs + écrans, sans auth).
 * Montées sur /public/game.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import {
  findPlayerByToken,
  isAdvanceDue,
  loadPlayers,
  loadSession,
  markDirty,
  withSession,
} from '../games/engine.js';
import { audienceCounts, playJoker, joinSession, submitAnswer } from '../games/quizFlow.js';
// import à effet de bord indispensable : enregistre l'advancer 'battle'
import { joinBattleSession, submitBattleAnswer } from '../games/battleFlow.js';
import { buildPublicState, buildYou } from '../games/views.js';
import type { PlayerRow, SessionRow } from '../games/types.js';

export const gamePublicRoutes = Router();

function httpError(res: Parameters<Parameters<typeof gamePublicRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[gamePublic]', err);
  res.status(status).json({ status: 'error', message });
}

/**
 * Ces routes ne servent QUE quiz/battle : les jeux de tables (chess, ...) ont
 * leurs propres routeurs. Sans cette garde, /public/game/<chessId>/join
 * exécuterait le join quiz sur une partie d'échecs.
 */
function ensureQuizBattle(session: SessionRow): void {
  if (session.mode !== 'quiz' && session.mode !== 'battle') {
    throw Object.assign(new Error('Session introuvable'), { httpStatus: 404 });
  }
}

async function hasAnswered(session: SessionRow, player: PlayerRow): Promise<boolean> {
  if (session.current_question_index < 0) return false;
  const { count } = await supabaseAdmin
    .from('game_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('player_id', player.id)
    .eq('question_index', session.current_question_index);
  return (count ?? 0) > 0;
}

/** Session active courante (pour les écrans et la bascule des tables) */
gamePublicRoutes.get('/current', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .select('id, join_code, mode, status, created_at')
      .is('ended_at', null)
      // événements projo uniquement : une partie d'échecs sur une table ne
      // doit jamais devenir "la" session courante du bar
      .in('mode', ['quiz', 'battle'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const session = data?.[0] ?? null;
    res.json({
      status: 'success',
      data: session
        ? {
            sessionId: session.id,
            joinCode: session.join_code,
            mode: session.mode,
            gameStatus: session.status,
          }
        : null,
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet (vue publique) + bloc "you" si playerToken fourni */
gamePublicRoutes.get('/:idOrCode/state', async (req, res) => {
  try {
    let session = await loadSession(req.params.idOrCode);
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    ensureQuizBattle(session);
    // rattrapage paresseux : si une transition auto est due, on l'applique
    // dans withSession (persistée) ; jamais d'advance sur une copie jetable
    if (isAdvanceDue(session)) {
      session = await withSession(session.id, async (s) => s);
    }
    const players = await loadPlayers(session.id);
    const state = buildPublicState(session, players);
    const token = (req.query.playerToken as string) || undefined;
    const player = await findPlayerByToken(session.id, token);
    const you = player ? buildYou(session, player, await hasAnswered(session, player)) : null;
    // « Avis du public » : arme pendant l'annonce, il n'a alors aucune donnee.
    // On calcule sa repartition ici, en direct, pour le seul joueur concerne.
    if (you && session.status === 'question') {
      const plays = you.jokerPlays as Array<{ type: string; data: unknown }>;
      if (plays.some((x) => x.type === 'audience')) {
        const live = await audienceCounts(session, session.current_question_index);
        you.jokerPlays = plays.map((x) => (x.type === 'audience' ? { ...x, data: live } : x));
      }
    }
    if (player) {
      // heartbeat de présence (best effort)
      void supabaseAdmin
        .from('game_players')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', player.id)
        .then(() => undefined);
    }
    res.json({ status: 'success', data: { state, you } });
  } catch (err) {
    httpError(res, err);
  }
});

/** Inscription (ou reprise via playerToken) */
gamePublicRoutes.post('/:idOrCode/join', async (req, res) => {
  try {
    const session = await loadSession(req.params.idOrCode);
    if (!session || session.ended_at) {
      res.status(404).json({ status: 'error', message: 'Aucune partie en cours' });
      return;
    }
    ensureQuizBattle(session);
    const { pseudo, device, playerToken } = req.body as {
      pseudo?: string;
      device?: string;
      playerToken?: string;
    };

    // Reprise de session
    const existing = await findPlayerByToken(session.id, playerToken);
    if (existing) {
      const you = buildYou(session, existing, await hasAnswered(session, existing));
      res.json({
        status: 'success',
        data: { playerToken: existing.player_token, you, sessionId: session.id },
      });
      return;
    }

    if (!pseudo) {
      res.status(400).json({ status: 'error', message: 'error_player_invalid_name' });
      return;
    }
    const player =
      session.mode === 'battle'
        ? await joinBattleSession(session, pseudo, device ?? 'mobile')
        : await joinSession(session, pseudo, device ?? 'mobile');
    const you = buildYou(session, player, false);
    res.json({
      status: 'success',
      data: { playerToken: player.player_token, you, sessionId: session.id },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Quitter avant le début (bouton ANNULER du legacy) */
gamePublicRoutes.post('/:idOrCode/leave', async (req, res) => {
  try {
    const session = await loadSession(req.params.idOrCode);
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    ensureQuizBattle(session);
    const player = await findPlayerByToken(session.id, (req.body as { playerToken?: string }).playerToken);
    if (player) {
      // soft delete : un DELETE dur cascaderait sur game_answers et fausserait
      // les reconstructions de scores. Le pseudo_norm est libéré pour qu'un
      // autre joueur (ou le même) puisse reprendre le pseudo.
      await supabaseAdmin
        .from('game_players')
        .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
        .eq('id', player.id);
      await withSession(session.id, async (s) => {
        markDirty(s);
      });
    }
    res.json({ status: 'success', data: { left: true } });
  } catch (err) {
    httpError(res, err);
  }
});

/** Réponse à la question courante (idempotent, retry safe) */
gamePublicRoutes.post('/:idOrCode/answer', async (req, res) => {
  try {
    const session = await loadSession(req.params.idOrCode);
    if (!session || session.ended_at) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    ensureQuizBattle(session);
    const { playerToken, questionIndex, answer, elapsedMs } = req.body as {
      playerToken?: string;
      questionIndex?: number;
      answer?: { choice?: number; number?: number; text?: string };
      elapsedMs?: number;
    };
    const player = await findPlayerByToken(session.id, playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (typeof questionIndex !== 'number' || !answer || typeof answer !== 'object') {
      res.status(400).json({ status: 'error', message: 'Requête invalide' });
      return;
    }
    const submit = session.mode === 'battle' ? submitBattleAnswer : submitAnswer;
    const result = await submit(
      session.id,
      player,
      questionIndex,
      answer,
      typeof elapsedMs === 'number' ? Math.round(elapsedMs) : null,
    );
    res.json({ status: 'success', data: result });
  } catch (err) {
    httpError(res, err);
  }
});

/** Jouer un joker (all_in / audience / fifty) pendant l'annonce ou la question */
gamePublicRoutes.post('/:idOrCode/joker', async (req, res) => {
  try {
    const session = await loadSession(req.params.idOrCode);
    if (!session || session.ended_at) {
      res.status(404).json({ status: 'error', message: 'Session introuvable' });
      return;
    }
    ensureQuizBattle(session);
    const { playerToken, questionIndex, type } = req.body as {
      playerToken?: string;
      questionIndex?: number;
      type?: string;
    };
    const player = await findPlayerByToken(session.id, playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    // jokers quiz uniquement : la battle a son propre rythme d'elimination
    if (session.mode !== 'quiz') {
      res.status(409).json({ status: 'error', message: 'error_bonus_window_closed' });
      return;
    }
    if (type !== 'all_in' && type !== 'audience' && type !== 'fifty') {
      res.status(400).json({ status: 'error', message: 'error_joker_type' });
      return;
    }
    const result = await playJoker(session.id, player, questionIndex ?? -1, type);
    res.json({ status: 'success', data: result });
  } catch (err) {
    httpError(res, err);
  }
});
