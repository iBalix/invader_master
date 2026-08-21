/**
 * Le croupier : sabot (ancre des distributions), cartes dont une face
 * cachée, total qui s'incrémente pendant sa séquence. Sa carte visible est
 * la base de toutes les décisions : grande et permanente.
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
  const overlap = Math.round(cardWidth * 0.36);
  const playing = state.status === 'dealer';
  const busted = dealer.total !== null && dealer.total > 21;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-end gap-4">
        {/* sabot : point de départ de toutes les cartes */}
        <div
          ref={(el) => {
            anchors.current['shoe'] = el;
          }}
          className="relative"
          style={{ width: cardWidth * 0.78, height: cardWidth * 0.78 * 1.4 }}
        >
          {[2, 1, 0].map((i) => (
            <div key={i} className="absolute" style={{ left: i * 3, top: -i * 3 }}>
              <CardGlyph card="back" theme={theme} width={cardWidth * 0.78} />
            </div>
          ))}
          <span
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold uppercase tracking-wider"
            style={{ color: theme.feltText }}
          >
            {state.shoeCount}
          </span>
        </div>

        {/* cartes du croupier */}
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
      </div>

      <div className="flex items-center gap-2">
        <span className="font-display text-xl font-bold uppercase tracking-[0.2em]" style={{ color: theme.feltText }}>
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
