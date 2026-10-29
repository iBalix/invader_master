/**
 * Classement d'une manche : rang / joueur / score / vague / envahisseurs /
 * soucoupes / temps / badges. Huit joueurs au plus : lignes de 64 px, jamais
 * de défilement.
 */

import { Crown } from 'lucide-react';
import type { TFunction } from '../../../i18n/useT';
import type { InvRankingEntry, InvRoundEnd } from '../lib/invTypes';
import { formatDuration, formatScore } from '../lib/format';

interface Props {
  ranking: InvRankingEntry[];
  myPlayerId: string | null;
  endedBy: InvRoundEnd;
  accent: string;
  t: TFunction;
  /** sans les colonnes secondaires (colonne étroite) */
  compact?: boolean;
}

const MEDALS = ['#E8C267', '#C7CCD9', '#B07B4F'];
const GOLD = '#E8C267';
const CYAN = '#33E2FF';

function Badge({ entry, t }: { entry: InvRankingEntry; t: TFunction }) {
  const size = 'text-[17px] px-3.5 py-1.5';
  if (entry.barRecord) {
    return (
      <span className={`flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider ${size}`} style={{ background: `${GOLD}26`, color: GOLD }}>
        <Crown className="h-5 w-5" />
        {t('table.inv.results.barRecord', 'RECORD DU BAR')}
      </span>
    );
  }
  if (entry.personalBest) {
    return (
      <span className={`rounded-full font-bold uppercase tracking-wider ${size}`} style={{ background: `${CYAN}1F`, color: CYAN }}>
        {t('table.inv.results.personalBest', 'Record perso')}
      </span>
    );
  }
  if (entry.firstRecord) {
    return (
      <span className={`rounded-full font-bold uppercase tracking-wider ${size} bg-white/10 text-white/70`}>
        {t('table.inv.results.firstRecord', 'Premier record')}
      </span>
    );
  }
  return null;
}

export default function RoundResultsTable({ ranking, myPlayerId, endedBy, accent, t, compact = false }: Props) {
  const grid = compact
    ? 'grid-cols-[60px_minmax(0,1fr)_170px_90px]'
    : 'grid-cols-[56px_minmax(0,1fr)_150px_80px_110px_130px_90px_196px]';
  const endNote =
    endedBy === 'cap'
      ? t('table.inv.results.cap', 'Temps écoulé')
      : endedBy === 'terminated'
        ? t('table.inv.results.terminated', 'Partie arrêtée')
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-2">
        <span className="font-display text-[34px] uppercase tracking-wider text-white">{t('table.inv.results.title', 'Classement de la manche')}</span>
        {endNote && <span className="rounded-full bg-white/10 px-4 py-1 text-[20px] font-bold uppercase text-white/70">{endNote}</span>}
      </div>
      <div className={`grid ${grid} items-center gap-3 px-4 text-[16px] font-bold uppercase tracking-wide text-white/45`}>
        <span />
        <span>{t('table.inv.results.player', 'Joueur')}</span>
        <span className="text-right">{t('table.inv.results.score', 'Score')}</span>
        <span className="text-right">{t('table.inv.results.wave', 'Vague')}</span>
        {!compact && <span className="text-right">{t('table.inv.results.kills', 'Abattus')}</span>}
        {!compact && <span className="text-right">{t('table.inv.results.ufo', 'Soucoupes')}</span>}
        {!compact && <span className="text-right">{t('table.inv.results.time', 'Temps')}</span>}
        {!compact && <span />}
      </div>
      <div className="flex flex-col gap-1.5">
        {ranking.map((entry) => {
          const rankColor = MEDALS[entry.rank - 1] ?? 'rgba(255,255,255,0.35)';
          const mine = entry.playerId === myPlayerId;
          return (
            <div
              key={entry.playerId}
              className={`grid ${grid} h-[64px] items-center gap-3 rounded-2xl border px-4 text-[26px]`}
              style={{
                background: mine ? `${accent}1A` : 'rgba(255,255,255,0.04)',
                borderColor: entry.rank === 1 ? GOLD : mine ? accent : 'rgba(255,255,255,0.1)',
              }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full font-display"
                style={{ border: `2px solid ${rankColor}`, color: rankColor, background: 'rgba(0,0,0,0.25)' }}
              >
                {entry.rank}
              </span>
              <span className="truncate font-display uppercase text-white">{entry.pseudo}</span>
              <span className="text-right font-retro text-[22px] text-white">{formatScore(entry.score)}</span>
              <span className="text-right text-white/80">{entry.wave}</span>
              {!compact && <span className="text-right text-white/75">{entry.kills}</span>}
              {!compact && <span className="text-right text-white/75">{entry.ufoHits}</span>}
              {!compact && <span className="text-right text-white/75">{formatDuration(entry.timeMs)}</span>}
              {!compact && (
                <span className="flex justify-end">
                  <Badge entry={entry} t={t} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
