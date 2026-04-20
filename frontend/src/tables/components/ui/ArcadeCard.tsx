/**
 * Carte "launcher" V3 (categorie, produit, jeu...) - VERSION OPTI mini-PC.
 *
 *   - Plus de backdrop-blur (catastrophique perf sur mini-PC).
 *     Aspect "verre" obtenu via fond opaque sombre + bordure claire.
 *   - Hover translate-y supprime (peu utile en tactile, force re-layout/repaint).
 *   - Variant `selected` met en avant avec un glow violet single-layer.
 */

import { type HTMLAttributes, type ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  hoverable?: boolean;
  children: ReactNode;
}

export default function ArcadeCard({
  selected = false,
  hoverable = true,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border transition-colors duration-150',
        selected
          ? 'border-table-violet/80 bg-table-violet/15 shadow-neon-violet'
          : 'border-white/10 bg-table-bg-elev/85 shadow-glass',
        hoverable ? 'active:scale-[0.99]' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
