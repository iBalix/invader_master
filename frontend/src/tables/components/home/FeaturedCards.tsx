/**
 * Cards "mises en avant" sur l'ecran d'accueil - VERSION OPTI mini-PC.
 *
 *   - Plus de backdrop-blur sur les cards (3 instances).
 *   - Plus de whileHover translate / scale image.
 *   - Plus de motion.div + AnimatePresence rotation pages : on fait
 *     un crossfade CSS simple (key change avec opacity transition).
 *   - Aspect "verre" via fond opaque sombre + bordure claire.
 *
 * Comportement clic :
 *   - Si `cta_target` est defini : la card est un <a>, clic = navigation.
 *   - Sinon : la card est un <button>, clic = ouvre une modale detail
 *     (image grand format + titre + sous-titre + description).
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { HomeFeatured } from '../../types';
import ArcadeModal from '../ui/ArcadeModal';

interface Props {
  items: HomeFeatured[];
  rotateMs?: number;
}

const PAGE_SIZE = 3;

export default function FeaturedCards({ items, rotateMs = 7000 }: Props) {
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<HomeFeatured | null>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(
      () => setPage((p) => (p + 1) % pageCount),
      rotateMs,
    );
    return () => window.clearInterval(id);
  }, [pageCount, rotateMs]);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-table-bg-elev/70 px-5 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/8 text-table-ink-muted">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg uppercase tracking-wider text-table-ink-soft">
            Pas de mise en avant
          </div>
          <div className="text-xs text-table-ink-muted">
            Ajoute un element dans Config ecrans &gt; Tables tactiles.
          </div>
        </div>
      </div>
    );
  }

  const start = page * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);

  return (
    <div className="relative">
      <div key={page} className="grid grid-cols-3 gap-3 animate-soft-pop">
        {visible.map((item) => (
          <FeaturedCard key={item.id} item={item} onSelect={setDetail} />
        ))}
        {visible.length < PAGE_SIZE &&
          Array.from({ length: PAGE_SIZE - visible.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-2xl border border-dashed border-white/8 bg-white/3"
            />
          ))}
      </div>

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === page ? 'w-6 bg-table-cyan' : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      <FeaturedDetailModal
        item={detail}
        open={detail !== null}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

interface CardProps {
  item: HomeFeatured;
  onSelect: (item: HomeFeatured) => void;
}

function FeaturedCard({ item, onSelect }: CardProps) {
  const card = (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-table-bg-elev/85 shadow-glass">
      <div className="relative h-28 w-full overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'linear-gradient(135deg, rgba(123,43,255,0.4), rgba(255,43,214,0.3))',
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 py-3">
        <div className="truncate font-display text-lg uppercase tracking-wider text-table-ink">
          {item.title}
        </div>
        {item.subtitle && (
          <div className="truncate text-sm text-table-ink-muted">
            {item.subtitle}
          </div>
        )}
      </div>
    </div>
  );

  if (item.cta_target) {
    return (
      <a href={item.cta_target} className="block h-full" draggable={false}>
        {card}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="block h-full w-full cursor-pointer text-left transition active:scale-[0.985]"
    >
      {card}
    </button>
  );
}

function FeaturedDetailModal({
  item,
  open,
  onClose,
}: {
  item: HomeFeatured | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;
  return (
    <ArcadeModal open={open} onClose={onClose} size="xl" title={item.title}>
      <div className="space-y-5">
        {item.image_url && (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <img
              src={item.image_url}
              alt={item.title}
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </div>
        )}

        {item.subtitle && (
          <div className="font-display text-lg uppercase tracking-wider text-table-ink-soft">
            {item.subtitle}
          </div>
        )}

        {item.description && (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-table-ink-soft">
            {item.description}
          </p>
        )}
      </div>
    </ArcadeModal>
  );
}
