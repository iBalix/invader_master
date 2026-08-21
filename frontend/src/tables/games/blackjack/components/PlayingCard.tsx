/**
 * Carte jouée : distribution depuis le sabot (trajet mesuré au montage via
 * le registre d'ancres) + retournement 3D quand la face se révèle.
 *
 * La mesure se fait AVANT de poser la classe d'animation : le keyframe 0 %
 * translate la carte vers le sabot, donc mesurer avec la classe déjà posée
 * fausserait le trajet. Deux temps : montage invisible sans classe, mesure
 * au layout effect, puis pose des variables et de la classe.
 *
 * La grammaire de mouvement vient du thème (trail / slide / step). En mode
 * réduit, la distribution devient un fondu court mais le retournement reste.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import CardGlyph from '../themes/CardGlyph';
import type { Card } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { AnchorRegistry } from '../lib/anchors';

interface Props {
  card: Card;
  theme: BjTheme;
  width: number;
  /** face cachée tant que true ; le passage à false déclenche le flip */
  facedown?: boolean;
  /** cascade de distribution (ms) ; 0 = tout de suite */
  dealDelayMs?: number;
  /** false = pas d'animation d'arrivée (premier rendu d'un spectateur) */
  animate?: boolean;
  anchors?: AnchorRegistry;
  reduced?: boolean;
}

const DEAL_CLASS: Record<BjTheme['dealFx'], string> = {
  trail: 'bj-deal-trail',
  slide: 'bj-deal-slide',
  step: 'bj-deal-step',
};

export default function PlayingCard({
  card,
  theme,
  width,
  facedown = false,
  dealDelayMs = 0,
  animate = true,
  anchors,
  reduced = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // l'animation d'arrivée est figée au montage : une carte déjà posée ne
  // rejoue jamais son trajet quand l'état se rafraîchit
  const [entrance] = useState(() => animate);
  const [delay] = useState(() => dealDelayMs);
  const [dealClass, setDealClass] = useState('');

  useLayoutEffect(() => {
    if (!entrance || !ref.current) return;
    const el = ref.current;
    const shoe = anchors?.current['shoe'];
    if (shoe) {
      // aucune classe d'animation posée à cet instant : la carte est à sa
      // position naturelle, le trajet mesuré est le vrai sabot -> siège
      const from = shoe.getBoundingClientRect();
      const to = el.getBoundingClientRect();
      el.style.setProperty('--dx', `${from.left + from.width / 2 - (to.left + to.width / 2)}px`);
      el.style.setProperty('--dy', `${from.top + from.height / 2 - (to.top + to.height / 2)}px`);
    } else {
      el.style.setProperty('--dx', '0px');
      el.style.setProperty('--dy', '-40px');
    }
    setDealClass(DEAL_CLASS[theme.dealFx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glow = reduced ? undefined : theme.cardGlow;
  const height = Math.round(width * 1.4);
  // invisible tant que le trajet n'est pas mesuré (une frame au montage)
  const waiting = entrance && dealClass === '';

  return (
    <div
      ref={ref}
      className={`bj-card ${dealClass}`}
      style={{
        width,
        height,
        opacity: waiting ? 0 : undefined,
        ['--bj-deal-ms' as string]: `${theme.dealMs}ms`,
        ['--bj-deal-delay' as string]: `${delay}ms`,
      }}
    >
      <div className="bj-flip h-full w-full">
        <div
          className="bj-flip-inner"
          data-facedown={facedown}
          style={{ ['--bj-flip-ms' as string]: `${theme.flipMs}ms` }}
        >
          <div className="bj-face" style={glow ? { filter: glow } : undefined}>
            <CardGlyph card={card === '??' ? 'back' : card} theme={theme} width={width} />
          </div>
          <div className="bj-face bj-face-back">
            <CardGlyph card="back" theme={theme} width={width} />
          </div>
        </div>
      </div>
    </div>
  );
}
