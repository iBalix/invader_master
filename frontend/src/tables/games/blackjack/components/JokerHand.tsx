/**
 * Mes jokers (contenu privé) : jouables hors de mon tour, un par fenêtre de
 * décision, deux par manche. Une attaque ouvre le sélecteur de cible.
 */

import { useState } from 'react';
import JokerGlyph, { JOKER_IS_ATTACK } from './JokerGlyph';
import { eligibleTargets, jokerPlayable } from '../lib/jokerRules';
import { tableOriginLabel } from '../lib/ring';
import type { BjPublicState, BjSeatView, JokerType } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  me: BjSeatView;
  jokers: JokerType[];
  theme: BjTheme;
  busy: boolean;
  onPlay: (type: JokerType, target: string | null) => void;
  t: TFunction;
}

export default function JokerHand({ state, me, jokers, theme, busy, onPlay, t }: Props) {
  const [picking, setPicking] = useState<JokerType | null>(null);

  if (jokers.length === 0) return null;

  function tap(type: JokerType) {
    if (busy || !jokerPlayable(state, me, type)) return;
    if (JOKER_IS_ATTACK[type]) {
      setPicking(type);
    } else {
      onPlay(type, null);
    }
  }

  const targets = picking ? eligibleTargets(state, me, picking) : [];

  return (
    <>
      <div
        className="pointer-events-auto flex items-end gap-2 rounded-2xl border px-3 py-2"
        style={{ background: theme.seatBg, borderColor: theme.seatBorder }}
      >
        <span className="mb-1 mr-1 font-display text-base font-bold uppercase tracking-wider" style={{ color: theme.feltText }}>
          {t('table.bj.jokers.mine')}
        </span>
        {jokers.map((type, i) => {
          const playable = !busy && jokerPlayable(state, me, type);
          return (
            <button
              key={`${type}-${i}`}
              className={`bj-pop transition-transform ${playable ? 'active:scale-95' : ''}`}
              style={{ opacity: playable ? 1 : 0.45, transform: playable ? undefined : 'translateY(4px)' }}
              onClick={() => tap(type)}
            >
              <JokerGlyph type={type} theme={theme} width={88} t={t} />
            </button>
          );
        })}
        {me.playedThisRound >= 2 && (
          <span className="mb-1 ml-1 text-sm font-bold uppercase" style={{ color: theme.danger }}>
            {t('table.bj.jokers.roundLimit')}
          </span>
        )}
      </div>

      {/* sélecteur de cible */}
      {picking && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPicking(null)}>
          <div
            className="bj-pop flex flex-col items-center gap-5 rounded-3xl border-2 px-10 py-8"
            style={{ background: theme.seatBg, borderColor: theme.hudAccent }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              <JokerGlyph type={picking} theme={theme} width={120} t={t} />
              <div className="max-w-[480px]">
                <div className="font-display text-4xl font-extrabold uppercase" style={{ color: theme.hudAccent }}>
                  {t(`table.bj.joker.${picking}`)}
                </div>
                <div className="mt-1.5 text-xl text-white/75">{t(`table.bj.joker.${picking}.desc`)}</div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {targets.map((seat) => (
                <button
                  key={seat.playerId}
                  className="flex min-w-[220px] flex-col items-center gap-1 rounded-2xl border-2 px-8 py-5 active:scale-95"
                  style={{ background: 'rgba(0,0,0,0.4)', borderColor: theme.danger }}
                  onClick={() => {
                    setPicking(null);
                    onPlay(picking, seat.playerId);
                  }}
                >
                  <span className="font-display text-2xl font-bold uppercase text-white">{seat.pseudo}</span>
                  <span className="text-base text-white/60">
                    {tableOriginLabel(seat.device) ?? ''} · {seat.hands.map((h) => h.total).join(' / ')}
                  </span>
                </button>
              ))}
              {targets.length === 0 && (
                <span className="text-xl text-white/60">{t('table.bj.jokers.noTarget')}</span>
              )}
            </div>
            <button className="rounded-2xl border border-white/25 px-9 py-4 font-display text-xl font-bold uppercase text-white/85" onClick={() => setPicking(null)}>
              {t('table.bj.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
