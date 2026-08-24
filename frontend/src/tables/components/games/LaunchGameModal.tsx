/**
 * Modale de lancement d'un jeu (DA V3 launcher glass).
 *
 * Cover + tags + 3 etapes avant lancement :
 *   1. Passer commande (au comptoir ou sur la table)
 *   2. Brancher les manettes USB - dynamique :
 *      - Jeu Invader (web) -> "Pas besoin de manettes" (vert)
 *      - Sinon : detection live du nb de manettes USB connectees
 *        (vert avec X/4 si >= 1, rouge si 0)
 *   3. Pour quitter le jeu : maintenir START 3s
 *
 * Le compte de manettes est mis a jour live via la Gamepad API.
 *
 * LANCEMENT : les DEUX dalles peuvent lancer. La demande part au serveur, qui
 * l'adresse au PC master (seul cable aux deux ecrans, seul capable de basculer
 * la dalle du slave). L'ecran qui a clique suit l'avancement ici meme ; l'autre
 * bascule sur l'ecran plein cadre. Avant, un client sur l'ecran secondaire ne
 * pouvait tout simplement pas lancer de jeu.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coffee,
  Gamepad2,
  Power,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowLeft,
  Loader2,
  Joystick,
} from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import YouTubeFadePreview from './YouTubeFadePreview';
import SNESControllerSchematic from './SNESControllerSchematic';
import type { Game } from '../../hooks/useGames';
import { requestLaunch } from '../../lib/gameLaunch';
import { useLaunchOrder, primeLaunchOrder } from '../../hooks/useLaunchOrder';
import { useHostname } from '../../hooks/useHostname';
import { useGamepadCount } from '../../hooks/useGamepadCount';
import { useT } from '../../i18n/useT';

interface Props {
  open: boolean;
  game: Game | null;
  onClose: () => void;
}

type StepTone = 'neutral' | 'success' | 'danger';

const TONE_STYLES: Record<
  StepTone,
  { wrap: string; iconWrap: string; title: string; body: string }
> = {
  neutral: {
    wrap: 'border-white/10 bg-white/5',
    iconWrap: 'border-white/15 bg-table-violet/40 text-table-ink',
    title: 'text-table-ink',
    body: 'text-table-ink-muted',
  },
  success: {
    wrap: 'border-table-mint/40 bg-table-mint/10',
    iconWrap: 'border-table-mint/40 bg-table-mint/20 text-table-mint',
    title: 'text-table-mint',
    body: 'text-table-mint/80',
  },
  danger: {
    wrap: 'border-table-red/40 bg-table-red/10',
    iconWrap: 'border-table-red/40 bg-table-red/20 text-table-red',
    title: 'text-table-red',
    body: 'text-table-red/80',
  },
};

function isInvaderGame(game: Game): boolean {
  const name = (game.consoleName ?? '').toLowerCase();
  const lib = (game.consoleLibrary ?? '').toLowerCase();
  return name.includes('invader') || lib.includes('invader');
}

// Nettoie un nom de console : retire les parentheses (et leur contenu) +
// trim. Ex: "Nintendo Entertainment System (NES)" -> "Nintendo Entertainment System"
function cleanConsoleName(name: string | null | undefined): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

interface StepCardProps {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
  tone: StepTone;
  badge?: React.ReactNode;
}

function StepCard({ index, icon: Icon, title, body, tone, badge }: StepCardProps) {
  const s = TONE_STYLES[tone];
  return (
    <li className={['flex gap-4 rounded-2xl border p-5', s.wrap].join(' ')}>
      <div
        className={[
          'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border',
          s.iconWrap,
        ].join(' ')}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xs uppercase tracking-[0.3em] text-table-ink-muted">
            Etape {index}
          </span>
          {badge}
        </div>
        <div className={['mt-1 font-display text-lg uppercase tracking-wider', s.title].join(' ')}>
          {title}
        </div>
        <div className={['mt-1 text-sm leading-relaxed', s.body].join(' ')}>{body}</div>
      </div>
    </li>
  );
}

export default function LaunchGameModal({ open, game, onClose }: Props) {
  const identity = useHostname();
  const navigate = useNavigate();
  const t = useT();
  const { order } = useLaunchOrder();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ordre deja en cours sur la table, sur un AUTRE jeu : on ne bascule jamais
  // en silence, le client doit confirmer.
  const [busyOrderGame, setBusyOrderGame] = useState<string | null>(null);
  // Etape de la modale : 'details' (defaut) ou 'controls' (rappel touches avant lancement)
  const [step, setStep] = useState<'details' | 'controls'>('details');

  // Detection live des manettes uniquement quand la modale est ouverte
  // (sinon on consomme du CPU pour rien sur les autres ecrans).
  const gamepadCount = useGamepadCount(open);

  // Reset de l'etape + erreur a la fermeture (et au changement de jeu)
  useEffect(() => {
    if (!open) {
      setStep('details');
      setError(null);
      setLaunching(false);
      setBusyOrderGame(null);
    }
  }, [open, game?.id]);

  // L'ordre est la verite : des qu'il est confirme, on passe a l'ecran plein
  // cadre. En cas d'echec, on affiche le message ici plutot que de laisser un
  // spinner tourner indefiniment.
  const orderStatus = order?.status ?? null;
  const orderIsForThisGame = !!order && !!game && order.gameId === game.id;
  useEffect(() => {
    if (!orderIsForThisGame) return;
    if (orderStatus === 'dispatched') {
      navigate('/table/in-game', { replace: true });
    } else if (orderStatus === 'failed' || orderStatus === 'cancelled') {
      setLaunching(false);
      setError(t('table.ingame.failed.info'));
    }
  }, [orderIsForThisGame, orderStatus, navigate, t]);

  if (!game) return null;

  // Jeux de la categorie "Bornes" : consultables mais pas lancables depuis une
  // table, ils tournent sur les bornes d'arcade de la salle. Regle heritee de la
  // v1 (invader_table/game.php:318) qui n'avait pas ete reprise ici.
  const reserveAuxBornes = game.bornesOnly === true;

  const launchable = !!game.fileName;
  const noControllerNeeded = isInvaderGame(game);
  const hasController = gamepadCount > 0;

  const hasControls = !!(
    game.controlA || game.controlB || game.controlX || game.controlY ||
    game.controlL || game.controlR || game.controlStart || game.controlSelect
  );
  const specialNote = game.specialNote?.trim() || '';
  const hasSpecialNote = !!specialNote;
  // L'etape de rappel s'affiche des qu'il y a une mention OU des touches configurees.
  const hasPreLaunchInfo = hasControls || hasSpecialNote;

  // Validation de l'etape 2 :
  //   - jeu Invader (web) -> pas de manette requise, toujours OK
  //   - sinon -> au moins une manette USB doit etre branchee
  const step2Valid = noControllerNeeded || hasController;

  const step2Tone: StepTone = step2Valid ? 'success' : 'danger';

  const launchDisabled = launching || !launchable || !step2Valid;
  // Ecran d'attente : on a demande, le serveur n'a pas encore confirme.
  const waiting = launching || (orderIsForThisGame && orderStatus === 'pending');

  async function handleLaunch(replace = false) {
    if (!game) return;
    if (!identity) return;
    // Garde-fou : aucun chemin ne doit pouvoir lancer un jeu de borne, meme si
    // un bouton reapparaissait un jour par accident.
    if (game.bornesOnly === true) return;
    if (!launchable) {
      setError(
        t(
          'table.games.error.missing',
          'Ce jeu ne peut pas etre lance (configuration manquante).'
        )
      );
      return;
    }
    setLaunching(true);
    setError(null);
    setBusyOrderGame(null);
    try {
      const { order: created, alreadyActive } = await requestLaunch(game.id, { replace });
      // Une partie tourne deja sur un AUTRE jeu : on demande confirmation au
      // lieu de la couper dans le dos du joueur en cours.
      if (alreadyActive && created && created.gameId !== game.id) {
        setLaunching(false);
        setBusyOrderGame(created.gameName);
        return;
      }
      // Le store partage prend l'ordre tout de suite : sur le master, c'est ce
      // qui declenche la reclamation puis le deeplink, sans attendre le
      // prochain sondage.
      primeLaunchOrder(created);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          err?.message ??
          t('table.games.error.launch', 'Erreur au lancement')
      );
      setLaunching(false);
    }
  }

  // Action du bouton primaire en vue details :
  //  - si le jeu a des touches configurees -> on affiche d'abord le rappel des touches
  //  - sinon -> lancement direct
  function handlePrimaryAction() {
    if (hasPreLaunchInfo) {
      setStep('controls');
    } else {
      void handleLaunch();
    }
  }

  // ----- Vue "une partie tourne deja" -----
  // Jamais de bascule silencieuse : couper la partie d'un autre client sans
  // le lui dire serait pire que de lui demander.
  if (busyOrderGame) {
    return (
      <ArcadeModal open={open} onClose={onClose} size="lg" title={game.name.toUpperCase()}>
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <AlertTriangle className="h-12 w-12 text-table-yellow" />
          <div className="font-display text-2xl uppercase tracking-wider text-table-ink">
            {t('table.games.busy.title', 'Une partie est deja en cours')}
          </div>
          <p className="max-w-md text-sm text-table-ink-muted">
            {t('table.games.busy.info', 'Sur cette table : {game}. Veux-tu changer de jeu ?').replace(
              '{game}',
              busyOrderGame
            )}
          </p>
          <div className="flex gap-3">
            <ArcadeButton variant="ghost" size="md" onClick={onClose}>
              {t('table.common.back', 'Retour')}
            </ArcadeButton>
            <ArcadeButton variant="primary" size="md" onClick={() => void handleLaunch(true)}>
              {t('table.games.busy.replace', 'Changer de jeu')}
            </ArcadeButton>
          </div>
        </div>
      </ArcadeModal>
    );
  }

  // ----- Vue "lancement en cours" -----
  // C'est la pop-up d'attente : elle reste affichee tant que le serveur n'a pas
  // tranche. Elle ne peut pas rester bloquee, l'ordre finit toujours par etre
  // confirme, echoue ou balaye.
  if (waiting) {
    return (
      <ArcadeModal open={open} onClose={onClose} size="lg" title={game.name.toUpperCase()}>
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <Loader2 className="h-14 w-14 animate-spin text-table-magenta" />
          <div className="font-display text-3xl uppercase tracking-wider text-table-ink">
            {t('table.ingame.launching', 'Lancement en cours')}
          </div>
          <p className="max-w-md text-sm text-table-ink-muted">
            {t('table.ingame.launching.info')}
          </p>
        </div>
      </ArcadeModal>
    );
  }

  // ----- Vue "rappel des touches" -----
  if (step === 'controls') {
    return (
      <ArcadeModal open={open} onClose={onClose} size="2xl" title={game.name.toUpperCase()}>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setStep('details')}
            className="mb-4 flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-display text-sm uppercase tracking-wider text-table-ink-soft transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>

          <div className="mb-4 font-retro text-xs uppercase tracking-[0.3em] text-table-cyan">
            {hasControls ? 'Rappel des touches' : 'A savoir'}
          </div>

          {hasSpecialNote && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-table-yellow/40 bg-table-yellow/10 p-4">
              <Sparkles className="h-5 w-5 shrink-0 text-table-yellow" />
              <p className="text-sm leading-relaxed text-table-ink whitespace-pre-line">
                {specialNote}
              </p>
            </div>
          )}

          {hasControls && (
            <SNESControllerSchematic
              controls={{
                controlA: game.controlA, controlB: game.controlB,
                controlX: game.controlX, controlY: game.controlY,
                controlL: game.controlL, controlR: game.controlR,
                controlStart: game.controlStart, controlSelect: game.controlSelect,
              }}
            />
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-table-red/40 bg-table-red/15 p-3 text-sm text-table-red">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="mt-6">
            <ArcadeButton
              variant="primary"
              size="xl"
              fullWidth
              disabled={launchDisabled}
              onClick={() => void handleLaunch()}
              icon={<Play className="h-6 w-6" />}
            >
              {launching
                ? t('table.games.launching', 'Lancement...')
                : t('table.games.launch')}
            </ArcadeButton>
            {!step2Valid && !launching && (
              <div className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-table-red">
                <AlertTriangle className="h-3.5 w-3.5" />
                Branche une manette USB pour pouvoir lancer le jeu.
              </div>
            )}
          </div>
        </div>
      </ArcadeModal>
    );
  }

  // ----- Vue "details" (defaut) -----
  return (
    <ArcadeModal open={open} onClose={onClose} size="2xl" title={game.name.toUpperCase()}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr,1fr]">
        <div>
          {game.youtubeVideoId ? (
            <YouTubeFadePreview
              videoId={game.youtubeVideoId}
              startSec={game.youtubeStartSec ?? 0}
              durationSec={game.youtubeDurationSec ?? null}
              fallbackImageUrl={game.images?.[0] ?? null}
              alt={game.name}
            />
          ) : game.images?.[0] ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/15 shadow-glass">
              <img
                src={game.images[0]}
                alt={game.name}
                className="w-full object-cover"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {cleanConsoleName(game.consoleDisplayName ?? game.consoleName) && (
              <span className="rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 font-display uppercase tracking-widest text-table-ink-soft">
                {cleanConsoleName(game.consoleDisplayName ?? game.consoleName)}
              </span>
            )}
            {game.categories.map((c) => (
              <span
                key={c}
                className="rounded-full border border-table-magenta/40 bg-table-magenta/15 px-3.5 py-1.5 font-display uppercase tracking-widest text-table-ink"
              >
                {c}
              </span>
            ))}
          </div>
          {game.subtitle && (
            <div className="mt-4 text-base text-table-ink-soft">{game.subtitle}</div>
          )}
          {game.description && (
            <p className="mt-2 text-sm leading-relaxed text-table-ink-muted">
              {game.description}
            </p>
          )}
        </div>

        {reserveAuxBornes ? (
          <div className="flex flex-col justify-center">
            <div className="rounded-2xl border border-table-yellow/40 bg-table-yellow/10 p-7 text-center">
              <Joystick className="mx-auto h-14 w-14 text-table-yellow" />
              <div className="mt-4 font-display text-3xl uppercase leading-tight tracking-wider text-table-yellow">
                {t('table.games.arcadeOnly.title', 'Disponible sur une borne du bar')}
              </div>
              <p className="mt-3 text-base leading-relaxed text-table-ink-soft">
                {t(
                  'table.games.arcadeOnly.info',
                  'Ce jeu ne se lance pas depuis la table. Rends-toi sur une borne d\'arcade de la salle pour y jouer.',
                )}
              </p>
            </div>
          </div>
        ) : (
        <div className="flex flex-col">
          <div className="font-retro text-xs uppercase tracking-[0.3em] text-table-cyan">
            {t('table.games.before', 'Avant de lancer')}
          </div>

          <ul className="mt-4 space-y-3">
            <StepCard
              index={1}
              icon={Coffee}
              title="Passer commande"
              body="Au comptoir ou directement depuis la carte sur cette table."
              tone="neutral"
            />

            {noControllerNeeded ? (
              <StepCard
                index={2}
                icon={Sparkles}
                title="Pas besoin de manettes"
                body="Ce jeu se joue directement sur l'ecran tactile."
                tone="success"
                badge={
                  <span className="inline-flex items-center gap-1 rounded-full border border-table-mint/40 bg-table-mint/15 px-2.5 py-1 font-display text-xs uppercase tracking-widest text-table-mint">
                    <CheckCircle2 className="h-3.5 w-3.5" /> OK
                  </span>
                }
              />
            ) : (
              <StepCard
                index={2}
                icon={Gamepad2}
                title="Brancher les manettes"
                body={
                  hasController
                    ? `Manette${gamepadCount > 1 ? 's' : ''} detectee${gamepadCount > 1 ? 's' : ''}, vous pouvez lancer la partie.`
                    : 'Branche au moins une manette USB sur le PC pour pouvoir jouer.'
                }
                tone={step2Tone}
                badge={
                  hasController ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-table-mint/40 bg-table-mint/15 px-2.5 py-1 font-display text-xs uppercase tracking-widest text-table-mint tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {gamepadCount}/4
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-table-red/50 bg-table-red/15 px-2.5 py-1 font-display text-xs uppercase tracking-widest text-table-red tabular-nums">
                      <XCircle className="h-3.5 w-3.5" /> 0/4
                    </span>
                  )
                }
              />
            )}

            <StepCard
              index={3}
              icon={Power}
              title="Pour quitter la partie"
              body={
                <span>
                  Maintiens la touche{' '}
                  <span className="rounded border border-table-yellow/50 bg-table-yellow/15 px-2 py-0.5 font-display text-xs uppercase tracking-widest text-table-yellow">
                    Start
                  </span>{' '}
                  pendant <strong className="text-table-ink">3 secondes</strong>.
                </span>
              }
              tone="neutral"
            />
          </ul>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-table-red/40 bg-table-red/15 p-3 text-xs text-table-red">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="mt-auto pt-5">
            {/* Les deux dalles lancent. Le serveur adresse ensuite l'ordre au
                PC master : c'est lui qui execute et bascule l'ecran. */}
            <ArcadeButton
              variant="primary"
              size="xl"
              fullWidth
              disabled={launchDisabled}
              onClick={handlePrimaryAction}
              icon={<Play className="h-6 w-6" />}
            >
              {launching
                ? t('table.games.launching', 'Lancement...')
                : t('table.games.launch')}
            </ArcadeButton>
            {!step2Valid && !launching && (
              <div className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-table-red">
                <AlertTriangle className="h-3.5 w-3.5" />
                Branche une manette USB pour pouvoir lancer le jeu.
              </div>
            )}
            {identity?.role === 'slave' && (
              <div className="mt-3 text-center text-xs text-table-ink-muted">
                {t('table.games.slave.info')}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </ArcadeModal>
  );
}
