/**
 * Console gamemaster — pilotage d'une session de quiz en direct.
 * Route back-office : /evenements/quiz-live
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clapperboard,
  Eye,
  Gift,
  ListOrdered,
  Music2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Square,
  Trophy,
  UserX,
  Volume2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import LightsBadge from '../components/Live/LightsBadge';

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

interface GmPlayer {
  id: string;
  pseudo: string;
  device: string;
  score: number;
  status: string;
  qdLeft: number;
  stats: { strike?: number; correctCount?: number; answerCount?: number };
}

interface GmState {
  id: string;
  joinCode: string;
  status: string;
  quizName: string;
  v: number;
  serverNow: number;
  phaseEndsAt: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  playerCount: number;
  qdFeed: string[];
  judging: boolean;
  config: { musicVolume?: number; sfxVolume?: number; showScores: boolean; wifiSsid: string };
  reveal?: { cancelled?: boolean; fastest?: string | null; answeredCount: number };
  rewards?: { revealed: number };
  cinematic?: { step: number };
  gm: {
    currentQuestion: GmQuestion | null;
    nextQuestion: GmQuestion | null;
    verdicts: Record<string, { accepted: boolean; source: string }>;
    judgeRunning: boolean;
    players: GmPlayer[];
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
  lobby: 'Salle d\'attente',
  rules: 'Règles affichées',
  announce: 'Annonce (fenêtre bonus)',
  question: 'Question en cours',
  locked: 'Réponses verrouillées',
  reveal: 'Révélation',
  leaderboard: 'Classement',
  cinematic: 'Cinématique finale',
  pause: 'Pause',
  rewards: 'Récompenses',
  end: 'Fin de partie',
};

export default function QuizLivePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GmState | null>(null);
  const [busy, setBusy] = useState(false);

  // découverte de la session active
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get('/api/game');
        const sessions = (data.items ?? []) as Array<{ id: string; endedAt: string | null }>;
        const active = sessions.find((s) => !s.endedAt);
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
      if (confirmMsg && !confirm(confirmMsg)) return;
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
    [sessionId, busy],
  );

  if (!sessionId || !state || (state && state.status === 'end' && sessionId === null)) {
    return <SessionLauncher onLaunched={(id) => setSessionId(id)} />;
  }

  return (
    <div className="pb-10">
      <Header state={state} onRefresh={() => void refresh()} />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ControlPanel state={state} busy={busy} action={action} />
          <QuestionCard state={state} sessionId={sessionId} action={action} />
        </div>
        <div className="space-y-6">
          <PlayersPanel state={state} sessionId={sessionId} action={action} />
          <LightsBadge />
          <MixerPanel state={state} action={action} />
          <DangerPanel state={state} action={action} onClosed={() => { setSessionId(null); setState(null); }} />
        </div>
      </div>
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

  return (
    <div>
      <h1 className="text-2xl font-bold">Quiz live</h1>
      <p className="mt-1 text-gray-500">
        Lance une session : le projecteur et les écrans du bar basculent automatiquement.
      </p>
      {loading ? (
        <p className="mt-8 text-gray-400">Chargement...</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q) => (
            <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-gray-900">{q.name}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {q.theme} · {q.questionCount} question{q.questionCount > 1 ? 's' : ''}
              </p>
              <button
                type="button"
                disabled={launching !== null || q.questionCount === 0}
                onClick={() => void launch(q.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                <Play size={15} /> {launching === q.id ? 'Lancement...' : 'Lancer une session'}
              </button>
            </div>
          ))}
          {quizzes.length === 0 && (
            <p className="text-gray-400">Aucun quiz : crée-en un dans Contenus &gt; Quiz.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header + panneau de contrôle
// ---------------------------------------------------------------------------

function Header({ state, onRefresh }: { state: GmState; onRefresh: () => void }) {
  const playURL = `${window.location.origin}/play/${state.joinCode}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{state.quizName}</h1>
          <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-sm font-bold text-indigo-700">
            {STATUS_LABELS[state.status] ?? state.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Question {Math.max(0, state.currentQuestionIndex + 1)}/{state.totalQuestions} ·{' '}
          {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''} · code{' '}
          <span className="font-mono font-bold text-gray-800">{state.joinCode}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={playURL}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Page joueur ↗
        </a>
        <a
          href={`${window.location.origin}/screen/PROJO`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Projecteur ↗
        </a>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
          aria-label="Rafraîchir"
        >
          <RefreshCw size={16} />
        </button>
      </div>
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
  variant?: 'primary' | 'secondary' | 'warn';
  children: React.ReactNode;
}) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    warn: 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${styles[variant]}`}
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
  const [special, setSpecial] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const isLast = state.currentQuestionIndex >= state.totalQuestions - 1;
  const s = state.status;

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

  const specialParams = special ? { special } : {};
  const nextAndReset = (name: string) => {
    void action(name, specialParams);
    setSpecial('');
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Pilotage</h2>
        {remaining !== null && (
          <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-sm font-bold text-gray-700">
            ⏱ {Math.ceil(remaining / 1000)}s
          </span>
        )}
      </div>

      {(s === 'reveal' || s === 'leaderboard' || s === 'lobby' || s === 'rules' || s === 'pause' || s === 'cinematic') && !isLastOrEnd(state) && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600" htmlFor="special">Prochaine question :</label>
          <select
            id="special"
            value={special}
            onChange={(e) => setSpecial(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {SPECIAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {(s === 'lobby' || s === 'rules') && (
          <>
            <Btn variant="secondary" disabled={busy} onClick={() => void action('rules')}>
              <ScrollText size={15} /> {s === 'rules' ? 'Masquer les règles' : 'Afficher les règles'}
            </Btn>
            <Btn variant="primary" disabled={busy} onClick={() => nextAndReset('start')}>
              <Play size={15} /> Démarrer le quiz
            </Btn>
          </>
        )}

        {s === 'announce' && (
          <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700">
              🎲 Fenêtre bonus ouverte {state.qdFeed.length > 0 && `· ${state.qdFeed.join(', ')}`}
            </span>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler la question
            </Btn>
          </>
        )}

        {s === 'question' && (
          <>
            <Btn variant="primary" disabled={busy} onClick={() => void action('reveal')}>
              <Eye size={15} /> Révéler maintenant
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ? (les réponses seront effacées)')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler
            </Btn>
          </>
        )}

        {s === 'locked' && (
          <>
            <Btn variant="primary" disabled={busy || state.gm.judgeRunning} onClick={() => void action('reveal')}>
              <Eye size={15} /> {state.gm.judgeRunning ? 'Jugement IA en cours...' : 'Révéler les réponses'}
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ?')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler
            </Btn>
          </>
        )}

        {s === 'reveal' && (
          <>
            {!isLast && (
              <Btn variant="primary" disabled={busy} onClick={() => nextAndReset('next')}>
                <ChevronRight size={15} /> Question suivante
              </Btn>
            )}
            <Btn disabled={busy} onClick={() => void action('leaderboard')}>
              <ListOrdered size={15} /> Classement
            </Btn>
            {isLast && (
              <Btn variant="primary" disabled={busy} onClick={() => void action('cinematic')}>
                <Clapperboard size={15} /> Cinématique finale
              </Btn>
            )}
            <Btn variant="warn" disabled={busy} onClick={() => void action('replay-question', {}, 'Rejouer cette question ? (les points attribués seront retirés)')}>
              <RotateCcw size={15} /> Rejouer
            </Btn>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ? (les points attribués seront retirés)')}>
              <X size={15} /> Annuler
            </Btn>
            <Btn disabled={busy} onClick={() => void action('pause')}>
              <Pause size={15} /> Pause
            </Btn>
          </>
        )}

        {s === 'leaderboard' && (
          <>
            {!isLast && (
              <Btn variant="primary" disabled={busy} onClick={() => nextAndReset('next')}>
                <ChevronRight size={15} /> Question suivante
              </Btn>
            )}
            {isLast && (
              <Btn variant="primary" disabled={busy} onClick={() => void action('cinematic')}>
                <Clapperboard size={15} /> Cinématique finale
              </Btn>
            )}
            <Btn disabled={busy} onClick={() => void action('pause')}>
              <Pause size={15} /> Pause
            </Btn>
          </>
        )}

        {s === 'cinematic' && (
          <>
            <span className="inline-flex items-center rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">
              🎬 Cinématique en cours (étape {(state.cinematic?.step ?? 0)}/6, automatique)
            </span>
            <Btn variant="primary" disabled={busy} onClick={() => void action('rewards')}>
              <Gift size={15} /> Récompenses
            </Btn>
            <Btn disabled={busy} onClick={() => void action('end')}>
              <Trophy size={15} /> Écran de fin
            </Btn>
          </>
        )}

        {s === 'pause' && (
          <>
            <Btn disabled={busy} onClick={() => void action('resume')}>
              <Play size={15} /> Reprendre
            </Btn>
            {!isLast && (
              <Btn variant="primary" disabled={busy} onClick={() => nextAndReset('resume-next')}>
                <ChevronRight size={15} /> Reprendre + question suivante
              </Btn>
            )}
          </>
        )}

        {s === 'rewards' && (
          <Btn variant="primary" disabled={busy} onClick={() => void action('end')}>
            <Trophy size={15} /> Écran de fin
          </Btn>
        )}
      </div>
    </div>
  );
}

function isLastOrEnd(state: GmState): boolean {
  return (
    state.currentQuestionIndex >= state.totalQuestions - 1 &&
    (state.status === 'reveal' || state.status === 'leaderboard' || state.status === 'cinematic')
  );
}

// ---------------------------------------------------------------------------
// Carte question + réponses live + verdicts
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
  const polling = state.status === 'question' || state.status === 'locked' || state.status === 'announce';

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
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-bold text-gray-900">Première question</h2>
        <QuestionPreview q={next} />
      </div>
    ) : null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">
          Question {state.currentQuestionIndex + 1}/{state.totalQuestions}
        </h2>
        <span className="text-sm text-gray-500">
          {q.difficulty} · {q.points} pt{q.points > 1 ? 's' : ''} · {q.theme}
          {state.gm.special && ` · SPÉCIALE ${state.gm.special}`}
        </span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{q.question}</p>

      {q.type === 'qcm' && (
        <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {q.answers.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2 text-sm ${
                i === q.correctIndex
                  ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              {String.fromCharCode(65 + i)}. {a} {i === q.correctIndex && '✔'}
            </div>
          ))}
        </div>
      )}
      {q.type === 'estimation' && (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Réponse : {q.expectedNumber} · paliers :{' '}
          {(q.estimationScoring ?? []).map((t) => `±${t.maxGap} → ${t.points} pts`).join(' · ')}
        </p>
      )}
      {q.type === 'free_text' && (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Réponse attendue : {q.expectedAnswer}
        </p>
      )}

      {q.helpAnimator && (
        <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          💡 <span className="font-semibold">Anecdote :</span> {q.helpAnimator}
        </p>
      )}

      {/* Verdicts IA éditables (réponse libre verrouillée) */}
      {q.type === 'free_text' && state.status === 'locked' && (
        <VerdictEditor state={state} answers={answers} action={action} />
      )}

      {/* Réponses en direct */}
      {polling && answers.length > 0 && q.type !== 'free_text' && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">
            Réponses reçues ({answers.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {answers.map((a) => (
              <span
                key={a.playerId}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  a.correct === true
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : a.correct === false
                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                }`}
              >
                {a.pseudo}
                {a.bonus && ' 🎲'}
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
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">Question suivante</h3>
          <QuestionPreview q={state.gm.nextQuestion} />
        </div>
      )}
    </div>
  );
}

function QuestionPreview({ q }: { q: GmQuestion }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm font-semibold text-gray-800">{q.question}</p>
      <p className="mt-1 text-xs text-gray-500">
        {q.type.toUpperCase()} · {q.difficulty} · {q.points} pt{q.points > 1 ? 's' : ''} · {q.theme}
        {q.type === 'qcm' && ` · réponse : ${q.answers[q.correctIndex]}`}
        {q.type === 'estimation' && ` · réponse : ${q.expectedNumber}`}
        {q.type === 'free_text' && ` · réponse : ${q.expectedAnswer}`}
      </p>
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
      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
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
      <h3 className="mb-2 text-sm font-semibold text-gray-500">
        Verdicts (clique pour corriger avant de révéler)
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
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                accepted
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <span>
                <span className="font-bold">{a.pseudo}</span>
                <span className="text-gray-600"> : « {a.answer.text} »</span>
              </span>
              <span className={`font-bold ${accepted ? 'text-emerald-700' : 'text-rose-600'}`}>
                {accepted ? '✔ acceptée' : '✘ refusée'}
                <span className="ml-1 text-xs font-normal text-gray-400">({v?.source ?? '?'})</span>
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && <p className="text-sm text-gray-400">Aucune réponse reçue.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Joueurs / mixer / danger
// ---------------------------------------------------------------------------

function PlayersPanel({
  state,
  action,
}: {
  state: GmState;
  sessionId: string;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<GmPlayer | null>(null);
  const [points, setPoints] = useState('1');
  const players = [...state.gm.players].sort((a, b) => b.score - a.score);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-gray-900">Joueurs ({players.length})</h2>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {players.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(selected?.id === p.id ? null : p)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
              selected?.id === p.id ? 'bg-indigo-50' : ''
            }`}
          >
            <span className="min-w-0 truncate">
              <span className="mr-2 text-xs text-gray-400">{i + 1}.</span>
              <span className="font-semibold">{p.pseudo}</span>
              <span className="ml-1.5 text-xs text-gray-400">{p.device !== 'mobile' && `· ${p.device}`}</span>
            </span>
            <span className="ml-2 shrink-0 font-mono font-bold text-indigo-600">{p.score}</span>
          </button>
        ))}
        {players.length === 0 && <p className="text-sm text-gray-400">Personne pour l'instant.</p>}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="mb-2 text-sm font-bold">{selected.pseudo} · {selected.score} pts · 🎲 ×{selected.qdLeft}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
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
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus size={13} className="inline" /> Points
            </button>
            <button
              type="button"
              onClick={() => {
                void action('kick', { playerId: selected.id }, `Retirer ${selected.pseudo} de la partie ?`);
                setSelected(null);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-100"
            >
              <UserX size={13} className="inline" /> Retirer
            </button>
          </div>
        </div>
      )}
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = (m: number, s: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void action('set-config', { config: { musicVolume: m / 100, sfxVolume: s / 100 } });
    }, 350);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-bold text-gray-900">Mixer du projecteur</h2>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-gray-600"><Music2 size={14} /> Musique de fond</span>
            <span className="font-mono font-bold text-gray-800">{music}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={music}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setMusic(v);
              push(v, sfx);
            }}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-gray-600"><Volume2 size={14} /> Effets sonores</span>
            <span className="font-mono font-bold text-gray-800">{sfx}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={sfx}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setSfx(v);
              push(music, v);
            }}
            className="w-full accent-indigo-600"
          />
        </div>
        <p className="text-xs text-gray-400">
          La musique baisse automatiquement pendant les extraits et remonte à ce niveau exact.
        </p>
      </div>
    </div>
  );
}

function DangerPanel({
  state,
  action,
  onClosed,
}: {
  state: GmState;
  action: (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;
  onClosed: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-rose-800">
        <AlertTriangle size={16} /> Zone sensible
      </h2>
      <button
        type="button"
        onClick={async () => {
          if (!confirm('Arrêter la partie ? Les écrans reviennent à leur état normal.')) return;
          await action('stop');
          onClosed();
          toast.success('Session terminée');
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
      >
        <Square size={14} /> Arrêter la partie
      </button>
      {state.status === 'end' && (
        <p className="mt-2 text-xs text-rose-700">
          La partie est sur l'écran de fin : arrête-la pour libérer les écrans.
        </p>
      )}
    </div>
  );
}
