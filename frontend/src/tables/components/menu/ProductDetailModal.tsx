/**
 * Modale de detail produit (DA V3 launcher).
 *
 * Affiche :
 *   - Image grand format (object-contain pour respecter le ratio natif)
 *   - Nom + sous-titre
 *   - Description complete
 *   - Prix (avec Happy Hour si applicable)
 *   - Selecteur quantite + bouton "Ajouter au panier"
 *
 * S'ouvre sur clic d'une ProductCard ; close = X / clic exterieur / Escape
 * (gere par ArcadeModal).
 */

import { useEffect, useState } from 'react';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import type { MenuProduct } from '../../hooks/useCarte';
import { formatPrice } from '../../lib/format';
import { useT } from '../../i18n/useT';

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

  useEffect(() => {
    if (open) setQty(1);
  }, [open, product?.id]);

  if (!product) return null;

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
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
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
