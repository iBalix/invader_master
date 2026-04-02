import WebSocket from 'ws';
import { WS_URL, AGENT_TOKEN } from './config.js';
import { executeCommand } from './executor.js';

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

let ws: WebSocket | null = null;
let reconnectDelay = MIN_RECONNECT_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  const url = `${WS_URL}?token=${AGENT_TOKEN}`;
  console.log(`[ws] Connecting to ${WS_URL}...`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[ws] Connected');
    reconnectDelay = MIN_RECONNECT_MS;
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'ping') {
        ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'execute') {
        const { id, command, params } = msg;
        console.log(`[ws] Received command: ${command} for ${params.targetName}`);
        const result = await executeCommand(command, params);
        ws?.send(JSON.stringify({ type: 'result', id, ...result }));
      }
    } catch (err) {
      console.error('[ws] Message parse error:', err);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[ws] Disconnected (code=${code}, reason=${reason.toString()})`);
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[ws] Error:', err.message);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  console.log(`[ws] Reconnecting in ${reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
    connect();
  }, reconnectDelay);
}

export function startAgent(): void {
  connect();
}
