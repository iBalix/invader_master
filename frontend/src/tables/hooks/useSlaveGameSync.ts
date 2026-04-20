/**
 * Hook ecoute (cote slave) sur le channel Pusher de SA propre table.
 *
 * Quand le master lance un jeu :
 *   -> on bascule sur /table/in-game (overlay "jeu en cours")
 * Quand le master termine :
 *   -> on revient a /table/home
 *
 * On evite les boucles de navigation : si l'utilisateur navigue lui-meme
 * sur le slave (carte/jeux) pendant qu'un jeu tourne, on respecte sa
 * navigation jusqu'a la prochaine fin de jeu.
 *
 * Le master n'ecoute pas son propre channel ici (pour ne pas se basculer
 * lui-meme en in-game alors qu'il vient de cliquer "Lancer").
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeChannel, unsubscribeChannel } from '../lib/pusher';
import { useHostname } from './useHostname';

export interface IncomingGame {
  game?: { id: string; name: string };
  startedAt?: string;
  from?: string;
}

export function useSlaveGameSync(onStart?: (g: IncomingGame) => void) {
  const identity = useHostname();
  const navigate = useNavigate();

  useEffect(() => {
    if (!identity || identity.role !== 'slave') return;

    const channel = subscribeChannel(identity.hostname);
    if (!channel) return;

    channel.bind('start-game', (data: IncomingGame) => {
      try {
        sessionStorage.setItem('invaderInGame', JSON.stringify(data ?? {}));
      } catch {
        /* ignore */
      }
      onStart?.(data);
      navigate('/table/in-game', { replace: true });
    });

    channel.bind('end-game', () => {
      try {
        sessionStorage.removeItem('invaderInGame');
      } catch {
        /* ignore */
      }
      navigate('/table/home', { replace: true });
    });

    return () => {
      unsubscribeChannel(identity.hostname);
    };
  }, [identity, navigate, onStart]);
}
