/**
 * Mise de la manche, au geste du casino : on TOUCHE SES JETONS pour les poser
 * sur le tapis, et on touche une pile posée pour la reprendre. Aucun palier
 * abstrait, aucun calcul mental : la valeur se lit dans les jetons.
 *
 * Les valeurs du rack sont dérivées des bornes de la table (mise minimale et
 * maximale), un jeton trop cher pour ce qu'il reste à miser se grise. L'envoi
 * au serveur reste automatique avec un léger debounce : le dernier montant
 * posé avant la fin du chrono fait foi. Qui ne touche à rien rejoue sa mise
 * précédente (déjà posée sur le tapis à l'ouverture).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import TimerRing from './TimerRing';
import ChipGlyph from '../themes/ChipGlyph';
import AnimatedNumber from './AnimatedNumber';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  myChips: number;
  /** mise déjà enregistrée côté serveur (betInput de mon siège) */
  serverBet: number | null;
  lastBet: number | null;
  onBet: (amount: number) => void;
  reduced?: boolean;
  t: TFunction;
}

const SEND_DEBOUNCE_MS = 550;
/** valeurs de jetons d'un vrai tapis, filtrées par les bornes de la table */
const STANDARD_DENOMS = [5, 10, 25, 50, 100, 250, 500];
/** au-delà, la pile s'affiche en « xN » plutôt qu'en hauteur */
const MAX_VISIBLE_PER_PILE = 5;

interface Chip {
  id: number;
  value: number;
}

/** le rack : bornes de la table + valeurs standard intermédiaires (5 max) */
function buildDenoms(minBet: number, maxBet: number): number[] {
  const set = new Set<number>([minBet, maxBet]);
  for (const d of STANDARD_DENOMS) {
    if (d > minBet && d < maxBet) set.add(d);
  }
  const all = Array.from(set).sort((a, b) => a - b);
  if (all.length <= 5) return all;
  // on garde les deux bornes et on échantillonne le milieu
  const middle = all.slice(1, -1);
  const keep = [0, 1, 2].map((i) => middle[Math.round((i * (middle.length - 1)) / 2)]);
  return Array.from(new Set([all[0], ...keep, all[all.length - 1]])).sort((a, b) => a - b);
}

let chipSeq = 0;

/** décompose un montant en jetons du rack (glouton, du plus gros au plus petit) */
function decompose(amount: number, denoms: number[]): Chip[] {
  const chips: Chip[] = [];
  let rest = amount;
  for (const value of [...denoms].sort((a, b) => b - a)) {
    while (rest >= value) {
      chips.push({ id: chipSeq++, value });
      rest -= value;
    }
  }
  // reste non représentable (mise héritée d'un clamp serveur) : un jeton à part
  if (rest > 0) chips.push({ id: chipSeq++, value: rest });
  return chips;
}

