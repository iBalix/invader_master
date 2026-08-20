/**
 * Ecran d'accueil "launcher" V3.
 *
 * Layout :
 *   - Image de fond : geree par TableLayout
 *   - Top : bandeau evenement (permanent) + apparitions de mises en avant
 *   - Centre : titre INVADER centre + 2 boutons CTA (picto + nom + sous-titre),
 *     plus un 3e bouton "Rejoindre la partie" quand un quiz ou un battle
 *     tourne. Avant, une banniere prenait la place du bandeau evenement, donc
 *     on perdait les mises en avant et le client ne trouvait pas l'entree la
 *     ou il la cherche : dans la rangee de boutons.
 *   - Top-right : locale switcher + bouton power (vers screensaver)
 *
 * Chaque bouton emet des particules vers l'exterieur (gauche pour Carte,
 * droite pour Jeux), de la couleur configuree en reglages globaux.
 *
 * Aucun scroll, layout fixe en 1920x1080.
 */

import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Utensils, Gamepad2, Power, ArrowRight, Swords, Target } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { useTableHome } from '../hooks/useTableHome';
import { useLiveEvent } from '../hooks/useLiveEvent';
import { useDesignConfig } from '../hooks/useDesignConfig';
import { useT } from '../i18n/useT';
import HomeTopBanner from '../components/home/HomeTopBanner';
import { useLiveGame } from '../hooks/useLiveGame';
import { loadIdentity } from '../../game/lib/gameClient';
import ButtonParticles from '../components/home/ButtonParticles';
import GamepadBadge from '../components/layout/GamepadBadge';
import LocaleSwitcher from '../components/layout/LocaleSwitcher';
import { EASE_OUT_QUART } from '../lib/motion';

/** Eclaircit/assombrit un hex de `amt` (-255..255). */
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function HomePage() {
  const identity = useHostname();
  const { featured, nextEvent, settings } = useTableHome(identity?.hostname);
  const liveEvent = useLiveEvent();
  const liveGame = useLiveGame();
  const { design } = useDesignConfig();
  const t = useT();
  const navigate = useNavigate();

  const menuColor = design.menuButtonColor;
  const gamesColor = design.gamesButtonColor;
  // Pas de couleur configurable pour un 3e bouton dans le modele de design
  // (menuButtonColor / gamesButtonColor seulement) : cyan en dur, la teinte
  // de l'ancienne banniere.
  const liveColor = '#22B8CF';

  // "Reprendre" plutot que "Rejoindre" si ce client a deja une identite dans
  // la partie en cours : c'est ce qui materialise le retour apres un detour
  // par la carte ou par un jeu retro.
  const alreadyPlaying = !!liveGame && loadIdentity()?.sessionId === liveGame.sessionId;

  return (
    <div className="relative flex h-full w-full flex-col px-12 py-8">
      {/* === Top bar : bandeau central + actions a droite === */}
      <header className="relative z-10 flex shrink-0 items-start">
        <div className="flex-1">
          <HomeTopBanner
            liveEvent={liveEvent}
            nextEvent={nextEvent}
            featured={featured}
            featuredIntervalMs={settings?.home_featured_interval_ms}
          />
        </div>
        <div className="absolute right-0 top-0 flex items-center gap-3">
          <GamepadBadge />
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

      {/* === Centre : titre INVADER + boutons CTA centres === */}
      <div className="relative z-10 flex flex-1 min-h-0 flex-col items-center justify-center">
        <motion.h1
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT_QUART }}
          className="text-center font-display text-[12rem] leading-[0.85] tracking-tight text-table-ink"
          style={{
            textShadow: '0 0 30px rgba(123, 43, 255, 0.6), 0 0 60px rgba(123, 43, 255, 0.3)',
          }}
        >
          INVADER
        </motion.h1>

        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6"
        >
          <CTAButton
            to="/table/menu"
            emitDirection="left"
            color={menuColor}
            icon={<Utensils className="h-9 w-9" />}
            label={t('table.home.cta.menu', 'Voir la carte')}
            hint={t('table.home.cta.menu.subtitle', 'Boissons & nourriture')}
          />
          <CTAButton
            to="/table/games"
            emitDirection="right"
            color={gamesColor}
            icon={<Gamepad2 className="h-9 w-9" />}
            label={t('table.home.cta.games', 'Voir les jeux')}
            hint={t('table.home.cta.games.subtitle', 'Lance ta partie')}
          />
          {liveGame && (
            <CTAButton
              to="/table/play"
              emitDirection="right"
              color={liveColor}
              icon={
                liveGame.mode === 'battle' ? (
                  <Swords className="h-9 w-9" />
                ) : (
                  <Target className="h-9 w-9" />
                )
              }
              label={
                alreadyPlaying
                  ? t('table.home.liveGame.resume', 'Reprendre')
                  : t('table.home.liveGame.cta', 'Rejoindre')
              }
              hint={
                liveGame.mode === 'battle'
                  ? t('table.home.liveGame.battle', 'Battle Royale en cours')
                  : t('table.home.liveGame.quiz', 'Quiz en cours')
              }
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

interface CTAButtonProps {
  to: string;
  emitDirection: 'left' | 'right';
  color: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}

function CTAButton({ to, emitDirection, color, icon, label, hint }: CTAButtonProps) {
  const gradient = `linear-gradient(135deg, ${shade(color, 18)} 0%, ${color} 50%, ${shade(color, -48)} 140%)`;

  return (
    <Link
      to={to}
      className="relative flex min-w-[26rem] items-center gap-6 rounded-2xl border border-white/15 p-6 pr-8 transition-transform duration-150 active:scale-[0.98]"
    >
      {/* Particules : jaillissent de l'extremite du bouton vers l'exterieur.
          Le canvas est colle au bord (avec un leger chevauchement de 1.5rem
          masque par le fond du bouton) et s'etend vers l'exterieur. */}
      <div
        className="pointer-events-none absolute top-[-2rem] bottom-[-2rem] z-0"
        style={
          emitDirection === 'left'
            ? { right: 'calc(100% - 1.5rem)', width: '14rem' }
            : { left: 'calc(100% - 1.5rem)', width: '14rem' }
        }
      >
        <ButtonParticles direction={emitDirection} color={color} />
      </div>

      {/* Fond colore (au-dessus des particules, masque celles "sous" le bouton) */}
      <div
        className="absolute inset-0 z-[1] rounded-2xl"
        style={{ background: gradient, boxShadow: `0 0 26px ${color}66` }}
      />

      <div className="relative z-[2] flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white">
        {icon}
      </div>
      <div className="relative z-[2] min-w-0 flex-1">
        <div className="font-display text-4xl uppercase leading-none tracking-wider text-white">
          {label}
        </div>
        <div className="mt-2 text-lg text-white/80">{hint}</div>
      </div>
      <div className="relative z-[2] flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
        <ArrowRight className="h-6 w-6" />
      </div>
    </Link>
  );
}
