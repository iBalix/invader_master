/**
 * Effets des jokers, diffusés à l'identique sur toutes les dalles : la carte
 * jouée se révèle en grand au centre, puis l'impact frappe le siège cible
 * (cadenas qui claque, poussée, filet, éclat de bouclier).
 */

import { useEffect, useRef, useState } from 'react';
import JokerGlyph, { JOKER_ICONS, jokerColor } from './JokerGlyph';
import CardGlyph from '../themes/CardGlyph';
import { Shield } from 'lucide-react';
import { seatAnchorKey, centerOf } from '../lib/anchors';
import type { AnchorRegistry } from '../lib/anchors';
import type { BjJokerEvent } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  event: BjJokerEvent | null;
  theme: BjTheme;
  anchors: AnchorRegistry;
  reduced?: boolean;
  t: TFunction;
}

const REVEAL_MS = 2400;
const IMPACT_MS = 2100;

interface ActiveFx {
  event: BjJokerEvent;
  impactAt: { x: number; y: number } | null;
}

export default function JokerFxLayer({ event, theme, anchors, reduced, t }: Props) {
  const [fx, setFx] = useState<ActiveFx | null>(null);
  const [impactVisible, setImpactVisible] = useState(false);
  const lastSeq = useRef<number>(event?.seq ?? -1);
  const firstPaint = useRef(true);

  useEffect(() => {
    // le premier état affiché ne rejoue pas un joker passé
    if (firstPaint.current) {
      firstPaint.current = false;
      lastSeq.current = event?.seq ?? -1;
      return;
    }
    if (!event || event.seq === lastSeq.current) return;
    lastSeq.current = event.seq;

    const targetKey = event.to ?? event.from;
    const el = anchors.current[seatAnchorKey(targetKey)];
    setFx({ event, impactAt: el ? centerOf(el) : null });
    setImpactVisible(false);
    const impactTimer = window.setTimeout(() => setImpactVisible(true), reduced ? 200 : 1400);
    const endTimer = window.setTimeout(() => {
      setFx(null);
      setImpactVisible(false);
    }, (reduced ? 1400 : REVEAL_MS) + IMPACT_MS);
    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.seq]);

  if (!fx) return null;
  const { event: e, impactAt } = fx;
  const color = jokerColor(e.type, theme);
  const Icon = JOKER_ICONS[e.type];

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* révélation au centre */}
      <div
        className="bj-joker-reveal absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
        style={{ ['--bj-joker-ms' as string]: `${reduced ? 1400 : REVEAL_MS}ms` }}
      >
        <JokerGlyph type={e.type} theme={theme} width={reduced ? 110 : 150} t={t} />
        <div className="rounded-full px-4 py-1.5 text-center font-display font-bold uppercase tracking-wide" style={{ background: 'rgba(0,0,0,0.78)', color: '#EDF0F7' }}>
          <span style={{ color }}>{e.fromPseudo}</span>
          {e.to && (
            <>
              <span className="mx-2 text-white/50">→</span>
              <span>{e.toPseudo}</span>
            </>
          )}
        </div>
        {e.shielded && (
          <div className="bj-pop flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-lg font-extrabold uppercase" style={{ background: `${theme.hudAccent}2E`, color: theme.hudAccent }}>
            <Shield className="h-5 w-5" />
            {t('table.bj.joker.shielded')}
          </div>
        )}
      </div>

      {/* impact sur le siège cible */}
      {impactVisible && impactAt && (
        <div className="absolute" style={{ left: impactAt.x, top: impactAt.y }}>
          {e.shielded ? (
            <div className="bj-shield-flash absolute -left-12 -top-12 h-24 w-24 rounded-full border-4" style={{ borderColor: theme.hudAccent }} />
          ) : (
            <div className="bj-impact-slam bj-impact-hold absolute -left-8 -top-8 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${color}2A`, border: `2.5px solid ${color}` }}>
              <Icon className="h-8 w-8" style={{ color }} />
            </div>
          )}
          {/* carte concernée (vol : volée ; force : tirée) */}
          {e.card && !e.shielded && (
            <div className="bj-pop absolute -top-24 left-6" style={{ animationDelay: '160ms' }}>
              <CardGlyph card={e.card} theme={theme} width={52} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
