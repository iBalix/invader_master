/**
 * Abonnement temps réel qui se répare tout seul.
 *
 * Le wifi d'un bar coupe. Quand ça arrive, un canal Supabase peut rester
 * ouvert côté client mais ne plus rien recevoir : la dalle ne voit alors plus
 * les créations de parties ni les coups adverses, et l'utilisateur croit
 * l'application figée jusqu'à ce qu'il recharge. On surveille donc l'état de
 * l'abonnement pour le recréer, et on le recrée aussi au retour du réseau ou
 * de la veille.
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeTopic, type TableEvent } from '../lib/realtime';

const RETRY_DELAY_MS = 3_000;

export function useRealtimeTopic(topic: string | null, onEvent: (e: TableEvent) => void): void {
  // le callback change à chaque render : on le garde dans une ref pour ne pas
  // recréer l'abonnement à chaque fois
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (!topic) return undefined;
    let alive = true;
    let retry: number | undefined;

    const unsubscribe = subscribeTopic(
      topic,
      (e) => onEventRef.current(e),
      (status) => {
        if (!alive) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (retry !== undefined) return;
          retry = window.setTimeout(() => {
            if (alive) setEpoch((n) => n + 1);
          }, RETRY_DELAY_MS);
        }
      },
    );

    const revive = () => {
      if (document.visibilityState === 'visible') setEpoch((n) => n + 1);
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('online', revive);

    return () => {
      alive = false;
      if (retry !== undefined) window.clearTimeout(retry);
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('online', revive);
      unsubscribe();
    };
  }, [topic, epoch]);
}
