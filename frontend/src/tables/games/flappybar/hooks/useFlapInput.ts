/**
 * Entrées du joueur local : n'importe quel tap sur la page (hors éléments
 * marqués data-flap-ui) et la barre d'espace deviennent `localFlap` sur le
 * pont. Le premier pointerdown débloque aussi l'audio. La manette est sondée
 * dans la scène (gamepadFlap).
 */

import { useCallback, useEffect, type PointerEvent, type RefObject } from 'react';
import type { FlapSfx } from '../audio/flapSfx';
import type { FlapBridge } from '../phaser/bridge';

export function useFlapInput(
  bridge: FlapBridge,
  sfxRef: RefObject<FlapSfx | null>,
): { onPointerDownCapture: (e: PointerEvent<HTMLElement>) => void } {
  const onPointerDownCapture = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      sfxRef.current?.unlock();
      const target = e.target as Element | null;
      if (target && typeof target.closest === 'function' && target.closest('[data-flap-ui]')) return;
      bridge.toScene.emit('localFlap');
    },
    [bridge, sfxRef],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      sfxRef.current?.unlock();
      bridge.toScene.emit('localFlap');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bridge, sfxRef]);

  return { onPointerDownCapture };
}
