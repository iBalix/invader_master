/**
 * Modal "Avis Google" : incitation a laisser 5 etoiles Google en
 * echange de -10% SUR UNE BOISSON. Affiche le QR code vers la fiche
 * Google de l'etablissement.
 *
 * La remise porte sur une boisson, PAS sur la commande entiere. Une premiere
 * version annoncait "10% sur le montant de ta commande", ce qui promettait au
 * client bien plus que ce que le bar accorde au comptoir. Toute reformulation
 * doit garder ce perimetre explicite : le client lit ce texte avant de
 * commander, il ne doit pas decouvrir la limite a l'encaissement.
 *
 *   - QR code grand format dans une "carte" blanche pour favoriser le scan
 *     (le scanner du tel a besoin de fond clair pour bien lire).
 *   - 5 etoiles jaunes anime au montage pour faire pop.
 *   - Texte clair sur le benefice (10% sur une boisson) et l'action (scan).
 */

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import { useT } from '../../i18n/useT';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GoogleReviewModal({ open, onClose }: Props) {
  const t = useT();
  return (
    <ArcadeModal open={open} onClose={onClose} size="lg">
      <div className="flex flex-col items-center text-center">
        {/* Etoiles */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{
                delay: 0.05 + i * 0.07,
                type: 'spring',
                stiffness: 380,
                damping: 16,
              }}
            >
              <Star
                className="h-9 w-9 fill-table-yellow text-table-yellow"
                style={{
                  filter: 'drop-shadow(0 0 12px rgba(255, 209, 36, 0.55))',
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* Headline */}
        <h2
          className="mt-6 font-display text-5xl uppercase leading-none tracking-wider text-table-ink"
          style={{
            textShadow:
              '0 0 30px rgba(255, 209, 36, 0.45), 0 0 60px rgba(255, 209, 36, 0.2)',
          }}
        >
          {t('table.review.title')}
        </h2>

        <p className="mt-4 max-w-md text-base text-table-ink-soft">
          {t('table.review.intro.before', 'Envoie-nous de la force avec')}{' '}
          <strong className="text-table-yellow">
            {t('table.review.intro.stars', '5 étoiles sur Google')}
          </strong>{' '}
          {t('table.review.intro.middle', "et on t'offre")}{' '}
          <strong className="text-table-ink">{t('table.review.intro.reward', '10% sur une boisson')}</strong>.
        </p>

        {/* QR card */}
        <div className="mt-7 flex flex-col items-center gap-4">
          <div className="rounded-3xl bg-white p-5 shadow-[0_0_60px_rgba(255,209,36,0.25)]">
            <img
              src="/qrcode_google.png"
              alt="QR Code avis Google"
              className="h-56 w-56"
              draggable={false}
            />
          </div>
          <div className="font-display text-xs uppercase tracking-[0.3em] text-table-ink-muted">
            {t('table.review.scan')}
          </div>
        </div>

        {/* Etape de validation */}
        <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-sm text-table-ink-soft">
          <div className="font-display text-xs uppercase tracking-wider text-table-yellow">
            {t('table.review.how')}
          </div>
          <ol className="mt-2 space-y-1 text-table-ink-soft">
            <li>1. {t('table.review.step1')}</li>
            <li>2. {t('table.review.step2')}</li>
            <li>3. {t('table.review.step3')}</li>
          </ol>
        </div>
      </div>
    </ArcadeModal>
  );
}
