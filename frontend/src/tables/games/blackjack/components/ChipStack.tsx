/**
 * Pile de jetons représentant un montant (décomposition en paliers, 5 jetons
 * visibles max) + montant en clair. Le jeton du dessus "pop" quand le
 * montant change.
 */

import ChipGlyph from '../themes/ChipGlyph';
import type { BjTheme } from '../themes/types';

interface Props {
  amount: number;
  theme: BjTheme;
  chipSize?: number;
  showAmount?: boolean;
  className?: string;
}

const DENOMS = [500, 100, 25, 10, 5, 1];

export function decomposeChips(amount: number, max = 5): number[] {
  const chips: number[] = [];
  let rest = amount;
  for (const d of DENOMS) {
    while (rest >= d && chips.length < max) {
      chips.push(d);
      rest -= d;
    }
  }
  if (chips.length === 0 && amount > 0) chips.push(amount);
  return chips;
}

export default function ChipStack({ amount, theme, chipSize = 26, showAmount = true, className }: Props) {
  if (amount <= 0) return null;
  const chips = decomposeChips(amount);
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <div className="relative" style={{ width: chipSize, height: chipSize + (chips.length - 1) * 4 }}>
        {chips.map((value, i) => (
          <ChipGlyph
            key={`${i}-${value}`}
            value={value}
            theme={theme}
            size={chipSize}
            blank={i < chips.length - 1}
            className={`absolute left-0 ${i === chips.length - 1 ? 'bj-chip-pop' : ''}`}
            style={{ bottom: i * 4, zIndex: i }}
          />
        ))}
      </div>
      {showAmount && (
        <span className="font-display font-bold" style={{ fontSize: chipSize * 0.62, color: 'inherit' }}>
          {amount}
        </span>
      )}
    </div>
  );
}
