/**
 * Detection live du nombre de manettes USB/BT branchees au PC.
 *
 * Utilise la Gamepad API du navigateur (supportee par Chromium/Edge/Firefox
 * depuis longtemps). Couple les events `gamepadconnected` /
 * `gamepaddisconnected` a un polling court (1.5s) car certains navigateurs
 * ne firent les events qu'au premier appui sur un bouton.
 *
 * Retourne juste un compteur (filtre les slots null et les manettes
 * disconnected).
 */

import { useEffect, useState } from 'react';

export function useGamepadCount(enabled = true): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    function update() {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const connected = pads.filter((p) => p !== null && p.connected).length;
      setCount(connected);
    }

    update();
    window.addEventListener('gamepadconnected', update);
    window.addEventListener('gamepaddisconnected', update);
    const interval = window.setInterval(update, 1500);

    return () => {
      window.removeEventListener('gamepadconnected', update);
      window.removeEventListener('gamepaddisconnected', update);
      window.clearInterval(interval);
    };
  }, [enabled]);

  return count;
}
