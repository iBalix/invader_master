/**
 * Le tapis de jetons d'un joueur : des piles physiques par valeur, comme au
 * casino, avec le montant à côté. Le stock se VOIT, il ne se lit pas
 * seulement. Représentation plafonnée (6 jetons par pile) : l'ordre de
 * grandeur compte, pas l'inventaire exact.
 */

import AnimatedNumber from './AnimatedNumber';
import ChipGlyph from '../themes/ChipGlyph';
import type { BjTheme } from '../themes/types';

interface Props {
  amount: number;
  theme: BjTheme;
  chipSize?: number;
  className?: string;
}

const DENOMS = [100, 25, 10, 5];
const MAX_PER_PILE = 6;

/** décompose le stock en piles [valeur, hauteur] (4 piles max) */
export function buildPiles(amount: number): Array<[number, number]> {
  const piles: Array<[number, number]> = [];
  let rest = amount;
  for (const denom of DENOMS) {
    const count = Math.min(Math.floor(rest / denom), MAX_PER_PILE);
    if (count > 0) {
      piles.push([denom, count]);
      rest -= count * denom;
    }
    if (piles.length >= 4) break;
  }
  if (piles.length === 0 && amount > 0) piles.push([amount, 1]);
  return piles;
}

export default function ChipPiles({ amount, theme, chipSize = 30, className }: Props) {
  const piles = buildPiles(amount);
  const step = Math.round(chipSize * 0.17);
  return (
    <div className={`flex items-end gap-2 ${className ?? ''}`}>
      <div className="flex items-end gap-1">
        {piles.map(([denom, count], pi) => (
          <div key={`${pi}-${denom}`} className="relative" style={{ width: chipSize, height: chipSize + (count - 1) * step }}>
            {Array.from({ length: count }, (_, i) => (
              <ChipGlyph
                key={i}
                value={denom}
                theme={theme}
                size={chipSize}
                blank={i < count - 1}
                className={i === count - 1 ? 'bj-chip-pop' : ''}
                style={{ position: 'absolute', left: 0, bottom: i * step, zIndex: i }}
              />
            ))}
          </div>
        ))}
      </div>
      <AnimatedNumber
        value={amount}
        className="font-display text-2xl font-extrabold leading-none"
        style={{ color: '#E8ECF5', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}
      />
    </div>
  );
}
