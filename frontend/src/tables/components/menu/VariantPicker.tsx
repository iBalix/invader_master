/**
 * Modale de selection d'une variante avant ajout au panier.
 * Visible quand le produit a au moins une variante et qu'on clique sur "+".
 */

import { X } from 'lucide-react';
import type { MenuVariantV2, MenuConditioningV2 } from '../../hooks/useCarteV2';

interface Props {
  productName: string;
  variants: MenuVariantV2[];
  conditioning?: MenuConditioningV2 | null;
  onSelect: (variant: MenuVariantV2) => void;
  onClose: () => void;
}

export default function VariantPicker({ productName, variants, conditioning, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-white/15 bg-table-bg-soft p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-table-ink-soft hover:bg-white/10 hover:text-table-ink"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-table-ink-muted">
            Choisir une variante
          </p>
          <h2 className="mt-1 font-display text-2xl uppercase tracking-wider text-table-ink">
            {productName}
          </h2>
          {conditioning && (
            <p className="mt-1 text-sm text-table-ink-soft">
              {conditioning.label}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v)}
              className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 active:scale-[0.98]"
            >
              <span
                className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-white/30"
                style={{ backgroundColor: v.color ?? '#cccccc' }}
              />
              <span className="font-display text-base uppercase tracking-wider text-table-ink">
                {v.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
