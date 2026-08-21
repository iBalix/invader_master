/**
 * Fin de partie : podium, titres rigolos, bouton Revanche qui rassoit tout
 * le monde avec la même configuration. Rien ne doit se trouver entre la fin
 * et ce bouton.
 */

import { RotateCcw, LogOut, Trophy } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
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

const STEP_HEIGHT = [150, 104, 72];

export default function GameOverOverlay({ state, you, theme, busy, onRematch, onExit, t }: Props) {
  const result = state.result;
  if (!result) return null;
  const podium = result.podium;
  const top3 = podium.slice(0, 3);
  // ordre visuel du podium : 2e, 1er, 3e
  const visual = [top3[1], top3[0], top3[2]].filter(Boolean);
  const offered = you !== null && (state.rematch?.offers.includes(you.playerId) ?? false);
  const offerCount = state.rematch?.offers.length ?? 0;
  const medals = [theme.gold, '#C7CCD9', '#B07B4F'];

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-7" style={{ background: 'rgba(3,5,12,0.93)' }}>
      <div className="flex items-center gap-4 font-display text-6xl font-black uppercase tracking-wider" style={{ color: theme.gold }}>
        <Trophy className="h-14 w-14" />
        {t('table.bj.end.title')}
      </div>

      {/* podium */}
      <div className="flex items-end gap-4">
        {visual.map((entry, vi) => {
          const rank = podium.indexOf(entry);
          return (
            <div key={entry.playerId} className="bj-pop flex flex-col items-center gap-2" style={{ animationDelay: `${(2 - vi) * 260}ms` }}>
              <span className="max-w-[280px] truncate font-display text-3xl font-extrabold uppercase" style={{ color: rank === 0 ? theme.gold : '#EDF0F7' }}>
                {entry.pseudo}
              </span>
              <span className="font-display text-4xl font-black" style={{ color: theme.hudAccent }}>
                {entry.score}
              </span>
              <div
                className="flex w-52 items-start justify-center rounded-t-2xl pt-3 font-display text-4xl font-black"
                style={{ height: STEP_HEIGHT[rank] ?? 40, background: `${medals[rank]}30`, border: `2px solid ${medals[rank]}`, color: medals[rank] }}
              >
                {rank + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* reste du classement */}
      {podium.length > 3 && (
        <div className="flex flex-wrap justify-center gap-2">
          {podium.slice(3).map((entry, i) => (
            <span key={entry.playerId} className="rounded-full bg-white/8 px-5 py-2.5 text-xl font-bold text-white/75">
              {i + 4}. {entry.pseudo} · {entry.score}
            </span>
          ))}
        </div>
      )}

      {/* titres */}
      {result.titles.length > 0 && (
        <div className="flex max-w-[900px] flex-wrap justify-center gap-2">
          {result.titles.map((title, i) => (
            <span
              key={`${title.playerId}-${title.titleKey}`}
              className="bj-pop rounded-full px-5 py-2.5 text-xl font-bold"
              style={{ background: `${theme.hudAccent}18`, color: theme.hudAccent, animationDelay: `${900 + i * 180}ms` }}
            >
              {title.pseudo} · {t(title.titleKey)}
              {title.titleKey.endsWith('banco') ? ` (+${title.value})` : title.value > 1 ? ` x${title.value}` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-4">
        {you && (
          <ArcadeButton
            variant="accent"
            size="xl"
            icon={<RotateCcw className="h-5 w-5" />}
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
