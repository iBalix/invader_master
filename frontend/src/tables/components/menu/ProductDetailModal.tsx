/**
 * Modale de detail produit (DA V3 launcher).
 *
 * Affiche :
 *   - Si product.videoUrl : video grand format en autoplay (muted),
 *     puis fondu vers product.imageUrl ~0.5s avant la fin.
 *   - Sinon : image grand format (object-contain, ratio natif).
 *   - Nom + sous-titre
 *   - Description complete
 *   - Prix (avec Happy Hour si applicable)
 *   - Selecteur quantite + bouton "Ajouter au panier"
 *
 * S'ouvre sur clic d'une ProductCard ; close = X / clic exterieur / Escape
 * (gere par ArcadeModal).
 */

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import type { MenuProduct } from '../../hooks/useCarte';
import { formatPrice } from '../../lib/format';
import { useT } from '../../i18n/useT';

// Duree (en secondes) avant la fin de la video a partir de laquelle on
// declenche le fondu vers l'image du produit.
const FADE_LEAD_TIME_S = 0.5;
// Duree CSS du fondu (doit rester proche de FADE_LEAD_TIME_S pour que le fondu
// se termine pile a la fin de la video).
const FADE_DURATION_MS = 500;

interface Props {
  open: boolean;
  product: MenuProduct | null;
  happyHour: boolean;
  qtyInCart: number;
  onClose: () => void;
  onAdd: (qty: number) => void;
}

export default function ProductDetailModal({
  open,
  product,
  happyHour,
  qtyInCart,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const [qty, setQty] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  // videoEnded : la video a fini ET il y a une image vers laquelle basculer
  // (la video est alors demontee, l'image reste seule).
  const [videoEnded, setVideoEnded] = useState(false);
  // videoFading : on est dans la phase de fondu vers l'image (les 0.5 dernieres s).
  const [videoFading, setVideoFading] = useState(false);

  useEffect(() => {
    if (open) {
      setQty(1);
      setVideoEnded(false);
      setVideoFading(false);
    } else {
      // Pause la video quand la modal se ferme pour ne pas la laisser tourner
      // pendant l'animation de sortie d'ArcadeModal.
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
        } catch {
          /* noop */
        }
      }
    }
  }, [open, product?.id]);

  if (!product) return null;

  const hasImage = Boolean(product.imageUrl);
  const hasVideo = Boolean(product.videoUrl);

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    // Pas de fondu si pas d'image cible : on laisse la video terminer
    // naturellement sur sa derniere frame.
    if (!hasImage) return;
    const remaining = v.duration - v.currentTime;
    if (Number.isFinite(remaining) && remaining <= FADE_LEAD_TIME_S && !videoFading) {
      setVideoFading(true);
    }
  }

  function handleVideoEnded() {
    // On ne demonte la video que si une image peut prendre le relais.
    if (hasImage) setVideoEnded(true);
  }

  function handleVideoError() {
    // Si la video echoue, on retombe immediatement sur l'image (ou le placeholder).
    setVideoEnded(true);
  }

  const price = Number(product.price ?? 0);
  const priceHh = product.priceHh != null ? Number(product.priceHh) : null;
  const hhActive = happyHour && priceHh != null && priceHh > 0 && priceHh < price;
  const unit = hhActive ? priceHh! : price;
  const total = unit * qty;

  function handleAdd() {
    onAdd(qty);
    onClose();
  }

  return (
    <ArcadeModal open={open} onClose={onClose} size="2xl">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr,1fr]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          {hasImage ? (
            <img
              src={product.imageUrl ?? undefined}
              alt={product.name}
              className="h-full w-full object-contain"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center font-display text-sm uppercase tracking-wider text-table-ink-muted"
              style={{
                background:
                  'linear-gradient(135deg, rgba(123,43,255,0.18), rgba(255,43,214,0.12))',
              }}
            >
              {t('table.menu.noImage', 'Pas d\'image')}
            </div>
          )}

          {hasVideo && !videoEnded && (
            <video
              ref={videoRef}
              // re-mount a chaque ouverture / changement de produit pour
              // garantir un replay propre depuis le debut.
              key={`${product.id}-${open ? 'open' : 'closed'}`}
              src={product.videoUrl ?? undefined}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain bg-black"
              style={{
                opacity: videoFading ? 0 : 1,
                transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
              }}
              autoPlay
              muted
              playsInline
              preload="auto"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
            />
          )}

          {hhActive && (
            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-table-yellow/40 bg-table-yellow/25 px-3 py-1.5 font-display text-[10px] uppercase tracking-widest text-table-yellow">
              <span className="h-1.5 w-1.5 rounded-full bg-table-yellow" />
              {t('table.menu.cart.happyhour')}
            </div>
          )}

          {qtyInCart > 0 && (
            <div className="absolute right-4 top-4 flex h-10 min-w-[2.5rem] items-center justify-center rounded-full border border-white/25 bg-table-magenta px-2.5 font-display text-sm text-white">
              x{qtyInCart}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h2 className="font-display text-3xl uppercase tracking-wider text-table-ink lg:text-4xl">
            {product.name}
          </h2>
          {product.subtitle && (
            <div className="mt-2 font-display text-base uppercase tracking-wider text-table-ink-soft">
              {product.subtitle}
            </div>
          )}

          {product.description && (
            <p className="mt-5 text-sm leading-relaxed text-table-ink-soft">
              {product.description}
            </p>
          )}

          <div className="mt-auto pt-6">
            <div className="flex items-baseline gap-3">
              {hhActive ? (
                <>
                  <span className="font-display text-4xl text-table-yellow">
                    {formatPrice(priceHh)}
                  </span>
                  <span className="font-display text-lg text-table-ink-muted line-through">
                    {formatPrice(price)}
                  </span>
                </>
              ) : (
                <span className="font-display text-4xl text-table-ink">
                  {formatPrice(price)}
                </span>
              )}
              <span className="ml-auto font-display text-xs uppercase tracking-widest text-table-ink-muted">
                {t('table.menu.unit', 'Prix unitaire')}
              </span>
            </div>

            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <span className="font-display text-xs uppercase tracking-widest text-table-ink-muted">
                {t('table.menu.quantity', 'Quantite')}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-table-ink transition-transform duration-150 active:scale-90"
                  aria-label="Moins"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className="min-w-[2.5rem] text-center font-display text-2xl tabular-nums text-table-ink">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-table-ink transition-transform duration-150 active:scale-90"
                  aria-label="Plus"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            <ArcadeButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleAdd}
              icon={<ShoppingCart className="h-5 w-5" />}
              className="mt-5"
            >
              {t('table.menu.addCart', 'Ajouter')} - {formatPrice(total)}
            </ArcadeButton>
          </div>
        </div>
      </div>
    </ArcadeModal>
  );
}
