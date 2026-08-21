/**
 * Jeton dessiné en code : disque, créneaux de bord (8 encoches), anneau
 * intérieur, valeur en typographie. Couleurs par palier via le thème.
 */

import type { BjTheme } from './types';

interface Props {
  value: number;
  theme: BjTheme;
  size: number;
  className?: string;
  style?: React.CSSProperties;
  /** cache la valeur (pile décorative) */
  blank?: boolean;
}

export default function ChipGlyph({ value, theme, size, className, style, blank }: Props) {
  const { base, edge, text } = theme.chipStyle(value);
  const notches = Array.from({ length: 8 }, (_, i) => i * 45);
  const label = value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} style={style} aria-hidden>
      <circle cx="24" cy="24" r="22.5" fill={base} stroke={edge} strokeWidth="1.6" />
      {notches.map((deg) => (
        <rect key={deg} x="21" y="1.6" width="6" height="7" rx="1.4" fill={edge} transform={`rotate(${deg} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="15" fill="none" stroke={edge} strokeWidth="1.8" strokeDasharray="4.4 3.4" opacity="0.85" />
      <circle cx="24" cy="24" r="12.6" fill={base} />
      {!blank && (
        <text
          x="24"
          y="24"
          fill={text}
          fontSize={label.length > 3 ? 10 : label.length > 2 ? 11.5 : 14}
          fontWeight="800"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
