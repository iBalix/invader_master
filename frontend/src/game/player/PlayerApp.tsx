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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  AUDIO_PREROLL_MS,
  clearIdentity,
  gameApi,
  loadIdentity,
  LOBBY_COUNTDOWN_MS,
  PAUSE_COUNTDOWN_MS,
  QUESTION_REPONSES_MS,
  questionShownAt,
  saveIdentity,
  type GameEvent,
  type PublicState,
  type You,
  REVEAL_JOUEUR_MS,
  serverNow,
} from '../lib/gameClient';
import { useGameSession, usePhaseCountdown } from '../hooks/useGameSession';
import {
  DifficultyBadge,
  PointsBadge,
  SPECIAL_LABELS,
  TimerRing,
  mediaLabel,
  TYPE_LABELS,
  FullscreenVideo,
} from '../ui/bits';
import { BattlePlayerScreen } from './BattlePlayer';
import QuizRules from './QuizRules';
import { JokerBar, JokerSlots } from './JokerUi';
import PostRevealSequence from './PostReveal';
import '../game.css';

const ERROR_LABELS: Record<string, string> = {
  error_player_already_exists: 'Ce pseudo est déjà pris !',
  error_player_invalid_name: 'Pseudo invalide (lettres, chiffres, espaces)',
  error_player_name_too_long: 'Pseudo trop long (16 caractères max)',
  error_timeout: 'Trop tard, le temps est écoulé !',
  error_no_bonus_left: 'Plus de bonus disponible',
  error_bonus_window_closed: 'La fenêtre de bonus est fermée',
  error_no_joker: "Tu n'as pas ce joker en main",
  error_joker_type: 'Ce joker ne marche que sur les QCM',
  error_reveal_sequence: 'La séquence de résultats est en cours',
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

/** plancher entre deux refetch de la répartition « avis du public » */
const AUDIENCE_REFRESH_MS = 450;

/**
 * Dalles qui rejouent l'extrait vidéo en plein écran pendant la phase 'media'.
 * Les autres surfaces (téléphones, autres dalles) affichent « Regarde
 * l'écran » : la vidéo ne se joue que sur le projecteur et sur ces tables-là.
 * L'extrait y est MUET : le son vient de la sono du bar via le projecteur,
 * cinq lecteurs légèrement désynchronisés s'entendraient.
 */
const VIDEO_DALLES = new Set(['TABLE02-1', 'TABLE03-1', 'TABLE05-1', 'TABLE06-1']);

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

  // « Avis du public » : la répartition des votes est calculée par le serveur au
  // GET de l'état, et pour le seul joueur qui a armé le joker (elle ne voyage
  // pas dans l'événement realtime, qui est diffusé à toute la salle). Sans le
  // rappel ci-dessous elle n'arrivait donc qu'au poll de secours, soit jusqu'à
  // 10 s de retard sur un vote qui dure une vingtaine de secondes : le joueur
  // voyait la salle voter en différé. On refetch à chaque réponse encaissée,
  // borné à AUDIENCE_REFRESH_MS pour ne pas marteler l'API, et uniquement pour
  // les joueurs concernés.
  const refreshRef = useRef<() => void>(() => {});
  const audienceArme = useRef(false);
  const dernierAudienceFetch = useRef(0);
  const onEvent = useCallback((e: GameEvent) => {
    if (e.event !== 'answered' || !audienceArme.current) return;
    const maintenant = Date.now();
    if (maintenant - dernierAudienceFetch.current < AUDIENCE_REFRESH_MS) return;
    dernierAudienceFetch.current = maintenant;
    refreshRef.current();
  }, []);

  const { state, you, youAbsent, refresh, setYou } = useGameSession(sessionRef, { playerToken, onEvent });
  refreshRef.current = refresh;
  audienceArme.current =
    state?.status === 'question' && (you?.jokerPlays ?? []).some((p) => p.type === 'audience');

  // Reprise d'identité (rescan du QR, refresh, retour de veille)
  useEffect(() => {
    if (!state || playerToken) return;
    const identity = loadIdentity();
    if (identity && identity.sessionId === state.id) {
      setPlayerToken(identity.playerToken);
    }
  }, [state, playerToken]);

  /**
   * Ejection : deux signaux, meme traitement.
   *  - you.status === 'afk' : retire pour inactivite (5 questions sans
   *    reponse). Le serveur garde la ligne visible juste pour NOUS LE DIRE.
   *  - youAbsent : une reponse /state requetee avec notre token est revenue
   *    sans you (kick GM, ligne passee en removed). Avant, ce cas laissait un
   *    spinner infini : identite locale intacte, JoinScreen jamais reaffiche.
   * Ordre imperatif : clearIdentity AVANT setPlayerToken(null), sinon l'effet
   * de reprise ci-dessus recharge l'identite et boucle.
   */
  const [ejectionNotice, setEjectionNotice] = useState<string | null>(null);
  useEffect(() => {
    const afk = you?.status === 'afk';
    if (!afk && !(youAbsent && playerToken)) return;
    clearIdentity();
    setPlayerToken(null);
    setYou(null);
    setEjectionNotice(
      afk
        ? 'Tu as été retiré de la partie après 5 questions sans réponse. Rejoins quand tu veux !'
        : 'Tu as été retiré de la partie par l\'animateur.',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you?.status, youAbsent, playerToken]);

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
        joinNotice={ejectionNotice}
        onJoined={(token, newYou) => {
          setEjectionNotice(null);
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
    // ZERO DEFILEMENT, sur tous les appareils : la surface de jeu fait
    // exactement la hauteur disponible (h-dvh sur telephone, h-full dans la
    // borne qui la fournit deja) et masque tout debordement. Chaque ecran doit
    // donc tenir dans sa hauteur : c'est un jeu, pas une page web.
    // `relative` : sans lui, le bouton Retour en `absolute` s'ancrait sur le
    // bloc conteneur initial, donc au coin de l'ECRAN et non de la surface de
    // jeu. Sur une dalle, il se retrouvait orphelin a 550 px de la colonne.
    <div className={`game-bg relative flex flex-col overflow-hidden text-white ${embedded ? 'h-full' : 'h-dvh'}`}>
      {/* Hors flux, ancre en BAS a gauche. Dans le flux, il poussait toute la
          surface vers le bas : la barre d'etat (pseudo, points) ne touchait
          plus le haut de la dalle et laissait une bande vide. En bas, il ne
          recouvre pas le pseudo non plus - c'est ce recouvrement qui l'avait
          fait sortir de l'absolute a l'epoque, quand il etait en haut. Ce
          bouton n'existe que sur la borne (seul TablePlayPage passe onExit),
          le rendu telephone est donc inchange. */}
      {onExit && (
        <button
          type="button"
          onClick={requestExit}
          className="absolute bottom-4 left-4 z-50 flex min-h-[48px] items-center gap-2 rounded-full border border-white/15 bg-black/60 px-5 py-3 text-base font-bold text-white/70 backdrop-blur active:bg-white/20"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Retour
        </button>
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
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 py-6">
      {children}
    </div>
  );
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

/**
 * Reprise après la pause : le même décompte que sur le projecteur, pour que
 * les joueurs relèvent la tête avant que la question tombe. Sans lui, la
 * question apparaissait sur un téléphone encore posé sur la table.
 */
function ResumingScreen({ state }: { state: PublicState }) {
  const remaining = usePhaseCountdown(state.phaseEndsAt);
  const secondes = Math.max(1, Math.ceil((remaining ?? 0) / 1000));
  return (
    <Center>
      <div className="text-center">
        <p className="font-bold uppercase tracking-[0.3em] text-cyan-300">Reprise dans</p>
        <div key={secondes} className="anim-pop my-3 text-8xl font-black leading-none text-cyan-200">
          {secondes}
        </div>
        <p className="text-lg font-bold text-white/80">Prépare-toi, ça repart !</p>
      </div>
    </Center>
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
        <JokerSlots jokers={you.jokers} />
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
  /** bandeau au-dessus du champ pseudo (ejection AFK ou kick) */
  joinNotice?: string | null;
}

export function PlayerScreen(props: ScreenProps) {
  const { state } = props;
  // un joueur ejecte pour inactivite n'est plus un joueur : direction
  // l'inscription (PlayerApp purge l'identite en parallele)
  const you = props.you?.status === 'afk' ? null : props.you;

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

  const videoDalle = VIDEO_DALLES.has((props.deviceLabel ?? '').toUpperCase());

  const body = (() => {
    switch (state.status) {
      case 'lobby':
        return <LobbyScreen {...props} you={you} />;
      case 'rules':
        return <QuizRules phaseStartedAt={state.phaseStartedAt} embedded={props.embedded} />;
      case 'announce':
        return <AnnounceScreen {...props} you={you} />;
      case 'media':
        // sur les dalles autorisees, la couche FullscreenVideo (plus bas)
        // recouvre tout ; partout ailleurs on renvoie vers le projecteur
        return videoDalle ? null : (
          <Center>
            <BigMessage
              emoji="🎬"
              title="Regarde l'écran !"
              sub="La question arrive juste après l'extrait."
            />
          </Center>
        );
      case 'question':
      case 'locked':
        return <QuestionScreen {...props} you={you} />;
      case 'reveal':
        return <RevealScreen state={state} you={you} embedded={props.embedded} />;
      case 'leaderboard':
      case 'cinematic':
        return <WatchScreen state={state} you={you} />;
      case 'pause':
        return (
          <Center>
            <div className="text-center">
              <BigMessage
                emoji="🍹"
                title="C'est la pause !"
                sub="C'est le moment d'aller reprendre des forces au bar !"
              />
              {/* le texte configure (promo du soir) vient EN PLUS, il ne
                  remplace plus l'invitation : les deux ont leur role */}
              {state.config.pauseText && (
                <p className="anim-pop mt-5 inline-block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-2 font-bold text-cyan-300">
                  {state.config.pauseText}
                </p>
              )}
              <MiniCompteARebours
                depuis={state.phaseStartedAt}
                dureeMs={PAUSE_COUNTDOWN_MS}
                libelle="Reprise dans"
              />
            </div>
          </Center>
        );
      case 'resuming':
        return <ResumingScreen state={state} />;
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

  // meme mecanique que le projecteur : montee des l'annonce pour precharger,
  // jouee pendant 'media', et JAMAIS demontee entre les deux (cf. FullscreenVideo)
  const q = state.question;
  const videoLayer =
    videoDalle && q?.videoYoutube && (state.status === 'announce' || state.status === 'media') ? (
      <FullscreenVideo spec={q.videoYoutube} active={state.status === 'media'} muted />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <StatusBar state={state} you={you} />
      {body}
      {videoLayer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------

function JoinScreen({ state, sessionRef, onJoined, playerToken, deviceLabel, embedded, joinNotice }: ScreenProps) {
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
      <div className={`anim-fade-up w-full text-center ${embedded ? 'max-w-2xl' : 'max-w-sm'}`}>
        <p className={`font-semibold uppercase tracking-[0.25em] text-cyan-300 ${embedded ? 'text-lg' : 'text-sm'}`}>
          {state.mode === 'battle' ? 'Battle Royale' : 'Quiz'}
        </p>
        <h1 className={`anim-title-glow mb-1 text-balance font-black ${embedded ? 'text-5xl' : 'text-3xl'}`}>{state.quizName}</h1>
        <p className={`mb-6 text-white/50 ${embedded ? 'text-lg' : 'text-sm'}`}>
          {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''} connecté{state.playerCount > 1 ? 's' : ''}
          {started ? ' · partie en cours, rejoins-nous !' : ''}
        </p>
        {joinNotice && (
          <p
            className={`anim-pop mb-5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 font-semibold text-amber-200 ${
              embedded ? 'text-lg' : 'text-sm'
            }`}
          >
            {joinNotice}
          </p>
        )}
        <label
          className={`mb-2 block text-left font-semibold text-white/70 ${embedded ? 'text-xl' : 'text-sm'}`}
          htmlFor="pseudo"
        >
          Ton pseudo ou nom d'équipe
        </label>
        <input
          id="pseudo"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void join()}
          maxLength={16}
          autoComplete="off"
          className={`mb-3 w-full rounded-xl border border-white/15 bg-white/5 text-center font-bold text-white placeholder-white/30 outline-none focus:border-cyan-400 ${
            embedded ? 'px-6 py-6 text-3xl' : 'px-4 py-3.5 text-lg'
          }`}
          placeholder="PSEUDO / ÉQUIPE"
        />
        {error && <p className="anim-shake mb-3 text-sm font-semibold text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={() => void join()}
          disabled={busy || !pseudo.trim()}
          className={`anim-glow w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40 ${
            embedded ? 'px-6 py-6 text-2xl' : 'px-4 py-4 text-lg'
          }`}
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

/** compte a rebours discret des attentes (indicatif, mm:ss) */
function MiniCompteARebours({ depuis, dureeMs, libelle }: { depuis: number | null; dureeMs: number; libelle: string }) {
  const [maintenant, setMaintenant] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(serverNow()), 500);
    return () => clearInterval(t);
  }, []);
  const reste = depuis === null ? dureeMs : Math.max(0, depuis + dureeMs - maintenant);
  if (reste <= 0) {
    return <p className="anim-suspense mt-4 font-black uppercase tracking-widest text-amber-300">⏳ C'est imminent !</p>;
  }
  const mm = Math.floor(reste / 60000);
  const ss = Math.floor((reste % 60000) / 1000);
  return (
    <p className="mt-4 text-white/60">
      {libelle}{' '}
      <span className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 font-black tabular-nums text-cyan-200">
        {mm}:{String(ss).padStart(2, '0')}
      </span>
    </p>
  );
}

function LobbyScreen({ state, you, sessionRef, playerToken, onLeft }: ScreenProps & { you: You }) {
  return (
    <Center>
      <div className="anim-fade-up text-center">
        <div className="mb-2 text-5xl">✅</div>
        <h2 className="text-2xl font-extrabold">Tu es dans la partie !</h2>
        <p className="mt-2 text-white/60">
          La partie démarre bientôt, reste sur cet écran.
        </p>
        <MiniCompteARebours depuis={state.phaseStartedAt} dureeMs={LOBBY_COUNTDOWN_MS} libelle="Début dans" />
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

// ---------------------------------------------------------------------------
// Annonce (fenêtre de bonus)
// ---------------------------------------------------------------------------

function AnnounceScreen({ state, you, sessionRef, playerToken, refresh, embedded }: ScreenProps & { you: You }) {
  const remaining = usePhaseCountdown(state.phaseEndsAt);
  const q = state.question;
  if (!q) return <Center><Spinner /></Center>;

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
          {mediaLabel(q) && (
            <span className={`rounded-full border border-cyan-400/30 bg-cyan-400/10 font-bold uppercase text-cyan-300 ${embedded ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-1 text-xs'}`}>
              {mediaLabel(q)}
            </span>
          )}
        </div>
        {special && (
          <div className="anim-pop mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 font-black text-amber-300">
            {special.emoji} {special.label}
          </div>
        )}

        <div className="mt-8">
          <JokerBar
            state={state}
            you={you}
            sessionRef={sessionRef}
            playerToken={playerToken}
            refresh={refresh}
            embedded={embedded}
          />
        </div>

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

/**
 * Fondu d'entree des reponses : la question se lit seule, puis les choix
 * arrivent tous ensemble (QUESTION_REPONSES_MS). Style et non className :
 * la transition CSS a besoin de voir l'etat initial rendu.
 */
function fonduReponses(visible: boolean): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(14px)',
    transition: 'opacity 600ms ease, transform 600ms cubic-bezier(0.3, 1.1, 0.4, 1)',
    pointerEvents: visible ? undefined : 'none',
  };
}

export const ANSWER_COLORS = [
  'border-cyan-400/50 bg-cyan-400/10 active:bg-cyan-400/25',
  'border-violet-400/50 bg-violet-400/10 active:bg-violet-400/25',
  'border-amber-400/50 bg-amber-400/10 active:bg-amber-400/25',
  'border-rose-400/50 bg-rose-400/10 active:bg-rose-400/25',
];

function QuestionScreen({ state, you, sessionRef, playerToken, refresh, embedded }: ScreenProps & { you: You }) {
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
  // Effets des jokers, DERIVES de you.jokerPlays et non stockes en local : les
  // jokers sont joues pendant l'annonce, le serveur fait foi. L'avis du public
  // est recalcule a chaque rafraichissement, ses barres montent donc en direct
  // pendant que la salle repond.
  const fiftyRemoved = (you.jokerPlays.find((x) => x.type === 'fifty')?.data?.removed ?? []) as number[];
  const audienceData = you.jokerPlays.find((x) => x.type === 'audience')?.data;
  const audience = audienceData?.counts
    ? { counts: audienceData.counts, total: audienceData.total ?? 0 }
    : null;
  const allInArme = you.jokerPlays.some((x) => x.type === 'all_in');

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

  // Mise en scene synchronisee avec le projecteur, en seuils sur
  // phaseStartedAt : pre-roll audio (extrait seul), puis la question, puis les
  // reponses en fondu global. En locked, phase_started_at est reecrit par le
  // serveur : le drapeau locked force tout visible.
  const [maintenant, setMaintenant] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(serverNow()), 200);
    return () => clearInterval(t);
  }, []);
  const ecouleQ = maintenant - (state.phaseStartedAt ?? maintenant);
  const preroll = q.musicUrl ? AUDIO_PREROLL_MS : 0;
  const questionVisible = locked || ecouleQ >= preroll;
  const reponsesVisibles = locked || ecouleQ >= preroll + QUESTION_REPONSES_MS;

  // pre-roll audio : l'extrait seul, le telephone n'a rien a lire
  if (!questionVisible && q.musicUrl) {
    const resteS = Math.max(0, Math.ceil((preroll - ecouleQ) / 1000));
    return (
      <Center>
        <div className={`anim-glow flex items-center justify-center rounded-full border-4 border-cyan-400/50 bg-cyan-400/10 ${embedded ? 'h-48 w-48 text-7xl' : 'h-32 w-32 text-5xl'}`}>
          🎵
        </div>
        <p className={`mt-6 font-black uppercase tracking-[0.3em] text-cyan-300 ${embedded ? 'text-2xl' : 'text-base'}`}>
          Écoute bien...
        </p>
        <p className={`mt-2 font-black tabular-nums text-white/70 ${embedded ? 'text-5xl' : 'text-3xl'}`}>{resteS}</p>
      </Center>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Question {q.index + 1}/{q.total} · {q.type === 'estimation' ? 'jusqu\u2019à ' : ''}{q.points} pt{q.points > 1 ? 's' : ''}
            {allInArme ? ' · 🎰 ALL-IN ×3' : ''}
          </p>
          <h2 className={`text-balance font-bold leading-snug ${embedded ? 'text-3xl' : 'text-lg'}`}>{q.question}</h2>
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
      {/* la video, elle, s'est jouee AVANT la question (phase 'media') :
          plus rien a regarder pendant qu'on repond, le bandeau serait faux */}
      {q.musicUrl && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/60">
          🎵 Écoute l'extrait...
        </div>
      )}

      {locked && !answered ? (
        <Center>
          <BigMessage emoji="⏱️" title="Temps écoulé !" sub={state.judging ? 'Vérification des réponses...' : 'Calcul des scores...'} />
        </Center>
      ) : q.type === 'qcm' ? (
        <div
          className={`grid min-h-0 flex-1 ${
            embedded ? 'grid-cols-2 grid-rows-2 gap-5' : 'grid-rows-4 gap-2'
          }`}
          style={fonduReponses(reponsesVisibles)}
        >
          {(q.answers ?? []).map((a, i) => {
            const retiree = fiftyRemoved.includes(i);
            const pct = audience && audience.total > 0
              ? Math.round(((audience.counts[i] ?? 0) / audience.total) * 100)
              : null;
            return (
              <button
                key={i}
                type="button"
                disabled={answered || locked || retiree || !reponsesVisibles}
                onClick={() => {
                  setSelected(i);
                  void send({ choice: i });
                }}
                className={`relative flex min-h-[52px] items-center overflow-hidden rounded-xl border-2 text-left font-semibold leading-snug transition-transform active:scale-[0.98] ${
                  embedded ? 'px-8 text-3xl' : 'px-4 py-2 text-base'
                } ${
                  selected === i
                    ? 'border-white bg-white/20'
                    : ANSWER_COLORS[i % 4]
                } ${answered && selected !== i ? 'opacity-40' : ''} ${
                  retiree ? 'opacity-25 grayscale' : ''
                }`}
              >
                {/* avis du public : jauge discrete sous le texte */}
                {pct !== null && !retiree && (
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-cyan-300/15"
                    style={{ width: `${pct}%`, transition: 'width 600ms ease-out' }}
                  />
                )}
                <span className="relative mr-2 font-black text-white/50">{String.fromCharCode(65 + i)}</span>
                <span className={`relative ${retiree ? 'line-through' : ''}`}>{a}</span>
                {pct !== null && !retiree && (
                  <span className={`absolute right-2 top-1 font-black tabular-nums text-cyan-200/90 ${embedded ? 'text-xl' : 'text-xs'}`}>
                    {pct}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : q.type === 'estimation' ? (
        <div style={fonduReponses(reponsesVisibles)}>
          <EstimationInput
            value={numberValue}
            onChange={setNumberValue}
            disabled={answered || locked || !reponsesVisibles}
            onSubmit={() => {
              const n = parseFloat(numberValue.replace(',', '.'));
              if (Number.isFinite(n)) void send({ number: n });
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3" style={fonduReponses(reponsesVisibles)}>
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

      {allInArme && !answered && (
        <div className="anim-pop mt-2 shrink-0 rounded-xl border-2 border-fuchsia-400/60 bg-fuchsia-500/15 px-3 py-1.5 text-center text-sm font-black text-fuchsia-200">
          🎰 ALL-IN : ×3 si bon, −{q.points} si faux
        </div>
      )}

      <div className="mt-2 min-h-[40px] shrink-0 text-center">
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

function RevealScreen({ state, you, embedded }: { state: PublicState; you: You; embedded?: boolean }) {
  const reveal = state.reveal;

  // ANTI-SPOILER. Le projecteur montre d'abord la repartition, puis la bonne
  // reponse. Si les telephones et les bornes affichaient le verdict des la
  // bascule en phase reveal, la salle connaitrait la reponse par ses voisins
  // avant la fin de l'animation. On retient donc l'affichage jusqu'a
  // REVEAL_JOUEUR_MS, cale APRES la revelation du projecteur.
  //
  // Compte depuis phaseStartedAt et non depuis le montage : un joueur qui
  // arrive en cours de revelation voit tout de suite le verdict, au lieu de
  // repartir pour un tour d'attente.
  const debut = state.phaseStartedAt;
  const [attente, setAttente] = useState(() =>
    debut === null ? 0 : Math.max(0, debut + REVEAL_JOUEUR_MS - serverNow()),
  );
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente(0), attente);
    return () => clearTimeout(t);
  }, [attente]);
  useEffect(() => {
    setAttente(debut === null ? 0 : Math.max(0, debut + REVEAL_JOUEUR_MS - serverNow()));
  }, [debut]);

  if (!reveal) return <Center><Spinner /></Center>;
  if (attente > 0) {
    return (
      <Center>
        <BigMessage emoji="👀" title="Résultats..." sub="Regarde l'écran principal !" />
      </Center>
    );
  }
  if (reveal.cancelled) {
    return (
      <Center>
        <BigMessage emoji="🚫" title="Question annulée" sub="L'animateur a annulé cette question, elle ne compte pas." />
      </Center>
    );
  }
  const mine = reveal.results[you.pseudo];

  // La sequence personnelle (verdict -> serie -> jokers) prend le relais.
  // Le fond rouge pulse uniquement pendant le temps du verdict.
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mine && !mine.correct && mine.answered ? 'anim-bg-pulse-red' : ''}`}>
      <PostRevealSequence state={state} you={you} embedded={embedded} />
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
