/**
 * Heartbeat periodique vers le backend pour signaler que la table est vivante.
 *
 * - Envoie un POST /public/tables/heartbeat toutes les `intervalMs` ms.
 * - Inclut le hostname courant via l'intercepteur de tablesApi.
 * - Silencieux en cas d'erreur reseau (les tables doivent rester operationnelles offline).
 */

import { useEffect } from 'react';
import { tablesApi } from '../lib/tablesApi';

export function useHeartbeat(intervalMs = 30_000): void {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled) return;
      try {
        await tablesApi.post('/heartbeat', {
          ts: Date.now(),
          path: window.location.pathname,
        });
      } catch {
        /* table doit rester utilisable hors ligne */
      }
    }

    ping();
    const id = window.setInterval(ping, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
