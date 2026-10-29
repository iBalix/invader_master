/**
 * Vitrine du lobby : comme le mode attract de la borne, une partie jouée par
 * l'autopilote tourne en boucle sur un petit écran (224x256 x2), sans son.
 * Une nouvelle partie repart 3 s après chaque GAME OVER.
 */

import { useEffect, useRef } from 'react';
import { createSim, stepSim, type InvSimState } from '../sim/invSim';
import { AutoPilot, PILOT_SKILLS } from '../engine/autopilot';
import { CrtView } from '../engine/crtView';
import { paintScreen } from '../engine/screen';

interface Props {
  hiScore: number;
  reduced: boolean;
}

const SCALE = 2;
const RESTART_MS = 3000;

export default function AttractScreen({ hiScore, reduced }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiRef = useRef(hiScore);
  hiRef.current = hiScore;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let view: CrtView;
    try {
      view = new CrtView(canvas, SCALE);
    } catch {
      return undefined;
    }
    view.setReduced(reduced);
    let game = 1;
    let sim: InvSimState = createSim();
    let pilot = new AutoPilot(game * 31 + 7, PILOT_SKILLS[2]);
    let overAt = 0;
    let raf = 0;
    const loop = (now: number) => {
      if (!sim.over) {
        stepSim(sim, pilot.maskFor(sim));
        if (sim.over) overAt = now;
      } else if (now - overAt > RESTART_MS) {
        game += 1;
        sim = createSim();
        pilot = new AutoPilot(game * 31 + 7, PILOT_SKILLS[game % 3]);
      }
      paintScreen(view.pixels, sim, {
        hiScore: hiRef.current,
        label: 'DEMO',
        banner: sim.over ? { text: 'GAME OVER', x: 72, y: 56, chars: Math.floor((now - overAt) / 117) } : null,
      });
      view.present();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="inv-tube">
      <canvas ref={canvasRef} style={{ width: 224 * SCALE, height: 256 * SCALE }} />
      <div className="inv-scanlines" />
    </div>
  );
}
