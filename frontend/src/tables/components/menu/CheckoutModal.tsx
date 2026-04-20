/**
 * Modale de validation de commande.
 *
 * Step 1 : choix du mode de paiement (CB ou Especes).
 * Step 2 : envoi POST /public/tables/:hostname/orders, puis confirmation.
 *   - CB     : "Commande envoyee au bar. Le barman vous l'apporte ainsi que le module de paiement."
 *   - Especes : "Rendez-vous au bar pour regler. Le serveur vous apportera la commande."
 */

import { useState } from 'react';
import { CreditCard, Banknote, Check, AlertTriangle } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import { tablesApi } from '../../lib/tablesApi';
import { useCart } from '../../store/cartStore';
import { formatPrice } from '../../lib/format';
import { useT } from '../../i18n/useT';
import type { CreatedOrder, PricedCart } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  hostname: string;
  priced: PricedCart;
}

type PaymentMethod = 'card' | 'cash';

export default function CheckoutModal({ open, onClose, hostname, priced }: Props) {
  const { items, couponCode, clear } = useCart();
  const t = useT();
  const [step, setStep] = useState<'choose' | 'sending' | 'done' | 'error'>('choose');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('choose');
    setMethod(null);
    setOrder(null);
    setError(null);
  }

  async function confirm(m: PaymentMethod) {
    setMethod(m);
    setStep('sending');
    try {
      const { data } = await tablesApi.post<{ order: CreatedOrder }>(
        `/${hostname}/orders`,
        {
          items: items.map((i) => ({ productId: String(i.productId), quantity: i.qty })),
          couponCode,
          paymentMethod: m,
        }
      );
      setOrder(data.order);
      setStep('done');
      clear();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('table.checkout.error', 'Impossible d\'envoyer la commande'));
      setStep('error');
    }
  }

  function close() {
    onClose();
    window.setTimeout(reset, 250);
  }

  return (
    <ArcadeModal
      open={open}
      onClose={close}
      size="lg"
      dismissOnBackdrop={step !== 'sending'}
      title={
        step === 'done'
          ? t('table.checkout.title.done', 'COMMANDE VALIDEE')
          : step === 'error'
          ? t('table.checkout.title.error', 'OUPS')
          : t('table.checkout.title.choose', 'PASSER COMMANDE')
      }
    >
      {step === 'choose' && (
        <div>
          <p className="mb-6 text-table-ink-soft">
            {t('table.checkout.howpay', 'Comment souhaites-tu payer ta commande de')}{' '}
            <strong className="text-table-ink">{formatPrice(priced.total)}</strong> ?
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => confirm('card')}
              className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-8 transition-transform duration-150 active:scale-[0.98] hover:bg-table-violet/12"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep text-white shadow-neon-violet">
                <CreditCard className="h-8 w-8" />
              </div>
              <span className="font-display text-2xl uppercase tracking-wider text-table-ink">
                {t('table.checkout.card', 'Carte bancaire')}
              </span>
              <span className="text-center text-xs text-table-ink-muted">
                {t('table.checkout.card.hint', 'Le barman vient avec le module')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => confirm('cash')}
              className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-8 transition-transform duration-150 active:scale-[0.98] hover:bg-table-cyan/10"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-table-cyan via-[#1FB7DC] to-[#0E5DAB] text-white shadow-neon-cyan">
                <Banknote className="h-8 w-8" />
              </div>
              <span className="font-display text-2xl uppercase tracking-wider text-table-ink">
                {t('table.checkout.cash', 'Especes')}
              </span>
              <span className="text-center text-xs text-table-ink-muted">
                {t('table.checkout.cash.hint', 'A regler au bar')}
              </span>
            </button>
          </div>
        </div>
      )}

      {step === 'sending' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="font-display text-xl uppercase tracking-wider text-table-ink">
            {t('table.checkout.sending', 'Envoi de la commande...')}
          </div>
          <div className="text-xs uppercase text-table-ink-muted">
            {t('table.checkout.sending.hint', 'Ne ferme pas l\'ecran')}
          </div>
        </div>
      )}

      {step === 'done' && order && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-table-mint to-[#2D8B66] text-white shadow-[0_6px_20px_rgba(94,217,161,0.45)]">
            <Check className="h-12 w-12" />
          </div>
          <div
            className="font-display text-3xl uppercase tracking-wider text-table-ink"
            style={{ textShadow: '0 0 18px rgba(94,217,161,0.45)' }}
          >
            {t('table.checkout.order', 'Commande')} #
            {order.orderNumber ?? order.id.slice(0, 6)}
          </div>
          <div className="text-table-ink-soft">
            {method === 'card'
              ? t('table.checkout.done.card')
              : t('table.checkout.done.cash')}
          </div>
          <ArcadeButton variant="primary" size="lg" onClick={close}>
            {t('table.checkout.ok', 'Compris')}
          </ArcadeButton>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-table-red/40 bg-table-red/20 text-table-red">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <div className="text-table-ink-soft">{error}</div>
          <div className="flex gap-3">
            <ArcadeButton variant="ghost" size="md" onClick={close}>
              {t('table.cancel', 'Annuler')}
            </ArcadeButton>
            <ArcadeButton
              variant="primary"
              size="md"
              onClick={() => setStep('choose')}
            >
              {t('table.retry', 'Reessayer')}
            </ArcadeButton>
          </div>
        </div>
      )}
    </ArcadeModal>
  );
}
