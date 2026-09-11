/**
 * Routeur d'upgrade WebSocket : UN seul écouteur 'upgrade' sur le serveur
 * HTTP, qui distribue par chemin vers des WebSocketServer en mode `noServer`.
 *
 * Pourquoi : `new WebSocketServer({ server, path })` (ws 8.x) installe son
 * propre écouteur 'upgrade' et répond 400 (abortHandshake) à toute requête
 * dont le chemin n'est pas le sien. Deux serveurs de ce type sur le même
 * serveur HTTP se sabotent mutuellement : chacun tue les connexions de
 * l'autre. Avec l'agent du comptoir (/ws/agent) et Flappy Bar (/ws/flappybar)
 * sur le même port Railway, il faut donc un aiguillage unique.
 */

import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import type { WebSocketServer } from 'ws';

const routes = new Map<string, WebSocketServer>();
let attachedTo: Server | null = null;

/** enregistre un WebSocketServer({ noServer: true }) pour un chemin exact */
export function registerWsPath(path: string, wss: WebSocketServer): void {
  if (routes.has(path)) {
    throw new Error(`[ws] chemin WebSocket déjà enregistré : ${path}`);
  }
  routes.set(path, wss);
}

export function attachUpgradeRouter(server: Server): void {
  if (attachedTo === server) return;
  if (attachedTo) throw new Error('[ws] le routeur d\'upgrade est déjà attaché à un autre serveur');
  attachedTo = server;

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://x').pathname;
    } catch {
      socket.destroy();
      return;
    }
    const wss = routes.get(pathname);
    if (!wss) {
      // réponse HTTP minimale avant de couper : un client mal configuré voit
      // un 404 net plutôt qu'une connexion qui meurt sans explication
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
}
