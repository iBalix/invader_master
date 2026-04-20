/**
 * Bandeau d'evenement - VERSION OPTI mini-PC.
 *
 *   - Plus de motion.div + animations entree (one-shot CSS suffit).
 *   - Plus de backdrop-blur (banner = surface large).
 *   - Plus de animate-ping sur le pastille LIVE (anim infinie GPU-heavy).
 */

import { Calendar, Radio, Sparkles, ArrowRight } from 'lucide-react';
import type { LiveEventState, UpcomingEvent } from '../../types';

interface Props {
  liveEvent: LiveEventState;
  nextEvent: UpcomingEvent | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EventBanner({ liveEvent, nextEvent }: Props) {
  if (liveEvent.is_live) {
    const label =
      liveEvent.event_label || liveEvent.event_type?.toUpperCase() || 'EVENT EN COURS';
    return (
      <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-table-magenta/40 bg-gradient-to-r from-table-magenta/30 via-[#7A0F73]/40 to-table-violet/30 px-4 py-3.5 shadow-neon-magenta">
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 font-display text-[9px] uppercase tracking-widest text-white">
          <span className="h-2 w-2 rounded-full bg-table-magenta" />
          LIVE
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-table-ink">
          <Radio className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-retro text-[9px] uppercase tracking-widest text-white/70">
            {liveEvent.event_type ?? 'event'}
          </div>
          <div className="truncate font-display text-xl uppercase tracking-wider text-table-ink">
            {label}
          </div>
        </div>
        {liveEvent.redirect_url && (
          <button
            type="button"
            onClick={() => {
              window.location.href = liveEvent.redirect_url!;
            }}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-4 py-2 font-display text-sm uppercase tracking-wider text-table-ink transition hover:bg-white/25"
          >
            Rejoindre
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (nextEvent) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-table-bg-elev/85 px-4 py-3.5 shadow-glass">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-table-violet/40 text-table-ink">
          <Calendar className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-retro text-[9px] uppercase tracking-widest text-table-cyan">
            Prochain evenement
          </div>
          <div className="truncate font-display text-xl uppercase tracking-wider text-table-ink">
            {nextEvent.title || nextEvent.name || 'Evenement'}
          </div>
          <div className="truncate text-xs text-table-ink-muted">
            {formatDate(nextEvent.date)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-white/10 bg-table-bg-elev/70 px-4 py-3.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-table-ink-muted">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg uppercase tracking-wider text-table-ink-soft">
          Pas d'event a l'horizon
        </div>
        <div className="text-xs text-table-ink-muted">
          Reste branche, on en programme chaque semaine.
        </div>
      </div>
    </div>
  );
}
