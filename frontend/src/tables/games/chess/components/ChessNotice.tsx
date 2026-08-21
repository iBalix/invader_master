/**
 * Avis éphémère (erreurs de coup, réseau) stylé DA, sans react-hot-toast
 * (dont le Toaster global est stylé back-office).
 */

import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  message: string | null;
}

export default function ChessNotice({ message }: Props) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none absolute left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-table-red/50 bg-black/85 px-6 py-2.5 font-display text-sm uppercase tracking-wider text-table-red"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
