/**
 * Console gamemaster — pilotage d'une session BATTLE ROYALE en direct.
 * Route back-office : /evenements/battle-live
 *
 * Point central : le panneau VERDICT. À chaque question, les éliminations
 * sont provisoires ; le GM corrige (bonne réponse / ressusciter / repêchage
 * général / fin de manche co-vainqueurs) AVANT d'afficher les résultats à la
 * salle. Rien n'est persisté avant "Afficher les résultats".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
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
  Music2,
  FlaskConical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Square,
  Swords,
  Trash2,
  UserX,
  Volume2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
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

interface GmBattle {
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
    victory?: boolean;
  } | null;
  roundResult: {
    roundNumber: number;
    entries: Array<{ pseudo: string; rank: number; bonus: number; survived: boolean }>;
  } | null;
  generalStandings: Array<{
    playerId: string;
    pseudo: string;
    score: number;
    position: number;
    qualifiedForFinal: boolean;
    isSpectator: boolean;
  }> | null;
  winner: { pseudo: string } | null;
  victoryPending: boolean;
}

interface GmState {
  id: string;
  joinCode: string;
  mode: string;
  status: string;
  quizName: string;
  serverNow: number;
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

  if (!sessionId || !state) {
    return <BattleLauncher onLaunched={(id) => setSessionId(id)} />;
  }

  return (
    <div className="pb-10">
      <Header state={state} onRefresh={() => void refresh()} />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ControlPanel state={state} busy={busy} action={action} />
          {state.status === 'verdict' && <VerdictPanel state={state} busy={busy} action={action} />}
          <QuestionCard state={state} />
          {(state.status === 'round_end' || state.status === 'end') && <StandingsCard state={state} />}
          <QueuePanel state={state} action={action} />
        </div>
        <div className="space-y-6">
          <PlayersPanel state={state} busy={busy} action={action} />
          <LightsBadge />
          <MixerPanel state={state} action={action} />
          <DangerPanel action={action} onClosed={() => { setSessionId(null); setState(null); }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Launcher : stock + lancement
// ---------------------------------------------------------------------------

function BattleLauncher({ onLaunched }: { onLaunched: (id: string) => void }) {
  const [stats, setStats] = useState<BattleStats | null>(null);
  const [launching, setLaunching] = useState(false);
  const [resetting, setResetting] = useState(false);

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
    if (!confirm('Remettre TOUTES les questions déjà posées en circulation ?')) return;
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

  return (
    <div>
      <h1 className="text-2xl font-bold">Battle Royale live</h1>
      <p className="mt-1 text-gray-500">
        Lance une battle : le projecteur et les écrans du bar basculent automatiquement.
        Une question posée ne ressort jamais (l'IA maintient le stock).
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Stock de questions</h2>
          {stats ? (
            <div className="mt-3 space-y-2">
              {DIFFICULTIES.map((d) => {
                const available = stats.available?.[d] ?? 0;
                const used = stats.used?.[d] ?? 0;
                return (
                  <div key={d} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-600">{d}</span>
                    <span>
                      <span className={`font-bold ${available < 5 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {available} disponible{available > 1 ? 's' : ''}
                      </span>
                      <span className="ml-2 text-gray-400">· {used} consommée{used > 1 ? 's' : ''}</span>
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-gray-400">
                Une question posée est retirée du stock pour de bon. Sous 5 disponibles par
                difficulté, l'IA en regénère automatiquement pendant la partie. Une battle de test
                ne consomme rien.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">Chargement...</p>
          )}
          <button
            type="button"
            disabled={resetting}
            onClick={() => void resetUsage()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw size={14} /> Réinitialiser les questions utilisées
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Nouvelle battle</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
            <li>⚔️ Élimination à chaque question, +1 point par bonne réponse</li>
            <li>🏅 Bonus de fin de manche : 25 / 20 / 18... jusqu'au 20e</li>
            <li>👑 Le top 10 du général s'affronte en finale</li>
            <li>🤖 Ajoute des bots depuis la console pour tester</li>
          </ul>
          <button
            type="button"
            disabled={launching}
            onClick={() => void launch()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            <Swords size={15} /> {launching ? 'Lancement...' : 'Lancer la battle'}
          </button>
          <button
            type="button"
            disabled={launching}
            onClick={() => void launch(true)}
            className="mt-5 ml-2 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          >
            <FlaskConical size={15} /> Lancer une battle de test
          </button>
          <p className="mt-2 text-xs text-gray-400">
            La battle de test se joue normalement, mais aucune question n'est consommée : elles
            restent toutes disponibles pour les vraies soirées.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header + pilotage
// ---------------------------------------------------------------------------

function Header({ state, onRefresh }: { state: GmState; onRefresh: () => void }) {
  const b = state.gm.battle;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{state.quizName}</h1>
          <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${
            state.status === 'verdict' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
          }`}>
            {STATUS_LABELS[state.status] ?? state.status}
          </span>
          {b?.isFinal && (
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-bold text-amber-700">
              👑 FINALE
            </span>
          )}
          {state.config.testMode && (
            <span className="rounded-full bg-amber-500 px-3 py-0.5 text-sm font-bold text-white">
              🧪 TEST · stock préservé
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {b && b.roundNumber > 0 && `Manche ${b.roundNumber} · question ${b.roundQuestionCount} · `}
          {state.playerCount} en vie · {b?.eliminatedCount ?? 0} éliminé{(b?.eliminatedCount ?? 0) > 1 ? 's' : ''}
          {(b?.waitingCount ?? 0) > 0 && ` · ${b?.waitingCount} en attente`}
          {(b?.spectatorCount ?? 0) > 0 && ` · ${b?.spectatorCount} spectateur${(b?.spectatorCount ?? 0) > 1 ? 's' : ''}`}
          {' · code '}
          <span className="font-mono font-bold text-gray-800">{state.joinCode}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`${window.location.origin}/play/${state.joinCode}`}
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
  variant?: 'primary' | 'secondary' | 'warn' | 'danger';
  children: React.ReactNode;
}) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    warn: 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    danger: 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
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
  const [remaining, setRemaining] = useState<number | null>(null);
  const s = state.status;
  const b = state.gm.battle;

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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Pilotage</h2>
        {remaining !== null && (
          <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-sm font-bold text-gray-700">
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
            {state.playerCount < 2 && (
              <span className="inline-flex items-center rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                2 joueurs minimum (ajoute des bots pour tester)
              </span>
            )}
          </>
        )}

        {(s === 'round_intro' || s === 'announce') && (
          <>
            <span className="inline-flex items-center rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">
              {s === 'round_intro' ? '⚔️ Intro de manche (automatique)' : '📣 Annonce (automatique)'}
            </span>
            <Btn variant="warn" disabled={busy} onClick={() => void action('cancel-question', {}, 'Annuler cette question ?')}>
              <X size={15} /> Annuler la question
            </Btn>
          </>
        )}

        {(s === 'question' || s === 'locked') && (
          <>
            <span className="inline-flex items-center rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">
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
          <span className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700">
            <Eye size={15} /> Vérifie les éliminations ci-dessous avant d'afficher les résultats
          </span>
        )}

        {s === 'reveal' && (
          <>
            {b?.victoryPending ? (
              <span className="inline-flex items-center rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700">
                👑 Victoire ! L'écran final s'affiche automatiquement...
              </span>
            ) : (
              <>
                <Btn variant="primary" disabled={busy} onClick={() => void action('next')}>
                  <ChevronRight size={15} /> Question suivante ({b?.nextDifficulty})
                </Btn>
                {!b?.isFinal && (
                  <Btn disabled={busy} onClick={() => void action('end-round', {}, 'Terminer la manche et distribuer les bonus ?')}>
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
          <span className="inline-flex items-center rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600">
            🌙 Fondu de fin en cours...
          </span>
        )}

        {s === 'end' && b?.winner && (
          <span className="inline-flex items-center rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700">
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-800">🤖 Calcul des éliminations en cours...</p>
      </div>
    );
  }

  const zeroSurvivors = v.survivorsAfter <= 0 && v.survivorsBefore > 0;

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-gray-900">
          Verdict · {v.pending.filter((p) => !p.overturned).length} élimination{v.pending.filter((p) => !p.overturned).length > 1 ? 's' : ''} provisoire{v.pending.filter((p) => !p.overturned).length > 1 ? 's' : ''}
        </h2>
        <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-sm font-bold text-gray-700">
          {v.survivorsBefore} → {v.repechage ? v.survivorsBefore : v.survivorsAfter} survivant{(v.repechage ? v.survivorsBefore : v.survivorsAfter) > 1 ? 's' : ''}
        </span>
      </div>

      {zeroSurvivors && !v.repechage && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="mb-2 font-bold text-rose-800">
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
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="font-bold text-amber-800">🛟 REPÊCHAGE GÉNÉRAL activé : personne n'est éliminé.</p>
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
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-rose-200 bg-rose-50'
            }`}
          >
            <span>
              <span className="font-bold">{p.pseudo}</span>
              <span className="text-gray-600">
                {p.reason === 'timeout'
                  ? ' · pas de réponse 😴'
                  : ` · réponse ${p.choice !== null ? String.fromCharCode(65 + p.choice) : '?'}`}
                {p.elapsedMs !== null && ` · ${(p.elapsedMs / 1000).toFixed(1)}s`}
              </span>
              {p.overturned === 'correct' && <span className="ml-2 font-bold text-emerald-700">✔ compté bonne réponse (+1)</span>}
              {p.overturned === 'revived' && <span className="ml-2 font-bold text-emerald-700">🛟 ressuscité (sans point)</span>}
            </span>
            {!v.repechage && (
              <span className="flex gap-1.5">
                {p.overturned ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void action('verdict-reset', { playerId: p.playerId })}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void action('verdict-mark-correct', { playerId: p.playerId })}
                      className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                    >
                      ✔ Bonne réponse
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void action('verdict-revive', { playerId: p.playerId })}
                      className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
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
          <p className="text-sm text-emerald-700">Aucune élimination : tout le monde a bien répondu !</p>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">
          Question {b?.roundQuestionCount ?? '?'} de la manche
        </h2>
        <span className="text-sm text-gray-500">{q.difficulty} · {q.theme}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{q.question}</p>
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
      {q.helpAnimator && (
        <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
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
  const standings = b.generalStandings ?? [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900">
        <ListOrdered size={16} /> Classement général
        {b.roundResult && <span className="text-sm font-normal text-gray-500">(après manche {b.roundResult.roundNumber})</span>}
      </h2>
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {standings.map((s) => (
          <div
            key={s.playerId}
            className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
              s.qualifiedForFinal ? 'bg-amber-50' : ''
            } ${s.isSpectator ? 'opacity-50' : ''}`}
          >
            <span>
              <span className="mr-2 text-xs text-gray-400">{s.position}.</span>
              <span className="font-semibold">{s.pseudo}</span>
              {s.qualifiedForFinal && <span className="ml-2 text-xs font-bold text-amber-600">👑 finale</span>}
            </span>
            <span className="font-mono font-bold text-indigo-600">{s.score}</span>
          </div>
        ))}
        {standings.length === 0 && <p className="text-sm text-gray-400">Pas encore de classement.</p>}
      </div>
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Prochaines questions</h2>
        <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-sm font-bold text-indigo-700">
          Prochaine difficulté : {b.nextDifficulty}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const list = b.queue[d] ?? [];
          return (
            <div key={d}>
              <h3 className={`mb-2 text-sm font-semibold ${d === b.nextDifficulty ? 'text-indigo-700' : 'text-gray-500'}`}>
                {d} {d === b.nextDifficulty && '← prochaine'}
              </h3>
              <div className="space-y-1.5">
                {list.map((q, i) => (
                  <div key={q.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-xs font-semibold text-gray-800">
                      {i + 1}. {q.question}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {q.theme} · réponse : {q.answers[q.correctIndex]}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => void action('queue-reorder', { difficulty: d, from: i, to: i - 1 })}
                        className="rounded border border-gray-300 p-1 text-gray-500 hover:bg-white disabled:opacity-30"
                        aria-label="Monter"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={i === list.length - 1}
                        onClick={() => void action('queue-reorder', { difficulty: d, from: i, to: i + 1 })}
                        className="rounded border border-gray-300 p-1 text-gray-500 hover:bg-white disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void action('queue-remove', { difficulty: d, questionId: q.id })}
                        className="rounded border border-rose-200 p-1 text-rose-500 hover:bg-rose-50"
                        aria-label="Retirer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="text-xs text-gray-400">File vide (remplie au tirage).</p>}
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-gray-900">Joueurs ({players.length})</h2>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(selected?.id === p.id ? null : p)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
              selected?.id === p.id ? 'bg-indigo-50' : ''
            }`}
          >
            <span className="min-w-0 truncate">
              <span className="mr-1.5">{PLAYER_STATUS_BADGES[p.status] ?? ''}</span>
              <span className="font-semibold">{p.pseudo}</span>
              {p.device === 'bot' && <span className="ml-1.5 text-xs text-gray-400">bot</span>}
            </span>
            <span className="ml-2 shrink-0 font-mono font-bold text-indigo-600">{p.score}</span>
          </button>
        ))}
        {players.length === 0 && <p className="text-sm text-gray-400">Personne pour l'instant.</p>}
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

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Bot size={14} /> Bots de test {b && b.botCount > 0 && `(${b.botCount})`}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={50}
            value={botCount}
            onChange={(e) => setBotCount(e.target.value)}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const n = parseInt(botCount, 10);
              if (!Number.isNaN(n)) void action('add-bots', { count: n });
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Ajouter
          </button>
          <button
            type="button"
            disabled={busy || !b || b.botCount === 0}
            onClick={() => void action('remove-bots', {}, 'Retirer tous les bots ?')}
            className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
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
              push(v, sfx, media);
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
              push(music, v, media);
            }}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-gray-600"><Film size={14} /> Média de la question</span>
            <span className="font-mono font-bold text-gray-800">{media}%</span>
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
          <p className="mt-1 text-xs text-gray-400">
            Extrait de blindtest et clip vidéo. Canal distinct de la musique de fond.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          La musique baisse automatiquement pendant les phases de suspense et remonte à ce niveau exact.
        </p>
      </div>
    </div>
  );
}

function DangerPanel({
  action,
  onClosed,
}: {
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
          if (!confirm('Arrêter la battle ? Les écrans passent en fondu puis reviennent à leur état normal.')) return;
          await action('stop');
          onClosed();
          toast.success('Battle terminée (fondu en cours)');
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
      >
        <Square size={14} /> Arrêter la battle
      </button>
      <p className="mt-2 text-xs text-rose-700">
        Les écrans font un fondu de quelques secondes puis reviennent à l'accueil.
      </p>
    </div>
  );
}
