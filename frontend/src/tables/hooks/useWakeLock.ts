/**
 * Empêche l'écran de la dalle de se mettre en veille tant que `active` est
 * vrai (Screen Wake Lock API). Utilisé pendant les parties plein écran :
 * une dalle qui s'éteint en pleine manche fige le navigateur et casse le
 * retour de partie. Le verrou est automatiquement relâché par le navigateur
 * quand l'onglet devient invisible : on le redemande au retour de
 * visibilité. Sans support de l'API, ne fait rien.
 */

import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;

    let sentinel: WakeLockSentinel | null = null;
    let alive = true;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (!alive && sentinel) void sentinel.release().catch(() => undefined);
      } catch {
        /* refus (batterie, permissions) : la veille OS reprend ses droits */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
