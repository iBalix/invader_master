/**
 * Temps forts plein écran : record du bar battu en pleine partie (signalé par
 * la boucle dès que mon score dépasse le HI-SCORE), puis à la fin de manche
 * si le classement porte le badge du record du bar. Fanfare locale.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Crown } from 'lucide-react';
import type { TFunction } from '../../../i18n/useT';
import type { InvSfxApi } from '../audio/invSfx';
import type { InvBridge } from '../engine/bridge';
import { formatScore } from '../lib/format';
import type { InvPublicState, InvYou } from '../lib/invTypes';

interface Props {
  bridge: InvBridge;
  state: InvPublicState;
  you: InvYou | null;
  sfxRef: RefObject<InvSfxApi | null>;
  t: TFunction;
}

const HOLD_MS = 2600;
const GOLD = '#E8C267';

export default function RecordBanner({ bridge, state, you, sfxRef, t }: Props) {
  const [shown, setShown] = useState<{ key: number; title: string; sub: string } | null>(null);
  const timer = useRef<number | null>(null);
  const celebratedRound = useRef<number | null>(null);

  const show = (title: string, sub: string) => {
    sfxRef.current?.play('record');
    setShown({ key: Date.now(), title, sub });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(null), HOLD_MS + 400);
  };

  useEffect(
    () =>
      bridge.fromRunner.on('barRecordBeaten', (score) => {
        show(t('table.inv.record.live', 'NOUVEAU RECORD DU BAR !'), formatScore(score));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridge, t],
  );

  // fin de manche : badge « record du bar » sur ma ligne, une seule fois
  const last = state.lastRound;
  useEffect(() => {
    if (!last || !last.records.applied || !you) return;
    if (celebratedRound.current === last.index) return;
    celebratedRound.current = last.index;
    const mine = last.ranking.find((e) => e.playerId === you.playerId);
    if (mine?.barRecord) show(t('table.inv.record.title', 'RECORD DU BAR'), `${mine.pseudo} · ${formatScore(mine.score)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.index, last?.records.applied, you?.playerId]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div
        key={shown.key}
        className="inv-banner flex flex-col items-center gap-3 rounded-3xl border-4 px-14 py-8"
        style={{ borderColor: GOLD, background: 'rgba(8,5,2,0.9)', boxShadow: `0 0 60px ${GOLD}88`, ['--inv-hold' as string]: `${HOLD_MS}ms` }}
      >
        <Crown className="h-16 w-16" style={{ color: GOLD }} />
        <span className="font-retro text-[40px]" style={{ color: GOLD, textShadow: `0 0 18px ${GOLD}` }}>
          {shown.title}
        </span>
        <span className="font-retro text-[30px] text-white">{shown.sub}</span>
      </div>
    </div>
  );
}
