/**
 * Temps forts records : "NOUVEAU RECORD DU BAR" (or, onde de choc, confettis,
 * son) et record perso (bannière discrète). Déclenchés par le classement de
 * fin de manche (une fois par manche et par joueur) et, en direct, par la
 * scène quand l'oiseau local dépasse le record connu.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import confetti from 'canvas-confetti';
import { Crown } from 'lucide-react';
import type { TFunction } from '../../../i18n/useT';
import type { FlapSfx } from '../audio/flapSfx';
import type { FlapPublicState, FlapYou } from '../lib/flapTypes';
import { formatMeters } from '../lib/format';
import type { FlapBridge } from '../phaser/bridge';

interface Moment {
  key: string;
  kind: 'bar' | 'personal';
  pseudo: string;
  meters: number;
}

interface Props {
  bridge: FlapBridge;
  state: FlapPublicState;
  you: FlapYou | null;
  reduced: boolean;
  sfxRef: RefObject<FlapSfx | null>;
  t: TFunction;
}

const GOLD = '#E8C267';
const CYAN = '#33E2FF';
const HOLD_MS: Record<Moment['kind'], number> = { bar: 3200, personal: 2000 };

export default function RecordCelebration({ bridge, state, you, reduced, sfxRef, t }: Props) {
  const [current, setCurrent] = useState<Moment | null>(null);
  const queue = useRef<Moment[]>([]);
  const seen = useRef(new Set<string>());
  const timer = useRef<number | null>(null);
  const firstPaint = useRef(true);
  const youRef = useRef(you);
  youRef.current = you;
  const stateRef = useRef(state);
  stateRef.current = state;
  const roundIndexRef = useRef<number | null>(null);
  if (state.round) roundIndexRef.current = state.round.index;

  const playNext = useCallback(() => {
    if (timer.current !== null) return;
    const next = queue.current.shift();
    if (!next) return;
    setCurrent(next);
    if (next.kind === 'bar') {
      sfxRef.current?.play('record');
      if (!reduced) {
        void confetti({
          particleCount: 140,
          spread: 90,
          startVelocity: 55,
          origin: { x: 0.5, y: 0.55 },
          colors: [GOLD, '#ffffff', '#FFE955'],
          zIndex: 45,
          disableForReducedMotion: true,
        });
      }
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCurrent(null);
      window.setTimeout(playNext, 150);
    }, HOLD_MS[next.kind] + 600);
  }, [reduced, sfxRef]);

  const enqueue = useCallback(
    (moment: Moment) => {
      if (seen.current.has(moment.key)) return;
      seen.current.add(moment.key);
      queue.current.push(moment);
      playNext();
    },
    [playNext],
  );

  // fin de manche : records du classement
  const lastIndex = state.lastRound?.index ?? null;
  useEffect(() => {
    const last = stateRef.current.lastRound;
    if (!last) return;
    if (firstPaint.current) {
      // manche déjà terminée à l'arrivée sur la page : on ne rejoue pas ses moments
      firstPaint.current = false;
      for (const entry of last.ranking) {
        seen.current.add(`bar:${last.index}:${entry.playerId}`);
        seen.current.add(`pb:${last.index}:${entry.playerId}`);
      }
      return;
    }
    const me = youRef.current;
    for (const entry of last.ranking) {
      if (entry.barRecord) {
        enqueue({ key: `bar:${last.index}:${entry.playerId}`, kind: 'bar', pseudo: entry.pseudo, meters: entry.distance });
      } else if (entry.personalBest && me && entry.playerId === me.playerId) {
        enqueue({ key: `pb:${last.index}:${entry.playerId}`, kind: 'personal', pseudo: entry.pseudo, meters: entry.distance });
      }
    }
  }, [lastIndex, enqueue]);

  // en direct : l'oiseau local dépasse le record du bar
  useEffect(
    () =>
      bridge.fromScene.on('barRecordBeaten', (meters) => {
        const me = youRef.current;
        const index = roundIndexRef.current;
        if (!me || index === null) return;
        enqueue({ key: `bar:${index}:${me.playerId}`, kind: 'bar', pseudo: me.pseudo, meters });
      }),
    [bridge, enqueue],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!current) return null;
  const bar = current.kind === 'bar';
  const style = {
    '--flap-hold': `${HOLD_MS[current.kind]}ms`,
    background: 'rgba(3,5,12,0.86)',
    border: `2px solid ${bar ? GOLD : CYAN}`,
  } as CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      {bar && !reduced && <div className="flap-shockwave" style={{ border: `6px solid ${GOLD}` }} />}
      <div className="flap-banner flex flex-col items-center gap-3 rounded-3xl px-14 py-8 text-center" style={style}>
        {bar ? (
          <>
            <span className="flex items-center gap-4 font-display text-[72px] leading-none" style={{ color: GOLD }}>
              <Crown className="h-16 w-16" />
              {t('table.flap.moment.record', 'NOUVEAU RECORD DU BAR')}
            </span>
            <span className="text-[40px] font-semibold text-white">
              {t('table.flap.moment.recordSub', '{pseudo} : {meters} m')
                .replace('{pseudo}', current.pseudo)
                .replace('{meters}', formatMeters(current.meters, 1))}
            </span>
          </>
        ) : (
          <span className="font-display text-[40px] leading-none" style={{ color: CYAN }}>
            {t('table.flap.moment.personal', 'Nouveau record perso !')}
          </span>
        )}
      </div>
    </div>
  );
}
