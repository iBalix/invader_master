/**
 * Diffusion temps réel via Supabase Realtime (broadcast REST).
 *
 * Le backend n'ouvre pas de websocket : il POSTe sur l'endpoint broadcast.
 * Les événements sont des SIGNAUX, jamais la source de vérité : chaque payload
 * transporte state_version et les clients refont un GET state s'ils détectent
 * un trou (protocole auto-réparant).
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function gameTopic(sessionId: string): string {
  return `game:${sessionId}`;
}

export async function broadcast(
  sessionId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: gameTopic(sessionId),
            event,
            payload,
            private: false,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[realtime] broadcast failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    // Le temps réel est best-effort : le polling de secours des clients rattrape.
    console.error('[realtime] broadcast error', err);
  }
}
