/**
 * Compte à rebours de départ de manche, calé sur l'horloge serveur : chiffres
 * de 5 à 1 puis « GO » pendant 700 ms. Un tick sonore par chiffre, un « go »
 * au départ (sons locaux uniquement).
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { serverNow } from '../../../lib/clockSync';
import type { InvSfxApi } from '../audio/invSfx';

interface Props {
  startsAt: number;
  goLabel: string;
  accent: string;
  sfxRef: RefObject<InvSfxApi | null>;
}

type Shown = number | 'go' | null;

const GO_MS = 700;
const MAX_DIGIT = 5;

function compute(startsAt: number): Shown {
  const remaining = startsAt - serverNow();
  if (remaining > 0) {
    const digit = Math.ceil(remaining / 1000);
    return digit <= MAX_DIGIT ? digit : null;
  }
  return remaining > -GO_MS ? 'go' : null;
}

export default function Countdown({ startsAt, goLabel, accent, sfxRef }: Props) {
  const [shown, setShown] = useState<Shown>(() => compute(startsAt));
  // même valeur de départ que l'affichage : un départ déjà passé au montage
  // (onglet en veille, reprise) doit effacer le chiffre, pas le figer
  const lastRef = useRef<Shown>(shown);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const value = compute(startsAt);
      if (value !== lastRef.current) {
        lastRef.current = value;
        setShown(value);
        if (value === 'go') sfxRef.current?.play('go');
        else if (typeof value === 'number') sfxRef.current?.play('tick');
      }
      // une fois le GO passé, plus rien à faire jusqu'à la prochaine manche
      if (value === null && serverNow() > startsAt) return;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [startsAt, sfxRef]);

  if (shown === null) return null;
  const go = shown === 'go';
  return (
    // sous le « PLAY PLAYER<1> » écrit dans l'écran par la boucle
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-[300px]">
      <div
        key={String(shown)}
        className="inv-count-pop font-retro leading-none"
        style={{
          fontSize: go ? 130 : 170,
          color: go ? accent : '#ffffff',
          textShadow: `0 0 18px ${go ? accent : '#ffffff'}, 0 6px 0 rgba(0,0,0,0.6)`,
        }}
      >
        {go ? goLabel : shown}
      </div>
    </div>
  );
}
