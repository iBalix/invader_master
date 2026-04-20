/**
 * Detecte l'inactivite de l'utilisateur sur une table tactile.
 *
 * Apres `timeoutMs` sans interaction (touch / click / pointermove / keydown),
 * appelle `onIdle` (typiquement : navigation vers /table/screensaver).
 *
 * Le timer est remis a zero a chaque interaction, et au montage.
 * Il peut etre desactive temporairement (ex: pendant un jeu) via `enabled=false`.
 */

import { useEffect, useRef } from 'react';

interface Options {
  timeoutMs: number;
  enabled?: boolean;
  onIdle: () => void;
}

const EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'pointermove',
  'touchstart',
  'keydown',
  'wheel',
];

export function useInactivity({ timeoutMs, enabled = true, onIdle }: Options): void {
  const timerRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    };

    EVENTS.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    reset();

    return () => {
      EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [timeoutMs, enabled]);
}
