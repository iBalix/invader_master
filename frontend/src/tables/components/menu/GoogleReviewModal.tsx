/**
 * Modal "Avis Google" : incitation a laisser 5 etoiles Google en
 * echange de -10% sur la commande. Affiche le QR code vers la fiche
 * Google de l'etablissement.
 *
 *   - QR code grand format dans une "carte" blanche pour favoriser le scan
 *     (le scanner du tel a besoin de fond clair pour bien lire).
 *   - 5 etoiles jaunes anime au montage pour faire pop.
 *   - Texte clair sur le benefice (10%) et l'action (scan).
 */

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GoogleReviewModal({ open, onClose }: Props) {
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
          -10% offerts
        </h2>

        <p className="mt-4 max-w-md text-base text-table-ink-soft">
          Envoie-nous de la force avec{' '}
          <strong className="text-table-yellow">5 etoiles sur Google</strong> et
          on t'offre <strong className="text-table-ink">10% sur le montant</strong>{' '}
          de ta commande.
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
            Scanne avec ton telephone
          </div>
        </div>

        {/* Etape de validation */}
        <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-sm text-table-ink-soft">
          <div className="font-display text-xs uppercase tracking-wider text-table-yellow">
            Comment ca marche ?
          </div>
          <ol className="mt-2 space-y-1 text-table-ink-soft">
            <li>1. Scanne le QR code et laisse ton avis 5 etoiles.</li>
            <li>2. Montre-le au bar.</li>
            <li>3. On applique -10% sur ta commande.</li>
          </ol>
        </div>
      </div>
    </ArcadeModal>
  );
}
