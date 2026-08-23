/**
 * Surface joueur (/play et /play/:code) — mobile-first, publique.
 *
 * Le téléphone est un pad de réponse : inscription au pseudo, activation des
 * bonus pendant l'annonce, réponse pendant la fenêtre, feedback personnel à
 * la révélation. Pour tout le reste : "regarde l'écran principal".
 *
 * MONTAGE EMBARQUÉ : la même surface sert aussi sur les bornes tactiles, via
 * /table/play (cf. tables/pages/TablePlayPage.tsx). Deux props optionnelles
 * suffisent, `embedded` pour le cadrage et `onExit` pour le retour à
 * l'interface de la table. Le parcours téléphone, lui, ne les passe pas et ne
 * change donc pas d'un pixel.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  clearIdentity,
  gameApi,
  loadIdentity,
  questionShownAt,
  saveIdentity,
  type PublicState,
  type You,
} from '../lib/gameClient';
import { useGameSession, usePhaseCountdown } from '../hooks/useGameSession';
import {
  DifficultyBadge,
  PointsBadge,
  SPECIAL_LABELS,
  TimerRing,
  TYPE_LABELS,
} from '../ui/bits';
import { BattlePlayerScreen } from './BattlePlayer';
import '../game.css';

const ERROR_LABELS: Record<string, string> = {
  error_player_already_exists: 'Ce pseudo est déjà pris !',
  error_player_invalid_name: 'Pseudo invalide (lettres, chiffres, espaces)',
  error_player_name_too_long: 'Pseudo trop long (16 caractères max)',
  error_timeout: 'Trop tard, le temps est écoulé !',
  error_no_bonus_left: 'Plus de bonus disponible',
  error_bonus_window_closed: 'La fenêtre de bonus est fermée',
  error_wrong_question: 'La question a changé, resynchronise-toi',
  error_not_active: 'Tu ne peux plus répondre dans cette partie',
};

export function label(err: string): string {
  return ERROR_LABELS[err] ?? err;
}

export interface PlayerAppProps {
  /** monté dans une autre interface (borne tactile) : cadrage en hauteur fluide */
  embedded?: boolean;
  /** affiche un retour vers l'interface hôte ; absent sur téléphone */
  onExit?: () => void;
  /** valeur envoyée en `device` à l'inscription (défaut 'mobile') */
  deviceLabel?: string;
}

