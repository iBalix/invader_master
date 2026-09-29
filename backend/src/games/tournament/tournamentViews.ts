/**
 * Tournoi : vues d'état.
 *
 * Rien de secret dans un tournoi : la vue publique (écrans, téléphones) porte
 * tout le déroulé, rondes comprises, et voyage EN ENTIER dans le signal
 * 'sync' (instantané, comme le blackjack et Flappy Bar). Quarante téléphones
 * n'ont donc pas à relire /state à chaque inscription ou résultat. Le jeton
 * des joueurs, lui, ne sort jamais : l'identifiant de joueur seul ne permet
 * aucune action.
 */

import { gameScore } from './swiss.js';
import { TOURNAMENT_FORMATS, TOURNAMENT_GAMES } from './registry.js';
import {
  tournamentConfigOf,
  tournamentStateOf,
  type TournamentMatch,
  type TournamentState,
} from './types.js';
import type { PlayerRow, SessionRow } from '../types.js';

function ms(value: string | null): number | null {
  return value ? new Date(value).getTime() : null;
}

function publicMatch(m: TournamentMatch): Record<string, unknown> {
  return {
    id: m.id,
    round: m.round,
    board: m.board,
    a: m.a,
    b: m.b,
    kind: m.kind,
    colorA: m.colorA,
    status: m.status,
    result: m.result,
    points: m.points,
    score: gameScore(m),
    // ref + at : le projecteur garde la partie qui vient de finir quelques
    // secondes à l'écran avant d'en montrer une autre
    games: m.games.map((g) => ({
      winner: g.winner,
      source: g.source,
      reason: g.reason,
      colorA: g.colorA,
      ref: g.ref,
      at: ms(g.at),
    })),
    live: m.live,
    gmLocked: m.gmLocked,
    rematch: m.rematch,
    decidedAt: ms(m.decidedAt),
  };
}

export function buildTournamentPublicState(session: SessionRow): Record<string, unknown> {
  const cfg = tournamentConfigOf(session);
  const st: TournamentState = tournamentStateOf(session);
  const players = Object.entries(st.roster)
    .sort((x, y) => x[1].seq - y[1].seq)
    .map(([id, r]) => ({ id, pseudo: r.pseudo, status: r.status, seq: r.seq, joinedAt: ms(r.joinedAt) }));
  const current = st.rounds[st.rounds.length - 1] ?? null;
  return {
    id: session.id,
    joinCode: session.join_code,
    mode: 'tournament',
    status: session.status,
    v: session.state_version,
    serverNow: Date.now(),
    createdAt: ms(session.created_at),
    startedAt: ms(session.started_at),
    phaseStartedAt: ms(session.phase_started_at),
    phaseEndsAt: ms(session.phase_ends_at),
    ended: Boolean(session.ended_at),
    title: cfg.title,
    format: cfg.format,
    formatLabel: TOURNAMENT_FORMATS[cfg.format]?.label ?? cfg.format,
    game: cfg.game,
    gameLabel: TOURNAMENT_GAMES[cfg.game]?.label ?? cfg.game,
    config: {
      registrationMin: cfg.registrationMin,
      lateJoin: cfg.lateJoin,
      plannedRounds: cfg.plannedRounds,
      match: cfg.match,
      points: cfg.points,
      byePolicy: cfg.byePolicy,
      display: cfg.display,
      wifiSsid: cfg.wifiSsid,
      wifiPassword: cfg.wifiPassword,
      texts: cfg.texts,
      testMode: cfg.testMode === true,
    },
    phase: st.phase,
    waitingForPlayers: st.waitingForPlayers,
    players,
    playerCount: players.filter((p) => p.status === 'active').length,
    standings: st.standings,
    rounds: st.rounds.map((r) => ({
      number: r.number,
      startedAt: ms(r.startedAt),
      finishedAt: ms(r.finishedAt),
      waiting: r.waiting,
      byePlayer: r.byePlayer,
      matches: r.matches.map(publicMatch),
    })),
    currentRound: current?.number ?? null,
    feed: st.feed.map((f) => ({ ...f, at: ms(f.at) })),
    pin: st.pin ? { ...st.pin, until: ms(st.pin.until) } : null,
    finishedAt: ms(st.finishedAt),
    closeReason: st.closeReason,
  };
}

/** bloc privé minimal : le reste se lit dans la vue publique par playerId */
export function buildTournamentYou(session: SessionRow, player: PlayerRow): Record<string, unknown> {
  const st = tournamentStateOf(session);
  const entry = st.roster[player.id];
  return {
    playerId: player.id,
    pseudo: entry?.pseudo ?? player.pseudo,
    status: entry?.status ?? 'left',
  };
}

export interface LiveGameInfo {
  status: string;
  /** dernier coup (ou début de partie), epoch ms */
  lastMoveAt: number | null;
  moves: number;
}

/** alertes de la console : ce qui demande une décision de l'animateur */
function gmAlerts(session: SessionRow, liveInfo: Record<string, LiveGameInfo>): string[] {
  const st = tournamentStateOf(session);
  const alerts: string[] = [];
  const pseudo = (id: string | null): string => (id ? st.roster[id]?.pseudo ?? '?' : '?');
  const round = st.rounds[st.rounds.length - 1];
  if (st.phase === 'registration' && st.waitingForPlayers) {
    alerts.push('Compte à rebours écoulé avec moins de 2 inscrits : démarre à la main ou ajoute du temps.');
  }
  if (round && st.phase === 'round') {
    if (round.waiting) {
      const pending = round.matches.some((m) => m.kind === 'normal' && (m.status === 'pending' || m.status === 'playing'));
      alerts.push(
        pending
          ? `${pseudo(round.waiting)} est exempt : il recevra un joueur du premier match terminé.`
          : `${pseudo(round.waiting)} attend un adversaire et plus aucun match ne peut le libérer : attribue un adversaire ou accorde l'exempt.`,
      );
    }
    for (const m of round.matches) {
      if (m.rematch && m.status !== 'done' && m.status !== 'cancelled') {
        alerts.push(`Revanche imposée faute d'autre solution : ${pseudo(m.a)} contre ${pseudo(m.b)}.`);
      }
      const info = m.live ? liveInfo[m.live.ref] : undefined;
      if (info?.lastMoveAt && Date.now() - info.lastMoveAt > 10 * 60_000) {
        const min = Math.round((Date.now() - info.lastMoveAt) / 60_000);
        alerts.push(`Partie figée : ${pseudo(m.a)} contre ${pseudo(m.b)}, dernier coup il y a ${min} min.`);
      }
    }
  }
  return alerts;
}

export function buildTournamentGmState(
  session: SessionRow,
  liveInfo: Record<string, LiveGameInfo> = {},
): Record<string, unknown> {
  const st = tournamentStateOf(session);
  return {
    ...buildTournamentPublicState(session),
    gm: {
      roster: Object.entries(st.roster).map(([id, r]) => ({
        id,
        pseudo: r.pseudo,
        status: r.status,
        device: r.device,
        gmAdded: r.gmAdded === true,
        joinedAt: ms(r.joinedAt),
      })),
      adjustments: st.adjustments,
      ignored: st.ignored,
      countedGames: st.countedRefs.length,
      liveInfo,
      alerts: gmAlerts(session, liveInfo),
      lastMutationAt: ms(st.lastMutationAt),
      templateId: tournamentConfigOf(session).templateId,
    },
  };
}