export default function BetPanel({ state, theme, myChips, serverBet, lastBet, onBet, reduced, t }: Props) {
  const { minBet, maxBet, betMs } = state.config;
  const ceiling = Math.max(minBet, Math.min(maxBet, myChips));
  const denoms = useMemo(() => buildDenoms(minBet, maxBet), [minBet, maxBet]);

  const [stack, setStack] = useState<Chip[]>(() =>
    decompose(Math.min(ceiling, Math.max(minBet, serverBet ?? lastBet ?? minBet)), denoms),
  );
  const total = stack.reduce((sum, c) => sum + c.value, 0);
  const timer = useRef<number | null>(null);
  const sent = useRef<number | null>(serverBet);

  // nouvelle manche : le tapis repart de la mise connue (souvent la précédente)
  const roundRef = useRef(state.roundIndex);
  useEffect(() => {
    if (roundRef.current !== state.roundIndex) {
      roundRef.current = state.roundIndex;
      sent.current = serverBet;
      setStack(decompose(Math.min(ceiling, Math.max(minBet, serverBet ?? lastBet ?? minBet)), denoms));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundIndex]);

  /** planifie l'envoi du montant courant (jamais sous la mise minimale) */
  function schedule(next: Chip[]) {
    const amount = next.reduce((sum, c) => sum + c.value, 0);
    if (timer.current) window.clearTimeout(timer.current);
    if (amount < minBet) return;
    timer.current = window.setTimeout(() => {
      if (sent.current !== amount) {
        sent.current = amount;
        onBet(amount);
      }
    }, SEND_DEBOUNCE_MS);
  }

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function addChip(value: number) {
    if (total + value > ceiling) return;
    setStack((prev) => {
      const next = [...prev, { id: chipSeq++, value }];
      schedule(next);
      return next;
    });
  }

  /** reprendre un jeton : on retire le dernier posé de cette valeur */
  function removeChip(value: number) {
    setStack((prev) => {
      const idx = prev.map((c) => c.value).lastIndexOf(value);
      if (idx < 0) return prev;
      const next = prev.slice(0, idx).concat(prev.slice(idx + 1));
      schedule(next);
      return next;
    });
  }

  function clearAll() {
    setStack(() => {
      schedule([]);
      return [];
    });
  }

  // le tapis : une pile par valeur, la plus grosse à gauche
  const piles = useMemo(() => {
    const byValue = new Map<number, Chip[]>();
    for (const chip of stack) {
      const list = byValue.get(chip.value) ?? [];
      list.push(chip);
      byValue.set(chip.value, list);
    }
    return Array.from(byValue.entries()).sort((a, b) => b[0] - a[0]);
  }, [stack]);

  const confirmed = serverBet !== null && serverBet === total && total > 0;
  const belowMin = total < minBet;
  const chipSize = 62;
  const pileChipSize = 46;
  const stepY = 9;

  return (
    <div
      className="pointer-events-auto flex items-stretch gap-5 rounded-3xl border px-6 py-3.5"
      style={{ background: theme.seatBg, borderColor: theme.seatBorder }}
    >
      {/* chrono de la phase de mises */}
      {state.phaseEndsAt && (
        <div className="flex items-center">
          <TimerRing
            endsAt={state.phaseEndsAt}
            totalMs={betMs}
            color={theme.hudAccent}
            dangerColor={theme.danger}
            size={64}
            reduced={reduced}
          />
        </div>
      )}

      {/* le tapis : les jetons posés, cliquables pour les reprendre */}
      <div className="flex flex-col justify-center gap-1">
        <span className="font-display text-sm font-bold uppercase tracking-[0.18em]" style={{ color: theme.feltText }}>
          {t('table.bj.bet.title')}
        </span>
        <div
          className="flex min-h-[92px] min-w-[300px] items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-2"
          style={{
            borderColor: belowMin ? `${theme.danger}66` : `${theme.hudAccent}55`,
            background: 'rgba(0,0,0,0.28)',
          }}
        >
          {piles.length === 0 ? (
            <span className="font-display text-lg font-bold uppercase" style={{ color: '#8B93A8' }}>
              {t('table.bj.bet.empty')}
            </span>
          ) : (
            <div className="flex items-end gap-3">
              {piles.map(([value, chips]) => {
                const shown = Math.min(chips.length, MAX_VISIBLE_PER_PILE);
                return (
                  <button
                    key={value}
                    className="bj-bet-zone-in relative active:scale-95"
                    style={{ width: pileChipSize, height: pileChipSize + (shown - 1) * stepY }}
                    onClick={() => removeChip(value)}
                    aria-label={`${t('table.bj.bet.remove')} ${value}`}
                  >
                    {chips.slice(-shown).map((chip, i) => (
                      <ChipGlyph
                        key={chip.id}
                        value={value}
                        theme={theme}
                        size={pileChipSize}
                        className={i === shown - 1 ? 'bj-chip-toss' : ''}
                        style={{ position: 'absolute', left: 0, bottom: i * stepY, zIndex: i }}
                      />
                    ))}
                    {chips.length > MAX_VISIBLE_PER_PILE && (
                      <span
                        className="absolute -right-1.5 -top-2 rounded-full px-1.5 font-display text-sm font-black"
                        style={{ background: theme.hudAccent, color: '#0A0D18', zIndex: 20 }}
                      >
                        ×{chips.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            <AnimatedNumber
              value={total}
              className="font-display text-5xl font-extrabold leading-none"
              style={{ color: belowMin ? theme.danger : theme.hudAccent }}
            />
            {stack.length > 0 && (
              <button
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white/60 active:scale-95"
                onClick={clearAll}
                aria-label={t('table.bj.bet.clear')}
              >
                <Undo2 className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
        <span className="h-5 font-display text-sm font-bold uppercase tracking-wide" style={{ color: belowMin ? theme.danger : confirmed ? theme.hudAccent : '#8B93A8' }}>
          {belowMin
            ? t('table.bj.bet.min').replace('{min}', String(minBet))
            : confirmed
              ? t('table.bj.bet.locked')
              : t('table.bj.bet.pending')}
        </span>
      </div>

      {/* le rack : mes jetons, on tape dedans pour miser */}
      <div className="flex flex-col justify-center gap-1 border-l border-white/10 pl-5">
        <span className="font-display text-sm font-bold uppercase tracking-[0.18em]" style={{ color: theme.feltText }}>
          {t('table.bj.bet.rack')}
        </span>
        <div className="flex items-center gap-3">
          {denoms.map((value) => {
            const affordable = total + value <= ceiling;
            return (
              <button
                key={value}
                className="bj-chip-btn active:scale-95"
                data-affordable={affordable}
                disabled={!affordable}
                onClick={() => addChip(value)}
                aria-label={`${t('table.bj.bet.add')} ${value}`}
              >
                <ChipGlyph value={value} theme={theme} size={chipSize} />
              </button>
            );
          })}
        </div>
        <span className="h-5 font-display text-sm font-bold uppercase tracking-wide text-white/40">
          {t('table.bj.bet.hint')}
        </span>
      </div>
    </div>
  );
}
