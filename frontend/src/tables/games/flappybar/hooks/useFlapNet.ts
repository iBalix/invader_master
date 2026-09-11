/**
 * Flux de manche de Flappy Bar : WebSocket /ws/flappybar branché sur le pont
 * React/Phaser.
 *
 *   - la scène émet `flap(frame)` => on envoie { t:'flap', f } (mis en file si
 *     la socket n'est pas ouverte) ;
 *   - le serveur relaie les flaps des autres => `remoteFlap`, leurs morts
 *     confirmées => `remoteDead`, l'état complet à la connexion => `remoteHello`.
 *
 * Best-effort : si la socket tombe, la partie locale continue (la mort est
 * déclarée en REST), seuls les fantômes se figent jusqu'à la reconnexion, où
 * le `hello` les reconstruit. Reprise 0,5 s -> 8 s avec un peu de jitter.
 */

import { useEffect, useRef, useState } from 'react';
import type { FlapBridge } from '../phaser/bridge';
import type { FlapWsClientMessage, FlapWsServerMessage } from '../lib/flapTypes';
import { flapWsUrl } from '../lib/wsUrl';

export type FlapNetStatus = 'closed' | 'connecting' | 'open';

export interface UseFlapNetOptions {
  sessionId: string | null;
  playerToken: string | null;
  /** ouvrir la socket (manche en cours ou imminente) */
  enabled: boolean;
  bridge: FlapBridge | null;
}

export interface UseFlapNetResult {
  status: FlapNetStatus;
  reconnects: number;
}

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000];
const CLOSE_GRACE_MS = 2_000;
const QUEUE_CAP = 64;

export function useFlapNet({ sessionId, playerToken, enabled, bridge }: UseFlapNetOptions): UseFlapNetResult {
  const [status, setStatus] = useState<FlapNetStatus>('closed');
  const [reconnects, setReconnects] = useState(0);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId || !bridge) return undefined;

    let alive = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let closeTimer: number | undefined;
    const queue: FlapWsClientMessage[] = [];

    const send = (msg: FlapWsClientMessage) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
        return;
      }
      if (queue.length >= QUEUE_CAP) queue.shift();
      queue.push(msg);
    };

    const offFlap = bridge.fromScene.on('flap', (frame) => send({ t: 'flap', f: frame }));

    const handle = (raw: string) => {
      let msg: FlapWsServerMessage;
      try {
        msg = JSON.parse(raw) as FlapWsServerMessage;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'hello':
          bridge.toScene.emit('remoteHello', msg.players ?? {}, msg.dead ?? {});
          break;
        case 'flap':
          bridge.toScene.emit('remoteFlap', msg.p, msg.f);
          break;
        case 'dead':
          bridge.toScene.emit('remoteDead', msg.p, msg.f);
          break;
        case 'left':
          bridge.toScene.emit('remoteLeft', msg.p);
          break;
        case 'bye':
          // la session est terminée côté serveur : on ne se reconnecte pas
          alive = false;
          socket?.close();
          break;
        default:
          // joined / round / end : la vérité de session vient du REST
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
        ws = new WebSocket(flapWsUrl(sessionId, playerToken));
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
      if (socket && socket.readyState === WebSocket.OPEN) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      attemptRef.current = 0;
      connect();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('online', revive);

    connect();

    return () => {
      alive = false;
      offFlap();
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('online', revive);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const closing = socket;
      socket = null;
      if (closing) {
        // on laisse partir les derniers flaps avant de fermer
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
