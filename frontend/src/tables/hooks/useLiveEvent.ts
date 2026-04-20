/**
 * Live event observable.
 *
 * - Initial fetch GET /public/live-event (etat persiste en BDD).
 * - Subscribe Pusher channel "TABLES" :
 *     - "event-start" : { type, label, redirect_url } -> on bascule en is_live=true
 *     - "event-end"   :                                    is_live=false
 *
 * Le state expose est utilise par l'ecran d'accueil pour afficher
 * un CTA dynamique (rejoindre l'event en cours / a venir / rien).
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { subscribeChannel, unsubscribeChannel } from '../lib/pusher';
import type { LiveEventState } from '../types';

const EMPTY: LiveEventState = { is_live: false };

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

    const channel = subscribeChannel('TABLES');
    if (channel) {
      channel.bind('event-start', (data: any) => {
        setState({
          is_live: true,
          event_type: data?.type ?? data?.event_type ?? null,
          event_label: data?.label ?? data?.event_label ?? null,
          redirect_url: data?.redirect_url ?? null,
          started_at: data?.started_at ?? new Date().toISOString(),
          ended_at: null,
        });
      });
      channel.bind('event-end', () => {
        setState((s) => ({ ...s, is_live: false, ended_at: new Date().toISOString() }));
      });
    }

    return () => {
      cancelled = true;
      unsubscribeChannel('TABLES');
    };
  }, []);

  return state;
}
