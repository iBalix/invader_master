import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { randomUUID } from 'crypto';

interface AgentCommand {
  type: 'execute';
  id: string;
  command: string;
  params: { targetName: string; gameName?: string };
}

interface AgentResult {
  type: 'result';
  id: string;
  success: boolean;
  output: string;
}

type PendingResolve = (result: AgentResult) => void;

let agentSocket: WebSocket | null = null;
const pendingCommands = new Map<string, { resolve: PendingResolve; timer: ReturnType<typeof setTimeout> }>();

const COMMAND_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function isAgentConnected(): boolean {
  return agentSocket !== null && agentSocket.readyState === WebSocket.OPEN;
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
    console.log('[ws] Bar agent connected');

    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'pong') return;

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
      if (agentSocket === ws) agentSocket = null;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
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
