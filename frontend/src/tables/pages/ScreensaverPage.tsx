/**
 * Ecran de veille (DA V3).
 *
 * - Fond tres sombre (voile noir quasi opaque par dessus le bg du TableLayout) :
 *   on est vraiment "en veille".
 * - Seul le bouton "Touchez pour commencer" reste visible en permanence.
 * - De temps en temps, une mise en avant (show_on_screensaver) apparait en grand
 *   au centre (visuel + titre + sous-titre), reste quelques secondes, puis
 *   disparait. Cycle : noir -> featured -> noir -> featured suivante...
 * - Tap n'importe ou -> /table/home
 *
 * Le reveil est branche sur `click` UNIQUEMENT, jamais sur `touchstart` : ne pas
 * remettre onTouchStart. Reveiller des le touchstart faisait naviguer avant la
 * fin du geste, si bien que le `click` synthetise ensuite par le navigateur a la
 * fin du tap atterrissait sur l'accueil deja monte. Un doigt pose a l'endroit du
 * bouton CARTE ouvrait donc la carte, alors que le client voulait seulement
 * sortir de veille. Avec `click`, l'evenement est le dernier de la sequence
 * tactile et il est consomme ici : le premier appui ne fait que reveiller.
 * `touch-manipulation` supprime au passage le delai de double-tap-zoom, donc le
 * reveil reste immediat.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useHostname } from '../hooks/useHostname';
import { tablesApi } from '../lib/tablesApi';
import { useT } from '../i18n/useT';
import LiveStartButton from '../components/screensaver/LiveStartButton';
import { useDesignConfig } from '../hooks/useDesignConfig';
import type { FeaturedItem } from '../types';

// Duree d'affichage d'une mise en avant, puis duree de "noir" entre deux.
const SHOWCASE_VISIBLE_MS = 7000;
const SHOWCASE_PAUSE_MS = 9000;

export default function ScreensaverPage() {
  const navigate = useNavigate();
  const identity = useHostname();
  const { design } = useDesignConfig();
  const t = useT();
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [showcaseIndex, setShowcaseIndex] = useState<number | null>(null);
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    tablesApi
      .get<{ items: FeaturedItem[] }>(`/${identity.hostname}/screensaver`)
      .then((res) => {
        if (!cancelled) setItems(res.data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  // Cycle noir <-> featured
  useEffect(() => {
    if (items.length === 0) {
      setShowcaseIndex(null);
      return;
    }

    let mounted = true;

    const scheduleShow = () => {
      timerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        setShowcaseIndex(indexRef.current % items.length);
        scheduleHide();
      }, SHOWCASE_PAUSE_MS);
    };

    const scheduleHide = () => {
      timerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        setShowcaseIndex(null);
        indexRef.current = (indexRef.current + 1) % items.length;
        scheduleShow();
      }, SHOWCASE_VISIBLE_MS);
    };

    // Premiere apparition apres une courte pause initiale
    scheduleShow();

    return () => {
      mounted = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [items]);

  const wakeUp = () => navigate('/table/home', { replace: true });
  const current = showcaseIndex != null ? items[showcaseIndex] ?? null : null;

  return (
    <div
      className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-hidden"
      onClick={wakeUp}
      role="button"
      aria-label={t('table.screensaver.tap')}
    >
      {/* Voile noir profond : vraie veille */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/90" />

      {/* Mise en avant intermittente en grand */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.03 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="relative z-[2] flex w-full max-w-5xl flex-col items-center gap-8 px-12"
          >
            {current.image_url && (
              <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/15 shadow-glass">
                <img
                  src={current.image_url}
                  alt={current.title}
                  className="max-h-[55vh] w-full object-cover"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                {current.lottie_url && (
                  <div className="pointer-events-none absolute inset-0">
                    <DotLottieReact src={current.lottie_url} loop autoplay style={{ width: '100%', height: '100%' }} />
                  </div>
                )}
              </div>
            )}
            <div className="text-center">
              <h2
                className="font-display text-6xl leading-none tracking-wide text-table-ink"
                style={{ textShadow: '0 0 24px rgba(123, 43, 255, 0.55)' }}
              >
                {current.title}
              </h2>
              {current.subtitle && (
                <p className="mt-4 text-2xl leading-snug text-table-ink-soft">{current.subtitle}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton "Touchez pour commencer" — vivant (halo scintillant + particules) */}
      <div className="absolute inset-x-0 bottom-16 z-[3] flex items-center justify-center">
        <LiveStartButton
          label={t('table.screensaver.tap', 'Touchez pour commencer')}
          colorA={design.menuButtonColor}
          colorB={design.gamesButtonColor}
        />
      </div>
    </div>
  );
}
