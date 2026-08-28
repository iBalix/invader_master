import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Protocole
// ---------------------------------------------------------------------------

interface AgentCommand {
  type: 'execute';
  id: string;
  command: string;
  params: { targetName: string; gameName?: string };
}

/** Scènes lumineuses connues de l'agent (vocabulaire fermé, versionné par cue.v) */
export type SceneName =
  | 'idle'
  | 'lobby'
  | 'pause'
  | 'category'
  | 'question_start'
  | 'question_show'
  | 'question_warn'
  | 'question_end'
  | 'verdict'
  | 'reveal'
  | 'bonus_question'
  | 'milestone'
  | 'round_winner'
  | 'leaderboard_reveal'
  | 'leaderboard_first'
  | 'cinematic_step'
  | 'rewards_step'
  | 'round_intro'
  | 'round_end'
  | 'event_end'
  | 'test_ping';

export interface LightCue {
  v: 1;
  /** monotone par session : l'agent ignore un cue plus ancien que le dernier joué */
  seq: number;
  /**
   * Identifie le process émetteur. `seq` vit en mémoire et repart à zéro à
   * chaque redémarrage du backend, alors que le worker Hue du bar tourne des
   * semaines sans bouger : sans cette époque, il prenait tous les cues d'après
   * un redéploiement pour des retardataires et les ignorait.
   */
  epoch: number;
  scene: SceneName;
  params: {
    durationMs?: number;
    /** OFFSET RELATIF depuis la réception, jamais un timestamp absolu :
     *  l'horloge du PC du bar peut avoir dérivé de plusieurs secondes */
    warnAtMs?: number;
    difficulty?: string;
    milestone?: 20 | 10 | 5 | 3;
    rank?: number;
    round?: number;
    isFinal?: boolean;
  };
}

interface AgentLight {
  type: 'light';
  id: string;
  cue: LightCue;
}

interface AgentResult {
  type: 'result';
  id: string;
  success: boolean;
  output: string;
}

/** Santé du sous-système lumière, poussée périodiquement par l'agent */
export interface LightStatus {
  enabled: boolean;
  bridgeHealthy: boolean;
  lastCue: string | null;
  /** âge en ms, relatif (jamais un timestamp : horloges non synchronisées) */
  lastCueAgeMs: number | null;
  sent60s: number;
  errors60s: number;
  dropped60s: number;
  queueDepth: number;
  workerAlive: boolean;
  dryRun: boolean;
  /**
   * Relances du worker Hue depuis le demarrage de l'agent. Un compteur qui
   * grimpe pendant une soiree signale un bridge qui rame : c'est le symptome
   * qui precede la saturation, autant le voir.
   */
  restarts: number;
}

type PendingResolve = (result: AgentResult) => void;

let agentSocket: WebSocket | null = null;
const pendingCommands = new Map<string, { resolve: PendingResolve; timer: ReturnType<typeof setTimeout> }>();

const COMMAND_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PING_STATUS_INTERVAL_MS = 60_000;
const LIGHT_STATUS_INTERVAL_MS = 10_000;

let lastPingStatus: Record<string, boolean> = {};
let lastLightStatus: LightStatus | null = null;
let agentCapabilities: string[] = [];

export function isAgentConnected(): boolean {
  return agentSocket !== null && agentSocket.readyState === WebSocket.OPEN;
}

export function getPingStatus(): Record<string, boolean> {
  return lastPingStatus;
}

export function getAgentCapabilities(): string[] {
  return agentCapabilities;
}

export function supportsLights(): boolean {
  return isAgentConnected() && agentCapabilities.includes('lights@1');
}

export function getLightStatus(): LightStatus | null {
  return isAgentConnected() ? lastLightStatus : null;
}

export function sendCommand(
  command: string,
  params: { targetName: string; gameName?: string }
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    if (!isAgentConnected()) {
      return reject(new Error('Agent non connecté'));
    }

    const id = randomUUID();
    const msg: AgentCommand = { type: 'execute', id, command, params };

    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error('Timeout: pas de réponse de l\'agent'));
    }, COMMAND_TIMEOUT_MS);

    pendingCommands.set(id, { resolve, timer });
    agentSocket!.send(JSON.stringify(msg));
  });
}

