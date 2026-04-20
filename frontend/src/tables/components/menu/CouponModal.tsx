/**
 * Modal de saisie d'un code promo.
 *
 * Validation cote backend via /orders/preview avec le panier courant :
 *   - Si couponError -> on l'affiche dans la modal sans appliquer
 *   - Si coupon OK -> on applique au store + on ferme la modal
 *
 * Style :
 *   - Input gros, monospace tracker, uppercase auto
 *   - Etat loading/idle/error/success visuellement distinct
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Tag } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import { tablesApi } from '../../lib/tablesApi';
import type { PricedCart } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  hostname: string;
  items: Array<{ productId: string | number; qty: number }>;
  initialCode?: string | null;
  onApply: (code: string) => void;
}

type Status = 'idle' | 'checking' | 'error' | 'success';

export default function CouponModal({
  open,
  onClose,
  hostname,
  items,
  initialCode,
  onApply,
}: Props) {
  const [code, setCode] = useState(initialCode ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [discountPreview, setDiscountPreview] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setCode(initialCode ?? '');
      setStatus('idle');
      setErrorMsg(null);
      setDiscountPreview(null);
    }
  }, [open, initialCode]);

  async function handleApply() {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setStatus('error');
      setErrorMsg('Saisis un code promo');
      return;
    }
    setStatus('checking');
    setErrorMsg(null);
    try {
      const { data } = await tablesApi.post<PricedCart>(
        `/${hostname}/orders/preview`,
        {
          items: items.map((i) => ({
            productId: String(i.productId),
            quantity: i.qty,
          })),
          couponCode: normalized,
        }
      );
      if (data.couponError) {
        setStatus('error');
        setErrorMsg(data.couponError);
        return;
      }
      if (data.coupon) {
        setStatus('success');
        setDiscountPreview(data.couponDiscount ?? 0);
        onApply(normalized);
        // petite pause pour montrer le success state avant la fermeture
        setTimeout(() => onClose(), 700);
        return;
      }
      setStatus('error');
      setErrorMsg('Code invalide');
    } catch {
      setStatus('error');
      setErrorMsg('Erreur de connexion, reessaie');
    }
  }

  return (
    <ArcadeModal open={open} onClose={onClose} size="md">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-table-cyan/40 bg-table-cyan/15 text-table-cyan">
          <Tag className="h-6 w-6" />
        </div>

        <h2 className="mt-5 font-display text-3xl uppercase tracking-wider text-table-ink">
          Code promo
        </h2>

        <p className="mt-2 text-sm text-table-ink-muted">
          Saisis ton code pour profiter de la remise.
        </p>

        <div className="mt-6 w-full">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (status === 'error') setStatus('idle');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply();
            }}
            disabled={status === 'checking' || status === 'success'}
            placeholder="EX: HAPPY10"
            autoFocus
            className={[
              'w-full rounded-2xl border bg-black/40 px-5 py-4 text-center font-display text-2xl uppercase tracking-[0.4em] text-table-ink outline-none transition placeholder:text-table-ink-muted/40 disabled:opacity-60',
              status === 'error'
                ? 'border-table-red/60 focus:border-table-red'
                : status === 'success'
                  ? 'border-table-mint/60 focus:border-table-mint'
                  : 'border-white/15 focus:border-table-violet',
            ].join(' ')}
          />

          {status === 'error' && errorMsg && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-table-red">
              <AlertTriangle className="h-4 w-4" /> {errorMsg}
            </div>
          )}

          {status === 'success' && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-table-mint">
              <CheckCircle2 className="h-4 w-4" />
              Code applique{discountPreview ? ` (- ${discountPreview.toFixed(2)} EUR)` : ''} !
            </div>
          )}
        </div>

        <div className="mt-6 flex w-full gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-display text-sm uppercase tracking-widest text-table-ink-soft transition hover:bg-white/10"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={status === 'checking' || status === 'success'}
            className="flex-1 rounded-xl border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep px-4 py-3 font-display text-sm uppercase tracking-widest text-white shadow-neon-violet transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'checking' ? 'Verification...' : 'Appliquer'}
          </button>
        </div>
      </div>
    </ArcadeModal>
  );
}
