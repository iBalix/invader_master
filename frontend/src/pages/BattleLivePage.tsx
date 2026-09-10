/**
 * Console gamemaster — pilotage d'une session BATTLE ROYALE en direct.
 * Route back-office : /evenements/battle-live
 *
 * Point central : le panneau VERDICT. À chaque question, les éliminations
 * sont provisoires ; le GM corrige (bonne réponse / ressusciter / repêchage
 * général / fin de manche co-vainqueurs) AVANT d'afficher les résultats à la
 * salle. Rien n'est persisté avant "Afficher les résultats".
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crown,
  Eye,
  Flag,
  LifeBuoy,
  ListOrdered,
  Film,
  MonitorPlay,
  Music2,
  FlaskConical,
  Pause,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Smartphone,
  Square,
  Swords,
  Trash2,
  UserX,
  Volume2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useConfirmation } from '../game/hooks/useConfirmation';
import { Link } from 'react-router-dom';
import { QrCanvas } from '../game/ui/bits';
import { BR_REVEAL_MIN_MS, BR_REVEAL_MIN_PALIER_MS } from '../game/lib/gameClient';
import LightsBadge from '../components/Live/LightsBadge';

// ---------------------------------------------------------------------------
// Types (vue GM battle)
// ---------------------------------------------------------------------------

interface GmPlayer {
  id: string;
  pseudo: string;
  device: string;
  score: number;
  status: string;
  stats: { correctCount?: number; answerCount?: number };
}

interface QueueItem {
  id: string;
  question: string;
  answers: string[];
  correctIndex: number;
  difficulty: string;
  theme: string;
  helpStory: string;
}

interface VerdictPendingEntry {
  playerId: string;
  pseudo: string;
  reason: 'wrong' | 'timeout';
  choice: number | null;
  elapsedMs: number | null;
  overturned?: 'correct' | 'revived' | null;
}

interface BattleStanding {
  playerId: string;
  pseudo: string;
  score: number;
  position: number;
  qualifiedForFinal: boolean;
  isSpectator: boolean;
}

export interface GmBattle {
  roundNumber: number;
  roundQuestionCount: number;
  isFinal: boolean;
  nextDifficulty: string;
  verdict: {
    computing: boolean;
    pending: VerdictPendingEntry[];
    correctPseudos: string[];
    answeredCount: number;
    survivorsBefore: number;
    survivorsAfter: number;
    repechage: boolean;
  } | null;
  queue: Record<string, QueueItem[]>;
  eliminatedCount: number;
  waitingCount: number;
  spectatorCount: number;
  botCount: number;
  reveal: {
    cancelled?: boolean;
    correctAnswer?: string;
    eliminated: Array<{ pseudo: string; reason: string }>;
    repechage: boolean;
    survivorsBefore: number;
    survivorsAfter: number;
    milestone?: number | null;
    roundWinner?: string;
    victory?: boolean;
  } | null;
  roundResult: {
    roundNumber: number;
    entries: Array<{ pseudo: string; rank: number; bonus: number; survived: boolean }>;
  } | null;
  generalStandings: BattleStanding[] | null;
  /** classement de la FINALE, precalcule quand elle est jouee (ecran de fin) */
  finalStandings: BattleStanding[] | null;
  winner: { pseudo: string } | null;
  victoryPending: boolean;
}

export interface GmState {
  id: string;
  joinCode: string;
  mode: string;
  status: string;
  quizName: string;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  currentQuestionIndex: number;
  playerCount: number;
  config: { musicVolume?: number; sfxVolume?: number; mediaVolume?: number; wifiSsid: string; testMode?: boolean };
  gm: {
    currentQuestion: {
      question: string;
      answers: string[];
      correctIndex: number;
      difficulty: string;
      theme: string | null;
      helpAnimator: string | null;
    } | null;
    players: GmPlayer[];
    battle: GmBattle | null;
  };
}

interface BattleStats {
  Facile: number;
  Moyen: number;
  Difficile: number;
  total: number;
  available?: Record<string, number>;
  used?: Record<string, number>;
}

const STATUS_LABELS: Record<string, string> = {
  lobby: 'Salle d\'attente',
  rules: 'Règles affichées',
  round_intro: 'Intro de manche',
  announce: 'Annonce',
  question: 'Question en cours',
  locked: 'Grâce (dernières réponses)',
  verdict: 'VERDICT : à toi de valider',
  reveal: 'Résultats affichés',
  round_end: 'Fin de manche',
  pause: 'Pause',
  closing: 'Fondu de fin',
  end: 'Fin de partie',
};

const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'] as const;

