/**
 * Choix de promotion : scrim limité au plateau + 4 tuiles tactiles rendues
 * par le thème. Annulable (tap à côté ou bouton).
 */

import { motion } from 'framer-motion';
import { useT } from '../../../i18n/useT';
import type { ChessColor, PromotionPiece } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

const CHOICES: PromotionPiece[] = ['q', 'r', 'n', 'b'];

interface Props {
  color: ChessColor;
  theme: ChessTheme;
  onPick: (piece: PromotionPiece | null) => void;
}

export default function PromotionPicker({ color, theme, onPick }: Props) {
  const t = useT();
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/65"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onPick(null);
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="font-display text-2xl uppercase tracking-wider text-table-ink">
          {t('table.chess.promotion.title')}
        </div>
        <div className="flex gap-5">
          {CHOICES.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onPick(piece)}
              className="flex h-32 w-32 items-center justify-center rounded-2xl border border-white/20 bg-table-bg-elev p-3 transition-transform active:scale-95"
              style={{ boxShadow: `0 0 18px ${theme.hudAccent}33` }}
            >
              {theme.renderPiece(piece, color, '100%')}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="rounded-full border border-white/15 bg-black/40 px-6 py-2.5 font-display uppercase tracking-wider text-table-ink-soft active:scale-95"
        >
          {t('table.common.cancel', 'Annuler')}
        </button>
      </motion.div>
    </div>
  );
}
