/**
 * Modale "launcher" V3.
 *
 * Comportement :
 *   - Clic sur le backdrop (en dehors de la modale) => fermeture (sauf si dismissOnBackdrop=false)
 *   - Bouton X (toujours sur z-20, au-dessus du contenu) => fermeture
 *   - Touche Escape => fermeture
 *
 * Note tactile : le backdrop a `cursor-pointer` pour que ce soit clair qu'on
 * peut tap a cote pour fermer.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, type MouseEvent } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  dismissOnBackdrop?: boolean;
  size?: 'md' | 'lg' | 'xl' | '2xl';
}

const SIZE_CLASSES = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

export default function ArcadeModal({
  open,
  onClose,
  title,
  children,
  dismissOnBackdrop = true,
  size = 'md',
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (!dismissOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-6 cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleBackdropClick}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-black/75"
            onClick={dismissOnBackdrop ? onClose : undefined}
          />

          <motion.div
            className={[
              'relative z-10 w-full cursor-default rounded-3xl border border-white/15 bg-table-bg-elev shadow-glass',
              'p-8',
              SIZE_CLASSES[size],
            ].join(' ')}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-3xl"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 0%, rgba(123,43,255,0.22), transparent 70%)',
              }}
            />

            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/40 text-table-ink transition hover:bg-white/15 active:scale-95"
              aria-label="Fermer"
            >
              <X className="h-6 w-6" />
            </button>

            {title && (
              <div className="relative mb-6 pr-14 font-display text-3xl uppercase tracking-wider text-table-ink">
                {title}
              </div>
            )}

            <div className="relative text-table-ink-soft">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
