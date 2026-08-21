/**
 * Routes publiques du jeu d'échecs (dalles tactiles, sans auth).
 * Montées sur /public/chess (AVANT le CORS restrictif, comme /public/game).
 *
 * Un spectateur n'a aucune inscription : GET /state sans playerToken renvoie
 * la vue publique, la synchro passe par le même protocole v/sync que le quiz.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { findPlayerByToken, isAdvanceDue, loadSession, withSession } from '../games/engine.js';
// import à effet de bord indispensable : enregistre l'advancer 'chess'
import {
  chessPlayerAction,
  createChessSession,
  joinChessSession,
  listOpenChessSessions,
  playChessMove,
  type ChessPlayerAction,
} from '../games/chess/chessFlow.js';
import {
  buildChessLobbyItem,
  buildChessPublicState,
  buildChessYou,
} from '../games/chess/chessViews.js';
import type { PromotionPiece } from '../games/chess/types.js';
import type { SessionRow } from '../games/types.js';

export const chessPublicRoutes = Router();

function httpError(res: Parameters<Parameters<typeof chessPublicRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[chessPublic]', err);
  res.status(status).json({ status: 'error', message });
}

const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(['q', 'r', 'b', 'n']);
const PLAYER_ACTIONS = new Set<ChessPlayerAction>([
  'resign',
  'draw-offer',
  'draw-accept',
  'draw-decline',
  'cancel',
  'rematch',
]);

function ensureChess(session: SessionRow | null): SessionRow {
  if (!session || session.mode !== 'chess') {
    throw Object.assign(new Error('Session introuvable'), { httpStatus: 404 });
  }
  return session;
}

function deviceOf(req: { header(name: string): string | undefined }, body?: { device?: string }): string {
  const fromBody = body?.device?.trim();
  if (fromBody) return fromBody.slice(0, 32);
  const fromHeader = req.header('x-hostname')?.trim();
  return fromHeader ? fromHeader.slice(0, 32) : 'unknown';
}

/**
 * Présence : une écriture au plus toutes les 30 s par joueur. Le sondage de
 * secours est passé à 2,5 s pendant une partie ; sans ce garde-fou, chaque
 * dalle écrirait en base 24 fois par minute pour rien.
 */
const HEARTBEAT_MIN_INTERVAL_MS = 30_000;
const lastHeartbeat = new Map<string, number>();

function touchHeartbeat(playerId: string): void {
  const now = Date.now();
  if (now - (lastHeartbeat.get(playerId) ?? 0) < HEARTBEAT_MIN_INTERVAL_MS) return;
  // borne mémoire : la table ne sert que de cache d'anti-rebond
  if (lastHeartbeat.size > 500) lastHeartbeat.clear();
  lastHeartbeat.set(playerId, now);
  void supabaseAdmin
    .from('game_players')
    .update({ last_seen_at: new Date(now).toISOString() })
    .eq('id', playerId)
    .then(() => undefined);
}

/** Lobby : parties en attente puis parties en cours */
chessPublicRoutes.get('/sessions', async (_req, res) => {
  try {
    const sessions = await listOpenChessSessions();
    const items = sessions
      .map(buildChessLobbyItem)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'lobby' ? -1 : 1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
    res.json({ status: 'success', items });
  } catch (err) {
    httpError(res, err);
  }
});

