/**
 * Carte produit (DA V3 launcher) - VERSION COMPACTE.
 *
 *   - Format image 16:9 (aspect-video) plus tasse que le 4:3.
 *   - Padding et tailles de texte reduites pour pouvoir afficher
 *     2 lignes de cards sans scroll sur 1920x1080.
 *   - Click sur la carte = ouvre la modale de detail (onSelect)
 *   - Click sur le bouton + = ajoute 1 au panier sans ouvrir la modale (onAdd)
 *   - stopPropagation sur le bouton + pour eviter le double trigger
 */

import { Plus } from 'lucide-react';
import type { MenuProduct } from '../../hooks/useCarte';
import { formatPrice } from '../../lib/format';

interface Props {
  product: MenuProduct;
  happyHour: boolean;
  qtyInCart: number;
  onSelect: () => void;
  onAdd: () => void;
}

export default function ProductCard({ product, happyHour, qtyInCart, onSelect, onAdd }: Props) {
  const price = Number(product.price ?? 0);
  const priceHh = product.priceHh != null ? Number(product.priceHh) : null;
  const hhActive = happyHour && priceHh != null && priceHh > 0 && priceHh < price;

  function handleAddClick(e: React.MouseEvent) {
    e.stopPropagation();
    onAdd();
  }

  return (
    <div
      onClick={onSelect}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-table-bg-elev/85 transition-transform duration-150 active:scale-[0.99]"
    >
      {hhActive && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full border border-table-yellow/40 bg-table-yellow/20 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-table-yellow">
          <span className="h-1 w-1 rounded-full bg-table-yellow" />
          Happy Hour
        </div>
      )}

      {qtyInCart > 0 && (
        <div className="absolute right-2 top-2 z-10 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-white/25 bg-table-magenta px-1.5 font-display text-xs text-white">
          x{qtyInCart}
        </div>
      )}

      <div className="relative aspect-video w-full overflow-hidden bg-black/30">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display text-xs uppercase text-table-ink-muted"
            style={{
              background:
                'linear-gradient(135deg, rgba(123,43,255,0.25), rgba(255,43,214,0.15))',
            }}
          >
            Pas d'image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="font-display text-lg uppercase tracking-wider text-table-ink line-clamp-2 leading-tight">
          {product.name}
        </div>

        <div className="mt-auto flex items-end justify-between pt-2.5">
          <div className="flex items-baseline gap-1.5">
            {hhActive ? (
              <>
                <span className="font-display text-lg text-table-yellow">
                  {formatPrice(priceHh)}
                </span>
                <span className="text-[10px] text-table-ink-muted line-through">
                  {formatPrice(price)}
                </span>
              </>
            ) : (
              <span className="font-display text-lg text-table-ink">
                {formatPrice(price)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddClick}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep text-white shadow-neon-violet transition-transform duration-150 active:scale-90"
            aria-label={`Ajouter ${product.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
