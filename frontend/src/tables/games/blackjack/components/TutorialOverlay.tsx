/**
 * Présentation animée avant la première mise (~66 s, 11 chapitres de 6 s),
 * identique et synchronisée sur toutes les dalles (horloge serveur).
 * Progressive : l'évident d'abord, les jokers à la fin. Personnalisée avec
 * les pseudos réellement assis. « Passer » au vote unanime.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { FastForward } from 'lucide-react';
import CardGlyph from '../themes/CardGlyph';
import ChipGlyph from '../themes/ChipGlyph';
import JokerGlyph from './JokerGlyph';
import AnimatedNumber from './AnimatedNumber';
import { serverNow } from '../../../lib/clockSync';
import { JOKER_TYPES } from '../lib/bjTypes';
import type { BjPublicState, BjYou } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  you: BjYou | null;
  theme: BjTheme;
  busy: boolean;
  onSkipVote: () => void;
  t: TFunction;
}

const CHAPTER_MS = 6_000;
const CHAPTERS = 11;

function Cards({ cards, theme, width = 84, flip }: { cards: string[]; theme: BjTheme; width?: number; flip?: boolean }) {
  return (
    <div className="flex">
      {cards.map((c, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -width * 0.34, zIndex: i }} className={flip && i === cards.length - 1 ? 'bj-tuto-flip' : ''}>
          <CardGlyph card={c} theme={theme} width={width} />
        </div>
      ))}
    </div>
  );
}

function Total({ value, color }: { value: number | string; color: string }) {
  return (
    <span className="rounded-full px-4 py-1.5 font-display text-3xl font-extrabold" style={{ background: 'rgba(0,0,0,0.6)', color }}>
      {value}
    </span>
  );
}

export default function TutorialOverlay({ state, you, theme, busy, onSkipVote, t }: Props) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((v) => v + 1), 400);
    return () => clearInterval(interval);
  }, []);

  const startedAt = state.phaseStartedAt ?? serverNow();
  const elapsed = Math.max(0, serverNow() - startedAt);
  const chapter = Math.min(CHAPTERS - 1, Math.floor(elapsed / CHAPTER_MS));
  const progress = Math.min(1, elapsed / (CHAPTERS * CHAPTER_MS));

  const seats = state.seats;
  const p1 = seats[0]?.pseudo ?? 'Marc';
  const p2 = seats[1]?.pseudo ?? 'Julie';
  const seated = you !== null && seats.some((s) => s.playerId === you.playerId);
  const voted = you?.skipVoted ?? false;
  const enabledJokers = JOKER_TYPES.filter((type) => state.config.jokersEnabled?.[type] !== false);

  const text = (key: string) =>
    t(`table.bj.tuto.${key}`)
      .replace('{p1}', p1)
      .replace('{p2}', p2)
      .replace('{prime}', String(state.config.prime));

  const scenes: ReactNode[] = [
    // 1. le but
    <div key="goal" className="flex items-center gap-10">
      <div className="flex flex-col items-center gap-2">
        <Cards cards={['Kh', '9s']} theme={theme} />
        <Total value={19} color={theme.hudAccent} />
        <span className="text-xl font-bold text-white/70">{p1}</span>
      </div>
      <span className="font-display text-6xl font-black text-white/60">VS</span>
      <div className="flex flex-col items-center gap-2">
        <Cards cards={['Td', '7c']} theme={theme} />
        <Total value={17} color="#EDF0F7" />
        <span className="text-xl font-bold text-white/70">{t('table.bj.dealer')}</span>
      </div>
    </div>,
    // 2. valeur des cartes
    <div key="values" className="flex items-end gap-6">
      {[
        ['As', '1 / 11'],
        ['Kd', '10'],
        ['Qc', '10'],
        ['7h', '7'],
      ].map(([card, value]) => (
        <div key={card} className="flex flex-col items-center gap-2">
          <CardGlyph card={card} theme={theme} width={88} />
          <Total value={value} color={theme.hudAccent} />
        </div>
      ))}
    </div>,
    // 3. tirer ou rester
    <div key="hitstand" className="flex items-center gap-12">
      <div className="flex flex-col items-center gap-2">
        <Cards cards={['9s', '7d', '4h']} theme={theme} flip />
        <Total value={20} color={theme.hudAccent} />
        <span className="text-lg font-bold uppercase text-white/60">{t('table.bj.tuto.hitGood')}</span>
      </div>
      <div className="flex flex-col items-center gap-2 opacity-90">
        <Cards cards={['Th', '6c', 'Kd']} theme={theme} />
        <Total value={26} color={theme.danger} />
        <span className="text-lg font-bold uppercase" style={{ color: theme.danger }}>
          {t('table.bj.tuto.hitBust')}
        </span>
      </div>
    </div>,
    // 4. le croupier
    <div key="dealer" className="flex flex-col items-center gap-3">
      <Cards cards={['??', '8s']} theme={theme} width={96} />
      <div className="rounded-full px-6 py-2.5 font-display text-2xl font-bold uppercase" style={{ background: 'rgba(0,0,0,0.6)', color: theme.feltText }}>
        {t('table.bj.felt.dealerRule')}
      </div>
    </div>,
    // 5. le score
    <div key="score" className="flex items-center gap-5">
      <div className="flex items-center gap-2">
        <ChipGlyph value={100} theme={theme} size={68} />
        <span className="font-display text-3xl font-bold text-white/85">{t('table.bj.tuto.chipsWord')}</span>
      </div>
      <span className="font-display text-5xl text-white/50">+</span>
      <span className="font-display text-3xl font-bold" style={{ color: theme.gold }}>
        {t('table.bj.tuto.roundsWord')}
      </span>
      <span className="font-display text-5xl text-white/50">=</span>
      <span className="rounded-2xl px-6 py-3 font-display text-5xl font-black" style={{ background: `${theme.hudAccent}22`, color: theme.hudAccent }}>
        <AnimatedNumber value={chapter >= 4 ? 900 : 500} durationMs={1600} />
      </span>
    </div>,
    // 6. la prime de manche
    <div key="prime" className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-1.5">
        <Cards cards={['Ks', 'Jd']} theme={theme} width={76} />
        <Total value={20} color={theme.gold} />
        <span className="text-lg font-bold text-white/70">{p1} · 2 {t('table.bj.tuto.cardsWord')}</span>
      </div>
      <div className="flex flex-col items-center gap-1.5 opacity-75">
        <Cards cards={['5h', '8c', '3s', '4d']} theme={theme} width={76} />
        <Total value={20} color="#EDF0F7" />
        <span className="text-lg font-bold text-white/60">{p2} · 4 {t('table.bj.tuto.cardsWord')}</span>
      </div>
      <span className="rounded-full px-6 py-3 font-display text-3xl font-black uppercase" style={{ background: `${theme.gold}26`, color: theme.gold }}>
        +{state.config.prime}
      </span>
    </div>,
    // 7. doubler
    <div key="double" className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <ChipGlyph value={50} theme={theme} size={60} />
        <span className="font-display text-5xl font-black" style={{ color: theme.gold }}>
          x2
        </span>
      </div>
      <Cards cards={['6h', '5s', '??']} theme={theme} flip />
    </div>,
    // 8. sauter n'est pas mourir
    <div key="bust" className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <div className="bj-hand-dimmed">
          <Cards cards={['Kh', '8d', '9c']} theme={theme} width={72} />
        </div>
        <Total value={27} color={theme.danger} />
      </div>
      <div className="flex items-center gap-2">
        {enabledJokers.slice(0, 2).map((type) => (
          <JokerGlyph key={type} type={type} theme={theme} width={72} t={t} compact />
        ))}
        <span className="ml-2 max-w-[300px] font-display text-2xl font-bold uppercase leading-tight" style={{ color: theme.hudAccent }}>
          {t('table.bj.tuto.bustKeep')}
        </span>
      </div>
    </div>,
    // 9. les jokers (principe)
    <div key="jokers" className="flex items-center gap-6">
      <div className="flex gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="h-12 w-9 rounded-[4px] border-2" style={{ background: theme.seatBg, borderColor: theme.hudAccent }} />
        ))}
      </div>
      <span className="max-w-[520px] text-center font-display text-2xl font-bold uppercase leading-snug text-white/85">
        {t('table.bj.tuto.jokersAnytime')}
      </span>
    </div>,
    // 10. les six jokers
    <div key="six" className="grid grid-cols-3 gap-5">
      {enabledJokers.map((type, i) => (
        <div key={type} className="bj-pop flex items-center gap-2" style={{ animationDelay: `${i * 350}ms` }}>
          <JokerGlyph type={type} theme={theme} width={64} t={t} compact />
          <div>
            <div className="font-display text-xl font-bold uppercase" style={{ color: theme.hudAccent }}>
              {t(`table.bj.joker.${type}`)}
            </div>
            <div className="max-w-[280px] text-base leading-tight text-white/65">{t(`table.bj.joker.${type}.desc`)}</div>
          </div>
        </div>
      ))}
    </div>,
    // 11. à vous
    <div key="go" className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {seats.map((s, i) => (
          <span
            key={s.playerId}
            className="bj-pop rounded-full px-6 py-2.5 font-display text-2xl font-bold uppercase"
            style={{ background: `${theme.hudAccent}1E`, color: theme.hudAccent, animationDelay: `${i * 240}ms` }}
          >
            {s.pseudo}
          </span>
        ))}
      </div>
    </div>,
  ];

  const titles = ['goal', 'values', 'hitstand', 'dealer', 'score', 'prime', 'double', 'bust', 'jokers', 'six', 'go'];

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center" style={{ background: 'rgba(3,5,12,0.93)' }}>
      {/* progression */}
      <div className="absolute left-1/2 top-8 w-[760px] -translate-x-1/2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress * 100}%`, background: theme.hudAccent }} />
        </div>
        <div className="mt-2 flex justify-between">
          {Array.from({ length: CHAPTERS }, (_, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i <= chapter ? theme.hudAccent : 'rgba(255,255,255,0.18)' }} />
          ))}
        </div>
      </div>

      {/* chapitre courant */}
      <div key={chapter} className="bj-chapter-in flex flex-col items-center gap-8 px-10">
        <div className="flex min-h-[260px] items-center justify-center">{scenes[chapter]}</div>
        <div className="max-w-[1240px] text-center font-display text-5xl font-bold leading-snug text-white">
          {text(titles[chapter])}
        </div>
      </div>

      {/* vote passer */}
      {seated && (
        <button
          className="absolute bottom-8 right-10 flex items-center gap-3 rounded-2xl border-2 px-9 py-5 font-display text-2xl font-bold uppercase active:scale-95"
          style={{
            borderColor: voted ? theme.hudAccent : 'rgba(255,255,255,0.28)',
            color: voted ? theme.hudAccent : '#EDF0F7',
            background: voted ? `${theme.hudAccent}14` : 'rgba(255,255,255,0.06)',
          }}
          disabled={busy || voted}
          onClick={onSkipVote}
        >
          <FastForward className="h-7 w-7" />
          {t('table.bj.tuto.skip')} ({state.skipVotes.length}/{seats.length})
        </button>
      )}
      {!seated && state.skipVotes.length > 0 && (
        <span className="absolute bottom-9 right-10 text-xl font-bold uppercase text-white/55">
          {t('table.bj.tuto.skip')} {state.skipVotes.length}/{seats.length}
        </span>
      )}
    </div>
  );
}
