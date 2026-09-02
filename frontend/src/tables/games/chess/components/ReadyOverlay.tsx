/**
 * Sas de confirmation avant le premier coup (statut 'ready').
 *
 * POURQUOI : la pendule partait dès que l'adversaire s'asseyait, et pire encore
 * sur une revanche, où le temps courait dès le clic, avant même que les joueurs
 * aient navigué vers la nouvelle partie. Sur 57 parties jouées, 13 se
 * terminaient au temps. Ici, personne ne peut être pris de court : le chrono ne
 * démarre qu'une fois les deux joueurs prêts, après un décompte.
 *
 * Le décompte est PILOTÉ PAR LE SERVEUR (`phaseEndsAt` posé à la dernière
 * confirmation, bascule par l'advancer) : les deux dalles affichent donc le
 * même chiffre, et une dalle qui recharge en plein décompte retombe au bon
 * endroit au lieu de repartir de trois.
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { serverNow } from '../../../lib/clockSync';
import { useT } from '../../../i18n/useT';

interface Props {
  /** confirmations reçues, ex. { count: 1, total: 2 } */
  ready: { count: number; total: number } | null;
  /** ai-je déjà confirmé ? */
  voted: boolean;
  /** spectateur : il regarde, il ne confirme pas */
  seated: boolean;
  busy: boolean;
  /** échéance serveur : décompte en cours quand tout le monde a confirmé */
  phaseEndsAt: number | null;
  soloVsAi: boolean;
  onReady: () => void;
}

/** au-delà, l'échéance est le délai d'abandon de table, pas le décompte */
const COUNTDOWN_MAX_MS = 4_000;

export default function ReadyOverlay({
  ready,
  voted,
  seated,
  busy,
  phaseEndsAt,
  soloVsAi,
  onReady,
}: Props) {
  const t = useT();
  const total = ready?.total ?? 2;
  const count = ready?.count ?? 0;
  const tousPrets = count >= total;

  // Tic local pendant le seul décompte : inutile de re-rendre l'écran toutes
  // les 100 ms pendant les deux minutes d'attente d'un joueur.
  const [, force] = useState(0);
  useEffect(() => {
    if (!tousPrets) return;
    const timer = window.setInterval(() => force((v) => v + 1), 100);
    return () => window.clearInterval(timer);
  }, [tousPrets]);

  const restant = phaseEndsAt !== null ? phaseEndsAt - serverNow() : null;
  const enDecompte = tousPrets && restant !== null && restant <= COUNTDOWN_MAX_MS;
  const secondes = restant !== null ? Math.max(1, Math.ceil(restant / 1000)) : null;

  if (enDecompte) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center">
        <p className="font-display text-2xl uppercase tracking-[0.35em] text-table-ink-soft">
          {t('table.chess.ready.starting')}
        </p>
        <div
          key={secondes}
          className="anim-pop font-display text-[10rem] font-black leading-none text-table-accent"
          style={{ textShadow: '0 0 60px rgba(0,229,255,0.55)' }}
        >
          {secondes}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-7 bg-black/70 px-8 text-center">
      <p className="font-display text-4xl font-black uppercase tracking-wider text-table-ink">
        {t('table.chess.ready.title')}
      </p>
      <p className="max-w-lg text-lg text-table-ink-soft">
        {soloVsAi ? t('table.chess.ready.subSolo') : t('table.chess.ready.sub')}
      </p>

      {seated ? (
        voted ? (
          <>
            <div className="flex items-center gap-3 rounded-full border-2 border-emerald-400/60 bg-emerald-400/10 px-8 py-4">
              <Check className="h-7 w-7 text-emerald-300" />
              <span className="font-display text-2xl font-black uppercase text-emerald-300">
                {t('table.chess.ready.youAreReady')}
              </span>
            </div>
            <p className="text-lg text-table-ink-soft">{t('table.chess.ready.waitingOther')}</p>
          </>
        ) : (
          <ArcadeButton variant="accent" size="xl" disabled={busy} onClick={onReady}>
            {t('table.chess.ready.cta')}
          </ArcadeButton>
        )
      ) : (
        <p className="text-lg text-table-ink-soft">{t('table.chess.ready.spectator')}</p>
      )}

      {/* avancement, masqué en solo : « 1/1 » n'apprend rien */}
      {!soloVsAi && (
        <div className="flex items-center gap-3">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-4 w-14 rounded-full transition-colors duration-300 ${
                i < count ? 'bg-emerald-400' : 'bg-white/20'
              }`}
            />
          ))}
          <span className="ml-2 font-display text-2xl font-black tabular-nums text-table-ink">
            {count}/{total}
          </span>
        </div>
      )}
    </div>
  );
}
