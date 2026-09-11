/**
 * Panneau permanent « Records du bar » : top N des meilleures performances
 * par pseudo pour un jeu. Générique : le jeu fournit son mode, son titre,
 * son accent et, s'il le veut, ses formats de score et de détails.
 *
 * Dalles vues de biais : rangées de 68 px, pseudo 28 px, score 34 px. Dix
 * rangées tiennent dans la colonne de droite d'un lobby 1080p sans défiler.
 * La ligne de la dalle (pseudo identique, casse ignorée) est cerclée de cyan.
 */

import { Trophy } from 'lucide-react';
import AnimatedGrid, { AnimatedGridItem } from '../ui/AnimatedGrid';
import RetroLoader from '../ui/RetroLoader';
import { useBarRecords, type BarRecordItem } from '../../hooks/useBarRecords';
import { useLocaleStore } from '../../i18n/localeStore';
import { useT } from '../../i18n/useT';
import { formatMeters, formatRelativeDay } from '../../games/flappybar/lib/format';

interface Props {
  /** identifiant du jeu côté API : GET /public/<mode>/records */
  mode: string;
  title: string;
  limit?: number;
  /** pseudo de la dalle : sa ligne est mise en avant */
  highlightPseudo?: string | null;
  /** couleur du score et du trophée */
  accent?: string;
  formatScore?: (item: BarRecordItem) => string;
  /** ligne secondaire sous le pseudo ; null pour ne rien afficher */
  formatDetails?: (item: BarRecordItem) => string | null;
  /** textes de l'état vide ; par défaut les libellés génériques */
  emptyTitle?: string;
  emptySub?: string;
  className?: string;
}

const MEDALS: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#E8C267', fg: '#2A1D05' },
  2: { bg: '#C7CCD9', fg: '#1B1F2A' },
  3: { bg: '#B07B4F', fg: '#2A1608' },
};

function defaultFormatScore(item: BarRecordItem, locale: 'fr' | 'en'): string {
  if (item.unit === 'm') return `${formatMeters(item.score, 1, locale)} m`;
  return item.unit ? `${item.score} ${item.unit}` : String(item.score);
}

export default function BarRecordsPanel({
  mode,
  title,
  limit = 10,
  highlightPseudo,
  accent = '#FFE955',
  formatScore,
  formatDetails,
  emptyTitle,
  emptySub,
  className = '',
}: Props) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const { items, loading, error } = useBarRecords(mode, limit);
  const mine = (highlightPseudo ?? '').trim().toLowerCase();
  const rows = items.slice(0, limit);
  // les rangées ne se réaniment que quand le classement change vraiment
  const signature = rows.map((r) => `${r.rank}:${r.pseudo}:${r.score}`).join('|');

  let body: React.ReactNode;
  if (loading && rows.length === 0) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <RetroLoader label={t('table.common.loading', 'LOADING')} />
      </div>
    );
  } else if (rows.length === 0) {
    const unavailable = error !== null;
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <Trophy className="h-24 w-24 text-table-ink-muted/60" strokeWidth={1.25} />
        <div className="font-display text-[26px] uppercase leading-tight tracking-wide text-table-ink-soft">
          {unavailable ? t('table.records.unavailable', 'Records indisponibles') : emptyTitle ?? t('table.records.empty', "Aucun record pour l'instant")}
        </div>
        <div className="text-[20px] leading-snug text-table-ink-muted">
          {unavailable ? t('table.records.retrying', 'Nouvelle tentative en cours...') : emptySub ?? t('table.records.emptySub', 'Sois le premier à marquer le bar')}
        </div>
      </div>
    );
  } else {
    body = (
      <AnimatedGrid resetKey={signature} className="tables-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {rows.map((item) => {
          const isMine = mine !== '' && item.pseudo.trim().toLowerCase() === mine;
          const medal = MEDALS[item.rank];
          const details = formatDetails ? formatDetails(item) : null;
          const score = formatScore ? formatScore(item) : defaultFormatScore(item, locale);
          return (
            <AnimatedGridItem key={`${item.rank}-${item.pseudo}`}>
              <div
                className={`flex h-[68px] items-center gap-4 rounded-2xl px-3 ${
                  isMine ? 'bg-table-cyan/10 ring-2 ring-table-cyan/80' : 'bg-white/[0.03]'
                }`}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-[24px] leading-none"
                  style={
                    medal
                      ? { background: medal.bg, color: medal.fg, boxShadow: `0 0 14px ${medal.bg}55` }
                      : { background: 'rgba(255,255,255,0.08)', color: '#7E78A6' }
                  }
                >
                  {item.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[28px] uppercase leading-tight tracking-wide text-table-ink">
                    {item.pseudo}
                  </div>
                  {details && <div className="truncate text-[20px] leading-tight text-table-ink-muted">{details}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-display text-[34px] leading-none tabular-nums" style={{ color: accent }}>
                    {score}
                  </span>
                  <span className="mt-1 text-[18px] leading-none text-table-ink-muted">
                    {formatRelativeDay(item.achievedAt, locale)}
                  </span>
                </div>
              </div>
            </AnimatedGridItem>
          );
        })}
      </AnimatedGrid>
    );
  }

  return (
    <section className={`flex min-h-0 flex-col rounded-3xl border border-white/12 bg-table-bg-elev/80 p-5 ${className}`}>
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <Trophy className="h-8 w-8 shrink-0" style={{ color: accent }} />
        <h2 className="truncate font-display text-[30px] uppercase leading-none tracking-wider text-table-ink">{title}</h2>
      </header>
      {body}
    </section>
  );
}
