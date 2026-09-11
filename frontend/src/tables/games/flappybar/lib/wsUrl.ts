/**
 * URL du WebSocket de manche (/ws/flappybar), dérivée de l'URL du backend :
 * même hôte que l'API REST, schéma http(s) -> ws(s). Le jeton n'est envoyé
 * qu'en query string de l'upgrade (jamais loggé côté serveur).
 */

import { BACKEND_URL } from '../../../lib/tablesApi';

export function flapWsUrl(sessionId: string, playerToken?: string | null): string {
  const base = BACKEND_URL.replace(/\/$/, '').replace(/^http/i, 'ws');
  const params = new URLSearchParams({ session: sessionId });
  if (playerToken) params.set('token', playerToken);
  return `${base}/ws/flappybar?${params.toString()}`;
}
