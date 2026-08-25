/**
 * Bloc fixe affiche en bas de la sidebar Menu. Reprend les horaires HH depuis
 * carte_settings et pulse quand la fenetre est active.
 */

import { useLocaleStore } from '../../i18n/localeStore';
import { useT } from '../../i18n/useT';

interface Props {
  start: string;
  end: string;
  days: string[];
  active: boolean;
}

const JOURS: Record<'fr' | 'en', Record<string, string>> = {
  fr: { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' },
  en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
};

function formatTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function formatDays(days: string[], locale: 'fr' | 'en', tousLesJours: string): string {
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const noms = JOURS[locale] ?? JOURS.fr;
  const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (sorted.length === 7) return tousLesJours;
  // contiguite ?
  const indices = sorted.map((d) => order.indexOf(d));
  const contiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (contiguous && sorted.length >= 2) {
    return `${noms[sorted[0]]}-${noms[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => noms[d]).join(' · ');
}

export default function HappyHourSidebarBlock({ start, end, days, active }: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useT();
  return (
    <>
      <style>{`
        @keyframes hh-block-glow {
          0%, 100% {
            box-shadow:
              0 0 18px 0 rgba(255, 43, 214, 0.55),
              0 0 36px 0 rgba(255, 43, 214, 0.25);
          }
          50% {
            box-shadow:
              0 0 28px 4px rgba(255, 43, 214, 0.7),
              0 0 56px 12px rgba(123, 43, 255, 0.35);
          }
        }
      `}</style>
      <div
        className={[
          'mx-3 mb-3 mt-1 shrink-0 overflow-hidden rounded-2xl border px-4 py-3 transition-all duration-300',
          'border-white/30 bg-gradient-to-br from-table-magenta via-[#D63FCD] to-table-violet text-white',
        ].join(' ')}
        style={
          active
            ? { animation: 'hh-block-glow 2.8s ease-in-out infinite' }
            : { boxShadow: '0 0 14px 0 rgba(255, 43, 214, 0.35)' }
        }
      >
        <div className="flex items-center gap-1.5">
          {active && (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full bg-white"
              style={{ animation: 'sidebar-live-dot 1.6s ease-out infinite' }}
            />
          )}
          <div className="font-display text-[11px] uppercase tracking-[0.3em] text-white/90">
            Happy Hour
          </div>
        </div>
        <div className="mt-1 font-display text-lg leading-tight text-white">
          {formatTime(start)} → {formatTime(end)}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/75">
          {formatDays(days, locale, t('table.menu.happyhour.everyday', 'Tous les jours'))}
        </div>
      </div>
    </>
  );
}
