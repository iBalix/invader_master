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
 */

import { useState } from 'react';
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
} from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import type { Game } from '../../hooks/useGames';
import {
  buildInvaderUrl,
  launchOnLocalMachine,
  notifySlaveStartGame,
} from '../../lib/gameLaunch';
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
    <li className={['flex gap-3 rounded-2xl border p-3', s.wrap].join(' ')}>
      <div
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
          s.iconWrap,
        ].join(' ')}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[10px] uppercase tracking-[0.3em] text-table-ink-muted">
            Etape {index}
          </span>
          {badge}
        </div>
        <div className={['mt-0.5 font-display text-sm uppercase tracking-wider', s.title].join(' ')}>
          {title}
        </div>
        <div className={['mt-0.5 text-xs leading-snug', s.body].join(' ')}>{body}</div>
      </div>
    </li>
  );
}

export default function LaunchGameModal({ open, game, onClose }: Props) {
  const identity = useHostname();
  const navigate = useNavigate();
  const t = useT();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detection live des manettes uniquement quand la modale est ouverte
  // (sinon on consomme du CPU pour rien sur les autres ecrans).
  const gamepadCount = useGamepadCount(open);

  if (!game) return null;

  const isMaster = identity?.role === 'master';
  const invaderUrl = buildInvaderUrl(game);
  const noControllerNeeded = isInvaderGame(game);
  const hasController = gamepadCount > 0;

  // Validation de l'etape 2 :
  //   - jeu Invader (web) -> pas de manette requise, toujours OK
  //   - sinon -> au moins une manette USB doit etre branchee
  const step2Valid = noControllerNeeded || hasController;

  const step2Tone: StepTone = step2Valid ? 'success' : 'danger';

  const launchDisabled = launching || !invaderUrl || !step2Valid;

  async function handleLaunch() {
    if (!game) return;
    if (!identity || identity.role !== 'master') return;
    if (!invaderUrl) {
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
    try {
      await notifySlaveStartGame(identity.hostname, {
        game: {
          id: game.id,
          name: game.name,
          fileName: game.fileName,
          consoleLibrary: game.consoleLibrary,
        },
        invaderUrl,
      });
      launchOnLocalMachine(invaderUrl);
      try {
        sessionStorage.setItem(
          'invaderInGame',
          JSON.stringify({ game: { id: game.id, name: game.name } })
        );
      } catch {
        /* ignore */
      }
      navigate('/table/in-game', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? t('table.games.error.launch', 'Erreur au lancement'));
      setLaunching(false);
    }
  }

  return (
    <ArcadeModal open={open} onClose={onClose} size="xl" title={game.name.toUpperCase()}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,1.4fr]">
        <div>
          {game.images?.[0] && (
            <div className="relative overflow-hidden rounded-2xl border border-white/15 shadow-glass">
              <img
                src={game.images[0]}
                alt={game.name}
                className="w-full object-cover"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {cleanConsoleName(game.consoleName) && (
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 font-display uppercase tracking-widest text-table-ink-soft">
                {cleanConsoleName(game.consoleName)}
              </span>
            )}
            {game.categories.map((c) => (
              <span
                key={c}
                className="rounded-full border border-table-magenta/40 bg-table-magenta/15 px-3 py-1 font-display uppercase tracking-widest text-table-ink"
              >
                {c}
              </span>
            ))}
          </div>
          {game.subtitle && (
            <div className="mt-3 text-sm text-table-ink-soft">{game.subtitle}</div>
          )}
          {game.description && (
            <p className="mt-2 text-xs leading-relaxed text-table-ink-muted">
              {game.description}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          <div className="font-retro text-[10px] uppercase tracking-[0.3em] text-table-cyan">
            {t('table.games.before', 'Avant de lancer')}
          </div>

          <ul className="mt-3 space-y-2.5">
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
                  <span className="inline-flex items-center gap-1 rounded-full border border-table-mint/40 bg-table-mint/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-table-mint">
                    <CheckCircle2 className="h-3 w-3" /> OK
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-table-mint/40 bg-table-mint/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-table-mint tabular-nums">
                      <CheckCircle2 className="h-3 w-3" /> {gamepadCount}/4
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-table-red/50 bg-table-red/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-table-red tabular-nums">
                      <XCircle className="h-3 w-3" /> 0/4
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
                  <span className="rounded border border-table-yellow/50 bg-table-yellow/15 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-table-yellow">
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
            {isMaster ? (
              <>
                <ArcadeButton
                  variant="primary"
                  size="xl"
                  fullWidth
                  disabled={launchDisabled}
                  onClick={handleLaunch}
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
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                <div className="font-display text-lg uppercase tracking-wider text-table-ink">
                  {t('table.games.slave.title', "Lancement depuis l'ecran principal")}
                </div>
                <div className="mt-2 text-xs text-table-ink-muted">
                  {t('table.games.slave.info')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ArcadeModal>
  );
}
