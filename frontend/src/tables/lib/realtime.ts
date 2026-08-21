/**
 * Temps reel des tables tactiles, via Supabase Realtime.
 *
 * Remplace Pusher, qui a ete supprime du projet : un prestataire en moins, et
 * surtout des identifiants qu'on maitrise, alors que ceux de Pusher etaient
 * partages avec l'ancien site PHP invader_table.
 *
 * Deux topics :
 *   - "table:TABLExx" : les deux dalles d'une meme table (ordre de lancement,
 *     demande de rechargement depuis le back-office)
 *   - "tables"        : tout le bar (demarrage / fin d'un event live)
 *
 * Un evenement ne transporte AUCUNE donnee metier : il dit seulement "il s'est
 * passe quelque chose, va relire". C'est ce qui rend le systeme insensible a
 * une perte d'evenement, et ce qui a permis de changer de fournisseur sans
 * toucher a un seul composant.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let warned = false;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn('[tables] VITE_SUPABASE_* absent : temps reel desactive, sondage seul.');
    }
    return null;
  }
  // persistSession false : une borne n'est connectee a aucun compte.
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

export interface TableEvent {
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Ecoute un topic. Retourne la fonction de desabonnement.
 * Si la configuration est absente, ne fait rien : les hooks appelants ont tous
 * un sondage de secours, la borne reste operationnelle.
 */
export type TopicStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

export function subscribeTopic(
  topic: string,
  onEvent: (e: TableEvent) => void,
  /**
   * Etat de l'abonnement. Indispensable en bar : un canal peut mourir apres
   * une coupure wifi et rester muet, sans que rien ne le signale. L'appelant
   * peut alors se reabonner au lieu de dependre de son seul sondage.
   */
  onStatus?: (status: TopicStatus) => void,
): () => void {
  const client = getSupabase();
  if (!client) return () => undefined;
  const channel: RealtimeChannel = client
    .channel(topic)
    .on('broadcast', { event: '*' }, (msg) => {
      onEvent({ event: msg.event, payload: (msg.payload ?? {}) as Record<string, unknown> });
    })
    .subscribe((status) => onStatus?.(status as TopicStatus));
  return () => {
    void client.removeChannel(channel);
  };
}
