/**
 * Ligne produit (layout horizontal) pour la Carte v2.
 *
 *   - Image carree a gauche.
 *   - Centre : tags, nom, sous-titre, description, pastilles variantes.
 *   - Droite :
 *       * si conditionings.length > 0 : cards horizontales (label en haut,
 *         prix gros au centre, bouton + en bas). Prix principal ignore.
 *       * sinon : prix (+ HH conditionnel) et bouton + global.
 *
 *   - HH actif + priceHh defini -> prix HH highlight jaune + prix normal barre.
 *   - HH inactif + priceHh defini -> mention discrete "Happy Hour: X€".
 */

import { Plus } from 'lucide-react';
import type { MenuProductV2, MenuConditioningV2 } from '../../hooks/useCarteV2';
import { formatPrice } from '../../lib/format';
import LucideIcon from '../../../lib/LucideIcon';
import { useT } from '../../i18n/useT';

interface Props {
  product: MenuProductV2;
  happyHour: boolean;
  qtyInCart: number;
  onSelect: () => void;
  onAdd: () => void;
  onAddConditioning?: (cond: MenuConditioningV2) => void;
  showAddButton?: boolean;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function ProductRow({
  product,
  happyHour,
  qtyInCart,
  onSelect,
  onAdd,
  onAddConditioning,
  showAddButton = true,
}: Props) {
  const t = useT();
  const conditionings = product.conditionings ?? [];
  const variants = product.variants ?? [];
  const tags = product.tags ?? [];
  const hasConditionings = conditionings.length > 0;

  const price = num(product.price);
  const priceHh = num(product.priceHh);
  const hhActive = happyHour && priceHh != null && price != null && priceHh > 0 && priceHh < price;
  const hasHhPriceVisible = priceHh != null && price != null && priceHh > 0 && priceHh < price;

  function stopAnd(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    };
  }

  return (
    <div
      onClick={onSelect}
      className="group relative flex cursor-pointer items-stretch gap-5 overflow-hidden rounded-2xl border border-white/10 bg-table-bg-elev/85 p-4 transition-transform duration-150 active:scale-[0.995]"
    >
      {qtyInCart > 0 && (
        <div className="absolute right-4 top-4 z-10 flex h-8 min-w-[2rem] items-center justify-center rounded-full border border-white/25 bg-table-magenta px-2 font-display text-sm text-white">
          x{qtyInCart}
        </div>
      )}

      {/*
        16:9 et non plus carre. Les photos produit sont fournies en 16:9 (1280x720
        cote stockage) : un cadre carre en rognait pres de la moitie de la largeur,
        et le meme visuel n'avait donc pas le meme cadrage ici et dans la fiche
        produit, qui est deja en 16:9. Meme hauteur qu'avant a 4 px pres, la ligne
        ne bouge pas.
      */}
      <div className="relative aspect-video w-64 shrink-0 overflow-hidden rounded-xl bg-black/30">
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
            {t('table.menu.noimage')}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs uppercase tracking-wider font-display"
                style={{
                  backgroundColor: t.color ? `${t.color}33` : 'rgba(255,255,255,0.08)',
                  color: t.color ?? 'rgba(255,255,255,0.85)',
                  border: t.color ? `1px solid ${t.color}66` : '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {t.iconName && <LucideIcon name={t.iconName} className="h-3.5 w-3.5" />}
                {t.name}
              </span>
            ))}
          </div>
        )}
        <div className="font-display text-2xl uppercase tracking-wider text-table-ink line-clamp-2 leading-tight">
          {product.name}
        </div>
        {product.subtitle && (
          <div className="mt-1.5 text-base text-table-ink-soft line-clamp-1">
            {product.subtitle}
          </div>
        )}
        {product.description && (
          <div className="mt-1.5 text-sm text-table-ink-muted line-clamp-3 leading-relaxed">
            {product.description}
          </div>
        )}

        {variants.length > 0 && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {variants.map((v) => (
              <span
                key={v.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs uppercase tracking-wider text-table-ink-soft"
                title={v.label}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/30"
                  style={{ backgroundColor: v.color ?? '#cccccc' }}
                />
                {v.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end">
        {hasConditionings ? (
          <div className="flex items-stretch gap-2">
            {conditionings.map((c) => {
              const cPrice = num(c.price) ?? 0;
              const cPriceHh = num(c.priceHh);
              const cHhActive = happyHour && cPriceHh != null && cPriceHh > 0 && cPriceHh < cPrice;
              const cHasHhVisible = cPriceHh != null && cPriceHh > 0 && cPriceHh < cPrice;
              return (
                <div
                  key={c.id}
                  className="flex w-24 flex-col items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-2 py-2.5"
                >
                  <span className="font-display text-xs uppercase tracking-wider text-table-ink-soft">
                    {c.label}
                  </span>
                  <div className="flex flex-col items-center leading-none">
                    {cHhActive ? (
                      <>
                        <span className="font-display text-2xl text-table-yellow">
                          {formatPrice(cPriceHh!)}
                        </span>
                        <span className="mt-0.5 text-[11px] text-table-ink-muted line-through">
                          {formatPrice(cPrice)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-display text-2xl text-table-ink">
                          {formatPrice(cPrice)}
                        </span>
                        {cHasHhVisible && (
                          <span className="mt-0.5 text-[10px] text-table-yellow/80">
                            HH&nbsp;{formatPrice(cPriceHh!)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {showAddButton && onAddConditioning && (
                    <button
                      type="button"
                      onClick={stopAnd(() => onAddConditioning(c))}
                      className="flex h-9 w-full items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep text-white shadow-neon-violet transition-transform active:scale-90"
                      aria-label={`Ajouter ${product.name} ${c.label}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              {hhActive ? (
                <>
                  <span className="font-display text-2xl text-table-yellow">
                    {formatPrice(priceHh!)}
                  </span>
                  <span className="text-xs text-table-ink-muted line-through">
                    {formatPrice(price!)}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-display text-2xl text-table-ink">
                    {price != null ? formatPrice(price) : '—'}
                  </span>
                  {!hhActive && hasHhPriceVisible && (
                    <span className="text-xs text-table-yellow/80">
                      Happy Hour&nbsp;: {formatPrice(priceHh!)}
                    </span>
                  )}
                </>
              )}
            </div>
            {showAddButton && (
              <button
                type="button"
                onClick={stopAnd(onAdd)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep text-white shadow-neon-violet transition-transform active:scale-90"
                aria-label={`Ajouter ${product.name}`}
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
