/**
 * Diffusion temps réel via Supabase Realtime (broadcast REST).
 *
 * Le backend n'ouvre pas de websocket : il POSTe sur l'endpoint broadcast.
 * Les événements sont des SIGNAUX, jamais la source de vérité : chaque client
 * sait se rattraper tout seul s'il en rate un (protocole auto-réparant :
 * state_version côté moteur de jeu, sondage de l'ordre côté tables).
 *
 * Sert aussi bien au moteur de jeu (topic `game:<session>`) qu'aux tables
 * tactiles (topic `table:<TABLExx>` et `tables`). C'est ce qui a permis de
 * supprimer Pusher : un fournisseur en moins, et des identifiants qu'on
 * maîtrise, alors que ceux de Pusher étaient partagés avec l'ancien site PHP.
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
  return broadcastTopic(gameTopic(sessionId), event, payload);
}

/**
 * Diffusion sur un topic arbitraire. Best-effort et jamais attendu par un
 * appelant critique : si Supabase est injoignable, les clients se rattrapent
 * à leur prochain sondage.
 */
export async function broadcastTopic(
  topic: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const send = async (): Promise<boolean> => {
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
            topic,
            event,
            payload,
            private: false,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[realtime] broadcast failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  };
  // un événement perdu coûte jusqu'à un cycle de sondage complet aux clients :
  // un hoquet réseau vaut donc UNE nouvelle tentative rapide avant d'abandonner
  try {
    if (await send()) return;
  } catch (err) {
    console.error('[realtime] broadcast error', err);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    await send();
  } catch (err) {
    // Le temps réel reste best-effort : le polling de secours des clients rattrape.
    console.error('[realtime] broadcast retry error', err);
  }
}
