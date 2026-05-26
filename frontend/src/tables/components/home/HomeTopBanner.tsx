/**
 * Bandeau haut de la home : l'evenement reste affiche en permanence ; une mise
 * en avant fait une apparition temporaire toutes les `featuredIntervalMs`.
 *
 * Animation orchestree (entree) :
 *   1. l'icone descend depuis le haut,
 *   2. le bloc (fond) se deploie vers la droite depuis derriere l'icone,
 *   3. le texte apparait.
 * Sortie (inverse) :
 *   1. le texte disparait, le bloc se replie vers la gauche,
 *   2. puis l'icone remonte.
 *
 * Optimise : scaleX (GPU) pour le fond, opacity/translate pour texte & icone.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Calendar, Radio, Sparkles, ArrowRight, Star } from 'lucide-react';
import type { FeaturedItem, LiveEventState, UpcomingEvent } from '../../types';
import { EASE_OUT_QUART } from '../../lib/motion';

const FEATURED_VISIBLE_MS = 6000;
const DEFAULT_INTERVAL_MS = 30000;

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

// ---- Variants orchestres (icone / fond / texte) ----
const iconVariants: Variants = {
  initial: { y: '-180%', opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, ease: EASE_OUT_QUART } },
  exit: { y: '-180%', opacity: 0, transition: { duration: 0.35, delay: 0.4, ease: EASE_OUT_QUART } },
};

const bgVariants: Variants = {
  initial: { scaleX: 0 },
  animate: { scaleX: 1, transition: { duration: 0.45, delay: 0.32, ease: EASE_OUT_QUART } },
  exit: { scaleX: 0, transition: { duration: 0.32, delay: 0.15, ease: EASE_OUT_QUART } },
};

const textVariants: Variants = {
  initial: { opacity: 0, x: -14 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, delay: 0.6, ease: EASE_OUT_QUART } },
  exit: { opacity: 0, x: -14, transition: { duration: 0.18, ease: EASE_OUT_QUART } },
};

const actionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3, delay: 0.7 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

interface Props {
  liveEvent: LiveEventState;
  nextEvent: UpcomingEvent | null;
  featured: FeaturedItem[];
  featuredIntervalMs?: number;
}

type Slide =
  | { kind: 'live' }
  | { kind: 'event' }
  | { kind: 'empty' }
  | { kind: 'featured'; item: FeaturedItem };

interface SlideParts {
  bgClass: string;
  icon: React.ReactNode;
  body: React.ReactNode;
  action?: React.ReactNode;
}

export default function HomeTopBanner({
  liveEvent,
  nextEvent,
  featured,
  featuredIntervalMs = DEFAULT_INTERVAL_MS,
}: Props) {
  const baseSlide: Slide = liveEvent.is_live
    ? { kind: 'live' }
    : nextEvent
      ? { kind: 'event' }
      : { kind: 'empty' };

  const [featuredIndex, setFeaturedIndex] = useState<number | null>(null);
  const cursorRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (liveEvent.is_live || featured.length === 0) {
      setFeaturedIndex(null);
      return;
    }
    let mounted = true;

    const showBase = () => {
      timerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        setFeaturedIndex(cursorRef.current % featured.length);
        showFeatured();
      }, featuredIntervalMs);
    };
    const showFeatured = () => {
      timerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        setFeaturedIndex(null);
        cursorRef.current = (cursorRef.current + 1) % featured.length;
        showBase();
      }, FEATURED_VISIBLE_MS);
    };

    showBase();
    return () => {
      mounted = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [liveEvent.is_live, featured, featuredIntervalMs]);

  const activeFeatured = featuredIndex != null ? featured[featuredIndex] ?? null : null;
  const slide: Slide = activeFeatured ? { kind: 'featured', item: activeFeatured } : baseSlide;
  const slideKey = slide.kind === 'featured' ? `featured-${slide.item.id}` : slide.kind;

  const parts = getSlideParts(slide, liveEvent, nextEvent);

  return (
    <div className="relative mx-auto h-24 w-full max-w-4xl">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={slideKey}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute inset-0 flex items-center"
        >
          {/* Fond qui se deploie depuis la gauche (derriere l'icone) */}
          <motion.div
            variants={bgVariants}
            style={{ originX: 0 }}
            className={['absolute inset-0 rounded-2xl border', parts.bgClass].join(' ')}
          />

          {/* Icone : descend en premier, par-dessus le fond */}
          <motion.div variants={iconVariants} className="relative z-[2] ml-3 shrink-0">
            {parts.icon}
          </motion.div>

          {/* Texte : apparait apres le deploiement */}
          <motion.div variants={textVariants} className="relative z-[2] ml-4 min-w-0 flex-1">
            {parts.body}
          </motion.div>

          {/* Action eventuelle (CTA / Rejoindre) */}
          {parts.action && (
            <motion.div variants={actionVariants} className="relative z-[2] mr-5 shrink-0">
              {parts.action}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function getSlideParts(
  slide: Slide,
  liveEvent: LiveEventState,
  nextEvent: UpcomingEvent | null,
): SlideParts {
  if (slide.kind === 'live') {
    const label = liveEvent.event_label || liveEvent.event_type?.toUpperCase() || 'EVENT EN COURS';
    return {
      bgClass: 'border-table-magenta/40 bg-gradient-to-r from-table-magenta/30 via-[#7A0F73]/40 to-table-violet/30 shadow-neon-magenta',
      icon: (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-table-ink">
          <Radio className="h-7 w-7" />
        </div>
      ),
      body: (
        <>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-2.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-white">
              <span className="h-2 w-2 rounded-full bg-table-magenta" /> LIVE
            </span>
            <span className="font-retro text-[11px] uppercase tracking-widest text-white/70">
              {liveEvent.event_type ?? 'event'}
            </span>
          </div>
          <div className="truncate font-display text-2xl uppercase tracking-wider text-table-ink">{label}</div>
        </>
      ),
      action: liveEvent.redirect_url ? (
        <button
          type="button"
          onClick={() => { window.location.href = liveEvent.redirect_url!; }}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-4 py-2.5 font-display text-base uppercase tracking-wider text-table-ink transition hover:bg-white/25"
        >
          Rejoindre <ArrowRight className="h-5 w-5" />
        </button>
      ) : undefined,
    };
  }

  if (slide.kind === 'event' && nextEvent) {
    return {
      bgClass: 'border-white/10 bg-table-bg-elev/85 shadow-glass',
      icon: (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-table-violet/40 text-table-ink">
          <Calendar className="h-7 w-7" />
        </div>
      ),
      body: (
        <>
          <div className="font-retro text-[11px] uppercase tracking-widest text-table-cyan">Prochain évènement</div>
          <div className="truncate font-display text-2xl uppercase tracking-wider text-table-ink">
            {nextEvent.title || nextEvent.name || 'Évènement'}
          </div>
          <div className="truncate text-sm text-table-ink-muted">{formatDate(nextEvent.date)}</div>
        </>
      ),
    };
  }

  if (slide.kind === 'featured') {
    const f = slide.item;
    return {
      bgClass: 'border-table-cyan/30 bg-table-bg-elev/85 shadow-glass',
      icon: f.image_url ? (
        <img src={f.image_url} alt={f.title} className="h-16 w-24 rounded-xl object-cover" draggable={false} />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-table-cyan/20 text-table-cyan">
          <Star className="h-7 w-7" />
        </div>
      ),
      body: (
        <>
          <div className="font-retro text-[11px] uppercase tracking-widest text-table-cyan">À l'affiche</div>
          <div className="truncate font-display text-2xl uppercase tracking-wider text-table-ink">{f.title}</div>
          {f.subtitle && <div className="truncate text-sm text-table-ink-muted">{f.subtitle}</div>}
        </>
      ),
      action: f.cta_label && f.cta_target ? (
        <a
          href={f.cta_target}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-display text-base uppercase tracking-wider text-table-ink transition hover:bg-white/20"
        >
          {f.cta_label} <ArrowRight className="h-5 w-5" />
        </a>
      ) : undefined,
    };
  }

  // empty
  return {
    bgClass: 'border-dashed border-white/10 bg-table-bg-elev/70',
    icon: (
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/5 text-table-ink-muted">
        <Sparkles className="h-6 w-6" />
      </div>
    ),
    body: (
      <>
        <div className="font-display text-xl uppercase tracking-wider text-table-ink-soft">Pas d'event à l'horizon</div>
        <div className="text-sm text-table-ink-muted">Reste branché, on en programme chaque semaine.</div>
      </>
    ),
  };
}
