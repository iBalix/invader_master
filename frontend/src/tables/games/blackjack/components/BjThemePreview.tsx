/**
 * Mini-préview d'un thème : coin de feutre, dos de carte, face et jeton.
 */

import CardGlyph from '../themes/CardGlyph';
import ChipGlyph from '../themes/ChipGlyph';
import type { BjTheme } from '../themes/types';

interface Props {
  theme: BjTheme;
  size?: number;
  selected?: boolean;
}

export default function BjThemePreview({ theme, size = 92, selected }: Props) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-2xl"
      style={{
        width: size,
        height: size,
        background: theme.feltBg,
        boxShadow: selected ? `0 0 0 3px ${theme.hudAccent}` : 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
    >
      <div className="absolute" style={{ transform: 'rotate(-10deg) translate(-14px, 2px)' }}>
        <CardGlyph card="back" theme={theme} width={size * 0.4} />
      </div>
      <div className="absolute" style={{ transform: 'rotate(9deg) translate(10px, 4px)' }}>
        <CardGlyph card="As" theme={theme} width={size * 0.4} />
      </div>
      <div className="absolute bottom-1.5 right-1.5">
        <ChipGlyph value={100} theme={theme} size={size * 0.3} />
      </div>
    </div>
  );
}