export default function PlayerApp({ embedded, onExit, deviceLabel }: PlayerAppProps = {}) {
  const { code } = useParams<{ code?: string }>();
  const [sessionRef, setSessionRef] = useState<string | null>(code ?? null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  // Résolution de la session : code d'URL, sinon session active
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (code) {
        setSessionRef(code);
      } else {
        try {
          const current = await gameApi.current();
          if (!cancelled && current) setSessionRef(current.sessionId);
        } catch {
          /* écran "pas de partie" */
        }
      }
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const { state, you, refresh, setYou } = useGameSession(sessionRef, { playerToken });

  // Reprise d'identité (rescan du QR, refresh, retour de veille)
  useEffect(() => {
    if (!state || playerToken) return;
    const identity = loadIdentity();
    if (identity && identity.sessionId === state.id) {
      setPlayerToken(identity.playerToken);
    }
  }, [state, playerToken]);

  const shellProps = { embedded, onExit };

  if (resolving) {
    return <Shell {...shellProps}><Center><Spinner /></Center></Shell>;
  }
  if (!sessionRef || (state && state.ended)) {
    return (
      <Shell {...shellProps}>
        <Center>
          <div className="anim-fade-up text-center">
            <h1 className="mb-3 text-3xl font-black text-white">INVADER</h1>
            <p className="text-white/60">
              {state?.ended ? 'La partie est terminée, merci d\'avoir joué !' : 'Aucune partie en cours pour le moment.'}
            </p>
          </div>
        </Center>
      </Shell>
    );
  }
  if (!state) {
    return <Shell {...shellProps}><Center><Spinner /></Center></Shell>;
  }

  return (
    <Shell
      {...shellProps}
      onResync={() => void refresh()}
      // Quitter pendant une question de battle royale, c'est être éliminé de
      // la manche (battleFlow : pas de réponse = raison 'timeout'). Le reste
      // du temps, on sort sans rien demander.
      exitWarning={
        state.mode === 'battle' && (state.status === 'question' || state.status === 'locked')
          ? 'Une question est en cours. Si tu quittes maintenant, tu seras éliminé de cette manche.'
          : undefined
      }
    >
      <PlayerScreen
        state={state}
        you={you}
        sessionRef={sessionRef}
        playerToken={playerToken}
        embedded={embedded}
        deviceLabel={deviceLabel}
        onJoined={(token, newYou) => {
          setPlayerToken(token);
          setYou(newYou);
          saveIdentity({ sessionId: state.id, playerToken: token, pseudo: newYou.pseudo });
          void refresh();
        }}
        onLeft={() => {
          setPlayerToken(null);
          setYou(null);
          clearIdentity();
          void refresh();
        }}
        refresh={refresh}
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell + primitives
// ---------------------------------------------------------------------------

interface ShellProps {
  children: React.ReactNode;
  onResync?: () => void;
  embedded?: boolean;
  onExit?: () => void;
  /** si defini, la sortie demande confirmation avec ce message */
  exitWarning?: string;
}

function Shell({ children, onResync, embedded, onExit, exitWarning }: ShellProps) {
  const [spinning, setSpinning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const requestExit = () => {
    if (exitWarning) setConfirming(true);
    else onExit?.();
  };

  return (
    // embedded : la borne fournit deja la hauteur, min-h-dvh y creerait une
    // seconde barre de defilement. Sur telephone, min-h-dvh reste necessaire.
    // `relative` : sans lui, le bouton Retour en `absolute` s'ancrait sur le
    // bloc conteneur initial, donc au coin de l'ECRAN et non de la surface de
    // jeu. Sur une dalle, il se retrouvait orphelin a 550 px de la colonne.
    <div className={`game-bg relative flex flex-col text-white ${embedded ? 'h-full overflow-y-auto' : 'min-h-dvh'}`}>
      {/* Dans le flux et non en absolute : agrandi pour le tactile, il
          recouvrait le pseudo de la barre d'etat. Ce bouton n'existe que sur la
          borne (seul TablePlayPage passe onExit), le rendu telephone est donc
          inchange. */}
      {onExit && (
        <div className="shrink-0 px-3 pt-3">
          <button
            type="button"
            onClick={requestExit}
            className="flex min-h-[48px] items-center gap-2 rounded-full border border-white/15 bg-black/60 px-5 py-3 text-base font-bold text-white/70 backdrop-blur active:bg-white/20"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Retour
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141033] p-6 text-center">
            <div className="mb-3 text-4xl">&#9888;&#65039;</div>
            <p className="text-balance text-base text-white/85">{exitWarning}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl bg-white/10 px-4 py-3 font-bold text-white active:bg-white/20"
              >
                Rester
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onExit?.();
                }}
                className="flex-1 rounded-xl bg-rose-500/80 px-4 py-3 font-bold text-white active:bg-rose-500"
              >
                Quitter quand même
              </button>
            </div>
          </div>
        </div>
      )}

      {onResync && (
        <button
          type="button"
          aria-label="Resynchroniser"
          onClick={() => {
            setSpinning(true);
            onResync();
            setTimeout(() => setSpinning(false), 700);
          }}
          className="fixed bottom-3 right-3 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/50 backdrop-blur active:bg-white/20"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-6 w-6 ${spinning ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M20 11a8 8 0 1 0-1.5 6.5M20 11V5m0 6h-6" />
          </svg>
        </button>
      )}
      {children}
    </div>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-5 py-8">{children}</div>;
}

export function Spinner() {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
  );
}

export function BigMessage({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="anim-fade-up text-center">
      <div className="mb-4 text-5xl">{emoji}</div>
      <h2 className="text-balance text-2xl font-extrabold">{title}</h2>
      {sub && <p className="mt-2 text-white/60">{sub}</p>}
    </div>
  );
}

function StatusBar({ state, you }: { state: PublicState; you: You }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-4 py-2.5 text-sm">
      <span className="truncate font-bold">{you.pseudo}</span>
      <div className="flex shrink-0 items-center gap-2">
        {you.strike >= 2 && (
          <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-bold text-orange-300">
            🔥 {you.strike}
          </span>
        )}
        {state.config.showScores && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums">
            {you.score} pts
          </span>
        )}
        <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-xs font-bold text-violet-300">
          🎲 ×{you.qdLeft}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatch par phase
// ---------------------------------------------------------------------------

export interface ScreenProps {
  state: PublicState;
  you: You | null;
  sessionRef: string;
  playerToken: string | null;
  /** monte dans l'interface d'une borne : hauteur fluide */
  embedded?: boolean;
  /** valeur `device` a l'inscription : hostname de la borne, ou 'mobile' */
  deviceLabel?: string;
  onJoined: (token: string, you: You) => void;
  onLeft: () => void;
  refresh: () => Promise<void>;
}

function PlayerScreen(props: ScreenProps) {
  const { state, you } = props;

  if (!you) {
    // Reprise en cours : le premier refresh part sans token, donc il existe
    // une fenetre d'un aller-retour ou l'etat est charge mais `you` pas
    // encore. Sans cette garde on affichait l'ecran d'inscription au joueur
    // qui revient, et s'il y tapait son pseudo il prenait un 409 pseudo deja
    // pris.
    const identity = loadIdentity();
    if (identity && identity.sessionId === state.id) {
      return <Center><Spinner /></Center>;
    }
    return <JoinScreen {...props} />;
  }

  if (state.mode === 'battle') {
    return <BattlePlayerScreen {...props} you={you} />;
  }

  const body = (() => {
    switch (state.status) {
      case 'lobby':
        return <LobbyScreen {...props} you={you} />;
      case 'rules':
        return <RulesScreen />;
      case 'announce':
        return <AnnounceScreen {...props} you={you} />;
      case 'question':
      case 'locked':
        return <QuestionScreen {...props} you={you} />;
      case 'reveal':
        return <RevealScreen state={state} you={you} />;
      case 'leaderboard':
      case 'cinematic':
        return <WatchScreen state={state} you={you} />;
      case 'pause':
        return (
          <Center>
            <BigMessage emoji="🍹" title="C'est la pause !" sub={state.config.pauseText} />
          </Center>
        );
      case 'rewards':
        return (
          <Center>
            <BigMessage emoji="🏅" title="Les récompenses arrivent..." sub="Regarde l'écran principal !" />
          </Center>
        );
      case 'end':
        return <EndScreen state={state} you={you} />;
      default:
        return <Center><Spinner /></Center>;
    }
  })();

  return (
    <div className={`flex flex-col ${props.embedded ? 'flex-1' : 'min-h-dvh'}`}>
      <StatusBar state={state} you={you} />
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------

function JoinScreen({ state, sessionRef, onJoined, playerToken, deviceLabel }: ScreenProps) {
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!pseudo.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // playerToken transmis quand on en a un : la route /join sait alors
      // reprendre l'identite existante au lieu de creer un doublon.
      const data = await gameApi.join(sessionRef, {
        pseudo: pseudo.trim(),
        device: deviceLabel ?? 'mobile',
        playerToken: playerToken ?? undefined,
      });
      onJoined(data.playerToken, data.you);
    } catch (err) {
      setError(err instanceof ApiError ? label(err.message) : 'Erreur réseau, réessaie');
    } finally {
      setBusy(false);
    }
  };

  const started = state.status !== 'lobby' && state.status !== 'rules';

  return (
    <Center>
      <div className="anim-fade-up w-full max-w-sm text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          {state.mode === 'battle' ? 'Battle Royale' : 'Quiz'}
        </p>
        <h1 className="anim-title-glow mb-1 text-balance text-3xl font-black">{state.quizName}</h1>
        <p className="mb-8 text-sm text-white/50">
          {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''} connecté{state.playerCount > 1 ? 's' : ''}
          {started ? ' · partie en cours, rejoins-nous !' : ''}
        </p>
        <label className="mb-2 block text-left text-sm font-semibold text-white/70" htmlFor="pseudo">
          Ton pseudo ou nom d'équipe
        </label>
        <input
          id="pseudo"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void join()}
          maxLength={16}
          autoComplete="off"
          className="mb-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-center text-lg font-bold text-white placeholder-white/30 outline-none focus:border-cyan-400"
          placeholder="PSEUDO / ÉQUIPE"
        />
        {error && <p className="anim-shake mb-3 text-sm font-semibold text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={() => void join()}
          disabled={busy || !pseudo.trim()}
          className="anim-glow w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-4 text-lg font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40"
        >
          {busy ? '...' : 'Participer'}
        </button>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// Lobby / règles
// ---------------------------------------------------------------------------

function LobbyScreen({ state, you, sessionRef, playerToken, onLeft }: ScreenProps & { you: You }) {
  return (
    <Center>
      <div className="anim-fade-up text-center">
        <div className="mb-2 text-5xl">✅</div>
        <h2 className="text-2xl font-extrabold">Tu es dans la partie !</h2>
        <p className="mt-2 text-white/60">
          La partie démarre bientôt, garde ton téléphone à portée de main.
        </p>
        <p className="mt-6 text-sm text-white/40">
          {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''} connecté{state.playerCount > 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => {
            if (playerToken) void gameApi.leave(sessionRef, playerToken).catch(() => undefined);
            onLeft();
          }}
          className="mt-8 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/50"
        >
          Quitter ({you.pseudo})
        </button>
      </div>
    </Center>
  );
}

function RulesScreen() {
  return (
    <Center>
      <div className="anim-fade-up max-w-sm">
        <h2 className="mb-5 text-center text-2xl font-black uppercase tracking-wider">Les règles</h2>
        <ul className="space-y-3 text-white/80">
          <li className="flex gap-3"><span>🎯</span><span>Réponds sur ton téléphone avant la fin du temps.</span></li>
          <li className="flex gap-3"><span>⭐</span><span>Chaque question affiche le nombre de points qu'elle rapporte.</span></li>
          <li className="flex gap-3"><span>⚡</span><span>Le plus rapide des bons répondeurs gagne 1 point bonus.</span></li>
          <li className="flex gap-3"><span>🎲</span><span>2 quitte ou double par partie : active-le avant la question, bonne réponse = points x2, mauvaise = rien à perdre !</span></li>
        </ul>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// Annonce (fenêtre de bonus)
// ---------------------------------------------------------------------------

function AnnounceScreen({ state, you, sessionRef, playerToken, refresh }: ScreenProps & { you: You }) {
  const remaining = usePhaseCountdown(state.phaseEndsAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = state.question;
  if (!q) return <Center><Spinner /></Center>;

  const activate = async () => {
    if (!playerToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await gameApi.bonus(sessionRef, { playerToken, questionIndex: q.index });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? label(err.message) : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  };

  const special = state.special ? SPECIAL_LABELS[state.special] : null;
  const progress = state.phaseEndsAt && remaining !== null
    ? Math.max(0, Math.min(1, remaining / state.config.announceMs))
    : 0;

  return (
    <Center>
      <div className="anim-pop w-full max-w-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          Question {q.index + 1}/{q.total}
        </p>
        <h2 className="mt-2 text-balance text-2xl font-black">{q.theme ?? 'Culture générale'}</h2>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <DifficultyBadge difficulty={q.difficulty} />
          <PointsBadge points={q.points} upTo={q.type === 'estimation'} />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/60">
            {TYPE_LABELS[q.type]}
          </span>
        </div>
        {special && (
          <div className="anim-pop mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 font-black text-amber-300">
            {special.emoji} {special.label}
          </div>
        )}

        <div className="mt-8">
          {you.qdActive ? (
            <div className="anim-pop rounded-2xl border-2 border-violet-400 bg-violet-500/20 px-5 py-5">
              <div className="text-3xl">🎲</div>
              <p className="mt-1 text-lg font-black text-violet-200">QUITTE OU DOUBLE ACTIVÉ !</p>
              <p className="text-sm text-violet-200/70">Bonne réponse = {q.points * 2} pts, mauvaise = rien à perdre</p>
            </div>
          ) : you.qdLeft > 0 ? (
            <button
              type="button"
              onClick={() => void activate()}
              disabled={busy}
              className="anim-glow w-full rounded-2xl border-2 border-violet-400/60 bg-violet-500/15 px-5 py-5 text-left active:scale-95 disabled:opacity-50"
              style={{ transition: 'transform 0.1s' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-black text-violet-200">🎲 QUITTE OU DOUBLE</p>
                  <p className="text-sm text-violet-200/70">Tente le x2 sur cette question !</p>
                </div>
                <span className="rounded-full bg-violet-400/20 px-3 py-1 text-sm font-bold text-violet-200">
                  ×{you.qdLeft}
                </span>
              </div>
            </button>
          ) : (
            <p className="text-sm text-white/40">Plus de quitte ou double disponible</p>
          )}
          {error && <p className="anim-shake mt-3 text-sm font-semibold text-rose-400">{error}</p>}
        </div>

        {state.qdFeed.length > 0 && (
          <p className="mt-5 text-sm text-violet-300/80">
            🎲 {state.qdFeed.join(', ')} {state.qdFeed.length > 1 ? 'tentent' : 'tente'} le quitte ou double !
          </p>
        )}

        <div className="mx-auto mt-8 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400"
            style={{ width: `${progress * 100}%`, transition: 'width 0.25s linear' }}
          />
        </div>
        <p className="mt-2 text-xs uppercase tracking-widest text-white/40">La question arrive...</p>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// Question (par type)
// ---------------------------------------------------------------------------

export const ANSWER_COLORS = [
  'border-cyan-400/50 bg-cyan-400/10 active:bg-cyan-400/25',
  'border-violet-400/50 bg-violet-400/10 active:bg-violet-400/25',
  'border-amber-400/50 bg-amber-400/10 active:bg-amber-400/25',
  'border-rose-400/50 bg-rose-400/10 active:bg-rose-400/25',
];

function QuestionScreen({ state, you, sessionRef, playerToken, refresh }: ScreenProps & { you: You }) {
  const remaining = usePhaseCountdown(state.phaseEndsAt);
  const q = state.question;
  const locked = state.status === 'locked';
  // Reference persistee : survit a une sortie/retour vers la carte du bar.
  // Voir questionShownAt() pour le detail de la faille evitee.
  const shownAtRef = useRef<number>(0);
  const questionIndexRef = useRef<number>(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [numberValue, setNumberValue] = useState<string>('');
  const [textValue, setTextValue] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'recorded' | 'failed'>(
    you.answered ? 'recorded' : 'idle',
  );

  // repère l'affichage réel de la question (mesure du temps de réponse)
  useEffect(() => {
    if (q && q.index !== questionIndexRef.current) {
      questionIndexRef.current = q.index;
      shownAtRef.current = questionShownAt(state.id, q.index);
      setSelected(null);
      setNumberValue('');
      setTextValue('');
      setSendState(you.answered ? 'recorded' : 'idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.index]);

  useEffect(() => {
    if (you.answered && sendState === 'idle') setSendState('recorded');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you.answered]);

  // vibration au début de la question
  useEffect(() => {
    if (state.status === 'question' && 'vibrate' in navigator) {
      try { navigator.vibrate?.(80); } catch { /* iOS */ }
    }
  }, [state.status]);

  if (!q) return <Center><Spinner /></Center>;

  const send = async (answer: { choice?: number; number?: number; text?: string }) => {
    if (!playerToken || sendState === 'sending' || sendState === 'recorded') return;
    setSendState('sending');
    const shownAt = shownAtRef.current || questionShownAt(state.id, q.index);
    const elapsedMs = Math.round(Date.now() - shownAt);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await gameApi.answer(sessionRef, { playerToken, questionIndex: q.index, answer, elapsedMs });
        setSendState('recorded');
        void refresh();
        return;
      } catch (err) {
        if (err instanceof ApiError && err.httpStatus !== 500 && err.httpStatus !== 0) {
          // erreur métier (timeout, mauvaise question) : pas de retry
          setSendState('failed');
          return;
        }
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    setSendState('failed');
  };

  const answered = sendState === 'recorded';
  const totalMs = state.phaseEndsAt && state.phaseStartedAt ? state.phaseEndsAt - state.phaseStartedAt : state.config.questionMs;

  return (
    <div className="flex flex-1 flex-col px-4 pb-16 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Question {q.index + 1}/{q.total} · {q.type === 'estimation' ? 'jusqu\u2019à ' : ''}{q.points} pt{q.points > 1 ? 's' : ''}
            {you.qdActive ? ' · 🎲 x2' : ''}
          </p>
          <h2 className="text-balance text-lg font-bold leading-snug">{q.question}</h2>
        </div>
        {remaining !== null && !locked && (
          <TimerRing remainingMs={remaining} totalMs={totalMs} size={60} />
        )}
      </div>

      {q.imageQuestionUrl && (
        <button type="button" className="mb-3" onClick={(e) => e.currentTarget.classList.toggle('fixed')}>
          <img
            src={q.imageQuestionUrl}
            alt=""
            className="max-h-44 w-full rounded-xl object-contain"
          />
        </button>
      )}
      {(q.musicUrl || q.videoYoutube) && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/60">
          {q.musicUrl ? '🎵 Écoute l\'extrait...' : '🎬 Regarde l\'écran principal !'}
        </div>
      )}

      {locked && !answered ? (
        <Center>
          <BigMessage emoji="⏱️" title="Temps écoulé !" sub={state.judging ? 'Vérification des réponses...' : 'Calcul des scores...'} />
        </Center>
      ) : q.type === 'qcm' ? (
        <div className="grid flex-1 content-start gap-2.5">
          {(q.answers ?? []).map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={answered || locked}
              onClick={() => {
                setSelected(i);
                void send({ choice: i });
              }}
              className={`rounded-xl border-2 px-4 py-3.5 text-left text-base font-semibold leading-snug transition-transform active:scale-[0.98] ${
                selected === i
                  ? 'border-white bg-white/20'
                  : ANSWER_COLORS[i % 4]
              } ${answered && selected !== i ? 'opacity-40' : ''}`}
            >
              <span className="mr-2 font-black text-white/50">{String.fromCharCode(65 + i)}</span>
              {a}
            </button>
          ))}
        </div>
      ) : q.type === 'estimation' ? (
        <EstimationInput
          value={numberValue}
          onChange={setNumberValue}
          disabled={answered || locked}
          onSubmit={() => {
            const n = parseFloat(numberValue.replace(',', '.'));
            if (Number.isFinite(n)) void send({ number: n });
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <input
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && textValue.trim() && void send({ text: textValue.trim() })}
            disabled={answered || locked}
            maxLength={80}
            autoComplete="off"
            placeholder="Ta réponse..."
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-lg font-semibold outline-none focus:border-cyan-400 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={answered || locked || !textValue.trim()}
            onClick={() => void send({ text: textValue.trim() })}
            className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3.5 font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40"
          >
            Valider
          </button>
        </div>
      )}

      <div className="mt-4 min-h-[44px] text-center">
        {sendState === 'recorded' && (
          <p className="anim-pop inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 font-bold text-emerald-300">
            ✓ Réponse enregistrée
          </p>
        )}
        {sendState === 'sending' && <p className="text-sm text-white/50">Envoi...</p>}
        {sendState === 'failed' && (
          <p className="anim-shake text-sm font-semibold text-rose-400">
            Échec de l'envoi, réessaie !
          </p>
        )}
      </div>
    </div>
  );
}

function EstimationInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const step = (dir: 1 | -1) => {
    const n = parseFloat(value.replace(',', '.')) || 0;
    // pas adaptatif doux : une année (1983) doit bouger de 10, pas de 100
    const abs = Math.abs(n);
    const magnitude = abs >= 100000 ? 1000 : abs >= 10000 ? 100 : abs >= 100 ? 10 : 1;
    onChange(String(n + dir * magnitude));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(-1)}
          className="w-16 shrink-0 rounded-xl border-2 border-white/15 bg-white/5 text-2xl font-black active:bg-white/15 disabled:opacity-40"
        >
          −
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ''))}
          disabled={disabled}
          inputMode="decimal"
          placeholder="0"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-4 text-center text-2xl font-black tabular-nums outline-none focus:border-cyan-400 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(1)}
          className="w-16 shrink-0 rounded-xl border-2 border-white/15 bg-white/5 text-2xl font-black active:bg-white/15 disabled:opacity-40"
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={disabled || value.trim() === '' || !Number.isFinite(parseFloat(value.replace(',', '.')))}
        onClick={onSubmit}
        className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3.5 font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40"
      >
        Valider
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Révélation (feedback personnel)
// ---------------------------------------------------------------------------

function RevealScreen({ state, you }: { state: PublicState; you: You }) {
  const reveal = state.reveal;
  if (!reveal) return <Center><Spinner /></Center>;
  if (reveal.cancelled) {
    return (
      <Center>
        <BigMessage emoji="🚫" title="Question annulée" sub="L'animateur a annulé cette question, elle ne compte pas." />
      </Center>
    );
  }
  const mine = reveal.results[you.pseudo];
  const isFastest = reveal.fastest === you.pseudo;

  return (
    <div className={`flex flex-1 flex-col ${mine && !mine.correct && mine.answered ? 'anim-bg-pulse-red' : ''}`}>
      <Center>
        <div className="anim-pop w-full max-w-sm text-center">
          {!mine || !mine.answered ? (
            <BigMessage emoji="😴" title="Pas de réponse" sub="Sois plus rapide la prochaine fois !" />
          ) : mine.correct ? (
            <>
              <div className="mb-3 text-6xl">{isFastest ? '⚡' : '🎉'}</div>
              <h2 className="text-3xl font-black text-emerald-300">BONNE RÉPONSE !</h2>
              <p className="mt-2 text-xl font-bold">
                +{mine.points} point{mine.points > 1 ? 's' : ''}
                {mine.qd && <span className="text-violet-300"> (🎲 x2 !)</span>}
              </p>
              {isFastest && (
                <p className="mt-2 inline-block rounded-full bg-amber-400/15 px-4 py-1.5 font-bold text-amber-300">
                  ⚡ Le plus rapide ! +1 pt bonus
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 text-6xl">💥</div>
              <h2 className="text-3xl font-black text-rose-400">RATÉ !</h2>
              {mine.qd && <p className="mt-1 text-violet-300/80">🎲 Quitte ou double perdu, mais rien de perdu !</p>}
              {mine.points < 0 && <p className="mt-1 font-bold text-rose-300">{mine.points} points</p>}
            </>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-white/40">La bonne réponse</p>
            <p className="mt-1 text-lg font-bold text-emerald-300">
              {reveal.correctAnswer ?? reveal.expectedAnswer ?? reveal.expectedNumber}
            </p>
            {typeof mine?.gap === 'number' && (
              <p className="mt-1 text-sm text-white/50">Ton écart : {mine.gap}</p>
            )}
          </div>
        </div>
      </Center>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement / fin
// ---------------------------------------------------------------------------

function WatchScreen({ state, you }: { state: PublicState; you: You }) {
  const mine = state.standings?.find((s) => s.pseudo === you.pseudo);
  return (
    <Center>
      <div className="anim-fade-up text-center">
        <div className="mb-4 text-5xl">🏆</div>
        <h2 className="text-2xl font-extrabold">Classement sur l'écran !</h2>
        {mine && state.status === 'leaderboard' && (
          <div className="anim-pop mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-6 py-4">
            <p className="text-4xl font-black text-cyan-300">#{mine.position}</p>
            <p className="mt-1 text-sm text-white/60">
              {mine.positionChange > 0 && <span className="text-emerald-300">▲ +{mine.positionChange} </span>}
              {mine.positionChange < 0 && <span className="text-rose-400">▼ {mine.positionChange} </span>}
              ta position
            </p>
          </div>
        )}
      </div>
    </Center>
  );
}

function EndScreen({ state, you }: { state: PublicState; you: You }) {
  const mine = state.standings?.find((s) => s.pseudo === you.pseudo);
  return (
    <Center>
      <div className="anim-pop w-full max-w-sm text-center">
        <div className="mb-3 text-6xl">🏁</div>
        <h2 className="text-balance text-2xl font-black">{state.endTexts?.winnerText}</h2>
        {mine && (
          <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 px-6 py-4">
            <p className="text-sm uppercase tracking-widest text-white/40">Ton résultat</p>
            <p className="mt-1 text-3xl font-black text-cyan-300">#{mine.position}</p>
            <p className="text-lg font-bold">{mine.score ?? you.score} points</p>
          </div>
        )}
        <p className="mt-6 text-white/50">{state.endTexts?.endText}</p>
      </div>
    </Center>
  );
}
