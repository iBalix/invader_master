/**
 * Routes publiques du tournoi (téléphones, écrans, tables ; sans auth).
 * Montées sur /public/tournament, AVANT /public (comme /public/chess).
 *
 * Les routes statiques sont déclarées avant les routes paramétrées : un code
 * d'inscription de 4 lettres (« GAME ») serait sinon pris pour un segment.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { findPlayerByToken, isAdvanceDue, loadSession, withSession } from '../games/engine.js';
// import à effet de bord indispensable : enregistre l'advancer 'tournament'
import { joinTournament, leaveTournament, rejoinTournament } from '../games/tournament/tournamentFlow.js';
// idem : écouteur des parties d'échecs + réconciliateur
import { chessGameContext, lookupMany, lookupParticipant } from '../games/tournament/chessBridge.js';
import { buildTournamentPublicState, buildTournamentYou } from '../games/tournament/tournamentViews.js';
import { inScope } from '../games/tournament/registry.js';
import type { SessionRow } from '../games/types.js';

export const tournamentPublicRoutes = Router();

function httpError(res: Parameters<Parameters<typeof tournamentPublicRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[tournamentPublic]', err);
  res.status(status).json({ status: 'error', message });
}

function ensureTournament(session: SessionRow | null): SessionRow {
  if (!session || session.mode !== 'tournament') {
    throw Object.assign(new Error('error_tournament_not_found'), { httpStatus: 404 });
  }
  return session;
}

function deviceOf(req: { header(name: string): string | undefined }, body?: { device?: string }): string {
  const fromBody = body?.device?.trim();
  if (fromBody) return fromBody.slice(0, 32);
  const fromHeader = req.header('x-hostname')?.trim();
  return fromHeader ? fromHeader.slice(0, 32) : 'mobile';
}

/** Tournoi en cours (téléphone arrivé sur /tournoi sans code, redirection de /play) */
tournamentPublicRoutes.get('/current', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .select('id, join_code, status, config, created_at')
      .eq('mode', 'tournament')
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    const row = (data ?? []).find((r) => inScope((r.config ?? {}) as { testMode?: boolean }));
    res.json({
      status: 'success',
      data: row
        ? {
            sessionId: row.id,
            joinCode: row.join_code,
            title: (row.config as { title?: string })?.title ?? 'Tournoi',
            gameStatus: row.status,
          }
        : null,
    });
  } catch (err) {
    httpError(res, err);
  }
});

/**
 * Lookup des tables : ce pseudo participe-t-il au tournoi d'échecs en cours ?
 * `opponent` (facultatif) : la partie avec cet adversaire comptera-t-elle ?
 * Indicatif seulement : le serveur revérifie à la fin de la partie.
 */
tournamentPublicRoutes.get('/lookup', async (req, res) => {
  try {
    const game = String(req.query.game ?? 'chess');
    const pseudo = String(req.query.pseudo ?? '').slice(0, 32);
    const opponent = req.query.opponent ? String(req.query.opponent).slice(0, 32) : null;
    const data = await lookupParticipant(game, pseudo, opponent);
    res.json({ status: 'success', data });
  } catch (err) {
    httpError(res, err);
  }
});

/** Lookup groupé (lobby des échecs : un créateur attend-il son adversaire de tournoi ?) */
tournamentPublicRoutes.get('/lookup-many', async (req, res) => {
  try {
    const game = String(req.query.game ?? 'chess');
    const pseudos = String(req.query.pseudos ?? '')
      .split(',')
      .map((p) => p.trim().slice(0, 32))
      .filter(Boolean);
    res.json({ status: 'success', data: await lookupMany(game, pseudos) });
  } catch (err) {
    httpError(res, err);
  }
});

/** Contexte tournoi d'une partie d'échecs (pastille en partie, récap de fin) */
tournamentPublicRoutes.get('/chess-game/:chessId', async (req, res) => {
  try {
    const data = await chessGameContext(req.params.chessId);
    res.json({ status: 'success', data });
  } catch (err) {
    httpError(res, err);
  }
});

/** État complet (vue publique) + bloc « you » si playerToken fourni */
tournamentPublicRoutes.get('/:idOrCode/state', async (req, res) => {
  try {
    let session = ensureTournament(await loadSession(req.params.idOrCode));
    // rattrapage paresseux : fin du compte à rebours, fin du podium
    if (isAdvanceDue(session)) {
      session = await withSession(session.id, async (s) => s);
    }
    const token = (req.query.playerToken as string) || undefined;
    const player = await findPlayerByToken(session.id, token);
    res.json({
      status: 'success',
      data: {
        state: buildTournamentPublicState(session),
        you: player ? buildTournamentYou(session, player) : null,
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Inscription (pseudo seul), ou reprise via playerToken */
tournamentPublicRoutes.post('/:idOrCode/join', async (req, res) => {
  try {
    const session = ensureTournament(await loadSession(req.params.idOrCode));
    const body = req.body as { pseudo?: string; device?: string; playerToken?: string };
    const existing = await findPlayerByToken(session.id, body.playerToken);
    if (existing) {
      res.json({
        status: 'success',
        data: {
          playerToken: existing.player_token,
          sessionId: session.id,
          state: buildTournamentPublicState(session),
          you: buildTournamentYou(session, existing),
        },
      });
      return;
    }
    if (session.ended_at) {
      res.status(409).json({ status: 'error', message: 'error_tournament_over' });
      return;
    }
    const { session: committed, player } = await joinTournament(
      session.id,
      body.pseudo ?? '',
      deviceOf(req, body),
    );
    res.json({
      status: 'success',
      data: {
        playerToken: player.player_token,
        sessionId: committed.id,
        state: buildTournamentPublicState(committed),
        you: buildTournamentYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Quitter le tournoi (plus apparié ; forfait si le match n'a pas commencé) */
tournamentPublicRoutes.post('/:idOrCode/leave', async (req, res) => {
  try {
    const session = ensureTournament(await loadSession(req.params.idOrCode));
    const player = await findPlayerByToken(session.id, (req.body as { playerToken?: string }).playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    const committed = await leaveTournament(session.id, player);
    // pendant les inscriptions, le joueur est retiré : plus de bloc « you »
    const still = await findPlayerByToken(session.id, player.player_token);
    res.json({
      status: 'success',
      data: {
        state: buildTournamentPublicState(committed),
        you: still ? buildTournamentYou(committed, still) : null,
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});

/** Revenir dans le tournoi depuis le même téléphone */
tournamentPublicRoutes.post('/:idOrCode/rejoin', async (req, res) => {
  try {
    const session = ensureTournament(await loadSession(req.params.idOrCode));
    const player = await findPlayerByToken(session.id, (req.body as { playerToken?: string }).playerToken);
    if (!player) {
      res.status(401).json({ status: 'error', message: 'error_unknown_player' });
      return;
    }
    const committed = await rejoinTournament(session.id, player);
    res.json({
      status: 'success',
      data: {
        state: buildTournamentPublicState(committed),
        you: buildTournamentYou(committed, player),
      },
    });
  } catch (err) {
    httpError(res, err);
  }
});