export default function BattleLivePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GmState | null>(null);
  const [busy, setBusy] = useState(false);
  const { demander, dialogue } = useConfirmation();

  // découverte de la session battle active
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get('/api/game');
        const sessions = (data.items ?? []) as Array<{ id: string; mode: string; endedAt: string | null }>;
        const active = sessions.find((s) => !s.endedAt && s.mode === 'battle');
        if (active) setSessionId(active.id);
      } catch {
        /* première visite */
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/api/game/${sessionId}/state`);
      setState(data.data ?? null);
    } catch {
      /* poll suivant */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [sessionId, refresh]);

  const action = useCallback(
    async (name: string, params: Record<string, unknown> = {}, confirmMsg?: string) => {
      if (!sessionId || busy) return;
      if (confirmMsg && !(await demander(confirmMsg))) return;
      setBusy(true);
      try {
        const { data } = await api.post(`/api/game/${sessionId}/action`, { action: name, params });
        setState(data.data ?? null);
      } catch (err) {
        const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
        toast.error(msg ?? 'Action impossible');
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, demander],
  );

  if (!sessionId || !state) {
    return (
      <Coque>
        <BattleLauncher onLaunched={(id) => setSessionId(id)} />
      </Coque>
    );
  }

  return (
    <Coque>
      {dialogue}
        <BattleGmBody
        state={state}
        busy={busy}
        action={action}
        onRefresh={() => void refresh()}
        onClosed={() => {
          setSessionId(null);
          setState(null);
        }}
      />
    </Coque>
  );
}

// ---------------------------------------------------------------------------
// Launcher : stock + lancement
// ---------------------------------------------------------------------------

function BattleLauncher({ onLaunched }: { onLaunched: (id: string) => void }) {
  const [stats, setStats] = useState<BattleStats | null>(null);
  const [launching, setLaunching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { demander, dialogue } = useConfirmation();

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/battle-questions/stats');
      setStats((data.stats ?? null) as BattleStats | null);
    } catch {
      /* silencieux */
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const launch = async (testMode = false) => {
    setLaunching(true);
    try {
      const { data } = await api.post('/api/game', {
        mode: 'battle',
        ...(testMode ? { config: { testMode: true } } : {}),
      });
      toast.success(
        testMode
          ? `Battle de TEST créée (stock intact) ! Code : ${data.data.joinCode}`
          : `Battle créée ! Code : ${data.data.joinCode}`,
      );
      onLaunched(data.data.id);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(msg ?? 'Erreur au lancement');
    } finally {
      setLaunching(false);
    }
  };

  const resetUsage = async () => {
    if (!(await demander('Remettre TOUTES les questions déjà posées en circulation ?'))) return;
    setResetting(true);
    try {
      const { data } = await api.post('/api/battle-questions/reset-usage');
      toast.success(data.message ?? 'Questions réinitialisées');
      void loadStats();
    } catch {
      toast.error('Échec de la réinitialisation');
    } finally {
      setResetting(false);
    }
  };

  const urlConsole = `${window.location.origin}/evenements/battle-live`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {dialogue}
      <h1 className="text-2xl font-black">Battle Royale live</h1>
      <p className="mt-1 text-sm text-slate-400">
        Lance une battle : le projecteur et les écrans du bar basculent automatiquement. Une
        question posée ne ressort jamais, l'IA maintient le stock.
      </p>

      {/* La console est faite pour le telephone, encore faut-il y arriver :
          l'animateur scanne et atterrit dessus. Le QR pointe sur la console
          elle-meme, l'authentification back-office reste requise. */}
      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <QrCanvas value={urlConsole} size={116} />
        <div className="min-w-0">
          <p className="font-bold">Ouvrir la console sur ton téléphone</p>
          <p className="mt-1 text-sm text-slate-400">
            Scanne ce code : tu arrives directement ici. Connexion back-office demandée si tu
            n'es pas déjà identifié sur l'appareil.
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(urlConsole);
              toast.success('Lien copié');
            }}
            className="mt-2 flex w-full max-w-full items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            <span className="min-w-0 flex-1 truncate">{urlConsole}</span>
            <span className="shrink-0 text-slate-400">copier</span>
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="font-bold">Stock de questions</h2>
          {stats ? (
            <div className="mt-3 space-y-2">
              {DIFFICULTIES.map((d) => {
                const available = stats.available?.[d] ?? 0;
                const used = stats.used?.[d] ?? 0;
                return (
                  <div key={d} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-300">{d}</span>
                    <span>
                      <span className={`font-bold ${available < 5 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {available} disponible{available > 1 ? 's' : ''}
                      </span>
                      <span className="ml-2 text-slate-500">· {used} consommée{used > 1 ? 's' : ''}</span>
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-slate-500">
                Une question posée est retirée du stock pour de bon. Sous 5 disponibles par
                difficulté, l'IA en regénère automatiquement pendant la partie. Une battle de test
                ne consomme rien.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Chargement...</p>
          )}
          <button
            type="button"
            disabled={resetting}
            onClick={() => void resetUsage()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            <RotateCcw size={14} /> Remettre les questions en circulation
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="font-bold">Nouvelle battle</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>⚔️ Élimination à chaque question, +1 point par bonne réponse</li>
            <li>🏅 Bonus de fin de manche : 25 / 20 / 18... jusqu'au 20e</li>
            <li>👑 Le top 10 du général s'affronte en finale</li>
            <li>🤖 Ajoute des bots depuis la console pour tester</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              <Swords size={15} /> {launching ? 'Lancement...' : 'Lancer la battle'}
            </button>
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
            >
              <FlaskConical size={15} /> Battle de test
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            La battle de test se joue normalement, mais aucune question n'est consommée : elles
            restent toutes disponibles pour les vraies soirées.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Coque plein ecran de la console, jumelle de celle du quiz.
 *
 * La page vit HORS du gabarit back-office (la barre laterale de 256 px rendait
 * la console inutilisable au telephone) : sans coque, elle se retrouvait sur un
 * fond nu, sans fond ni retour en arriere. Le fond sombre est aussi celui de la
 * salle : l'animateur a l'ecran en pleine figure toute la soiree.
 */
function Coque({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 lg:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft size={13} /> Back-office
        </Link>
        <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
          Console battle
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Corps de la console, SANS acces reseau : il ne recoit que l'etat et une
 * fonction d'action. C'est ce qui permet au laboratoire de le monter avec des
 * donnees factices et une action sans effet, et donc de regler la surface la
 * moins testee du parc, celle que l'animateur tient en main toute la soiree.
 */
/**
 * La console se met en page sur SA PROPRE largeur, mesuree, et non sur celle de
 * la fenetre.
 *
 * Les media queries de Tailwind regardent la fenetre : montee dans le cadre
 * telephone du laboratoire (375 px) au milieu d'un ecran large, la console
 * gardait ses trois colonnes ecrasees et le labo mentait sur ce que
 * l'animateur verrait vraiment. Une mesure du conteneur dit la verite partout,
 * page reelle comprise.
 */
const EtroitContext = createContext(false);

export function BattleGmBody({
  state,
  busy,
  action,
  onRefresh,
  onClosed,
}: {
  state: GmState;
  busy: boolean;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
  onRefresh: () => void;
  onClosed: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setEtroit(e.contentRect.width < 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <EtroitContext.Provider value={etroit}>
    <div ref={ref} className="mx-auto max-w-[1400px] px-3 pb-10 pt-3 sm:px-5">
      <Header state={state} onRefresh={onRefresh} action={action} onClosed={onClosed} />
      <div className={`mt-4 grid gap-4 ${etroit ? 'grid-cols-1' : 'grid-cols-3 gap-6'}`}>
        <div className={`space-y-4 ${etroit ? '' : 'col-span-2 space-y-6'}`}>
          <ControlPanel state={state} busy={busy} action={action} />
          {state.status === 'verdict' && <VerdictPanel state={state} busy={busy} action={action} />}
          {state.status === 'reveal' && <RevealPanel state={state} />}
          <QuestionCard state={state} />
          {(state.status === 'round_end' || state.status === 'end') && <StandingsCard state={state} />}
          <QueuePanel state={state} action={action} />
        </div>
        <div className={`space-y-4 ${etroit ? '' : 'space-y-6'}`}>
          <PlayersPanel state={state} busy={busy} action={action} />
          <LightsBadge />
          <MixerPanel state={state} action={action} />
        </div>
      </div>
    </div>
    </EtroitContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Header + pilotage
// ---------------------------------------------------------------------------

/**
 * En-tete collant, calque sur celui du quiz.
 *
 * Les actions sont en ICONES SEULES sous 900 px : a quatre libelles, l'en-tete
 * partait sur deux lignes en 375 px et le nom de la partie etait ecrase. La
 * barre du bas dit combien il reste de monde en piste : c'est l'information
 * qui compte dans une battle, et elle fond a vue d'oeil.
 */
function Header({
  state,
  onRefresh,
  action,
  onClosed,
}: {
  state: GmState;
  onRefresh: () => void;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
  onClosed: () => void;
}) {
  const etroit = useContext(EtroitContext);
  const { demander, dialogue } = useConfirmation();
  const b = state.gm.battle;
  const [qrOuvert, setQrOuvert] = useState(false);
  const urlConsole = `${window.location.origin}/evenements/battle-live`;
  const inscrits =
    state.playerCount + (b?.eliminatedCount ?? 0) + (b?.waitingCount ?? 0) + (b?.spectatorCount ?? 0);
  const enPiste = inscrits > 0 ? state.playerCount / inscrits : 0;

  const bouton = 'inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold';

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
      {dialogue}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-black lg:text-lg">{state.quizName}</h1>
            <span
              className={`shrink-0 truncate rounded-full px-2.5 py-0.5 text-[11px] font-bold lg:text-xs ${
                state.status === 'verdict'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-indigo-500/20 text-indigo-300'
              }`}
            >
              {STATUS_LABELS[state.status] ?? state.status}
            </span>
            {b?.isFinal && (
              <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                👑
                <span className="ml-1 hidden lg:inline">FINALE</span>
              </span>
            )}
            {state.config.testMode && (
              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                🧪
                <span className="ml-1 hidden lg:inline">TEST</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400 lg:text-xs">
            {b && b.roundNumber > 0 && `M${b.roundNumber} · Q${b.roundQuestionCount} · `}
            <span className="font-bold text-slate-200">{state.playerCount}</span> en vie ·{' '}
            {b?.eliminatedCount ?? 0} éliminé{(b?.eliminatedCount ?? 0) > 1 ? 's' : ''}
            {(b?.waitingCount ?? 0) > 0 && ` · ${b?.waitingCount} en attente`}
            {(b?.spectatorCount ?? 0) > 0 && ` · ${b?.spectatorCount} spect.`}
            {' · '}
            <span className="font-mono font-bold text-slate-200">{state.joinCode}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            title="Rafraîchir"
            aria-label="Rafraîchir"
            className={`${bouton} border-white/15 text-slate-300 hover:bg-white/5`}
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => setQrOuvert(true)}
            title="QR code de la console"
            aria-label="QR code de la console"
            className={`${bouton} border-white/15 text-slate-300 hover:bg-white/5`}
          >
            <QrCode size={15} />
            <span className={etroit ? 'hidden' : 'hidden lg:inline'}>QR console</span>
          </button>
          <a
            href={`${window.location.origin}/play/${state.joinCode}`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir la page joueur"
            className={`${bouton} border-white/15 text-slate-300 hover:bg-white/5`}
          >
            <Smartphone size={15} />
            <span className={etroit ? 'hidden' : 'hidden lg:inline'}>Joueur ↗</span>
          </a>
          <a
            href={`${window.location.origin}/screen/PROJO`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir le projecteur"
            className={`${bouton} border-white/15 text-slate-300 hover:bg-white/5`}
          >
            <MonitorPlay size={15} />
            <span className={etroit ? 'hidden' : 'hidden lg:inline'}>Projo ↗</span>
          </a>
          {/* Arret toujours a portee : une soiree qui doit s'arreter ne laisse
              pas le temps de faire defiler jusqu'en bas de page. */}
          <button
            type="button"
            onClick={async () => {
              if (!(await demander('Arrêter la battle ? Les écrans font un fondu puis reviennent à l\'accueil.'))) return;
              await action('stop');
              onClosed();
              toast.success('Battle terminée (fondu en cours)');
            }}
            title="Arrêter la battle"
            aria-label="Arrêter la battle"
            className={`${bouton} border-rose-400/40 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20`}
          >
            <Square size={15} />
            <span className={etroit ? 'hidden' : 'hidden lg:inline'}>Arrêter</span>
          </button>
        </div>
      </div>

      {/* Ce qui reste en piste, en une barre : elle fond a chaque question. */}
      {inscrits > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${enPiste * 100}%`, transition: 'width 500ms ease' }}
          />
        </div>
      )}

      {/* PORTAIL obligatoire : l'en-tete est collant avec backdrop-blur, et un
          backdrop-filter fait de son element le referent des descendants en
          position fixed. Rendue ici, la modale se centrait dans l'en-tete. */}
      {qrOuvert &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
            onClick={() => setQrOuvert(false)}
          >
            <div
              className="rounded-2xl bg-white p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-3 font-bold text-gray-900">Ouvrir la console ailleurs</h3>
              <QrCanvas value={urlConsole} size={220} />
              <p className="mt-3 break-all text-xs text-gray-400">{urlConsole}</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Btn({
  onClick,
  disabled,
  variant = 'secondary',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'warn' | 'danger';
  children: React.ReactNode;
}) {
  const etroit = useContext(EtroitContext);
  const styles = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    secondary: 'border border-white/15 text-slate-200 hover:bg-white/10',
    warn: 'border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25',
    danger: 'border border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Pleine largeur et 48 px de haut quand la console est etroite :
      // l'animateur vise a une main, dans le noir, avec un micro dans l'autre.
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${
        etroit ? 'min-h-[48px] w-full justify-center' : 'justify-start'
      } ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

function ControlPanel({
  state,
  busy,
  action,
}: {
  state: GmState;
  busy: boolean;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  /** difficulte forcee pour la prochaine question ; null = rampe automatique */
  const [forcee, setForcee] = useState<string | null>(null);
  const s = state.status;
  const b = state.gm.battle;

  // le choix ne vaut que pour UNE question : on le relache des qu'elle est tiree
  useEffect(() => {
    setForcee(null);
  }, [state.currentQuestionIndex]);

  // Verrou de revelation : le serveur refuse « question suivante » et « fin de
  // manche » tant que la sequence n'a pas fini de se jouer (409). Le bouton
  // affiche le compte a rebours plutot que de renvoyer un refus muet.
  useEffect(() => {
    if (s !== 'reveal') return;
    const i = setInterval(() => setMaintenant(Date.now()), 400);
    return () => clearInterval(i);
  }, [s]);
  const minimumReveal =
    b?.reveal?.milestone != null ? BR_REVEAL_MIN_PALIER_MS : BR_REVEAL_MIN_MS;
  const verrouMs =
    s === 'reveal' && state.phaseStartedAt !== null && !b?.victoryPending
      ? Math.max(0, state.phaseStartedAt + minimumReveal - (maintenant + (state.serverNow - Date.now())))
      : 0;
  const verrou = verrouMs > 0;
  /** manche jouee : un survivant ou moins, il n'y a plus de question a poser */
  const manchejouee =
    s === 'reveal' && !b?.isFinal && (b?.reveal?.survivorsAfter ?? 2) <= 1;

  useEffect(() => {
    if (!state.phaseEndsAt) {
      setRemaining(null);
      return;
    }
    const offset = state.serverNow - Date.now();
    const tick = () => setRemaining(Math.max(0, (state.phaseEndsAt ?? 0) - (Date.now() + offset)));
    tick();
    const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [state.phaseEndsAt, state.serverNow]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-slate-100">Pilotage</h2>
        {remaining !== null && (
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-bold text-slate-200">
            ⏱ {Math.ceil(remaining / 1000)}s
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {(s === 'lobby' || s === 'rules') && (
          <>
            <Btn variant="secondary" disabled={busy} onClick={() => void action('rules')}>
              <ScrollText size={15} /> {s === 'rules' ? 'Masquer les règles' : 'Afficher les règles'}
            </Btn>
            <Btn variant="primary" disabled={busy || state.playerCount < 2} onClick={() => void action('start-round')}>
              <Play size={15} /> Lancer la manche 1
            </Btn>
            <Btn disabled={busy} onClick={() => void action('pause')}>
              <Pause size={15} /> Pause
            </Btn>
            {state.playerCount < 2 && (
              <span className="inline-flex items-center rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400">
                2 joueurs minimum (ajoute des bots pour tester)
              </span>
            )}
          </>
        )}

        {(s === 'round_intro' || s === 'announce') && (
          <>
            <span className="inline-flex items-center rounded-lg bg-indigo-500/15 px-4 py-2.5 text-sm font-semibold text-indigo-300">
              {s === 'round_intro' ? '⚔️ Intro de manche (automatique)' : '📣 Annonce (automatique)'}
            </span>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler la question
            </Btn>
          </>
        )}

        {(s === 'question' || s === 'locked') && (
          <>
            <span className="inline-flex items-center rounded-lg bg-indigo-500/15 px-4 py-2.5 text-sm font-semibold text-indigo-300">
              {s === 'question' ? '❓ Question en cours...' : '⏳ Grâce : dernières réponses acceptées'}
            </span>
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ? (les réponses seront effacées)')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler
            </Btn>
          </>
        )}

        {s === 'verdict' && (
          <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-300">
              <Eye size={15} /> Vérifie les éliminations ci-dessous avant d'afficher les résultats
            </span>
            {/* le backend accepte les deux ici : une question posee de travers
                se rejoue sans devoir d'abord afficher les resultats */}
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ? (les réponses seront effacées)')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler
            </Btn>
          </>
        )}

        {s === 'reveal' && (
          <>
            {b?.victoryPending ? (
              <span className="inline-flex items-center rounded-lg bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-300">
                👑 Victoire ! L'écran final s'affiche automatiquement...
              </span>
            ) : manchejouee ? (
              /* PLUS QU'UN SURVIVANT : la manche est jouee. Le legacy retirait
                 purement et simplement « question suivante » dans ce cas, et
                 c'est la bonne facon : poser une question a une seule personne
                 n'a aucun sens. Le serveur la refuse aussi (409). */
              <>
                <span className="inline-flex items-center gap-2 rounded-lg bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-200">
                  👑 {b?.reveal?.roundWinner
                    ? `${b.reveal.roundWinner} remporte la manche`
                    : 'Plus de survivant'}
                </span>
                <Btn variant="primary" disabled={busy} onClick={() => void action('end-round', {}, 'Terminer la manche et distribuer les bonus ?')}>
                  <Flag size={15} /> Fin de manche
                </Btn>
              </>
            ) : (
              <>
                <Btn variant="primary" disabled={busy || verrou} onClick={() => void action('next', forcee ? { difficulty: forcee } : {})}>
                  <ChevronRight size={15} />{' '}
                  {verrou
                    ? `Révélation en cours... ${Math.ceil(verrouMs / 1000)}s`
                    : `Question suivante (${forcee ?? b?.nextDifficulty})`}
                </Btn>
                {/* La rampe automatique (3 faciles, 5 moyennes, puis
                    difficiles) convient la plupart du temps, mais l'animateur
                    sent parfois qu'il faut une facile pour laisser respirer la
                    salle, ou une difficile pour couper court a une manche qui
                    s'eternise. Le choix ne vaut que pour la prochaine. */}
                <div className="flex w-full items-center gap-1 rounded-xl border border-white/10 p-1">
                  <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Forcer
                  </span>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForcee(forcee === d ? null : d)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        forcee === d
                          ? 'bg-indigo-500/25 text-indigo-200'
                          : 'text-slate-400 hover:bg-white/5'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {!b?.isFinal && (
                  <Btn disabled={busy || verrou} onClick={() => void action('end-round', {}, 'Terminer la manche et distribuer les bonus ?')}>
                    <Flag size={15} /> Fin de manche
                  </Btn>
                )}
              </>
            )}
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ? (éliminations et points annulés)')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ? (éliminations et points annulés)')}>
              <X size={15} /> Annuler
            </Btn>
            <Btn disabled={busy} onClick={() => void action('pause')}>
              <Pause size={15} /> Pause
            </Btn>
          </>
        )}

        {s === 'round_end' && (
          <>
            <Btn variant="primary" disabled={busy} onClick={() => void action('start-round')}>
              <Play size={15} /> Manche suivante
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('start-final', {}, 'Lancer la FINALE ? Seul le top 10 continue, les autres deviennent spectateurs.')}>
              <Crown size={15} /> Lancer la finale
            </Btn>
            <Btn disabled={busy} onClick={() => void action('pause')}>
              <Pause size={15} /> Pause
            </Btn>
          </>
        )}

        {s === 'pause' && (
          <Btn variant="primary" disabled={busy} onClick={() => void action('resume')}>
            <Play size={15} /> Reprendre
          </Btn>
        )}

        {s === 'closing' && (
          <span className="inline-flex items-center rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">
            🌙 Fondu de fin en cours...
          </span>
        )}

        {s === 'end' && b?.winner && (
          <span className="inline-flex items-center rounded-lg bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-300">
            👑 Vainqueur : {b.winner.pseudo}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau VERDICT
// ---------------------------------------------------------------------------

function VerdictPanel({
  state,
  busy,
  action,
}: {
  state: GmState;
  busy: boolean;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const v = state.gm.battle?.verdict;
  const isFinal = state.gm.battle?.isFinal ?? false;
  if (!v) return null;

  if (v.computing) {
    return (
      <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 p-5">
        <p className="font-semibold text-amber-200">🤖 Calcul des éliminations en cours...</p>
      </div>
    );
  }

  const zeroSurvivors = v.survivorsAfter <= 0 && v.survivorsBefore > 0;

  return (
    <div className="rounded-xl border-2 border-rose-400/40 bg-white/5 p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-slate-100">
          Verdict · {v.pending.filter((p) => !p.overturned).length} élimination{v.pending.filter((p) => !p.overturned).length > 1 ? 's' : ''} provisoire{v.pending.filter((p) => !p.overturned).length > 1 ? 's' : ''}
        </h2>
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-bold text-slate-200">
          {v.survivorsBefore} → {v.repechage ? v.survivorsBefore : v.survivorsAfter} survivant{(v.repechage ? v.survivorsBefore : v.survivorsAfter) > 1 ? 's' : ''}
        </span>
      </div>

      {zeroSurvivors && !v.repechage && (
        <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/15 p-3">
          <p className="mb-2 font-bold text-rose-200">
            ⚠️ ZÉRO SURVIVANT : tout le monde tombe sur cette question. Deux choix :
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn variant="warn" disabled={busy} onClick={() => void action('verdict-revive-group')}>
              <LifeBuoy size={15} /> Repêchage général (tout le monde survit)
            </Btn>
            {!isFinal && (
              <Btn variant="danger" disabled={busy} onClick={() => void action('verdict-end-round-tie', {}, 'Terminer la manche avec tous les joueurs co-vainqueurs (rang 1 partagé) ?')}>
                <Flag size={15} /> Fin de manche, co-vainqueurs
              </Btn>
            )}
          </div>
        </div>
      )}

      {v.repechage && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-400/40 bg-amber-500/15 p-3">
          <p className="font-bold text-amber-200">🛟 REPÊCHAGE GÉNÉRAL activé : personne n'est éliminé.</p>
          <Btn variant="secondary" disabled={busy} onClick={() => void action('verdict-revive-group')}>
            Annuler le repêchage
          </Btn>
        </div>
      )}

      <div className="space-y-1.5">
        {v.pending.map((p) => (
          <div
            key={p.playerId}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
              v.repechage || p.overturned
                ? 'border-emerald-400/40 bg-emerald-500/15'
                : 'border-rose-400/40 bg-rose-500/15'
            }`}
          >
            <span>
              <span className="font-bold">{p.pseudo}</span>
              <span className="text-slate-300">
                {p.reason === 'timeout'
                  ? ' · pas de réponse'
                  : ` · réponse ${p.choice !== null ? String.fromCharCode(65 + p.choice) : '?'}`}
                {p.elapsedMs !== null && ` · ${(p.elapsedMs / 1000).toFixed(1)}s`}
              </span>
              {p.overturned === 'correct' && <span className="ml-2 font-bold text-emerald-300">✔ compté bonne réponse (+1)</span>}
              {p.overturned === 'revived' && <span className="ml-2 font-bold text-emerald-300">🛟 ressuscité (sans point)</span>}
            </span>
            {!v.repechage && (
              <span className="flex gap-1.5">
                {p.overturned ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void action('verdict-reset', { playerId: p.playerId })}
                    className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10"
                  >
                    Annuler
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void action('verdict-mark-correct', { playerId: p.playerId })}
                      className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-200"
                    >
                      ✔ Bonne réponse
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void action('verdict-revive', { playerId: p.playerId })}
                      className="rounded-md border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-200"
                    >
                      🛟 Ressusciter
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        ))}
        {v.pending.length === 0 && (
          <p className="text-sm text-emerald-300">Aucune élimination : tout le monde a bien répondu !</p>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {v.answeredCount} réponse{v.answeredCount > 1 ? 's' : ''} reçue{v.answeredCount > 1 ? 's' : ''} ·
        bons répondeurs : {v.correctPseudos.length > 0 ? v.correctPseudos.join(', ') : 'aucun'}
      </p>

      <div className="mt-4">
        <Btn variant="primary" disabled={busy} onClick={() => void action('show-results')}>
          <Eye size={15} /> Afficher les résultats à la salle
        </Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question courante + anecdote
// ---------------------------------------------------------------------------

function QuestionCard({ state }: { state: GmState }) {
  const q = state.gm.currentQuestion;
  const b = state.gm.battle;
  if (!q) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-100">
          Question {b?.roundQuestionCount ?? '?'} de la manche
        </h2>
        <span className="text-sm text-slate-400">{q.difficulty} · {q.theme}</span>
      </div>
      <p className="text-lg font-semibold text-slate-100">{q.question}</p>
      <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {q.answers.map((a, i) => (
          <div
            key={i}
            className={`rounded-lg border px-3 py-2 text-sm ${
              i === q.correctIndex
                ? 'border-emerald-300 bg-emerald-500/15 font-bold text-emerald-200'
                : 'border-white/10 text-slate-300'
            }`}
          >
            {String.fromCharCode(65 + i)}. {a} {i === q.correctIndex && '✔'}
          </div>
        ))}
      </div>
      {q.helpAnimator && (
        <p className="mt-3 rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-800">
          💡 <span className="font-semibold">Anecdote :</span> {q.helpAnimator}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classements (fin de manche / fin de partie)
// ---------------------------------------------------------------------------

function StandingsCard({ state }: { state: GmState }) {
  const b = state.gm.battle;
  if (!b) return null;
  // une fois la finale jouee, le general d'AVANT la finale n'est plus le
  // classement de la soiree : c'est finalStandings qui fait foi
  const final = b.finalStandings ?? null;
  const standings = final ?? b.generalStandings ?? [];
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-100">
        <ListOrdered size={16} /> {final ? 'Classement final' : 'Classement général'}
        {!final && b.roundResult && (
          <span className="text-sm font-normal text-slate-400">(après manche {b.roundResult.roundNumber})</span>
        )}
      </h2>
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {standings.map((s) => (
          <div
            key={s.playerId}
            className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
              s.qualifiedForFinal ? 'bg-amber-500/15' : ''
            } ${s.isSpectator ? 'opacity-50' : ''}`}
          >
            <span>
              <span className="mr-2 text-xs text-slate-500">{s.position}.</span>
              <span className="font-semibold">{s.pseudo}</span>
              {s.qualifiedForFinal && <span className="ml-2 text-xs font-bold text-amber-300">👑 finale</span>}
            </span>
            <span className="font-mono font-bold text-indigo-300">{s.score}</span>
          </div>
        ))}
        {standings.length === 0 && <p className="text-sm text-slate-500">Pas encore de classement.</p>}
      </div>
    </div>
  );
}

/**
 * Ce que la SALLE voit pendant la revelation. Le backend servait deja ce bloc,
 * il n'etait rendu nulle part : l'animateur commentait une revelation qu'il ne
 * voyait pas, sans la bonne reponse ni la liste des elimines effectifs.
 */
function RevealPanel({ state }: { state: GmState }) {
  const r = state.gm.battle?.reveal;
  if (!r) return null;
  if (r.cancelled) {
    return (
      <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 p-5">
        <h2 className="font-bold text-amber-200">🚫 Question annulée</h2>
        <p className="mt-1 text-sm text-amber-300">La salle voit « elle ne compte pas, on continue ».</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-100">
        <Eye size={16} /> À l'écran maintenant
      </h2>
      {r.correctAnswer && (
        <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-200">
          ✔ {r.correctAnswer}
        </p>
      )}
      <p className="mt-3 text-sm text-slate-300">
        <span className="font-mono font-bold text-slate-100">{r.survivorsBefore}</span> →{' '}
        <span className="font-mono font-bold text-indigo-300">{r.survivorsAfter}</span> survivant
        {r.survivorsAfter > 1 ? 's' : ''}
        {r.victory && <span className="ml-2 font-bold text-amber-300">👑 victoire</span>}
      </p>
      {r.repechage ? (
        <p className="mt-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-200">
          🛟 Repêchage général : personne n'est éliminé.
        </p>
      ) : r.eliminated.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Aucun éliminé sur cette question.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.eliminated.map((e) => (
            <span
              key={e.pseudo}
              className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-300"
              title={e.reason === 'timeout' ? 'pas de réponse' : 'mauvaise réponse'}
            >
              💀 {e.pseudo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File de questions
// ---------------------------------------------------------------------------

function QueuePanel({
  state,
  action,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const b = state.gm.battle;
  if (!b) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-100">Prochaines questions</h2>
        <span className="rounded-full bg-indigo-500/20 px-3 py-0.5 text-sm font-bold text-indigo-300">
          Prochaine difficulté : {b.nextDifficulty}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const list = b.queue[d] ?? [];
          return (
            <div key={d}>
              <h3 className={`mb-2 text-sm font-semibold ${d === b.nextDifficulty ? 'text-indigo-300' : 'text-slate-400'}`}>
                {d} {d === b.nextDifficulty && '← prochaine'}
              </h3>
              <div className="space-y-1.5">
                {list.map((q, i) => (
                  <div key={q.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-200">
                      {i + 1}. {q.question}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {q.theme} · réponse : {q.answers[q.correctIndex]}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => void action('queue-reorder', { difficulty: d, from: i, to: i - 1 })}
                        className="rounded border border-white/15 p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30"
                        aria-label="Monter"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={i === list.length - 1}
                        onClick={() => void action('queue-reorder', { difficulty: d, from: i, to: i + 1 })}
                        className="rounded border border-white/15 p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void action('queue-remove', { difficulty: d, questionId: q.id })}
                        className="rounded border border-rose-400/40 p-1 text-rose-500 hover:bg-rose-500/15"
                        aria-label="Retirer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="text-xs text-slate-500">File vide (remplie au tirage).</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Joueurs / bots / mixer / danger
// ---------------------------------------------------------------------------

const PLAYER_STATUS_BADGES: Record<string, string> = {
  active: '💚',
  eliminated: '💀',
  waiting: '🕐',
  spectator: '👀',
};

function PlayersPanel({
  state,
  busy,
  action,
}: {
  state: GmState;
  busy: boolean;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<GmPlayer | null>(null);
  const [points, setPoints] = useState('1');
  const [botCount, setBotCount] = useState('10');
  const b = state.gm.battle;
  const players = [...state.gm.players].sort((a, c) => c.score - a.score);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-100">Joueurs ({players.length})</h2>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(selected?.id === p.id ? null : p)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/10 ${
              selected?.id === p.id ? 'bg-indigo-500/15' : ''
            }`}
          >
            <span className="min-w-0 truncate">
              <span className="mr-1.5">{PLAYER_STATUS_BADGES[p.status] ?? ''}</span>
              <span className="font-semibold">{p.pseudo}</span>
              {p.device === 'bot' && <span className="ml-1.5 text-xs text-slate-500">bot</span>}
            </span>
            <span className="ml-2 shrink-0 font-mono font-bold text-indigo-300">{p.score}</span>
          </button>
        ))}
        {players.length === 0 && <p className="text-sm text-slate-500">Personne pour l'instant.</p>}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="mb-2 text-sm font-bold">
            {selected.pseudo} · {selected.score} pts · {PLAYER_STATUS_BADGES[selected.status]} {selected.status}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-20 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                const n = parseInt(points, 10);
                if (!Number.isNaN(n)) {
                  void action('give-points', { pseudo: selected.pseudo, points: n });
                  toast.success(`${n > 0 ? '+' : ''}${n} pts pour ${selected.pseudo}`);
                }
              }}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              <Plus size={13} className="inline" /> Points
            </button>
            <button
              type="button"
              onClick={() => {
                void action('kick', { playerId: selected.id }, `Retirer ${selected.pseudo} de la partie ?`);
                setSelected(null);
              }}
              className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/25"
            >
              <UserX size={13} className="inline" /> Retirer
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-400">
          <Bot size={14} /> Bots de test {b && b.botCount > 0 && `(${b.botCount})`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={50}
            value={botCount}
            onChange={(e) => setBotCount(e.target.value)}
            className="w-20 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-slate-100"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const n = parseInt(botCount, 10);
              if (!Number.isNaN(n)) void action('add-bots', { count: n });
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            Ajouter
          </button>
          <button
            type="button"
            disabled={busy || !b || b.botCount === 0}
            onClick={() => void action('remove-bots', {}, 'Retirer tous les bots ?')}
            className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-40"
          >
            Tout retirer
          </button>
        </div>
      </div>
    </div>
  );
}

function MixerPanel({
  state,
  action,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>) => Promise<void>;
}) {
  const [music, setMusic] = useState(Math.round((state.config.musicVolume ?? 0.35) * 100));
  const [sfx, setSfx] = useState(Math.round((state.config.sfxVolume ?? 0.8) * 100));
  const [media, setMedia] = useState(Math.round((state.config.mediaVolume ?? 0.9) * 100));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = (m: number, s: number, md: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void action('set-config', {
        config: { musicVolume: m / 100, sfxVolume: s / 100, mediaVolume: md / 100 },
      });
    }, 350);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <h2 className="mb-4 font-bold text-slate-100">Mixer du projecteur</h2>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-300"><Music2 size={14} /> <span className="truncate">Musique de fond</span></span>
            <span className="shrink-0 font-mono font-bold text-slate-200">{music}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={music}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setMusic(v);
              push(v, sfx, media);
            }}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-300"><Volume2 size={14} /> <span className="truncate">Effets sonores</span></span>
            <span className="shrink-0 font-mono font-bold text-slate-200">{sfx}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={sfx}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setSfx(v);
              push(music, v, media);
            }}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-300"><Film size={14} /> <span className="truncate">Média de la question</span></span>
            <span className="shrink-0 font-mono font-bold text-slate-200">{media}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={media}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setMedia(v);
              push(music, sfx, v);
            }}
            className="w-full accent-indigo-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Extrait de blindtest et clip vidéo. Canal distinct de la musique de fond.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          La musique baisse automatiquement pendant les phases de suspense et remonte à ce niveau exact.
        </p>
      </div>
    </div>
  );
}
