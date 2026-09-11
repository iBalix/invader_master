/**
 * Classement d'une manche : rang / joueur / distance / temps / tuyaux /
 * badges, lignes de 64 px jusqu'à 10 joueurs. Au-delà (11 à 20), deux
 * colonnes de 10 côte à côte, lignes 56 px, texte 22 px, colonnes temps et
 * tuyaux retirées. Jamais de défilement.
 */

import { Crown } from 'lucide-react';
import type { TFunction } from '../../../i18n/useT';
import type { FlapRankingEntry, FlapRoundEnd } from '../lib/flapTypes';
import { formatDuration, formatMeters } from '../lib/format';

interface Props {
  ranking: FlapRankingEntry[];
  myPlayerId: string | null;
  endedBy: FlapRoundEnd;
  accent: string;
  t: TFunction;
}

const MEDALS = ['#E8C267', '#C7CCD9', '#B07B4F'];
const GOLD = '#E8C267';
const CYAN = '#33E2FF';

function Badge({ entry, compact, t }: { entry: FlapRankingEntry; compact: boolean; t: TFunction }) {
  const size = compact ? 'text-[16px] px-2.5 py-1' : 'text-[18px] px-3.5 py-1.5';
  if (entry.barRecord) {
    return (
      <span className={`flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider ${size}`} style={{ background: `${GOLD}26`, color: GOLD }}>
        <Crown className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
        {t('table.flap.results.barRecord', 'RECORD DU BAR')}
      </span>
    );
  }
  if (entry.personalBest) {
    return (
      <span className={`rounded-full font-bold uppercase tracking-wider ${size}`} style={{ background: `${CYAN}1F`, color: CYAN }}>
        {t('table.flap.results.personalBest', 'Record perso')}
      </span>
    );
  }
  if (entry.firstRecord) {
    return (
      <span className={`rounded-full font-bold uppercase tracking-wider ${size} bg-white/10 text-white/70`}>
        {t('table.flap.results.firstRecord', 'Premier record')}
      </span>
    );
  }
  return null;
}

export default function RoundResultsTable({ ranking, myPlayerId, endedBy, accent, t }: Props) {
  const compact = ranking.length > 10;
  const columns = compact ? [ranking.slice(0, 10), ranking.slice(10, 20)] : [ranking];
  const rowH = compact ? 56 : 64;
  const text = compact ? 'text-[22px]' : 'text-[26px]';
  const grid = compact ? 'grid-cols-[52px_1fr_140px_170px]' : 'grid-cols-[72px_1fr_240px_200px_160px_220px]';
  const endNote =
    endedBy === 'cap'
      ? t('table.flap.results.cap', 'Temps écoulé')
      : endedBy === 'terminated'
        ? t('table.flap.results.terminated', 'Partie arrêtée')
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-2">
        <span className="font-display text-[34px] uppercase tracking-wider text-white">{t('table.flap.results.title', 'Classement de la manche')}</span>
        {endNote && <span className="rounded-full bg-white/10 px-4 py-1 text-[20px] font-bold uppercase text-white/70">{endNote}</span>}
      </div>
      <div className={`grid gap-4 ${compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {columns.map((column, ci) => (
          <div key={ci} className="flex flex-col gap-1.5">
            <div className={`grid ${grid} items-center gap-3 px-4 text-[18px] font-bold uppercase tracking-wider text-white/45`}>
              <span />
              <span>{t('table.flap.results.player', 'Joueur')}</span>
              <span className="text-right">{t('table.flap.results.distance', 'Distance')}</span>
              {!compact && <span className="text-right">{t('table.flap.results.time', 'Temps')}</span>}
              {!compact && <span className="text-right">{t('table.flap.results.pipes', 'Tuyaux')}</span>}
              <span />
            </div>
            {column.map((entry) => {
              const rankColor = MEDALS[entry.rank - 1] ?? 'rgba(255,255,255,0.35)';
              const mine = entry.playerId === myPlayerId;
              return (
                <div
                  key={entry.playerId}
                  className={`grid ${grid} items-center gap-3 rounded-2xl border px-4 ${text}`}
                  style={{
                    height: rowH,
                    background: mine ? `${accent}1A` : 'rgba(255,255,255,0.04)',
                    borderColor: entry.rank === 1 ? GOLD : mine ? accent : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <span
                    className={`flex items-center justify-center rounded-full font-display ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}
                    style={{ border: `2px solid ${rankColor}`, color: rankColor, background: 'rgba(0,0,0,0.25)' }}
                  >
                    {entry.rank}
                  </span>
                  <span className="truncate font-display uppercase text-white">{entry.pseudo}</span>
                  <span className="text-right font-display text-white">{formatMeters(entry.distance, 1)} m</span>
                  {!compact && <span className="text-right text-white/75">{formatDuration(entry.timeMs)}</span>}
                  {!compact && <span className="text-right text-white/75">{entry.pipes}</span>}
                  <span className="flex justify-end">
                    <Badge entry={entry} compact={compact} t={t} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
