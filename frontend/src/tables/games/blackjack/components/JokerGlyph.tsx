/**
 * Carte joker dessinée en code : cadre de carte, icône du pouvoir, nom.
 * Sert en main (petite), en légende (mini) et en révélation (grande).
 */

import { Zap, Lock, Hand, LifeBuoy, Shield, RefreshCw } from 'lucide-react';
import type { JokerType } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

export const JOKER_ICONS: Record<JokerType, typeof Zap> = {
  force: Zap,
  lock: Lock,
  steal: Hand,
  filet: LifeBuoy,
  shield: Shield,
  redraw: RefreshCw,
};

/** attaques (ciblent un adversaire) vs cartes défensives (soi-même) */
export const JOKER_IS_ATTACK: Record<JokerType, boolean> = {
  force: true,
  lock: true,
  steal: true,
  filet: false,
  shield: false,
  redraw: false,
};

export function jokerColor(type: JokerType, theme: BjTheme): string {
  return JOKER_IS_ATTACK[type] ? theme.danger : theme.hudAccent;
}

interface Props {
  type: JokerType;
  theme: BjTheme;
  width: number;
  t: TFunction;
  /** nom masqué (petites tailles) */
  compact?: boolean;
}

export default function JokerGlyph({ type, theme, width, t, compact }: Props) {
  const height = width * 1.4;
  const color = jokerColor(type, theme);
  const Icon = JOKER_ICONS[type];
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 rounded-lg border-2"
      style={{
        width,
        height,
        background: theme.seatBg,
        borderColor: color,
        boxShadow: `inset 0 0 12px ${color}22`,
      }}
    >
      <Icon style={{ color, width: width * 0.44, height: width * 0.44 }} />
      {!compact && (
        <span
          className="px-1 text-center font-display font-extrabold uppercase leading-tight"
          style={{ color, fontSize: Math.max(9, width * 0.13) }}
        >
          {t(`table.bj.joker.${type}`)}
        </span>
      )}
    </div>
  );
}
