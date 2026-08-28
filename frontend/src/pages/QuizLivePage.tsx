/**
 * Console gamemaster — pilotage d'une session de quiz/blindtest en direct.
 * Route : /evenements/quiz-live (auth + rôles inchangés).
 *
 * PENSÉE TÉLÉPHONE D'ABORD. Les GM animent depuis leur téléphone : la page rend
 * PLEIN ÉCRAN, HORS MainLayout (la sidebar fixe de 256 px laissait ~119 px de
 * contenu sur un écran de 375 px, la console était inutilisable). Un lien
 * ramène au back-office.
 *
 * Structure : en-tête collant (statut, chrono, progression), contenu en
 * onglets (Pilotage / Questions / Classement / Réglages), et une barre
 * d'action collée en bas, sous le pouce — LE bouton du moment y vit, avec un
 * compte à rebours pendant la séquence post-reveal (le backend refuse de toute
 * façon les actions avant REVEAL_MIN_MS, le bouton ne ment donc jamais).
 *
 * Sur grand écran (lg:), le Pilotage reste affiché à gauche et les onglets
 * pilotent la colonne de droite.
 *
 * Vs l'ancienne console : la liste COMPLÈTE des questions avec type, difficulté
 * et médias (le manque n°1 par rapport au back-office PHP), le classement
 * navigable (gm.standings était envoyé par le backend et jeté), le don de
 * jokers, et le mixer resynchronisé sur l'état serveur (deux GM ne se
 * désynchronisent plus).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clapperboard,
  Eye,
  Film,
  Gift,
  ListOrdered,
  MonitorPlay,
  Music2,
  Pause,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  ScrollText,
  Smartphone,
  Square,
  Trophy,
  UserX,
  Volume2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import LightsBadge from '../components/Live/LightsBadge';
import { JOKER_DEFS, REVEAL_MIN_MS, type JokerType } from '../game/lib/gameClient';
import { QrCanvas } from '../game/ui/bits';

// ---------------------------------------------------------------------------
// Types (vue GM)
// ---------------------------------------------------------------------------

interface GmQuestion {
  type: 'qcm' | 'estimation' | 'free_text';
  question: string;
  answers: string[];
  correctIndex: number;
  correctAnswer?: string;
  expectedAnswer?: string | null;
  expectedNumber?: number | null;
  estimationScoring?: Array<{ maxGap: number; points: number }> | null;
  difficulty: string;
  points: number;
  theme: string | null;
  helpAnimator: string | null;
}

interface GmQuestionListItem {
  index: number;
  type: 'qcm' | 'estimation' | 'free_text';
  question: string;
  difficulty: string;
  points: number;
  theme: string | null;
  hasMusic: boolean;
  hasVideo: boolean;
  hasImageQ: boolean;
  hasImageR: boolean;
  helpAnimator: string | null;
  /** reponse attendue, tous types confondus (l'animateur doit pouvoir la lire) */
  answer: string;
  state: 'done' | 'current' | 'todo';
}

interface GmPlayer {
  id: string;
  pseudo: string;
  device: string;
  score: number;
  status: string;
  jokers: JokerType[];
  stats: { strike?: number; correctCount?: number; answerCount?: number };
}

interface GmState {
  id: string;
  joinCode: string;
  status: string;
  quizName: string;
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  playerCount: number;
  jokerFeed: Array<{ pseudo: string; type: JokerType }>;
  judging: boolean;
  config: {
    musicVolume?: number;
    sfxVolume?: number;
    mediaVolume?: number;
    showScores: boolean;
    wifiSsid: string;
  };
  reveal?: { cancelled?: boolean; fastest?: string | null; answeredCount: number };
  rewards?: { revealed: number };
  cinematic?: { step: number };
  standings?: Array<{ pseudo: string; position: number; positionChange: number; device: string; score?: number }>;
  gm: {
    currentQuestion: GmQuestion | null;
    nextQuestion: GmQuestion | null;
    verdicts: Record<string, { accepted: boolean; source: string }>;
    judgeRunning: boolean;
    players: GmPlayer[];
    questions: GmQuestionListItem[];
    standings?: Array<{ pseudo: string; position: number; positionChange: number; device: string; score?: number }>;
    special: string | null;
  };
}

interface LiveAnswer {
  pseudo: string;
  playerId: string;
  answer: { choice?: number; number?: number; text?: string };
  elapsedMs: number | null;
  bonus: string | null;
  correct: boolean | null;
}

interface QuizChoice {
  id: string;
  name: string;
  theme: string;
  questionCount: number;
  published: boolean;
}

const SPECIAL_OPTIONS = [
  { value: '', label: 'Question normale' },
  { value: 'double', label: '✨ Points x2' },
  { value: 'quitte_double', label: '⚡ Quitte ou double collectif (-2 si faux)' },
  { value: 'shot', label: '🥃 Shot pour le plus rapide' },
  { value: 'goodies', label: '🎁 Goodies pour le plus rapide' },
];

