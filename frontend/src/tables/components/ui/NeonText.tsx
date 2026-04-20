/**
 * NeonText : helper de mise en forme texte avec accent neon V3.
 */

import { type HTMLAttributes, type ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  color?: 'cyan' | 'violet' | 'magenta' | 'yellow' | 'red' | 'ink';
  flicker?: boolean;
  glow?: boolean;
  children: ReactNode;
}

const COLOR_CLASSES = {
  cyan: 'text-table-cyan',
  violet: 'text-table-violet-soft',
  magenta: 'text-table-magenta',
  yellow: 'text-table-yellow',
  red: 'text-table-red',
  ink: 'text-table-ink',
};

const GLOW_CLASSES: Record<string, string> = {
  cyan: 'drop-shadow-[0_0_8px_rgba(51,226,255,0.6)]',
  violet: 'drop-shadow-[0_0_8px_rgba(166,100,255,0.6)]',
  magenta: 'drop-shadow-[0_0_8px_rgba(255,43,214,0.6)]',
  yellow: 'drop-shadow-[0_0_8px_rgba(255,233,85,0.6)]',
  red: 'drop-shadow-[0_0_8px_rgba(255,59,92,0.6)]',
  ink: '',
};

export default function NeonText({
  color = 'ink',
  flicker: _flicker = false,
  glow = false,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <span
      className={[COLOR_CLASSES[color], glow ? GLOW_CLASSES[color] : '', className].join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
