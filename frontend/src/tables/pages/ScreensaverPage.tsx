/**
 * Ecran de veille (DA V3 launcher glass).
 *
 * - Image de fond + particules : herites du TableLayout
 * - Carrousel des items mis en avant (auto-rotate)
 * - Sans items : grand titre INVADER + tagline glass
 * - Tap n'importe ou -> /table/home
 * - Zero scroll
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { Hand } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { tablesApi } from '../lib/tablesApi';
import { useT } from '../i18n/useT';
import type { ScreensaverFeatured } from '../types';

const SLIDE_DURATION_MS = 6000;

export default function ScreensaverPage() {
  const navigate = useNavigate();
  const identity = useHostname();
  const t = useT();
  const [items, setItems] = useState<ScreensaverFeatured[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    tablesApi
      .get<{ items: ScreensaverFeatured[] }>(`/${identity.hostname}/screensaver`)
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

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const wakeUp = () => navigate('/table/home', { replace: true });

  const current = items[index] ?? null;

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      onClick={wakeUp}
      onTouchStart={wakeUp}
      role="button"
      aria-label={t('table.screensaver.tap')}
    >
      <div className="flex w-full flex-1 items-center justify-center px-12">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="relative grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2"
            >
              <motion.div
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-table-bg-elev/85 shadow-glass"
              >
                <img
                  src={current.image_url}
                  alt={current.title}
                  className="h-[58vh] w-full object-cover"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                {current.lottie_url && (
                  <div className="pointer-events-none absolute inset-0">
                    <DotLottieReact
                      src={current.lottie_url}
                      loop
                      autoplay
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="space-y-6 text-center lg:text-left"
              >
                <h2
                  className="font-display text-7xl leading-none tracking-wide text-table-ink"
                  style={{
                    textShadow: '0 0 24px rgba(123, 43, 255, 0.55)',
                  }}
                >
                  {current.title}
                </h2>
                {current.subtitle && (
                  <p className="text-2xl leading-snug text-table-ink-soft">
                    {current.subtitle}
                  </p>
                )}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center text-center"
            >
              <h1
                className="font-display text-[14rem] leading-none tracking-wider text-table-ink"
                style={{
                  textShadow: '0 0 30px rgba(123, 43, 255, 0.6)',
                }}
              >
                INVADER
              </h1>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-table-bg-elev/70 px-6 py-2 font-retro text-sm uppercase tracking-[0.3em] text-table-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-table-cyan" />
                {t('table.screensaver.tagline', 'Bar / Retro Gaming')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex w-full flex-col items-center justify-center gap-5 pb-12">
        {items.length > 1 && (
          <div className="flex items-center gap-2">
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-10 bg-table-cyan' : 'w-6 bg-white/20'
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 rounded-full border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep px-8 py-4 font-display text-xl uppercase tracking-widest text-white shadow-neon-violet">
          <Hand className="h-6 w-6" />
          {t('table.screensaver.tap')}
        </div>
      </div>
    </div>
  );
}
