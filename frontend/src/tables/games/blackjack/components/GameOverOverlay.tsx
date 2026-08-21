/**
 * Fin de partie : un CLASSEMENT clair, ligne par ligne, avec la composition
 * du score (manches gagnées x prime + jetons = total), puis les hauts faits
 * en liste avec leur picto. Le bouton Revanche rassoit tout le monde avec la
 * même configuration : rien ne doit se trouver entre la fin et lui.
 */

import { Coins, Crown, Flame, LogOut, RotateCcw, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ChipGlyph from '../themes/ChipGlyph';
import type { BjPublicState, BjYou } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  you: BjYou | null;
  theme: BjTheme;
  busy: boolean;
  onRematch: () => void;
  onExit: () => void;
  t: TFunction;
}

const TITLE_ICONS: Record<string, typeof Flame> = {
  'table.bj.title.banco': Coins,
  'table.bj.title.blackjacks': Sparkles,
  'table.bj.title.busts': Flame,
  'table.bj.title.jokers': Zap,
  'table.bj.title.twentyones': Target,
};

const RANK_COLORS = ['#E8C267', '#C7CCD9', '#B07B4F'];

export default function GameOverOverlay({ state, you, theme, busy, onRematch, onExit, t }: Props) {
  const result = state.result;
  if (!result) return null;
  const podium = result.podium;
  const prime = state.config.prime;
  const offered = you !== null && (state.rematch?.offers.includes(you.playerId) ?? false);
  const offerCount = state.rematch?.offers.length ?? 0;
  const grid = 'grid grid-cols-[72px_1fr_300px_190px_190px] items-center gap-3';

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 overflow-y-auto py-8" style={{ background: 'rgba(3,5,12,0.95)' }}>
      <div className="flex items-center gap-4 font-display text-5xl font-black uppercase tracking-wider" style={{ color: theme.gold }}>
        <Trophy className="h-12 w-12" />
        {t('table.bj.end.title')}
      </div>

      {/* le classement, ligne par ligne, score décomposé */}
      <div className="flex w-[1060px] flex-col gap-2.5">
        <div className={`${grid} px-5 text-base font-bold uppercase tracking-wider text-white/40`}>
          <span />
          <span />
          <span>{t('table.bj.end.hRounds')}</span>
          <span>{t('table.bj.end.hChips')}</span>
          <span className="text-right">{t('table.bj.end.hScore')}</span>
        </div>
        {podium.map((entry, i) => {
          const first = i === 0;
          const rankColor = RANK_COLORS[i] ?? 'rgba(255,255,255,0.35)';
          return (
            <div
              key={entry.playerId}
              className={`${grid} bj-pop rounded-2xl border px-5 py-3.5`}
              style={{
                animationDelay: `${i * 140}ms`,
                background: first ? `${theme.gold}14` : 'rgba(255,255,255,0.04)',
                borderColor: first ? theme.gold : 'rgba(255,255,255,0.12)',
                borderWidth: first ? 2 : 1,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full font-display text-2xl font-black"
                style={{ border: `2px solid ${rankColor}`, color: rankColor, background: 'rgba(0,0,0,0.25)' }}
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                {first && <Crown className="h-7 w-7 shrink-0" style={{ color: theme.gold }} />}
                <span className="truncate font-display text-3xl font-extrabold uppercase" style={{ color: first ? theme.gold : '#EDF0F7' }}>
                  {entry.pseudo}
                </span>
              </span>
              <span className="text-xl text-white/80">
                <span className="font-display font-bold" style={{ color: entry.roundsWon > 0 ? theme.gold : 'rgba(255,255,255,0.4)' }}>
                  {entry.roundsWon}★
                </span>
                {entry.roundsWon > 0 && (
                  <span className="text-white/55">
                    {' '}
                    × {prime} = <span className="font-bold text-white/85">+{entry.roundsWon * prime}</span>
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 text-xl font-bold text-white/85">
                <ChipGlyph value={100} theme={theme} size={26} />
                {entry.chips}
              </span>
              <span className="flex items-center justify-end gap-2 font-display text-3xl font-black" style={{ color: first ? theme.gold : theme.hudAccent }}>
                <Trophy className="h-6 w-6" />
                {entry.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* les hauts faits, en liste claire */}
      {result.titles.length > 0 && (
        <div className="flex w-[1060px] flex-col gap-2.5">
          <span className="text-base font-bold uppercase tracking-[0.2em] text-white/40">{t('table.bj.end.titles')}</span>
          <div className={`grid gap-x-12 gap-y-2.5 ${result.titles.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {result.titles.map((title, i) => {
              const Icon = TITLE_ICONS[title.titleKey] ?? Sparkles;
              return (
                <div key={`${title.playerId}-${title.titleKey}`} className="bj-pop flex items-center gap-3 text-xl" style={{ animationDelay: `${500 + i * 150}ms` }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `${theme.hudAccent}1A`, border: `1.5px solid ${theme.hudAccent}55` }}>
                    <Icon className="h-6 w-6" style={{ color: theme.hudAccent }} />
                  </span>
                  <span className="text-white/90">
                    <span className="font-display font-bold" style={{ color: theme.hudAccent }}>
                      {title.pseudo}
                    </span>{' '}
                    · {t(title.titleKey)}
                    <span className="text-white/50">
                      {title.titleKey.endsWith('banco') ? ` (+${title.value})` : title.value > 1 ? ` x${title.value}` : ''}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center gap-4">
        {you && (
          <ArcadeButton
            variant="accent"
            size="xl"
            icon={<RotateCcw className="h-6 w-6" />}
            disabled={busy || offered}
            onClick={onRematch}
          >
            {offered ? t('table.bj.end.rematchWaiting') : t('table.bj.end.rematch')}
            {offerCount > 0 ? ` (${offerCount})` : ''}
          </ArcadeButton>
        )}
        <ArcadeButton variant="ghost" size="xl" icon={<LogOut className="h-6 w-6" />} onClick={onExit}>
          {t('table.bj.end.exit')}
        </ArcadeButton>
      </div>
    </div>
  );
}