/** Création d'une partie (le créateur est assis immédiatement) */
chessPublicRoutes.post('/sessions', async (req, res) => {
  try {
    const body = req.body as {
      pseudo?: string;
      device?: string;
      clock?: { initialMinutes?: number; incrementSeconds?: number } | null;
      color?: string;
      theme?: string;
    };
    const { session, player } = await createChessSession({
      pseudo: body.pseudo ?? '',
      device: deviceOf(req, body),
      clock:
        body.clock == null
          ? null
          : {
              initialMinutes: Number(body.clock.initialMinutes),
              incrementSeconds: Number(body.clock.incrementSeconds),
            },
      color: (body.color ?? 'random') as 'w' | 'b' | 'random',
      theme: body.theme ?? '',
    });
    res.json({
      status: 'success',
      data: {
        sessionId: session.id,
        joinCode: session.join_code,
        playerToken: player.player_token,
        state: buildChessPublicState(session),
        you: buildChessYou(session, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet (vue publique) + bloc "you" si playerToken fourni */
chessPublicRoutes.get('/:idOrCode/state', async (req, res) => {
  try {
    let session = ensureChess(await loadSession(req.params.idOrCode));
    // rattrapage paresseux : drapeau/expiration appliqués et persistés
    if (isAdvanceDue(session)) {
      session = await withSession(session.id, async (s) => s);
    }
    const token = (req.query.playerToken as string) || undefined;
    const player = await findPlayerByToken(session.id, token);
    if (player) touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: {
        state: buildChessPublicState(session),
        you: player ? buildChessYou(session, player) : null,
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Rejoindre (2e joueur) ou reprendre son siège via playerToken */
chessPublicRoutes.post('/:idOrCode/join', async (req, res) => {
  try {
    let session = ensureChess(await loadSession(req.params.idOrCode));
    const body = req.body as { pseudo?: string; device?: string; playerToken?: string };

    // reprise d'identité (reload, redémarrage de la dalle)
    const existing = await findPlayerByToken(session.id, body.playerToken);
    if (existing) {
      if (isAdvanceDue(session)) {
        session = await withSession(session.id, async (s) => s);
      }
      touchHeartbeat(existing.id);
      res.json({
        status: 'success',
        data: {
          playerToken: existing.player_token,
          sessionId: session.id,
          state: buildChessPublicState(session),
          you: buildChessYou(session, existing),
        },
      });
      return;
    }

    if (session.ended_at) {
      res.status(409).json({ status: 'error', message: 'error_chess_game_full' });
      return;
    }
    const { session: committed, player } = await joinChessSession(
      session.id,
      body.pseudo ?? '',
      deviceOf(req, body),
    );
    res.json({
      status: 'success',
      data: {
        playerToken: player.player_token,
        sessionId: committed.id,
        state: buildChessPublicState(committed),
        you: buildChessYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Jouer un coup (validation 100% serveur, pendules serveur) */
chessPublicRoutes.post('/:idOrCode/move', async (req, res) => {
  try {
    const session = ensureChess(await loadSession(req.params.idOrCode));
    const body = req.body as {
      playerToken?: string;
      ply?: number;
      from?: string;
      to?: string;
      promotion?: string;
    };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (
      !Number.isInteger(body.ply) ||
      (body.ply as number) < 0 ||
      typeof body.from !== 'string' ||
      !SQUARE_RE.test(body.from) ||
      typeof body.to !== 'string' ||
      !SQUARE_RE.test(body.to) ||
      (body.promotion !== undefined && !PROMOTIONS.has(body.promotion))
    ) {
      res.status(400).json({ status: 'error', message: 'error_chess_illegal_move' });
      return;
    }
    const committed = await playChessMove(session.id, player, {
      ply: body.ply as number,
      from: body.from,
      to: body.to,
      promotion: body.promotion as PromotionPiece | undefined,
    });
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: {
        state: buildChessPublicState(committed),
        you: buildChessYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Actions joueur : abandon, nulle, annulation, revanche */
chessPublicRoutes.post('/:idOrCode/action', async (req, res) => {
  try {
    const session = ensureChess(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; action?: string };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (!body.action || !PLAYER_ACTIONS.has(body.action as ChessPlayerAction)) {
      res.status(400).json({ status: 'error', message: 'Action inconnue' });
      return;
    }
    const committed = await chessPlayerAction(session.id, player, body.action as ChessPlayerAction);
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: {
        state: buildChessPublicState(committed),
        you: buildChessYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});
