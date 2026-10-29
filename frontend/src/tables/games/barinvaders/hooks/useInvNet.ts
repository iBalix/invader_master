/**
 * Flux de manche de Bar Invaders : WebSocket /ws/barinvaders branché sur le
 * pont React/boucle (modèle de useFlapNet).
 *
 *   - la boucle émet `input(frame, masque)` et `mark(frame)` => { t:'in' } et
 *     { t:'hb' } ;
 *   - le serveur relaie les entrées et filigranes des autres => `remoteInput`,
 *     `remoteMark`, leurs scores officiels => `remoteDead`, l'état complet à
 *     la connexion => `remoteHello`, le départ d'une manche => `remoteRound`.
 *
 * Contrairement aux flaps de Flappy, une entrée perdue désynchroniserait la
 * partie rejouée : les entrées ne sont JAMAIS jetées de la file d'attente
 * (seul le dernier filigrane compte, il remplace le précédent). Si la socket
 * tombe, la partie locale continue ; à la reconnexion la file part d'un bloc
 * et le `hello` reconstruit les adversaires. Reprise 0,5 s -> 8 s.
 */

import { useEffect, useRef, useState } from 'react';
import type { InvBridge } from '../engine/bridge';
import type { InvWsClientMsg, InvWsRound, InvWsServerMsg } from '../lib/invTypes';
import { invWsUrl } from '../lib/wsUrl';

export type InvNetStatus = 'closed' | 'connecting' | 'open';

export interface UseInvNetOptions {
  sessionId: string | null;
  playerToken: string | null;
  /** ouvrir la socket (manche en cours ou imminente) */
  enabled: boolean;
  bridge: InvBridge | null;
}

export interface UseInvNetResult {
  status: InvNetStatus;
  reconnects: number;
}

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000];
const CLOSE_GRACE_MS = 2_000;
/** 20 min de partie à 30 changements/s, très au-delà d'un usage réel */
const INPUT_QUEUE_CAP = 40_000;

export function useInvNet({ sessionId, playerToken, enabled, bridge }: UseInvNetOptions): UseInvNetResult {
  const [status, setStatus] = useState<InvNetStatus>('closed');
  const [reconnects, setReconnects] = useState(0);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId || !bridge) return undefined;

    let alive = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let closeTimer: number | undefined;
    const queue: InvWsClientMsg[] = [];
    let pendingMark: number | null = null;

    const open = () => socket !== null && socket.readyState === WebSocket.OPEN;
    const send = (msg: InvWsClientMsg) => {
      if (open()) {
        socket?.send(JSON.stringify(msg));
        return;
      }
      if (msg.t === 'hb') {
        pendingMark = msg.f;
        return;
      }
      if (queue.length < INPUT_QUEUE_CAP) queue.push(msg);
    };

    // la manche annoncée par le WebSocket peut précéder le snapshot de session
    const adoptRound = (round: InvWsRound | null) => {
      if (!round) return;
      const current = bridge.store.getState().round;
      if (current && current.index >= round.index) return;
      bridge.store.setState({
        round: { index: round.index, startsAt: round.startsAt, capAt: round.capAt, participants: round.participants },
      });
    };

    const offs = [
      bridge.fromRunner.on('input', (frame, mask) => send({ t: 'in', f: frame, m: mask })),
      bridge.fromRunner.on('mark', (frame) => send({ t: 'hb', f: frame })),
    ];

    const handle = (raw: string) => {
      let msg: InvWsServerMsg;
      try {
        msg = JSON.parse(raw) as InvWsServerMsg;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'hello':
          adoptRound(msg.round);
          bridge.toRunner.emit('remoteHello', msg.round ? msg.round.index : null, msg.inputs ?? {}, msg.marks ?? {}, msg.dead ?? {});
          break;
        case 'round':
          adoptRound(msg.round);
          bridge.toRunner.emit('remoteRound', msg.round.index);
          break;
        case 'in':
          bridge.toRunner.emit('remoteInput', msg.p, msg.f, msg.m);
          break;
        case 'hb':
          bridge.toRunner.emit('remoteMark', msg.p, msg.f);
          break;
        case 'dead':
          bridge.toRunner.emit('remoteDead', msg.p, msg.frame, msg.score);
          break;
        case 'bye':
          // la session est terminée côté serveur : on ne se reconnecte pas
          alive = false;
          socket?.close();
          break;
        default:
          // joined / left / ended : la vérité de session vient du REST
          break;
      }
    };

    const scheduleRetry = () => {
      if (!alive) return;
      const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)] + Math.random() * 300;
      attemptRef.current += 1;
      retryTimer = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (!alive) return;
      setStatus('connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(invWsUrl(sessionId, playerToken));
      } catch {
        scheduleRetry();
        return;
      }
      socket = ws;
      ws.onopen = () => {
        if (!alive || socket !== ws) return;
        if (attemptRef.current > 0) setReconnects((n) => n + 1);
        attemptRef.current = 0;
        setStatus('open');
        while (queue.length > 0) {
          const msg = queue.shift();
          if (msg) ws.send(JSON.stringify(msg));
        }
        if (pendingMark !== null) {
          ws.send(JSON.stringify({ t: 'hb', f: pendingMark }));
          pendingMark = null;
        }
      };
      ws.onmessage = (ev) => {
        if (socket !== ws) return;
        if (typeof ev.data === 'string') handle(ev.data);
      };
      ws.onerror = () => {
        /* onclose suit toujours : c'est là qu'on reprogramme */
      };
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        setStatus('closed');
        scheduleRetry();
      };
    };

    const revive = () => {
      if (!alive) return;
      if (document.visibilityState !== 'visible') return;
      if (open()) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      attemptRef.current = 0;
      connect();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('online', revive);

    connect();

    return () => {
      alive = false;
      for (const off of offs) off();
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('online', revive);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const closing = socket;
      socket = null;
      if (closing) {
        // on laisse partir les dernières entrées avant de fermer
        closeTimer = window.setTimeout(() => closing.close(), CLOSE_GRACE_MS);
        closing.onclose = () => {
          if (closeTimer !== undefined) window.clearTimeout(closeTimer);
        };
      }
      setStatus('closed');
    };
  }, [enabled, sessionId, playerToken, bridge]);

  return { status, reconnects };
}
