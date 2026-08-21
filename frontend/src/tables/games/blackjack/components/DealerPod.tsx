/**
 * Le croupier : sabot nettement dissocié des cartes (excentré à gauche,
 * son compteur sous lui), cartes centrées dont une face cachée, total qui
 * s'incrémente pendant sa séquence. Sa carte visible est la base de toutes
 * les décisions : grande et permanente.
 */

import CardGlyph from '../themes/CardGlyph';
import PlayingCard from './PlayingCard';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { AnchorRegistry } from '../lib/anchors';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  anchors: AnchorRegistry;
  dealDelays?: number[];
  animate: boolean;
  reduced?: boolean;
  t: TFunction;
}

export default function DealerPod({ state, theme, anchors, dealDelays, animate, reduced, t }: Props) {
  const { dealer } = state;
  const cardWidth = 96;
  const shoeWidth = Math.round(cardWidth * 0.72);
  const overlap = Math.round(cardWidth * 0.36);
  const playing = state.status === 'dealer';
  const busted = dealer.total !== null && dealer.total > 21;

  return (
    <div className="relative flex flex-col items-center gap-2">
      {/* le sabot, bien à l'écart des cartes, son compteur sous lui */}
      <div className="absolute right-full top-1 mr-20 flex flex-col items-center gap-1.5">
        <div
          ref={(el) => {
            anchors.current['shoe'] = el;
          }}
          className="relative"
          style={{ width: shoeWidth + 8, height: shoeWidth * 1.4 + 8 }}
        >
          {[2, 1, 0].map((i) => (
            <div key={i} className="absolute" style={{ left: i * 3, top: 8 - i * 3 }}>
              <CardGlyph card="back" theme={theme} width={shoeWidth} />
            </div>
          ))}
        </div>
        <span className="text-base font-bold tracking-wider" style={{ color: theme.feltText, opacity: 0.8 }}>
          {state.shoeCount}
        </span>
      </div>

      {/* cartes du croupier, centrées */}
      <div className="flex" style={{ minHeight: cardWidth * 1.4 }}>
        {dealer.cards.map((card, i) => (
          <div key={i} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: i }}>
            <PlayingCard
              card={card}
              theme={theme}
              width={cardWidth}
              facedown={card === '??'}
              dealDelayMs={dealDelays?.[i] ?? 0}
              animate={animate}
              anchors={anchors}
              reduced={reduced}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-bold uppercase tracking-[0.25em]" style={{ color: theme.feltText }}>
          {t('table.bj.dealer')}
        </span>
        {dealer.total !== null && (
          <span
            className={`rounded-full px-4 py-1 font-display text-3xl font-extrabold ${playing ? 'bj-pop' : ''}`}
            style={{
              background: 'rgba(0,0,0,0.55)',
              color: busted ? theme.danger : dealer.total >= 17 ? '#EDF0F7' : theme.hudAccent,
            }}
          >
            {dealer.total}
          </span>
        )}
        {busted && (
          <span className="bj-pop rounded-full px-3 py-1 font-display text-xl font-extrabold uppercase" style={{ background: `${theme.danger}2E`, color: theme.danger }}>
            {t('table.bj.dealer.bust')}
          </span>
        )}
      </div>
    </div>
  );
}
