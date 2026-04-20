/**
 * Ecran d'accueil "launcher" V3.
 *
 * Layout :
 *   - Image de fond + particules : geres par TableLayout
 *   - Top-right : locale switcher + bouton power (vers screensaver)
 *   - Gauche-haut : titre INVADER tres gros + sous-titre + 2 boutons CTA
 *   - Bas-droite : event live/upcoming + grille de cards "mises en avant"
 *
 * Aucun scroll, layout fixe en 1920x1080.
 */

import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Utensils, Gamepad2, Power, ArrowRight } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { useTableHome } from '../hooks/useTableHome';
import { useLiveEvent } from '../hooks/useLiveEvent';
import { useT } from '../i18n/useT';
import EventBanner from '../components/home/EventBanner';
import FeaturedCards from '../components/home/FeaturedCards';
import LocaleSwitcher from '../components/layout/LocaleSwitcher';
import { EASE_OUT_QUART } from '../lib/motion';

export default function HomePage() {
  const identity = useHostname();
  const { featured, nextEvent } = useTableHome(identity?.hostname);
  const liveEvent = useLiveEvent();
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full w-full flex-col px-12 py-8">
      {/* === Top bar minimale === */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div />
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <button
            type="button"
            onClick={() => navigate('/table/screensaver', { replace: true })}
            aria-label={t('table.home.standby', 'Mise en veille')}
            title={t('table.home.standby', 'Mise en veille')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-table-bg-elev/85 text-table-ink-soft transition hover:border-table-magenta/60 hover:bg-table-magenta/15 hover:text-table-magenta active:scale-95"
          >
            <Power className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* === Bloc principal : titre + CTA a gauche === */}
      <div className="grid flex-1 min-h-0 grid-cols-12 gap-8">
        <div className="col-span-7 flex flex-col justify-center">
          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT_QUART }}
            className="font-display text-[12rem] leading-[0.85] tracking-tight text-table-ink"
            style={{
              textShadow:
                '0 0 30px rgba(123, 43, 255, 0.6), 0 0 60px rgba(123, 43, 255, 0.3)',
            }}
          >
            INVADER
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-4 max-w-xl font-body text-xl text-table-ink-soft"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.55)' }}
          >
            {t(
              'table.home.subtitle',
              'Choisis ton terrain de jeu : commande tes boissons ou lance une partie retro depuis cette table.',
            )}
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-10 flex flex-wrap items-center gap-5"
          >
            <CTAButton
              to="/table/menu"
              variant="violet"
              icon={<Utensils className="h-7 w-7" />}
              label={t('table.home.cta.menu', 'Voir la carte')}
              hint={t('table.home.cta.menu.subtitle', 'Boissons & nourriture')}
            />
            <CTAButton
              to="/table/games"
              variant="magenta"
              icon={<Gamepad2 className="h-7 w-7" />}
              label={t('table.home.cta.games', 'Voir les jeux')}
              hint={t('table.home.cta.games.subtitle', 'Lance ta partie')}
            />
          </motion.div>
        </div>

        {/* === colonne droite : reservee aux featured (positionnes en bas) === */}
        <div className="col-span-5" />
      </div>

      {/* === Bas-droite : event banner + featured cards === */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="absolute bottom-8 right-12 flex w-[52rem] flex-col gap-4"
      >
        <div className="flex items-center gap-3 px-1">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
          <span className="font-retro text-[11px] uppercase tracking-[0.3em] text-table-ink-muted">
            {t('table.home.featured.title', 'A l\'affiche')}
          </span>
          <span className="h-px w-12 bg-white/15" />
        </div>
        <EventBanner liveEvent={liveEvent} nextEvent={nextEvent} />
        <FeaturedCards items={featured} />
      </motion.div>
    </div>
  );
}

interface CTAButtonProps {
  to: string;
  variant: 'violet' | 'magenta';
  icon: React.ReactNode;
  label: string;
  hint: string;
}

function CTAButton({ to, variant, icon, label, hint }: CTAButtonProps) {
  const palette =
    variant === 'violet'
      ? {
          bg: 'from-table-violet via-table-violet to-table-violet-deep',
          glow: 'shadow-neon-violet',
        }
      : {
          bg: 'from-table-magenta via-[#D724B5] to-[#7A0F73]',
          glow: 'shadow-neon-magenta',
        };

  return (
    <Link
      to={to}
      className={[
        'relative flex min-w-[20rem] items-center gap-5 rounded-2xl bg-gradient-to-br p-5 pr-7',
        'border border-white/15 transition-transform duration-150 active:scale-[0.98]',
        palette.bg,
        palette.glow,
      ].join(' ')}
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-3xl uppercase leading-none tracking-wider text-white">
          {label}
        </div>
        <div className="mt-1.5 text-sm text-white/75">{hint}</div>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
        <ArrowRight className="h-5 w-5" />
      </div>
    </Link>
  );
}
