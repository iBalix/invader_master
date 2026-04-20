/**
 * Bouton "launcher" V3 - VERSION OPTI mini-PC.
 *
 * Variants : primary (violet), accent (magenta), cyan, danger (rouge), ghost (verre).
 *
 * Optimisations perf :
 *   - Plus de shimmer hover (animation infinie GPU-heavy).
 *   - Plus de backdrop-blur sur ghost (fond opaque suffit).
 *   - shadow-neon "single layer" via tailwind config.
 *   - Anim active:scale conservee (utile en tactile, pas chere).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'cyan' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-table-violet via-table-violet to-table-violet-deep text-white shadow-neon-violet border border-white/15',
  accent:
    'bg-gradient-to-br from-table-magenta via-[#D724B5] to-[#7A0F73] text-white shadow-neon-magenta border border-white/15',
  cyan:
    'bg-gradient-to-br from-table-cyan via-[#1FB7DC] to-[#0E5DAB] text-white shadow-neon-cyan border border-white/15',
  danger:
    'bg-gradient-to-br from-table-red via-[#D52D4D] to-[#7A0F26] text-white shadow-[0_6px_20px_rgba(255,59,92,0.45)] border border-white/15',
  ghost:
    'bg-table-bg-elev/85 text-table-ink border border-white/15',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
  xl: 'px-10 py-5 text-xl',
};

const ArcadeButton = forwardRef<HTMLButtonElement, Props>(function ArcadeButton(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    fullWidth,
    className = '',
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={[
        'relative inline-flex items-center justify-center gap-3 rounded-2xl font-display uppercase tracking-wider',
        'transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-table-violet/40',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
});

export default ArcadeButton;
