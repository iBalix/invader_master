/**
 * Live event observable.
 *
 * - Initial fetch GET /public/live-event (etat persiste en BDD).
 * - Abonnement Supabase Realtime au topic "tables" :
 *     - "event-start" : { type, label, redirect_url } -> on bascule en is_live=true
 *     - "event-end"   :                                    is_live=false
 *
 * Le state expose est utilise par l'ecran d'accueil pour afficher
 * un CTA dynamique (rejoindre l'event en cours / a venir / rien).
 *
 * Un sondage de secours double le temps reel : avant, ce hook faisait UN fetch
 * au montage puis dependait entierement de l'evenement. Une borne allumee qui
 * ratait le "event-start" ne voyait jamais l'event, jusqu'a rechargement.
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { subscribeTopic } from '../lib/realtime';
import type { LiveEventState } from '../types';

const EMPTY: LiveEventState = { is_live: false };

/** un event demarre rarement : 30 s de latence au pire suffisent largement */
const POLL_MS = 30_000;

export function useLiveEvent(): LiveEventState {
  const [state, setState] = useState<LiveEventState>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    publicApi
      .get<LiveEventState>('/live-event')
      .then((res) => {
        if (!cancelled && res.data) setState(res.data);
      })
      .catch(() => {
        /* live event optionnel */
      });

    const stop = subscribeTopic('tables', (e) => {
      const data = e.payload as any;
      if (e.event === 'event-start') {
        setState({
          is_live: true,
          event_type: data?.type ?? data?.event_type ?? null,
          event_label: data?.label ?? data?.event_label ?? null,
          redirect_url: data?.redirect_url ?? null,
          started_at: data?.started_at ?? new Date().toISOString(),
          ended_at: null,
        });
      } else if (e.event === 'event-end') {
        setState((s) => ({ ...s, is_live: false, ended_at: new Date().toISOString() }));
      }
    });

    // Filet : meme si tous les evenements se perdent, la borne se remet a jour.
    const poll = window.setInterval(() => {
      publicApi
        .get<LiveEventState>('/live-event')
        .then((res) => {
          if (!cancelled && res.data) setState(res.data);
        })
        .catch(() => undefined);
    }, POLL_MS);

    return () => {
      cancelled = true;
      stop();
      window.clearInterval(poll);
    };
  }, []);

  return state;
}
