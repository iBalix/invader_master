/**
 * L'écran de la borne : canvas 896x1024 (224x256 x4) dans son tube néon,
 * scanlines et vignettage en CSS. Monte la boucle de jeu (InvRunner) au
 * montage, l'arrête au démontage ; un seul runner vivant malgré le double
 * montage de React.StrictMode (le premier est arrêté aussitôt).
 */

import { useEffect, useRef, type RefObject } from 'react';
import type { InvSfxApi } from '../audio/invSfx';
import type { InvBridge } from '../engine/bridge';
import type { InvControls } from '../engine/controls';
import { CrtView, VIEW_H, VIEW_W } from '../engine/crtView';
import { InvRunner } from '../engine/runner';

interface Props {
  bridge: InvBridge;
  controls: InvControls;
  sfxRef: RefObject<InvSfxApi | null>;
  children?: React.ReactNode;
}

export default function InvScreen({ bridge, controls, sfxRef, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let runner: InvRunner | null = null;
    try {
      runner = new InvRunner(bridge, new CrtView(canvas), controls, () => sfxRef.current);
      runner.start();
    } catch (err) {
      console.error('[barinvaders] écran indisponible', err);
    }
    return () => runner?.stop();
  }, [bridge, controls, sfxRef]);

  return (
    <div className="inv-tube">
      <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} style={{ width: VIEW_W, height: VIEW_H }} />
      <div className="inv-scanlines" />
      {children}
    </div>
  );
}
