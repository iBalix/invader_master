/**
 * Cycle de vie du jeu Phaser dans un hôte React : création asynchrone (le
 * moteur arrive dans son propre chunk), destruction au démontage, et un seul
 * jeu vivant malgré le double montage de React.StrictMode (le premier
 * `createFlapGame` résout après l'annulation et se détruit aussitôt).
 */

import { useEffect, useState, type RefObject } from 'react';
import type { FlapBridge } from '../phaser/bridge';
import { createFlapGame, type FlapGame } from '../phaser/createFlapGame';

export function usePhaserGame(hostRef: RefObject<HTMLElement>, bridge: FlapBridge, themeId: string): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let game: FlapGame | null = null;
    setReady(false);
    const off = bridge.fromScene.on('ready', () => {
      if (!cancelled) setReady(true);
    });
    // Le gestionnaire d'échelle de Phaser ne réagit qu'au resize de la fenêtre :
    // si l'hôte n'a pas encore sa taille au boot (premier layout, volet
    // masqué), le canvas resterait en 0x0. On l'observe directement.
    const observer = new ResizeObserver(() => {
      if (!cancelled && game) game.scale.refresh();
    });
    observer.observe(host);
    // Création différée d'un tick : en React.StrictMode le premier passage de
    // l'effet est annulé synchroniquement, on n'instancie donc jamais un jeu
    // pour rien (un Phaser.Game détruit avant son boot laissait un canvas orphelin).
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      createFlapGame(host, bridge)
        .then((created) => {
          if (cancelled) {
            created.destroy(true);
            return;
          }
          game = created;
          // la taille de l'hôte n'est connue qu'après le premier layout
          requestAnimationFrame(() => {
            if (!cancelled) created.scale.refresh();
          });
        })
        .catch((err) => {
          console.error('[flappybar] moteur de rendu indisponible', err);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
      off();
      if (game) {
        game.destroy(true);
        game = null;
      }
    };
  }, [hostRef, bridge, themeId]);

  return { ready };
}