const STATUS_LABELS: Record<string, string> = {
  lobby: "Salle d'attente",
  rules: 'Règles affichées',
  announce: 'Annonce (fenêtre jokers)',
  media: 'Extrait vidéo',
  question: 'Question en cours',
  locked: 'Réponses verrouillées',
  reveal: 'Révélation + séquence',
  leaderboard: 'Classement',
  cinematic: 'Cinématique finale',
  pause: 'Pause',
  resuming: 'Reprise annoncée',
  rewards: 'Récompenses',
  end: 'Fin de partie',
};

const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  qcm: { label: 'QCM', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' },
  estimation: { label: 'ESTIM', cls: 'bg-violet-500/15 text-violet-300 border-violet-400/30' },
  free_text: { label: 'LIBRE', cls: 'bg-teal-500/15 text-teal-300 border-teal-400/30' },
};

const DIFF_BADGES: Record<string, string> = {
  Facile: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  Moyen: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  Difficile: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
};

type Tab = 'pilotage' | 'questions' | 'classement' | 'reglages';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuizLivePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('pilotage');
  // décalage horloge serveur, réévalué à chaque refresh
  const clockOffset = useRef(0);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get('/api/game');
        const sessions = (data.items ?? []) as Array<{ id: string; mode: string; endedAt: string | null }>;
        const active = sessions.find((s) => !s.endedAt && s.mode === 'quiz');
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
      const st = (data.data ?? null) as GmState | null;
      if (st) clockOffset.current = st.serverNow - Date.now();
      setState(st);
    } catch {
      /* poll suivant */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    // un téléphone sort de veille en plein quiz : refetch immédiat
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionId, refresh]);

  const action = useCallback(
    async (name: string, params: Record<string, unknown> = {}, confirmMsg?: string) => {
      if (!sessionId || busy) return;
      if (confirmMsg && !confirm(confirmMsg)) return;
      setBusy(true);
      try {
        const { data } = await api.post(`/api/game/${sessionId}/action`, { action: name, params });
        setState(data.data ?? null);
      } catch (err) {
        const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
        toast.error(
          msg === 'error_reveal_sequence'
            ? 'La séquence des joueurs se termine, encore quelques secondes...'
            : (msg ?? 'Action impossible'),
        );
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy],
  );

  if (!sessionId || !state) {
    return (
      <Coque>
        <SessionLauncher onLaunched={(id) => setSessionId(id)} />
      </Coque>
    );
  }

  return (
    <Coque>
      <HeaderBar
        state={state}
        onStop={async () => {
          if (!confirm('Arrêter la partie ? Les écrans reviennent à leur état normal.')) return;
          await action('stop');
          setSessionId(null);
          setState(null);
          toast.success('Session terminée');
        }}
      />

      {/* contenu : onglets sur mobile, pilotage + colonne sur desktop */}
      {/* Mobile : l'onglet actif occupe tout. Desktop : Pilotage a gauche en
          permanence, l'onglet pilote la colonne de droite (Questions par defaut). */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 pb-48 pt-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4 lg:px-6">
        <div className={`space-y-3 lg:col-span-2 ${tab === 'pilotage' ? 'block' : 'hidden lg:block'}`}>
          <PilotagePanel state={state} sessionId={sessionId} action={action} />
        </div>
        <div className="lg:col-span-1">
          <div className={tab === 'questions' ? 'block' : tab === 'pilotage' ? 'hidden lg:block' : 'hidden'}>
            <QuestionsPanel state={state} />
          </div>
          <div className={tab === 'classement' ? 'block' : 'hidden'}>
            <StandingsPanel state={state} action={action} />
          </div>
          <div className={tab === 'reglages' ? 'block' : 'hidden'}>
            <SettingsPanel
              state={state}
              action={action}
              onClosed={() => {
                setSessionId(null);
                setState(null);
              }}
            />
          </div>
        </div>
      </div>

      <BottomBar
        state={state}
        busy={busy}
        action={action}
        clockOffset={clockOffset}
        tab={tab}
        setTab={setTab}
      />
    </Coque>
  );
}

/** coquille plein écran sombre : la console est une régie, pas une page d'admin */
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
          Console quiz
        </span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lancement de session
// ---------------------------------------------------------------------------

function SessionLauncher({ onLaunched }: { onLaunched: (id: string) => void }) {
  const [quizzes, setQuizzes] = useState<QuizChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get('/api/quizzes');
        setQuizzes((data.items ?? []) as QuizChoice[]);
      } catch {
        toast.error('Impossible de charger les quiz');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const launch = async (quizId: string) => {
    setLaunching(quizId);
    try {
      const { data } = await api.post('/api/game', { quizId });
      toast.success(`Session créée ! Code : ${data.data.joinCode}`);
      onLaunched(data.data.id);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(msg ?? 'Erreur au lancement');
    } finally {
      setLaunching(null);
    }
  };

  const urlConsole = `${window.location.origin}/evenements/quiz-live`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-black">Quiz live</h1>
      <p className="mt-1 text-sm text-slate-400">
        Lance une session : le projecteur et les écrans du bar basculent automatiquement.
      </p>

      {/* La console est faite pour le telephone, encore faut-il y arriver :
          l'animateur scanne et atterrit dessus. Le QR pointe sur la console
          elle-meme, pas sur un acces de contournement, l'authentification
          back-office reste requise. */}
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
      {loading ? (
        <p className="mt-8 text-slate-500">Chargement...</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quizzes.map((q) => (
            <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-bold">{q.name}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {q.theme} · {q.questionCount} question{q.questionCount > 1 ? 's' : ''}
              </p>
              <button
                type="button"
                disabled={launching !== null || q.questionCount === 0}
                onClick={() => void launch(q.id)}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                <Play size={15} /> {launching === q.id ? 'Lancement...' : 'Lancer une session'}
              </button>
            </div>
          ))}
          {quizzes.length === 0 && (
            <p className="text-slate-500">Aucun quiz : crée-en un dans Contenus &gt; Quiz.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// En-tête collant
// ---------------------------------------------------------------------------

function HeaderBar({ state, onStop }: { state: GmState; onStop: () => void }) {
  // QR de la console : il n'existait que sur l'ecran de lancement, or c'est
  // souvent EN PLEINE PARTIE qu'un animateur perd le lien (telephone verrouille,
  // onglet ferme). On l'affiche a la demande, sans quitter la console.
  const [qrOuvert, setQrOuvert] = useState(false);
  const urlConsole = `${window.location.origin}/evenements/quiz-live`;
  const progress =
    state.totalQuestions > 0
      ? Math.max(0, Math.min(1, (state.currentQuestionIndex + (state.status === 'reveal' || state.status === 'leaderboard' ? 1 : 0)) / state.totalQuestions))
      : 0;
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur lg:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-black lg:text-lg">{state.quizName}</h1>
            <span className="max-w-[45%] shrink-0 truncate rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 lg:max-w-none lg:text-xs">
              {STATUS_LABELS[state.status] ?? state.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400 lg:text-xs">
            Q{Math.max(1, state.currentQuestionIndex + 1)}/{state.totalQuestions} ·{' '}
            {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''} · code{' '}
            <span className="font-mono font-bold text-slate-200">{state.joinCode}</span>
          </p>
        </div>
        {/* Actions en ICONES SEULES sous lg : a trois libelles, l'en-tete ne
            tenait plus en 375 px et le nom du quiz etait ecrase a zero. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setQrOuvert(true)}
            title="QR code de la console"
            aria-label="QR code de la console"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            <QrCode size={15} />
            <span className="hidden lg:inline">QR console</span>
          </button>
          <a
            href={`${window.location.origin}/play/${state.joinCode}`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir la page joueur"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            <Smartphone size={15} />
            <span className="hidden lg:inline">Joueur ↗</span>
          </a>
          <a
            href={`${window.location.origin}/screen/PROJO`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir le projecteur"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            <MonitorPlay size={15} />
            <span className="hidden lg:inline">Projo ↗</span>
          </a>
          {/* ARRET TOUJOURS A PORTEE. Il vivait dans l'onglet Reglages : en
              plein direct, personne ne va chercher un onglet pour couper la
              partie. Protege par une confirmation. */}
          <button
            type="button"
            onClick={onStop}
            title="Arrêter la partie"
            aria-label="Arrêter la partie"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-400/10 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-400/20"
          >
            <Square size={15} />
            <span className="hidden lg:inline">Arrêter</span>
          </button>
        </div>
      </div>
      <div className="mx-auto mt-2 h-1 w-full max-w-6xl overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-indigo-400"
          style={{ width: `${progress * 100}%`, transition: 'width 400ms ease' }}
        />
      </div>

      {/* PORTAIL obligatoire : le header est sticky avec backdrop-blur, et un
          backdrop-filter fait de son element le referent des descendants en
          position fixed. Rendue ici, la modale se centrait dans le header
          (70 px de haut) et sortait de l'ecran par le haut. */}
      {qrOuvert && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          onClick={() => setQrOuvert(false)}
        >
          <div
            // text-slate-100 explicite : via le portail, la modale vit sous
            // document.body et n'herite plus du texte clair de la coque sombre
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 text-center text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-black">Reprendre la console</p>
            <p className="mt-1 text-sm text-slate-400">
              Scanne avec le téléphone de l'animateur : il retombe directement sur cette
              partie. Connexion back-office demandée s'il n'est pas identifié.
            </p>
            <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
              <QrCanvas value={urlConsole} size={220} />
            </div>
            <p className="mt-3 break-all font-mono text-xs text-slate-500">{urlConsole}</p>
            <button
              type="button"
              onClick={() => setQrOuvert(false)}
              className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 font-bold hover:bg-white/15"
            >
              Fermer
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet Pilotage
// ---------------------------------------------------------------------------

function PilotagePanel({
  state,
  sessionId,
  action,
}: {
  state: GmState;
  sessionId: string;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  return (
    <>
      <QuestionCard state={state} sessionId={sessionId} action={action} />
      {(state.status === 'reveal' || state.status === 'leaderboard') && (
        <GiveJokerCard state={state} action={action} />
      )}
    </>
  );
}

function GiveJokerCard({
  state,
  action,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const players = [...state.gm.players]
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.score - b.score);
  return (
    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-black text-yellow-200">
        <Gift size={15} /> Donner un joker
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Tirage aléatoire pour chaque joueur servi. Les mains pleines (2/2) sont sautées.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void action('give-joker', {}, `Donner un joker à tous les joueurs éligibles ?`)
          }
          className="min-h-[44px] rounded-xl border border-yellow-400/40 bg-yellow-400/15 px-4 py-2 text-sm font-bold text-yellow-200 hover:bg-yellow-400/25"
        >
          🎁 À tout le monde
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
        >
          À un joueur...
        </button>
      </div>
      {open && (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.jokers.length >= 2}
              onClick={() => {
                void action('give-joker', { playerId: p.id });
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-40"
            >
              <span className="font-semibold">{p.pseudo}</span>
              <span className="text-xs text-slate-400">
                {p.jokers.map((j) => JOKER_DEFS[j].emoji).join(' ') || '∅'} ({p.jokers.length}/2)
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte question (courante) + réponses live + verdicts
// ---------------------------------------------------------------------------

function QuestionCard({
  state,
  sessionId,
  action,
}: {
  state: GmState;
  sessionId: string;
  action: (name: string, params?: Record<string, unknown>) => Promise<void>;
}) {
  const q = state.gm.currentQuestion;
  const [answers, setAnswers] = useState<LiveAnswer[]>([]);
  const polling =
    state.status === 'question' || state.status === 'locked' || state.status === 'announce';

  useEffect(() => {
    if (!polling) {
      setAnswers([]);
      return;
    }
    const load = async () => {
      try {
        const { data } = await api.get(`/api/game/${sessionId}/answers`);
        setAnswers((data.items ?? []) as LiveAnswer[]);
      } catch {
        /* prochain poll */
      }
    };
    void load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [polling, sessionId, state.currentQuestionIndex]);

  if (!q) {
    const next = state.gm.nextQuestion;
    return next ? (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-2 text-sm font-black text-slate-300">Première question</h2>
        <QuestionPreview q={next} />
      </div>
    ) : null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black">
          Q{state.currentQuestionIndex + 1}/{state.totalQuestions}
        </h2>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${TYPE_BADGES[q.type].cls}`}>
          {TYPE_BADGES[q.type].label}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DIFF_BADGES[q.difficulty] ?? 'border-white/15 text-slate-300'}`}>
          {q.difficulty} · {q.points} pt{q.points > 1 ? 's' : ''}
        </span>
        {q.theme && <span className="text-xs text-slate-400">{q.theme}</span>}
        {state.gm.special && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
            SPÉCIALE {state.gm.special}
          </span>
        )}
      </div>
      <p className="font-semibold leading-snug">{q.question}</p>

      {q.type === 'qcm' && (
        <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {q.answers.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2 text-sm ${
                i === q.correctIndex
                  ? 'border-emerald-400/50 bg-emerald-400/10 font-bold text-emerald-300'
                  : 'border-white/10 text-slate-400'
              }`}
            >
              {String.fromCharCode(65 + i)}. {a} {i === q.correctIndex && '✔'}
            </div>
          ))}
        </div>
      )}
      {q.type === 'estimation' && (
        <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-300">
          Réponse : {q.expectedNumber} · paliers :{' '}
          {(q.estimationScoring ?? []).map((t) => `±${t.maxGap} → ${t.points} pts`).join(' · ')}
        </p>
      )}
      {q.type === 'free_text' && (
        <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-300">
          Réponse attendue : {q.expectedAnswer}
        </p>
      )}

      {q.helpAnimator && (
        <p className="mt-3 rounded-lg border border-indigo-400/20 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-200">
          💡 <span className="font-semibold">Anecdote :</span> {q.helpAnimator}
        </p>
      )}

      {state.status === 'announce' && state.jokerFeed.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {state.jokerFeed.slice(-8).map((f, i) => (
            <span
              key={i}
              className="rounded-full border px-2 py-0.5 text-xs font-semibold"
              style={{ borderColor: `${JOKER_DEFS[f.type].couleur}55`, color: JOKER_DEFS[f.type].couleur }}
            >
              {JOKER_DEFS[f.type].emoji} {f.pseudo}
            </span>
          ))}
        </div>
      )}

      {q.type === 'free_text' && state.status === 'locked' && (
        <VerdictEditor state={state} answers={answers} action={action} />
      )}

      {polling && answers.length > 0 && q.type !== 'free_text' && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Réponses reçues ({answers.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {answers.map((a) => (
              <span
                key={a.playerId}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  a.correct === true
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                    : a.correct === false
                      ? 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                      : 'border-white/10 bg-white/5 text-slate-300'
                }`}
              >
                {a.pseudo}
                {a.bonus === 'all_in' && ' 🎰'}
                {typeof a.answer.choice === 'number' && ` · ${String.fromCharCode(65 + a.answer.choice)}`}
                {typeof a.answer.number === 'number' && ` · ${a.answer.number}`}
                {a.correct === true && <Check size={11} />}
                {a.correct === false && <X size={11} />}
              </span>
            ))}
          </div>
        </div>
      )}

      {state.gm.nextQuestion && (state.status === 'reveal' || state.status === 'leaderboard') && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Question suivante
          </h3>
          <QuestionPreview q={state.gm.nextQuestion} />
        </div>
      )}
    </div>
  );
}

function QuestionPreview({ q }: { q: GmQuestion }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${TYPE_BADGES[q.type].cls}`}>
          {TYPE_BADGES[q.type].label}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DIFF_BADGES[q.difficulty] ?? 'border-white/15 text-slate-300'}`}>
          {q.difficulty} · {q.points} pt{q.points > 1 ? 's' : ''}
        </span>
        {q.theme && <span className="text-[11px] text-slate-500">{q.theme}</span>}
      </div>
      <p className="text-sm font-semibold text-slate-200">{q.question}</p>
      <p className="mt-1 text-xs text-emerald-300">
        {q.type === 'qcm' && `Réponse : ${q.answers[q.correctIndex]}`}
        {q.type === 'estimation' && `Réponse : ${q.expectedNumber}`}
        {q.type === 'free_text' && `Réponse : ${q.expectedAnswer}`}
      </p>
      {q.helpAnimator && (
        <p className="mt-1 text-xs text-indigo-300">💡 {q.helpAnimator}</p>
      )}
    </div>
  );
}

function VerdictEditor({
  state,
  answers,
  action,
}: {
  state: GmState;
  answers: LiveAnswer[];
  action: (name: string, params?: Record<string, unknown>) => Promise<void>;
}) {
  const verdicts = state.gm.verdicts;
  if (state.gm.judgeRunning) {
    return (
      <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-300">
        🤖 Jugement IA en cours...
      </p>
    );
  }
  const sorted = [...answers].sort((a, b) => {
    const va = verdicts[a.playerId]?.accepted ? 1 : 0;
    const vb = verdicts[b.playerId]?.accepted ? 1 : 0;
    return va - vb;
  });
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Verdicts (touche pour corriger avant de révéler)
      </h3>
      <div className="space-y-1.5">
        {sorted.map((a) => {
          const v = verdicts[a.playerId];
          const accepted = v?.accepted ?? false;
          return (
            <button
              key={a.playerId}
              type="button"
              onClick={() => void action('verdict', { playerId: a.playerId, accepted: !accepted })}
              className={`flex min-h-[44px] w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                accepted
                  ? 'border-emerald-400/40 bg-emerald-400/10'
                  : 'border-rose-400/30 bg-rose-400/10'
              }`}
            >
              <span className="min-w-0">
                <span className="font-bold">{a.pseudo}</span>
                <span className="text-slate-400"> : « {a.answer.text} »</span>
              </span>
              <span className={`ml-2 shrink-0 font-bold ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>
                {accepted ? '✔' : '✘'}
                <span className="ml-1 text-xs font-normal text-slate-500">({v?.source ?? '?'})</span>
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && <p className="text-sm text-slate-500">Aucune réponse reçue.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet Questions : toute la liste, avec type, difficulté et médias
// ---------------------------------------------------------------------------

function QuestionsPanel({ state }: { state: GmState }) {
  const [openHelp, setOpenHelp] = useState<number | null>(null);
  const courante = useRef<HTMLDivElement | null>(null);
  const questions = state.gm.questions ?? [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-3 text-sm font-black text-slate-300">
        Questions ({questions.filter((qq) => qq.state === 'done').length}/{questions.length} jouées)
      </h2>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[65vh]">
        {questions.map((qq) => {
          const estCourante = qq.state === 'current';
          const faite = qq.state === 'done';
          const helpVisible = openHelp === qq.index;
          return (
            <div
              key={qq.index}
              ref={estCourante ? courante : undefined}
              className={`rounded-xl border px-3 py-2 ${
                estCourante
                  ? 'border-indigo-400/60 bg-indigo-500/10'
                  : faite
                    ? 'border-white/5 bg-white/[0.02] opacity-50'
                    : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-xs font-bold text-slate-500">
                  {qq.index + 1}
                </span>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${TYPE_BADGES[qq.type].cls}`}>
                  {TYPE_BADGES[qq.type].label}
                </span>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${DIFF_BADGES[qq.difficulty] ?? 'border-white/15 text-slate-300'}`}>
                  {qq.points}pt
                </span>
                <span className="shrink-0 text-[11px] tracking-wide text-slate-500">
                  {qq.hasMusic && '🎵'}
                  {qq.hasVideo && '🎬'}
                  {(qq.hasImageQ || qq.hasImageR) && '🖼'}
                </span>
                {faite && <Check size={12} className="shrink-0 text-emerald-400" />}
              </div>
              <button
                type="button"
                onClick={() => qq.helpAnimator && setOpenHelp(helpVisible ? null : qq.index)}
                className="mt-1 w-full text-left"
              >
                <p className={`text-xs leading-snug ${estCourante ? 'font-bold text-slate-100' : 'text-slate-300'}`}>
                  {qq.question}
                  {qq.helpAnimator && <span className="ml-1 text-indigo-400">💡</span>}
                </p>
              </button>
              {/* La reponse attendue est TOUJOURS lisible : sur une estimation
                  ou une reponse libre, elle n'apparaissait nulle part dans la
                  liste, et l'animateur ne pouvait pas la donner de vive voix. */}
              {qq.answer && (
                <p
                  className={`mt-1 truncate text-xs font-bold ${
                    estCourante ? 'text-emerald-300' : 'text-emerald-400/60'
                  }`}
                >
                  ✔ {qq.answer}
                </p>
              )}
              {helpVisible && qq.helpAnimator && (
                <p className="mt-1 rounded-lg bg-indigo-400/10 px-2 py-1.5 text-xs text-indigo-200">
                  {qq.helpAnimator}
                </p>
              )}
            </div>
          );
        })}
        {questions.length === 0 && <p className="text-sm text-slate-500">Pas de questions.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet Classement
// ---------------------------------------------------------------------------

function StandingsPanel({
  state,
  action,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<GmPlayer | null>(null);
  const [points, setPoints] = useState('1');
  const players = [...state.gm.players].sort((a, b) => b.score - a.score);
  const changes = new Map(
    (state.gm.standings ?? state.standings ?? []).map((s) => [s.pseudo, s.positionChange]),
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-3 text-sm font-black text-slate-300">Classement ({players.length})</h2>
      <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
        {players.map((p, i) => {
          const delta = changes.get(p.pseudo) ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(selected?.id === p.id ? null : p)}
              className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/5 ${
                selected?.id === p.id ? 'bg-indigo-500/15' : ''
              } ${p.status !== 'active' ? 'opacity-40' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`w-6 shrink-0 text-right font-mono text-xs font-bold ${i < 3 ? 'text-amber-300' : 'text-slate-500'}`}>
                  {i + 1}
                </span>
                {delta !== 0 && (
                  <span className={`shrink-0 text-[10px] font-bold ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                  </span>
                )}
                <span className="truncate font-semibold">{p.pseudo}</span>
                {p.device !== 'mobile' && (
                  <span className="shrink-0 text-[10px] text-slate-500">{p.device}</span>
                )}
                <span className="shrink-0 text-xs">
                  {p.jokers.map((j) => JOKER_DEFS[j].emoji).join('')}
                </span>
              </span>
              <span className="ml-2 shrink-0 font-mono font-bold tabular-nums text-indigo-300">
                {p.score}
              </span>
            </button>
          );
        })}
        {players.length === 0 && <p className="text-sm text-slate-500">Personne pour l'instant.</p>}
      </div>

      {selected && (
        <div className="mt-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3">
          <p className="mb-2 text-sm font-bold">
            {selected.pseudo} · {selected.score} pts ·{' '}
            {selected.jokers.map((j) => JOKER_DEFS[j].emoji).join(' ') || 'aucun joker'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-20 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm"
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
              className="min-h-[44px] rounded-lg bg-indigo-500 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-400"
            >
              <Plus size={13} className="inline" /> Points
            </button>
            {(state.status === 'reveal' || state.status === 'leaderboard') && (
              <button
                type="button"
                disabled={selected.jokers.length >= 2}
                onClick={() => void action('give-joker', { playerId: selected.id })}
                className="min-h-[44px] rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-sm font-bold text-yellow-200 hover:bg-yellow-400/20 disabled:opacity-40"
              >
                🎁 Joker
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void action('kick', { playerId: selected.id }, `Retirer ${selected.pseudo} de la partie ?`);
                setSelected(null);
              }}
              className="min-h-[44px] rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-300 hover:bg-rose-400/20"
            >
              <UserX size={13} className="inline" /> Retirer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet Réglages : mixer + lumières + zone sensible
// ---------------------------------------------------------------------------

function SettingsPanel({
  state,
  action,
  onClosed,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
  onClosed: () => void;
}) {
  return (
    <div className="space-y-3">
      <MixerPanel state={state} action={action} />
      <LightsBadge />
      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-rose-300">
          <AlertTriangle size={15} /> Zone sensible
        </h2>
        <button
          type="button"
          onClick={async () => {
            if (!confirm('Arrêter la partie ? Les écrans reviennent à leur état normal.')) return;
            await action('stop');
            onClosed();
            toast.success('Session terminée');
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-sm font-bold text-rose-300 hover:bg-rose-400/20"
        >
          <Square size={14} /> Arrêter la partie
        </button>
        {state.status === 'end' && (
          <p className="mt-2 text-xs text-rose-300">
            La partie est sur l'écran de fin : arrête-la pour libérer les écrans.
          </p>
        )}
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
  const editing = useRef(false);

  // Resynchronise sur l'état serveur quand on n'est PAS en train de glisser :
  // sans ça, deux GM sur deux téléphones se désynchronisaient en silence.
  useEffect(() => {
    if (editing.current) return;
    setMusic(Math.round((state.config.musicVolume ?? 0.35) * 100));
    setSfx(Math.round((state.config.sfxVolume ?? 0.8) * 100));
    setMedia(Math.round((state.config.mediaVolume ?? 0.9) * 100));
  }, [state.config.musicVolume, state.config.sfxVolume, state.config.mediaVolume]);

  const push = (m: number, s: number, md: number) => {
    editing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      editing.current = false;
      void action('set-config', {
        config: { musicVolume: m / 100, sfxVolume: s / 100, mediaVolume: md / 100 },
      });
    }, 350);
  };

  const rows: Array<{
    icon: React.ReactNode;
    label: string;
    value: number;
    set: (v: number) => void;
    hint?: string;
  }> = [
    { icon: <Music2 size={14} />, label: 'Musique de fond', value: music, set: (v) => { setMusic(v); push(v, sfx, media); } },
    { icon: <Volume2 size={14} />, label: 'Effets sonores', value: sfx, set: (v) => { setSfx(v); push(music, v, media); } },
    {
      icon: <Film size={14} />,
      label: 'Média de la question',
      value: media,
      set: (v) => { setMedia(v); push(music, sfx, v); },
      hint: 'Extrait de blindtest et clip vidéo. Canal distinct de la musique de fond.',
    },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-4 text-sm font-black text-slate-300">Mixer du projecteur</h2>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-400">
                {r.icon} {r.label}
              </span>
              <span className="font-mono font-bold tabular-nums text-slate-200">{r.value}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={r.value}
              onChange={(e) => r.set(parseInt(e.target.value, 10))}
              className="h-6 w-full accent-indigo-500"
            />
            {r.hint && <p className="mt-1 text-xs text-slate-500">{r.hint}</p>}
          </div>
        ))}
        <p className="text-xs text-slate-500">
          La musique baisse automatiquement pendant les extraits et remonte à ce niveau exact.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre d'action collante : onglets + LE bouton du moment
// ---------------------------------------------------------------------------

function BottomBar({
  state,
  busy,
  action,
  clockOffset,
  tab,
  setTab,
}: {
  state: GmState;
  busy: boolean;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
  clockOffset: React.MutableRefObject<number>;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const [special, setSpecial] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sequenceLeft, setSequenceLeft] = useState(0);
  const s = state.status;
  const isLast = state.currentQuestionIndex >= state.totalQuestions - 1;

  // chrono de phase + compte a rebours de la sequence post-reveal
  useEffect(() => {
    const tick = () => {
      const now = Date.now() + clockOffset.current;
      setRemaining(state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : null);
      setSequenceLeft(
        s === 'reveal' && state.phaseStartedAt
          ? Math.max(0, state.phaseStartedAt + REVEAL_MIN_MS - now)
          : 0,
      );
    };
    tick();
    const i = setInterval(tick, 400);
    return () => clearInterval(i);
  }, [state.phaseEndsAt, state.phaseStartedAt, s, clockOffset]);

  const specialParams = special ? { special } : {};
  const nextAndReset = (name: string) => {
    void action(name, specialParams);
    setSpecial('');
  };
  const seqSec = Math.ceil(sequenceLeft / 1000);
  const bloqueParSequence = s === 'reveal' && sequenceLeft > 0;

  // LE bouton principal du moment
  let principal: { label: React.ReactNode; onClick: () => void; disabled?: boolean } | null = null;
  if (s === 'lobby' || s === 'rules') {
    principal = { label: <><Play size={17} /> Démarrer le quiz</>, onClick: () => nextAndReset('start') };
  } else if (s === 'question') {
    principal = { label: <><Eye size={17} /> Révéler maintenant</>, onClick: () => void action('reveal') };
  } else if (s === 'locked') {
    principal = {
      label: <><Eye size={17} /> {state.gm.judgeRunning ? 'Jugement IA...' : 'Révéler les réponses'}</>,
      onClick: () => void action('reveal'),
      disabled: state.gm.judgeRunning,
    };
  } else if (s === 'reveal' || s === 'leaderboard') {
    principal = isLast
      ? {
          label: bloqueParSequence ? (
            <><Clapperboard size={17} /> Cinématique dans {seqSec}s</>
          ) : (
            <><Clapperboard size={17} /> Cinématique finale</>
          ),
          onClick: () => void action('cinematic'),
          disabled: bloqueParSequence,
        }
      : {
          label: bloqueParSequence ? (
            <><ChevronRight size={17} /> Suivante dans {seqSec}s</>
          ) : (
            <><ChevronRight size={17} /> Question suivante</>
          ),
          onClick: () => nextAndReset('next'),
          disabled: bloqueParSequence,
        };
  } else if (s === 'cinematic') {
    principal = { label: <><Gift size={17} /> Récompenses</>, onClick: () => void action('rewards') };
  } else if (s === 'media') {
    // l'extrait s'enchaine tout seul sur la question ; le bouton sert a
    // l'ecourter (extrait trop long, souci de lecture sur le projo)
    principal = { label: <><ChevronRight size={17} /> Passer la vidéo</>, onClick: () => void action('skip-media') };
  } else if (s === 'pause') {
    // 'resume' annonce la reprise (décompte 5 s) puis enchaîne sur la question
    // suivante. On passe par nextAndReset pour emporter la question spéciale.
    principal = { label: <><Play size={17} /> Reprendre</>, onClick: () => nextAndReset('resume') };
  } else if (s === 'resuming') {
    principal = { label: <><Pause size={17} /> Annuler la reprise</>, onClick: () => void action('pause') };
  } else if (s === 'rewards') {
    principal = { label: <><Trophy size={17} /> Écran de fin</>, onClick: () => void action('end') };
  }

  // actions secondaires du statut
  const secondaires: Array<{ label: React.ReactNode; onClick: () => void; warn?: boolean }> = [];
  if (s === 'lobby' || s === 'rules') {
    secondaires.push({
      label: <><ScrollText size={13} /> {s === 'rules' ? 'Masquer règles' : 'Règles'}</>,
      onClick: () => void action('rules'),
    });
  }
  if (s === 'announce') {
    secondaires.push({
      label: <><X size={13} /> Annuler la question</>,
      onClick: () => void action('cancel-question', {}, 'Annuler cette question ?'),
      warn: true,
    });
  }
  if (s === 'media' || s === 'question' || s === 'locked' || s === 'reveal') {
    secondaires.push({
      label: <><RotateCcw size={13} /> Rejouer</>,
      onClick: () => void action('replay-question', {}, 'Rejouer cette question ? (réponses et points effacés)'),
      warn: true,
    });
    secondaires.push({
      label: <><X size={13} /> Annuler</>,
      onClick: () => void action('cancel-question', {}, 'Annuler cette question ?'),
      warn: true,
    });
  }
  if (s === 'reveal' || s === 'leaderboard') {
    if (s === 'reveal') {
      secondaires.push({ label: <><ListOrdered size={13} /> Classement</>, onClick: () => void action('leaderboard') });
    }
    if (isLast && s === 'reveal') {
      // cinematic est deja le bouton principal au dernier tour
    }
    secondaires.push({ label: <><Pause size={13} /> Pause</>, onClick: () => void action('pause') });
    if (!isLast) {
      secondaires.push({
        label: <><Clapperboard size={13} /> Cinématique</>,
        onClick: () => void action('cinematic'),
      });
    }
  }
  if (s === 'cinematic') {
    secondaires.push({ label: <><Trophy size={13} /> Écran de fin</>, onClick: () => void action('end') });
  }
  if (s === 'pause') {
    secondaires.push({
      label: <><RotateCcw size={13} /> Revenir à l'écran précédent</>,
      onClick: () => void action('resume-back'),
    });
  }

  const montrerSpeciale =
    (s === 'lobby' || s === 'rules' || s === 'reveal' || s === 'leaderboard' || s === 'pause') && !isLast;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-3 pt-2 lg:px-6">
        {/* rangée contextuelle : chrono, spéciale, secondaires */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {remaining !== null && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 font-mono text-xs font-bold tabular-nums">
              ⏱ {Math.ceil(remaining / 1000)}s
            </span>
          )}
          {s === 'announce' && (
            <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-300">
              🃏 Fenêtre jokers ouverte
            </span>
          )}
          {s === 'cinematic' && (
            <span className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300">
              🎬 Étape {state.cinematic?.step ?? 0}/6 (auto)
            </span>
          )}
          {montrerSpeciale && (
            <select
              value={special}
              onChange={(e) => setSpecial(e.target.value)}
              className="shrink-0 rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              {SPECIAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {secondaires.map((b, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={b.onClick}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                b.warn
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                  : 'border-white/15 text-slate-300 hover:bg-white/5'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* LE bouton du moment, plein pouce */}
        {principal && (
          <button
            type="button"
            disabled={busy || principal.disabled}
            onClick={principal.onClick}
            className="mb-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 text-base font-black text-white transition hover:bg-indigo-400 active:scale-[0.99] disabled:opacity-50"
          >
            {principal.label}
          </button>
        )}

        {/* onglets */}
        <div className="flex items-stretch gap-1 pb-2 lg:hidden">
          {(
            [
              ['pilotage', 'Pilotage'],
              ['questions', 'Questions'],
              ['classement', 'Classement'],
              ['reglages', 'Réglages'],
            ] as Array<[Tab, string]>
          ).map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-h-[44px] flex-1 rounded-xl text-xs font-bold ${
                tab === t ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        {/* desktop : la colonne de droite se pilote ici aussi */}
        <div className="hidden items-stretch gap-1 pb-2 lg:flex">
          {(
            [
              ['questions', 'Questions'],
              ['classement', 'Classement'],
              ['reglages', 'Réglages'],
            ] as Array<[Tab, string]>
          ).map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t === tab ? 'questions' : t)}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold ${
                tab === t ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
