/**
 * Ecran plein cadre pendant un lancement / une partie.
 *
 * Trois etats, tous derives de l'ordre de lancement serveur :
 *   - lancement en cours  : le jeu demarre, personne ne sait encore s'il tourne
 *   - partie en cours     : l'agent du bar a vu l'emulateur tourner
 *   - echec               : message clair plutot qu'un ecran fige
 *
 * Les deux dalles affichent la meme chose parce qu'elles lisent le meme ordre.
 * C'est ce qui empeche le slave de rester bloque sur "partie en cours" : meme
 * s'il rate tous les evenements temps reel, le prochain sondage le libere.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Loader2, AlertTriangle } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { leaveGameScreen, useLaunchOrder } from '../hooks/useLaunchOrder';
import { useT } from '../i18n/useT';
import ArcadeButton from '../components/ui/ArcadeButton';
import { endOrder, reportFocus } from '../lib/gameLaunch';

/** sur le master, cadence a laquelle on regarde si Edge a repris la main */
const FOCUS_CHECK_MS = 3_000;

export default function InGamePage() {
  const identity = useHostname();
  const navigate = useNavigate();
  const t = useT();
  const { order, ready, refresh } = useLaunchOrder();
  const [closing, setClosing] = useState(false);

  const orderId = order?.id ?? null;
  const isMaster = identity?.role === 'master';

  // Retour du focus sur le master : indice de fin de partie. On le remonte,
  // le serveur decide : il ignore les premieres secondes apres le lancement,
  // ou Edge reprend brievement la main avant que l'emulateur ouvre sa fenetre.
  // La verification periodique rattrape une fin de jeu sans evenement focus
  // (jeu quitte pendant ce delai, ou Edge deja considere comme actif) : tant
  // que l'emulateur tourne, c'est lui qui a la main, jamais Edge.
  // Des que le serveur retient le signal, on recharge sans attendre le
  // prochain sondage : l'ecran rose ne fait plus qu'un flash a la sortie du jeu.
  useEffect(() => {
    if (!isMaster || !orderId) return;
    function signaler() {
      reportFocus(orderId as string)
        .then((after) => {
          if (after?.endedAt) leaveGameScreen(navigate);
        })
        .catch(() => undefined);
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) signaler();
    }, FOCUS_CHECK_MS);
    window.addEventListener('focus', signaler);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', signaler);
    };
  }, [isMaster, orderId, navigate]);

  // Ceinture : plus d'ordre du tout (partie finie, onglet recharge, veille
  // depassee) -> on rentre. Sans ca, un ecran pouvait rester bloque ici.
  useEffect(() => {
    if (ready && !order) leaveGameScreen(navigate);
  }, [ready, order, navigate]);

  if (!order) return null;

  const failed = order.status === 'failed' || order.status === 'cancelled';
  const launching = order.status === 'pending';


  async function handleEnd() {
    if (!order) return;
    setClosing(true);
    try {
      await endOrder(order.id);
    } catch {
      /* le sondage ou le balayeur finiront par liberer la table */
    }
    refresh();
    leaveGameScreen(navigate);
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: failed
            ? 'radial-gradient(circle at 50% 50%, rgba(255,60,80,0.22), transparent 60%), linear-gradient(180deg, rgba(7,5,18,0.55) 0%, rgba(7,5,18,0.85) 100%)'
            : 'radial-gradient(circle at 50% 50%, rgba(255,43,214,0.25), transparent 60%), linear-gradient(180deg, rgba(7,5,18,0.55) 0%, rgba(7,5,18,0.85) 100%)',
        }}
      />

      <div
        className={[
          'flex h-36 w-36 items-center justify-center rounded-3xl border border-white/20 text-white',
          failed
            ? 'bg-gradient-to-br from-table-red via-[#B3243A] to-[#5E0F1C]'
            : 'bg-gradient-to-br from-table-magenta via-[#D724B5] to-[#7A0F73] shadow-neon-magenta',
        ].join(' ')}
      >
        {failed ? (
          <AlertTriangle className="h-20 w-20" />
        ) : launching ? (
          <Loader2 className="h-20 w-20 animate-spin" />
        ) : (
          <Gamepad2 className="h-20 w-20" />
        )}
      </div>

      <h1
        className="mt-10 font-display text-6xl uppercase tracking-wider text-table-ink"
        style={{
          textShadow: failed ? '0 0 24px rgba(255,60,80,0.5)' : '0 0 24px rgba(255,43,214,0.55)',
        }}
      >
        {failed
          ? t('table.ingame.failed', "Le jeu n'a pas demarre")
          : launching
            ? t('table.ingame.launching', 'Lancement en cours')
            : t('table.ingame.playing')}
      </h1>

      {order.gameName && (
        <div className="mt-3 rounded-full border border-white/15 bg-white/8 px-5 py-2 font-display text-xl uppercase tracking-wider text-table-ink">
          {order.gameName}
        </div>
      )}

      <p className="mt-8 max-w-xl text-base text-table-ink-soft">
        {failed
          ? t('table.ingame.failed.info')
          : launching
            ? t('table.ingame.launching.info')
            : t('table.ingame.howto.quit')}
      </p>

      {/* Le bouton est disponible sur LES DEUX dalles : si le master est fige,
          le client doit pouvoir liberer la table depuis l'ecran secondaire. */}
      {!launching && (
        <div className="mt-10 flex gap-3">
          {failed && (
            <ArcadeButton variant="primary" size="md" onClick={() => navigate('/table/games')}>
              {t('table.ingame.retry', 'Reessayer')}
            </ArcadeButton>
          )}
          <ArcadeButton variant="ghost" size="md" onClick={handleEnd} disabled={closing}>
            {t('table.ingame.end')}
          </ArcadeButton>
        </div>
      )}
    </div>
  );
}
