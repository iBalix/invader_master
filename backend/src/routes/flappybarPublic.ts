/**
 * Routes publiques de Flappy Bar (dalles tactiles, sans auth).
 * Montées sur /public/flappybar (AVANT le CORS restrictif, comme /public/chess).
 *
 * Les flaps en direct ne passent pas ici : ils transitent par le WebSocket
 * /ws/flappybar (flappybar-bridge). Le HTTP porte le cycle de vie (salle,
 * manches, records) et la déclaration de mort, seule écriture qui fait foi.
 * Un spectateur n'a aucune inscription : GET /state sans playerToken renvoie
 * la vue publique.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { findPlayerByToken, isAdvanceDue, loadSession, withSession } from '../games/engine.js';
// import à effet de bord indispensable : enregistre l'advancer 'flappybar'
import {
  createFlapSession,
  ensureRecordsApplied,
  flapPlayerAction,
  joinFlapSession,
  listOpenFlapSessions,
  recordsPending,
  reportFlapDeath,
  type FlapPlayerAction,
} from '../games/flappybar/flapFlow.js';
import * as flapStore from '../games/flappybar/flapStore.js';
import {
  buildFlapLobbyItem,
  buildFlapPublicState,
  buildFlapYou,
} from '../games/flappybar/flapViews.js';
import { SIM, isValidFlapList } from '../games/flappybar/flapSim.js';
import { FLAP_MAX_FLAPS, FLAP_RECORDS_MODE } from '../games/flappybar/types.js';
import { listRecords } from '../games/records.js';
import type { SessionRow } from '../games/types.js';

export const flappybarPublicRoutes = Router();

function httpError(res: Parameters<Parameters<typeof flappybarPublicRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[flapPublic]', err);
  res.status(status).json({ status: 'error', message });
}

const ACTIONS = new Set<FlapPlayerAction>(['start', 'leave', 'invite']);

function ensureFlap(session: SessionRow | null): SessionRow {
  if (!session || session.mode !== 'flappybar') {
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
  // preuve de vie en mémoire pour le pont WebSocket (socket morte != joueur parti)
  flapStore.touchSeen(playerId);
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

/**
 * Rattrapage paresseux avant une lecture : transitions dues (plafond de
 * manche, lobby expiré) et records d'une manche close encore en attente.
 */
async function freshen(session: SessionRow): Promise<SessionRow> {
  if (isAdvanceDue(session) || recordsPending(session)) {
    return withSession(session.id, ensureRecordsApplied);
  }
  return session;
}

/** Lobby : salles en attente puis manches en cours, les plus récentes d'abord */
flappybarPublicRoutes.get('/sessions', async (_req, res) => {
  try {
    const sessions = await listOpenFlapSessions();
    const items = sessions.map(buildFlapLobbyItem).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'lobby' ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    res.json({ status: 'success', items });
  } catch (err) {
    httpError(res, err);
  }
});

/** Création d'une salle (le créateur est placé, hôte de la salle) */
flappybarPublicRoutes.post('/sessions', async (req, res) => {
  try {
    const body = req.body as { pseudo?: string; device?: string; theme?: string; maxPlayers?: number };
    const { session, player } = await createFlapSession({
      pseudo: body.pseudo ?? '',
      device: deviceOf(req, body),
      theme: body.theme ?? '',
      maxPlayers: body.maxPlayers,
    });
    res.json({
      status: 'success',
      data: {
        sessionId: session.id,
        joinCode: session.join_code,
        playerToken: player.player_token,
        state: buildFlapPublicState(session),
        you: buildFlapYou(session, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Tableau d'honneur du bar (toutes parties confondues) */
flappybarPublicRoutes.get('/records', async (req, res) => {
  try {
    const raw = Number(req.query.limit ?? 10);
    const limit = Number.isInteger(raw) ? Math.min(50, Math.max(1, raw)) : 10;
    const items = await listRecords(FLAP_RECORDS_MODE, limit);
    res.json({ status: 'success', items });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet (vue publique) + bloc "you" si playerToken fourni */
flappybarPublicRoutes.get('/:idOrCode/state', async (req, res) => {
  try {
    const session = await freshen(ensureFlap(await loadSession(req.params.idOrCode)));
    const token = (req.query.playerToken as string) || undefined;
    const player = await findPlayerByToken(session.id, token);
    if (player) touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: {
        state: buildFlapPublicState(session),
        you: player ? buildFlapYou(session, player) : null,
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Rejoindre (salle ou manche en cours, on entre à la suivante), ou reprise par jeton */
flappybarPublicRoutes.post('/:idOrCode/join', async (req, res) => {
  try {
    const session = ensureFlap(await loadSession(req.params.idOrCode));
    const body = req.body as { pseudo?: string; device?: string; playerToken?: string };
    if (body.playerToken) {
      const existing = await findPlayerByToken(session.id, body.playerToken);
      if (!existing) {
        res.status(401).json({ status: 'error', message: 'error_unknown_player' });
        return;
      }
      const fresh = await freshen(session);
      touchHeartbeat(existing.id);
      res.json({
        status: 'success',
        data: {
          playerToken: existing.player_token,
          sessionId: fresh.id,
          state: buildFlapPublicState(fresh),
          you: buildFlapYou(fresh, existing),
        },
      });
      return;
    }
    const { session: committed, player } = await joinFlapSession(
      session.id,
      body.pseudo ?? '',
      deviceOf(req, body),
    );
    res.json({
      status: 'success',
      data: {
        playerToken: player.player_token,
        sessionId: committed.id,
        state: buildFlapPublicState(committed),
        you: buildFlapYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Actions de salle : lancer une manche, partir, inviter le bar */
flappybarPublicRoutes.post('/:idOrCode/action', async (req, res) => {
  try {
    const session = ensureFlap(await loadSession(req.params.idOrCode));
    const body = req.body as { playerToken?: string; action?: string };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    if (!body.action || !ACTIONS.has(body.action as FlapPlayerAction)) {
      res.status(400).json({ status: 'error', message: 'Action inconnue' });
      return;
    }
    const committed = await flapPlayerAction(session.id, player, body.action as FlapPlayerAction);
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildFlapPublicState(committed), you: buildFlapYou(committed, player) },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Déclaration de mort : le serveur rejoue les flaps et impose son résultat */
flappybarPublicRoutes.post('/:idOrCode/round/death', async (req, res) => {
  try {
    const session = ensureFlap(await loadSession(req.params.idOrCode));
    const body = req.body as {
      playerToken?: string;
      roundIndex?: unknown;
      frame?: unknown;
      flaps?: unknown;
    };
    const player = await findPlayerByToken(session.id, body.playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    const roundIndex = body.roundIndex;
    const frame = body.frame;
    const flaps = body.flaps;
    const valid =
      typeof roundIndex === 'number' && Number.isInteger(roundIndex) && roundIndex >= 0 &&
      typeof frame === 'number' && Number.isInteger(frame) && frame >= 0 && frame <= SIM.MAX_FRAMES &&
      isValidFlapList(flaps) && flaps.length <= FLAP_MAX_FLAPS;
    if (!valid) {
      res.status(400).json({ status: 'error', message: 'error_flap_bad_flaps' });
      return;
    }
    const { session: committed, result } = await reportFlapDeath(session.id, player, {
      roundIndex: roundIndex as number,
      frame: frame as number,
      flaps: flaps as number[],
    });
    touchHeartbeat(player.id);
    res.json({
      status: 'success',
      data: { state: buildFlapPublicState(committed), you: buildFlapYou(committed, player), result },
    });
  } catch (err) {
    httpError(res, err);
  }
});
