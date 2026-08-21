/**
 * Routes publiques du blackjack (dalles tactiles, sans auth).
 * Montées sur /public/blackjack (AVANT le CORS restrictif, comme /public/chess).
 *
 * Un spectateur n'a aucune inscription : GET /state sans playerToken renvoie
 * la vue publique. Le contenu des jokers ne circule que dans la vue `you`.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { findPlayerByToken, isAdvanceDue, loadSession, withSession } from '../games/engine.js';
// import à effet de bord indispensable : enregistre l'advancer 'blackjack'
import {
  bjAct,
  bjBet,
  bjJoker,
  bjMeta,
  createBjSession,
  joinBjSession,
  listOpenBjSessions,
  type BjAct,
  type BjMeta,
  type CreateBjInput,
} from '../games/blackjack/bjFlow.js';
import {
  buildBjLobbyItem,
  buildBjPublicState,
  buildBjYou,
} from '../games/blackjack/bjViews.js';
import { JOKER_TYPES, type JokerType } from '../games/blackjack/types.js';
import type { SessionRow } from '../games/types.js';

export const blackjackPublicRoutes = Router();

function httpError(res: Parameters<Parameters<typeof blackjackPublicRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[bjPublic]', err);
  res.status(status).json({ status: 'error', message });
}

const ACTS = new Set<BjAct>(['hit', 'stand', 'double', 'split']);
const METAS = new Set<BjMeta>(['launch', 'skip-intro', 'leave', 'end-after-round', 'rematch', 'invite']);

function ensureBj(session: SessionRow | null): SessionRow {
  if (!session || session.mode !== 'blackjack') {
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

/** présence : une écriture au plus toutes les 30 s par joueur (cf. chess) */
const HEARTBEAT_MIN_INTERVAL_MS = 30_000;
const lastHeartbeat = new Map<string, number>();

function touchHeartbeat(playerId: string): void {
  const now = Date.now();
  if (now - (lastHeartbeat.get(playerId) ?? 0) < HEARTBEAT_MIN_INTERVAL_MS) return;
  if (lastHeartbeat.size > 500) lastHeartbeat.clear();
  lastHeartbeat.set(playerId, now);
  void supabaseAdmin
    .from('game_players')
    .update({ last_seen_at: new Date(now).toISOString() })
    .eq('id', playerId)
    .then(() => undefined);
}

/** Lobby : tables en attente puis parties en cours */
blackjackPublicRoutes.get('/sessions', async (_req, res) => {
  try {
    const sessions = await listOpenBjSessions();
    const items = sessions.map(buildBjLobbyItem).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'lobby' ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    res.json({ status: 'success', items });
  } catch (err) {
    httpError(res, err);
  }
});

/** Création d'une table (le créateur est assis, la salle d'attente s'ouvre) */
blackjackPublicRoutes.post('/sessions', async (req, res) => {
  try {
    const body = req.body as Partial<CreateBjInput> & { device?: string };
    const { session, player } = await createBjSession({
      pseudo: body.pseudo ?? '',
      device: deviceOf(req, body),
      maxSeats: Number(body.maxSeats ?? 6),
      lateJoin: body.lateJoin !== false,
      decks: Number(body.decks ?? 4),
      startChips: Number(body.startChips ?? 500),
      minBet: Number(body.minBet ?? 10),
      maxBet: Number(body.maxBet ?? 100),
      rounds: Number(body.rounds ?? 8),
      decisionMs: Number(body.decisionMs ?? 10000),
      allowDouble: body.allowDouble !== false,
      allowSplit: body.allowSplit !== false,
      jokersEnabled: (body.jokersEnabled ?? {}) as Partial<Record<JokerType, boolean>>,
      jokerFrequency: (body.jokerFrequency ?? 'normal') as 'rare' | 'normal' | 'generous',
      theme: body.theme ?? '',
    });
    res.json({
      status: 'success',
      data: {
        sessionId: session.id,
        joinCode: session.join_code,
        playerToken: player.player_token,
        state: buildBjPublicState(session),
        you: buildBjYou(session, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet (vue publique) + bloc "you" si playerToken fourni */
blackjackPublicRoutes.get('/:idOrCode/state', async (req, res) => {
  try {
    let session = ensureBj(await loadSession(req.params.idOrCode));
    if (isAdvanceDue(session)) {
      session = await withSession(session.id, async (s) => s);
    }
    const token = (req.query.playerToken as string) || undefined;
    const player = await findPlayerByToken(session.id, token);
    if (player) touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: {
        state: buildBjPublicState(session),
        you: player ? buildBjYou(session, player) : null,
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** S'asseoir (salle d'attente ou en cours si la table l'accepte), ou reprise */
blackjackPublicRoutes.post('/:idOrCode/join', async (req, res) => {
  try {
    let session = ensureBj(await loadSession(req.params.idOrCode));
    const body = req.body as { pseudo?: string; device?: string; playerToken?: string };
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
          state: buildBjPublicState(session),
          you: buildBjYou(session, existing),
        },
      });
      return;
    }
    if (session.ended_at) {
      res.status(409).json({ status: 'error', message: 'error_bj_game_over' });
      return;
    }
    const { session: committed, player } = await joinBjSession(
      session.id,
      body.pseudo ?? '',
      deviceOf(req, body),
    );
    res.json({
      status: 'success',
      data: {
        playerToken: player.player_token,
        sessionId: committed.id,
        state: buildBjPublicState(committed),
        you: buildBjYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Mise de la manche */
blackjackPublicRoutes.post('/:idOrCode/bet', async (req, res) => {
  try {
    const session = ensureBj(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; amount?: number };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    const committed = await bjBet(session.id, player, Number(body.amount));
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildBjPublicState(committed), you: buildBjYou(committed, player) },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Décision de main : tirer, rester, doubler, séparer */
blackjackPublicRoutes.post('/:idOrCode/act', async (req, res) => {
  try {
    const session = ensureBj(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; action?: string; windowSeq?: number };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (!body.action || !ACTS.has(body.action as BjAct) || !Number.isInteger(body.windowSeq)) {
      res.status(400).json({ status: 'error', message: 'Requête invalide' });
      return;
    }
    const committed = await bjAct(session.id, player, body.action as BjAct, body.windowSeq as number);
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildBjPublicState(committed), you: buildBjYou(committed, player) },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Jouer un joker (jouable hors de son tour) */
blackjackPublicRoutes.post('/:idOrCode/joker', async (req, res) => {
  try {
    const session = ensureBj(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; joker?: string; target?: string };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (!body.joker || !JOKER_TYPES.includes(body.joker as JokerType)) {
      res.status(400).json({ status: 'error', message: 'Requête invalide' });
      return;
    }
    const committed = await bjJoker(
      session.id,
      player,
      body.joker as JokerType,
      typeof body.target === 'string' ? body.target : null,
    );
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildBjPublicState(committed), you: buildBjYou(committed, player) },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Actions de table : lancer, passer l'intro, partir, terminer, revanche */
blackjackPublicRoutes.post('/:idOrCode/action', async (req, res) => {
  try {
    const session = ensureBj(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; action?: string };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (!body.action || !METAS.has(body.action as BjMeta)) {
      res.status(400).json({ status: 'error', message: 'Action inconnue' });
      return;
    }
    const committed = await bjMeta(session.id, player, body.action as BjMeta);
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildBjPublicState(committed), you: buildBjYou(committed, player) },
    });
  } catch (err) {
    httpError(res, err);
  }
});
