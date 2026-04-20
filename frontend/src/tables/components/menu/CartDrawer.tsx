/**
 * Drawer du panier (DA V3 launcher glass).
 *
 * Glass dark + neon. Calcul preview backend en debounce 300ms.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Trash2, X, AlertTriangle, Star, CheckCircle2 } from 'lucide-react';
import { useCart } from '../../store/cartStore';
import { tablesApi } from '../../lib/tablesApi';
import { formatPrice } from '../../lib/format';
import type { PricedCart } from '../../types';
import ArcadeButton from '../ui/ArcadeButton';
import GoogleReviewModal from './GoogleReviewModal';
import CouponModal from './CouponModal';
import { EASE_OUT_QUART } from '../../lib/motion';

interface Props {
  open: boolean;
  onClose: () => void;
  hostname: string;
  onCheckout: (priced: PricedCart) => void;
}

export default function CartDrawer({ open, onClose, hostname, onCheckout }: Props) {
  const { items, couponCode, setQty, remove, setCoupon, clear } = useCart();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);

  const payload = useMemo(
    () => ({
      items: items.map((i) => ({ productId: String(i.productId), quantity: i.qty })),
      couponCode,
    }),
    [items, couponCode]
  );

  useEffect(() => {
    if (!open) {
      setReviewOpen(false);
      setCouponOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (items.length === 0) {
      setPriced(null);
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await tablesApi.post<PricedCart>(
          `/${hostname}/orders/preview`,
          payload
        );
        setPriced(data);
      } catch {
        setPriced(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, hostname, payload, items.length]);

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="flex-1 bg-black/70"
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: EASE_OUT_QUART }}
            className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-table-bg-elev shadow-glass"
          >
            {/* halo violet doux gauche */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-32 opacity-60"
              style={{
                background:
                  'linear-gradient(90deg, rgba(123,43,255,0.25), transparent)',
              }}
            />

            <header className="relative flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="font-display text-2xl uppercase tracking-wider text-table-ink">
                Ma commande
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/8 text-table-ink transition hover:bg-white/14"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="tables-scroll relative min-h-0 flex-1 overflow-y-auto p-5">
              {items.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-table-ink-muted">
                  <div className="font-display text-2xl uppercase text-table-ink-soft">
                    Panier vide
                  </div>
                  <div className="text-sm">
                    Touche un produit pour l'ajouter a ta commande.
                  </div>
                </div>
              )}

              <ul className="space-y-3">
                {items.map((item) => {
                  const pricedItem = priced?.items.find(
                    (p) => p.productId === String(item.productId)
                  );
                  const basePrice = pricedItem?.unitPrice ?? item.unitPrice;
                  const unit = pricedItem?.appliedPrice ?? item.unitPrice;
                  const hh = pricedItem?.happyHourApplied ?? false;
                  return (
                    <li
                      key={item.productId}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-14 w-14 shrink-0 rounded-xl border border-white/15 object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-display text-sm uppercase tracking-wider text-table-ink">
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-1.5">
                          {hh ? (
                            <>
                              <span className="font-display text-sm text-table-yellow">
                                {formatPrice(unit)}
                              </span>
                              <span className="text-[10px] text-table-ink-muted/70 line-through">
                                {formatPrice(basePrice)}
                              </span>
                              <span className="rounded-full bg-table-yellow/20 px-1.5 py-0.5 text-[9px] font-display uppercase tracking-wider text-table-yellow">
                                HH
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-table-ink-muted">
                              {formatPrice(unit)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQty(item.productId, item.qty - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-table-ink hover:bg-white/12"
                          aria-label="Retirer"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-7 text-center font-display text-base text-table-ink">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(item.productId, item.qty + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-table-ink hover:bg-white/12"
                          aria-label="Ajouter"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item.productId)}
                          className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-table-red hover:bg-table-red/10"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="mt-5 group flex w-full items-center gap-4 rounded-2xl border border-table-yellow/30 bg-gradient-to-br from-table-yellow/15 via-table-yellow/8 to-transparent p-4 text-left transition hover:border-table-yellow/55 hover:from-table-yellow/22 active:scale-[0.99]"
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-table-yellow/40 bg-table-yellow/15"
                    style={{
                      boxShadow: '0 0 24px rgba(255, 209, 36, 0.25)',
                    }}
                  >
                    <Star
                      className="h-7 w-7 fill-table-yellow text-table-yellow"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(255, 209, 36, 0.6))' }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base uppercase tracking-wider text-table-yellow">
                      -10% offerts
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-table-ink-soft">
                      Laisse-nous 5 etoiles sur Google.
                      <span className="ml-1 text-table-yellow underline decoration-dotted underline-offset-2">
                        Voir le QR code
                      </span>
                    </div>
                  </div>
                </button>
              )}

            </div>

            {items.length > 0 && (
              <footer className="relative shrink-0 border-t border-white/10 bg-black/40 p-5">
                <dl className="space-y-1.5 text-sm text-table-ink-soft">
                  <div className="flex items-center justify-between">
                    <dt>Sous-total</dt>
                    <dd>{formatPrice(priced?.subtotal ?? 0)}</dd>
                  </div>
                  {(priced?.happyHourDiscount ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-table-yellow">
                      <dt>Happy Hour</dt>
                      <dd>- {formatPrice(priced!.happyHourDiscount)}</dd>
                    </div>
                  )}
                  {(priced?.couponDiscount ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-table-cyan">
                      <dt>Code promo</dt>
                      <dd>- {formatPrice(priced!.couponDiscount)}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <div className="font-display text-xl uppercase tracking-wider text-table-ink">
                    Total
                  </div>
                  <div
                    className="font-display text-3xl tracking-wider text-table-ink"
                    style={{ textShadow: '0 0 20px rgba(123,43,255,0.45)' }}
                  >
                    {loading ? '...' : formatPrice(priced?.total ?? 0)}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={clear}
                    className="col-span-1 rounded-xl border border-table-red/40 px-3 py-3 font-display text-xs uppercase tracking-widest text-table-red transition hover:bg-table-red/15"
                  >
                    Vider
                  </button>
                  <ArcadeButton
                    variant="primary"
                    size="md"
                    className="col-span-2"
                    disabled={!priced || priced.items.length === 0 || loading}
                    onClick={() => priced && onCheckout(priced)}
                  >
                    Commander
                  </ArcadeButton>
                </div>

                {/* Lien discret tout en bas de la colonne */}
                <div className="mt-4 flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCouponOpen(true)}
                    className="font-display text-[11px] uppercase tracking-[0.25em] text-table-ink-muted transition hover:text-table-cyan"
                  >
                    {priced?.coupon
                      ? `Code applique : ${priced.coupon.code}`
                      : 'Je dispose d\u2019un code promo'}
                  </button>
                  {priced?.coupon && (
                    <button
                      type="button"
                      onClick={() => setCoupon(null)}
                      className="text-[10px] uppercase tracking-widest text-table-ink-muted/70 transition hover:text-table-red"
                    >
                      Retirer
                    </button>
                  )}
                  {priced?.couponError && !priced?.coupon && (
                    <div className="flex items-center gap-1 text-[11px] text-table-red">
                      <AlertTriangle className="h-3 w-3" /> {priced.couponError}
                    </div>
                  )}
                  {priced?.coupon && !priced?.couponError && (
                    <div className="flex items-center gap-1 text-[10px] text-table-mint">
                      <CheckCircle2 className="h-3 w-3" /> Reduction active
                    </div>
                  )}
                </div>
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>

    <GoogleReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} />

    <CouponModal
      open={couponOpen}
      onClose={() => setCouponOpen(false)}
      hostname={hostname}
      items={items.map((i) => ({ productId: i.productId, qty: i.qty }))}
      initialCode={couponCode}
      onApply={(code) => setCoupon(code)}
    />
    </>
  );
}
