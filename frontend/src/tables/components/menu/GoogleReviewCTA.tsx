/**
 * CTA bas de page affiche sur la borne quand le module commande est desactive.
 * Click = ouvre la modale "10% sur une boisson contre un avis Google" (QR + explications).
 */

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { EASE_OUT_QUART } from '../../lib/motion';
import { useT } from '../../i18n/useT';

interface Props {
  onClick: () => void;
}

export default function GoogleReviewCTA({ onClick }: Props) {
  const t = useT();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_QUART, delay: 0.2 }}
      whileTap={{ scale: 0.97 }}
      className="fixed bottom-8 right-8 z-40 flex items-center gap-3 rounded-full border border-yellow-300/40 bg-gradient-to-br from-yellow-400 via-yellow-300 to-amber-300 px-9 py-5 font-display text-xl uppercase tracking-wider text-black shadow-2xl"
      style={{ boxShadow: '0 0 28px 0 rgba(250, 204, 21, 0.45)' }}
    >
      <Star className="h-7 w-7 fill-black" />
      {t('table.review.cta')}
    </motion.button>
  );
}
