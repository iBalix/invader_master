/**
 * AnimatedGrid : wrapper qui anime ses enfants en cascade (stagger)
 * a chaque changement de `resetKey` (typiquement la categorie active).
 *
 *   - Fade-up subtil + leger zoom : sympa sans surcharger la perception.
 *   - Stagger limite (0.025s) pour rester rapide meme avec beaucoup d'items.
 *   - En mode `usePerfMode().reduced`, on skip totalement l'animation
 *     (juste un re-render normal pour ne pas spammer le GPU des mini-PC).
 *
 * Usage :
 *   <AnimatedGrid resetKey={currentId} className="grid grid-cols-4 gap-4">
 *     {items.map((it) => (
 *       <AnimatedGridItem key={it.id}>
 *         <Card ... />
 *       </AnimatedGridItem>
 *     ))}
 *   </AnimatedGrid>
 */

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePerfMode } from '../../hooks/usePerfMode';
import { EASE_OUT_QUART } from '../../lib/motion';

interface GridProps {
  resetKey: string | number | null;
  className?: string;
  children: ReactNode;
}

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.04,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: EASE_OUT_QUART },
  },
};

export default function AnimatedGrid({ resetKey, className, children }: GridProps) {
  const perf = usePerfMode();

  if (perf.reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={String(resetKey)}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

interface ItemProps {
  className?: string;
  children: ReactNode;
}

export function AnimatedGridItem({ className, children }: ItemProps) {
  const perf = usePerfMode();

  if (perf.reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div variants={itemVariants} className={className} style={{ willChange: 'transform' }}>
      {children}
    </motion.div>
  );
}
