/**
 * Légende permanente des six jokers, sur le bord gauche : le joueur qui
 * attend son tour lit passivement le mode d'emploi. Un appui déplie les
 * descriptions.
 */

import { useState } from 'react';
import JokerGlyph from './JokerGlyph';
import { JOKER_TYPES } from '../lib/bjTypes';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  t: TFunction;
}

export default function JokerLegend({ state, theme, t }: Props) {
  const [open, setOpen] = useState(false);
  const enabled = JOKER_TYPES.filter((type) => state.config.jokersEnabled?.[type] !== false);
  if (enabled.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute left-2 top-1/2 z-20 -translate-y-1/2">
      <button
        className="flex flex-col gap-2 rounded-2xl border p-2.5"
        style={{ background: `${theme.seatBg}`, borderColor: theme.seatBorder, opacity: open ? 1 : 0.82 }}
        onClick={() => setOpen((v) => !v)}
      >
        {enabled.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <JokerGlyph type={type} theme={theme} width={44} t={t} compact />
            {open && (
              <div className="w-72 pr-1 text-left">
                <div className="font-display text-base font-bold uppercase" style={{ color: theme.hudAccent }}>
                  {t(`table.bj.joker.${type}`)}
                </div>
                <div className="text-sm leading-tight text-white/70">{t(`table.bj.joker.${type}.desc`)}</div>
              </div>
            )}
          </div>
        ))}
      </button>
    </div>
  );
}
