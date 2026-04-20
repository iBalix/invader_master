/**
 * Layout commun a tous les ecrans des tables tactiles.
 *
 * DA V3 "launcher gaming neon" - VERSION OPTIMISEE pour mini-PC.
 *
 *   - Image de fond + particules : UNIQUEMENT sur home + screensaver
 *     (les pages "show"). Sur les pages fonctionnelles (menu / games /
 *     in-game / setup), on remplace par un degrade statique : zero
 *     repaint, zero compositing.
 *   - Voile sombre / halo violet : composes une seule fois en CSS
 *     statique, pas en multiples couches GPU.
 *   - Transitions verticales Framer Motion : conservees mais desactivees
 *     en mode reduced (prefers-reduced-motion / low-end / ?perf=lite).
 *   - Heartbeat backend + detection inactivite : inchange.
 */

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useRef } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useInactivity } from '../../hooks/useInactivity';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import { useSlaveGameSync } from '../../hooks/useSlaveGameSync';
import { usePerfMode } from '../../hooks/usePerfMode';
import ParticlesBackground from '../fx/ParticlesBackground';
import { EASE_OUT_QUART } from '../../lib/motion';

const IDLE_TIMEOUT_MS = 90_000;
const BG_IMAGE_URL = '/table-bg.png';

type RouteKind = 'screensaver' | 'home' | 'sub' | 'fullscreen' | 'setup';

/**
 * Direction de la transition (from -> to). On calcule ca cote conteneur
 * pour decider de l'animation que les motion.div sortantes/entrantes vont
 * jouer. Ca evite que la sortante translate alors que l'entrante fade :
 * crossfade synchronise pour les modes "spe" (screensaver/fullscreen/setup),
 * slide vertical pour les pages applicatives (home <-> sub).
 */
type Direction = 'home-down' | 'sub-up' | 'fade';

function getRouteKind(pathname: string): RouteKind {
  if (pathname.startsWith('/table/screensaver')) return 'screensaver';
  if (pathname.startsWith('/table/home')) return 'home';
  if (pathname.startsWith('/table/in-game')) return 'fullscreen';
  if (pathname.startsWith('/table/setup')) return 'setup';
  return 'sub';
}

function computeDirection(from: RouteKind | null, to: RouteKind): Direction {
  // Toute transition impliquant un mode "ecran spe" -> crossfade pur.
  // Comme ca on n'a pas un translate vertical contre un fade qui se chevauchent.
  const SPE: ReadonlyArray<RouteKind> = ['screensaver', 'fullscreen', 'setup'];
  if (SPE.includes(to) || (from && SPE.includes(from))) return 'fade';

  // home -> sub : la nouvelle page (sub) vient du bas, l'ancienne (home) sort en haut
  if (to === 'sub') return 'sub-up';
  // sub -> home : la nouvelle page (home) vient du haut, l'ancienne (sub) sort en bas
  if (to === 'home') return 'home-down';

  return 'fade';
}

const PAGE_VARIANTS: Variants = {
  initial: (dir: Direction) => {
    if (dir === 'sub-up') return { y: '100%', opacity: 1 };
    if (dir === 'home-down') return { y: '-100%', opacity: 1 };
    return { y: 0, opacity: 0 };
  },
  animate: { y: 0, opacity: 1 },
  exit: (dir: Direction) => {
    // Cle : le exit doit etre coherent avec l'entree du suivant.
    // sub-up -> la sortante (home) part vers le haut
    // home-down -> la sortante (sub) part vers le bas
    // fade -> crossfade
    if (dir === 'sub-up') return { y: '-100%', opacity: 1 };
    if (dir === 'home-down') return { y: '100%', opacity: 1 };
    return { y: 0, opacity: 0 };
  },
};

export default function TableLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeKind = getRouteKind(location.pathname);
  const perf = usePerfMode();

  // Direction de transition courante (from -> to), calculee a chaque change
  // de routeKind. On mute le ref pendant le useMemo (pattern "previous value"
  // recommande par React quand on n'a pas besoin de re-render).
  const prevRouteKindRef = useRef<RouteKind | null>(null);
  const direction = useMemo<Direction>(() => {
    const from = prevRouteKindRef.current;
    const dir = computeDirection(from, routeKind);
    prevRouteKindRef.current = routeKind;
    return dir;
  }, [routeKind]);

  const inactivityEnabled = useMemo(() => {
    return (
      routeKind !== 'screensaver' && routeKind !== 'setup' && routeKind !== 'fullscreen'
    );
  }, [routeKind]);

  useInactivity({
    timeoutMs: IDLE_TIMEOUT_MS,
    enabled: inactivityEnabled,
    onIdle: () => navigate('/table/screensaver', { replace: true }),
  });

  useHeartbeat();
  useSlaveGameSync();

  const isShow = routeKind === 'home' || routeKind === 'screensaver';
  const showBgImage = isShow;
  const showParticles = isShow;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-table-bg font-body text-table-ink"
      style={
        !showBgImage
          ? {
              // pages fonctionnelles : degrade statique sombre, zero compositing image
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(123,43,255,0.18), transparent 55%), linear-gradient(180deg, #0F0A24 0%, #070512 70%, #050310 100%)',
            }
          : undefined
      }
    >
      {showBgImage && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(123,43,255,0.20), transparent 55%), linear-gradient(180deg, rgba(7,5,18,0.55) 0%, rgba(7,5,18,0.35) 35%, rgba(7,5,18,0.85) 100%)',
            }}
          />
        </>
      )}

      {showParticles && <ParticlesBackground count={35} />}

      <main className="relative z-10 h-full w-full">
        {perf.reduced ? (
          // mode lite : pas d'AnimatePresence, juste l'Outlet brut
          <div className="absolute inset-0 h-full w-full">
            <Outlet />
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={routeKind === 'sub' ? location.pathname : routeKind}
              custom={direction}
              variants={PAGE_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{
                type: 'tween',
                ease: EASE_OUT_QUART,
                duration: direction === 'fade' ? 0.32 : 0.45,
              }}
              className="absolute inset-0 h-full w-full"
              style={{ willChange: 'transform, opacity' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