/**
 * Envoi d'un cue lumière. Fire-and-forget par construction : aucune promesse
 * en attente, donc aucun résultat orphelin possible et aucun timeout à armer.
 * Retourne false si l'agent est absent ou trop ancien pour comprendre.
 */
export function sendLightCue(cue: LightCue): boolean {
  if (!supportsLights()) return false;
  try {
    const msg: AgentLight = { type: 'light', id: randomUUID(), cue };
    agentSocket!.send(JSON.stringify(msg));
    return true;
  } catch (err) {
    console.error('[ws] sendLightCue failed:', (err as Error).message);
    return false;
  }
}

export function initAgentBridge(server: Server): void {
  const agentToken = process.env.BAR_AGENT_TOKEN;
  if (!agentToken) {
    console.warn('[ws] BAR_AGENT_TOKEN not set — agent bridge disabled');
    return;
  }

  const wss = new WebSocketServer({ server, path: '/ws/agent' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token !== agentToken) {
      console.warn('[ws] Agent connection rejected — invalid token');
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
      console.warn('[ws] Closing previous agent connection');
      agentSocket.close(4000, 'Replaced by new connection');
    }

    agentSocket = ws;
    agentCapabilities = [];
    lastLightStatus = null;
    console.log('[ws] Bar agent connected');

    // Les timers sont scopés à CETTE connexion (variables locales) : avec des
    // variables de module, une reconnexion écrasait la référence et le timer
    // de la session précédente fuyait à jamais.
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const every = (ms: number, fn: () => void) => {
      timers.push(setInterval(fn, ms));
    };
    const send = (payload: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    every(HEARTBEAT_INTERVAL_MS, () => send({ type: 'ping' }));

    const requestPingStatus = () => send({ type: 'ping_all' });
    requestPingStatus();
    every(PING_STATUS_INTERVAL_MS, requestPingStatus);

    const requestLightStatus = () => {
      if (agentCapabilities.includes('lights@1')) send({ type: 'light_status_request' });
    };
    every(LIGHT_STATUS_INTERVAL_MS, requestLightStatus);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'pong') return;

        if (msg.type === 'hello') {
          agentCapabilities = Array.isArray(msg.capabilities) ? msg.capabilities : [];
          console.log(
            `[ws] Agent hello — version=${msg.agentVersion ?? '?'} capabilities=${agentCapabilities.join(',') || 'none'}`,
          );
          requestLightStatus();
          return;
        }

        if (msg.type === 'ping_status') {
          lastPingStatus = msg.results ?? {};
          return;
        }

        if (msg.type === 'light_status') {
          lastLightStatus = {
            enabled: Boolean(msg.enabled),
            bridgeHealthy: Boolean(msg.bridgeHealthy),
            lastCue: msg.lastCue ?? null,
            lastCueAgeMs: typeof msg.lastCueAgeMs === 'number' ? msg.lastCueAgeMs : null,
            sent60s: Number(msg.sent60s) || 0,
            errors60s: Number(msg.errors60s) || 0,
            dropped60s: Number(msg.dropped60s) || 0,
            queueDepth: Number(msg.queueDepth) || 0,
            workerAlive: Boolean(msg.workerAlive),
            dryRun: Boolean(msg.dryRun),
            restarts: Number(msg.restarts) || 0,
          };
          return;
        }

        if (msg.type === 'result') {
          const pending = pendingCommands.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingCommands.delete(msg.id);
            pending.resolve(msg as AgentResult);
          }
        }
      } catch {
        console.error('[ws] Failed to parse agent message');
      }
    });

    ws.on('close', () => {
      console.log('[ws] Bar agent disconnected');
      for (const t of timers) clearInterval(t);
      timers.length = 0;
      // ne réinitialise l'état global que si cette socket est encore la courante
      // (une connexion remplacée ne doit pas effacer l'état de la nouvelle)
      if (agentSocket === ws) {
        agentSocket = null;
        lastPingStatus = {};
        lastLightStatus = null;
        agentCapabilities = [];
      }
      for (const [id, pending] of pendingCommands) {
        clearTimeout(pending.timer);
        pending.resolve({ type: 'result', id, success: false, output: 'Agent disconnected' });
      }
      pendingCommands.clear();
    });

    ws.on('error', (err) => {
      console.error('[ws] Agent socket error:', err.message);
    });
  });

  console.log('[ws] Agent bridge ready on /ws/agent');
}
