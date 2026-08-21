/**
 * Une main : cartes en éventail, total, mise, verrou/filet, résultat.
 * La zone dangereuse (12-16 dur) est marquée d'un cadre orange, sans
 * pourcentage : un chiffre de probabilité tue le frisson.
 */

import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import PlayingCard from './PlayingCard';
import ChipStack from './ChipStack';
import { inDangerZone } from '../lib/cards';
import type { BjHandView } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { AnchorRegistry } from '../lib/anchors';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  hand: BjHandView;
  theme: BjTheme;
  cardWidth: number;
  /** c'est le tour de CETTE main */
  active: boolean;
  /** délais de cascade par index de carte (distribution initiale) */
  dealDelays?: number[];
  animate: boolean;
  anchors?: AnchorRegistry;
  reduced?: boolean;
  showOutcome: boolean;
  t: TFunction;
}

const BUST_CLASS: Record<BjTheme['bustFx'], string> = {
  dissolve: 'bj-bust-dissolve',
  sag: 'bj-bust-sag',
  burst: 'bj-bust-burst',
};

const OUTCOME_LABEL: Record<string, string> = {
  blackjack: 'table.bj.outcome.blackjack',
  win: 'table.bj.outcome.win',
  push: 'table.bj.outcome.push',
  lose: 'table.bj.outcome.lose',
  bust: 'table.bj.outcome.bust',
};

export default function HandFan({
  hand,
  theme,
  cardWidth,
  active,
  dealDelays,
  animate,
  anchors,
  reduced,
  showOutcome,
  t,
}: Props) {
  // le bust se joue UNE fois, au moment où il survient (pas au premier rendu)
  const prevBusted = useRef(hand.busted);
  const [bustAnim, setBustAnim] = useState(false);
  useEffect(() => {
    if (hand.busted && !prevBusted.current) {
      setBustAnim(true);
      const timer = window.setTimeout(() => setBustAnim(false), 700);
      return () => window.clearTimeout(timer);
    }
    prevBusted.current = hand.busted;
    return undefined;
  }, [hand.busted]);
  useEffect(() => {
    prevBusted.current = hand.busted;
  }, [hand.busted]);

  const danger = !hand.busted && inDangerZone(hand.total, hand.soft);
  const totalColor = hand.busted
    ? theme.danger
    : hand.blackjack || hand.total === 21
      ? theme.gold
      : danger
        ? '#FF9F3D'
        : '#E9ECF5';
  const overlap = Math.round(cardWidth * 0.42);
  const n = hand.cards.length;
  const dimmed = hand.busted && !bustAnim;

  return (
    <div className={`relative flex flex-col items-center gap-1 ${hand.stood && !active ? 'opacity-90' : ''}`}>
      {/* cartes */}
      <div
        className={`relative flex ${bustAnim ? BUST_CLASS[theme.bustFx] : ''} ${dimmed ? 'bj-hand-dimmed' : ''}`}
        style={{ paddingLeft: overlap / 2 }}
      >
        {hand.cards.map((card, i) => (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : -overlap,
              transform: n > 1 ? `rotate(${(i - (n - 1) / 2) * 3.5}deg) translateY(${Math.abs(i - (n - 1) / 2) * 2}px)` : undefined,
              zIndex: i,
            }}
          >
            <PlayingCard
              card={card}
              theme={theme}
              width={cardWidth}
              dealDelayMs={dealDelays?.[i] ?? 0}
              animate={animate}
              anchors={anchors}
              reduced={reduced}
            />
          </div>
        ))}
      </div>

      {/* total + états */}
      <div className="flex items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 font-display text-sm font-bold leading-none ${danger ? 'ring-1' : ''}`}
          style={{
            color: totalColor,
            background: 'rgba(0,0,0,0.55)',
            ...(danger ? { boxShadow: 'inset 0 0 0 1.5px #FF9F3D66' } : {}),
          }}
        >
          {hand.total}
          {hand.soft ? 's' : ''}
        </span>
        {hand.locked && <Lock className="h-4 w-4" style={{ color: theme.danger }} />}
        {hand.doubled && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${theme.hudAccent}33`, color: theme.hudAccent }}>
            x2
          </span>
        )}
        {hand.filetUsed && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${theme.gold}26`, color: theme.gold }}>
            {t('table.bj.hand.filet')}
          </span>
        )}
      </div>

      {/* mise de la main */}
      {hand.bet > 0 && (
        <div style={{ color: '#CBD2E0' }}>
          <ChipStack amount={hand.bet} theme={theme} chipSize={20} />
        </div>
      )}

      {/* résultat au paiement */}
      {showOutcome && hand.outcome && (
        <div
          className="bj-pop pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 font-display text-sm font-extrabold"
          style={{
            background: 'rgba(0,0,0,0.82)',
            color:
              hand.outcome === 'push' ? '#CBD2E0' : (hand.delta ?? 0) > 0 ? theme.gold : theme.danger,
          }}
        >
          {t(OUTCOME_LABEL[hand.outcome])}
          {hand.delta !== null && hand.delta !== 0 ? ` ${hand.delta > 0 ? '+' : ''}${hand.delta}` : ''}
        </div>
      )}
    </div>
  );
}
