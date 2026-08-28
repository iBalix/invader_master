/**
 * Écrans du bar (/screen/:hostname) — routes persistantes, sans auth.
 *
 * - PROJO : écran maître de la partie, seul à jouer le son (+ cues).
 * - BAR01/BAR02 : QR "rejoins la partie en cours" pendant une game, idle sinon.
 * La page suit toute seule l'état : idle → partie → idle, sans intervention.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  gameApi,
  JOKER_DEFS,
  type JokerType,
  type PublicState,
  type StandingEntry,
} from '../lib/gameClient';
import { useGameSession, usePhaseCountdown } from '../hooks/useGameSession';
import {
  DifficultyBadge,
  QrCanvas,
  SPECIAL_LABELS,
  TimerRing,
  mediaLabel,
  TYPE_LABELS,
  YoutubeClip,
} from '../ui/bits';
import { gameAudio } from './audio';
import { useSansZoom } from '../../hooks/useSansZoom';
import { REVEAL_BARRES_MS, REVEAL_IMAGE_MS, REVEAL_RAPIDE_MS, REVEAL_REPONSE_MS, REVEAL_SERIE_MS, serverNow, SPEED_BONUS } from '../lib/gameClient';
import { BattleProjectorBody } from './BattleScreens';
import QuizRules from '../player/QuizRules';
import '../game.css';

export function playUrl(joinCode: string): string {
  // URL publique de la surface joueur (même origine que l'écran)
  return `${window.location.origin}/play/${joinCode}`;
}

/**
 * Emis des que le son est deverrouille, pour que le voile "Activer le son"
 * disparaisse meme s'il est deja affiche au moment du geste.
 */
const AUDIO_PRET = 'invader:audio-pret';

export default function ScreenApp() {
  const { hostname = 'PROJO' } = useParams<{ hostname: string }>();
  useSansZoom();
  const isProjector = !hostname.toUpperCase().startsWith('BAR');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Découverte de la session active (poll léger tant qu'idle)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const current = await gameApi.current();
        if (!cancelled) setSessionId(current?.sessionId ?? null);
      } catch {
        /* backend momentanément injoignable : on garde l'état courant */
      }
    };
    void check();
    const interval = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const [toasts, setToasts] = useState<
    Array<{ id: number; text: string; kind: string; jokerType?: JokerType; award?: boolean }>
  >([]);
  const toastId = useRef(0);
  const pushToast = (
    text: string,
    kind = 'join',
    extra?: { jokerType?: JokerType; award?: boolean },
  ) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-4), { id, text, kind, ...extra }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const [answeredCount, setAnsweredCount] = useState(0);

  const { state } = useGameSession(sessionId, {
    onEvent: (e) => {
      if (!isProjector) return;
      if (e.event === 'player-joined') pushToast(`${e.payload.pseudo} rejoint la partie !`, 'join');
      if (e.event === 'joker') {
        // Pas de son : sur une annonce, dix joueurs activent leur joker en
        // quelques secondes et le blip devenait un crepitement. Le retour visuel
        // suffit, et il laisse la musique respirer.
        if (e.payload.kind === 'play') {
          pushToast(e.payload.pseudo as string, 'joker', {
            jokerType: e.payload.type as JokerType,
          });
        } else if (e.payload.kind === 'award') {
          const awards = (e.payload.awards ?? []) as Array<{ pseudo: string; type: JokerType }>;
          // don GM groupe : un seul toast agrege, pas dix qui s'empilent
          if (awards.length > 3) {
            pushToast(`${awards.length} joueurs gagnent un joker !`, 'joker', { award: true });
          } else {
            for (const a of awards) {
              pushToast(a.pseudo, 'joker', { jokerType: a.type, award: true });
            }
          }
        }
      }
      if (e.event === 'answered') setAnsweredCount((e.payload.count as number) ?? 0);
    },
  });

  // reset compteur de réponses à chaque question
  useEffect(() => {
    setAnsweredCount(0);
  }, [state?.currentQuestionIndex, state?.status === 'question']);

  // DEVERROUILLAGE AUDIO : au premier geste utilisateur, n'importe lequel et sur
  // n'importe quel ecran, ecran d'attente inclus.
  //
  // Avant, seul un clic sur le voile "Activer le son" appelait enable(). Or ce
  // voile ne vit que dans ProjectorScreen, monte uniquement quand une partie
  // tourne. Le clic d'ouverture du kiosque, qui atterrit sur l'ecran d'attente,
  // ne comptait donc pas : le voile resurgissait au lancement du quiz alors que
  // le navigateur avait bien recu son geste et que la page n'avait pas rechargé.
  //
  // Deux mecanismes, parce qu'un seul ne suffit pas :
  //   - hasBeenActive couvre le geste ARRIVE AVANT le montage de React (cas du
  //     clic automatique a l'ouverture de l'URL, qui precede l'app) ;
  //   - les ecouteurs couvrent le geste qui arrive apres.
  useEffect(() => {
    if (gameAudio.enabled) return;
    const declarer = () => {
      gameAudio.enable();
      window.dispatchEvent(new Event(AUDIO_PRET));
    };
    if (navigator.userActivation?.hasBeenActive) {
      declarer();
      return;
    }
    const evenements: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    const surGeste = () => {
      declarer();
      evenements.forEach((e) => window.removeEventListener(e, surGeste));
    };
    evenements.forEach((e) => window.addEventListener(e, surGeste));
    return () => evenements.forEach((e) => window.removeEventListener(e, surGeste));
  }, []);

  const active = state && !state.ended;

  if (!active) {
    return <IdleScreen hostname={hostname} />;
  }
  if (!isProjector) {
    return <BarScreen state={state} />;
  }
  return (
    <ProjectorScreen state={state} toasts={toasts} answeredCount={answeredCount} />
  );
}

// ---------------------------------------------------------------------------
// Idle + écran bar
// ---------------------------------------------------------------------------

function IdleScreen({ hostname }: { hostname: string }) {
  return (
    <div className="game-bg flex h-dvh flex-col items-center justify-center overflow-hidden text-white">
      <h1 className="anim-title-glow text-6xl font-black tracking-[0.3em]">INVADER</h1>
      <p className="mt-4 text-white/30">{hostname}</p>
    </div>
  );
}

function BarScreen({ state }: { state: PublicState }) {
  return (
    <div className="game-bg flex h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-8 text-center text-white">
      <p className="anim-pop rounded-full border border-cyan-400/40 bg-cyan-400/10 px-6 py-2 text-xl font-bold uppercase tracking-widest text-cyan-300">
        🎮 Partie en cours
      </p>
      <h1 className="anim-title-glow text-balance text-5xl font-black">{state.quizName}</h1>
      <p className="max-w-xl text-2xl text-white/70">
        Il n'est pas trop tard : scanne le QR code et rejoins la partie !
      </p>
      <QrCanvas value={playUrl(state.joinCode)} size={260} />
      <p className="text-xl text-white/50">
        {state.participantCount ?? state.playerCount} joueur
        {(state.participantCount ?? state.playerCount) > 1 ? 's' : ''} en jeu · WiFi{' '}
        <span className="font-bold text-white">{state.config.wifiSsid}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projecteur
// ---------------------------------------------------------------------------

function ProjectorScreen({
  state,
  toasts,
  answeredCount,
}: {
  state: PublicState;
  toasts: Array<{ id: number; text: string; kind: string; jokerType?: JokerType; award?: boolean }>;
  answeredCount: number;
}) {
  const [soundOn, setSoundOn] = useState(gameAudio.enabled);
  useEffect(() => {
    const surPret = () => setSoundOn(true);
    window.addEventListener(AUDIO_PRET, surPret);
    return () => window.removeEventListener(AUDIO_PRET, surPret);
  }, []);
  const prevStatus = useRef<string>('');
  const prevCineStep = useRef(-1);
  const remaining = usePhaseCountdown(state.phaseEndsAt);

  // musique de fond + volumes
  useEffect(() => {
    gameAudio.setMusic(state.config.musicUrl);
  }, [state.config.musicUrl]);
  useEffect(() => {
    gameAudio.setVolumes(state.config.musicVolume ?? 0.35, state.config.sfxVolume ?? 0.8);
  }, [state.config.musicVolume, state.config.sfxVolume]);

  // ducking : extraits & annonces
  useEffect(() => {
    const q = state.question;
    // 'locked' compris : l'extrait vient d'etre coupe, laisser la musique de
    // fond remonter dans la seconde donne un a-coup en pleine revelation
    const mediaPlaying =
      (state.status === 'question' || state.status === 'locked') &&
      Boolean(q?.musicUrl || q?.videoYoutube);
    gameAudio.duck(mediaPlaying || state.status === 'cinematic' || state.status === 'verdict');
  }, [state.status, state.question]);

  // cues de transition
  useEffect(() => {
    const from = prevStatus.current;
    const to = state.status;
    if (from === to) return;
    prevStatus.current = to;
    const isBattle = state.mode === 'battle';
    switch (to) {
      case 'round_intro':
        gameAudio.roundIntroSting();
        break;
      case 'announce':
        gameAudio.announceSting();
        break;
      case 'question':
        gameAudio.questionSting();
        break;
      case 'locked':
        gameAudio.lockSting();
        break;
      case 'verdict':
        gameAudio.verdictPad();
        break;
      case 'reveal': {
        gameAudio.revealSweep();
        if (isBattle) {
          const r = state.battle?.reveal;
          setTimeout(() => {
            if (r?.victory) gameAudio.battleVictory();
            else if (r?.repechage) gameAudio.repechageHit();
            else if ((r?.eliminated.length ?? 0) > 0) gameAudio.eliminationSting();
            else gameAudio.correctHit();
            if (r?.milestone != null) setTimeout(() => gameAudio.milestoneHit(), 1000);
          }, 1200);
        } else {
          // Cales sur les MEMES constantes que l'animation : c'est tout l'interet
          // de les avoir sorties dans gameClient. Des valeurs en dur ici avaient
          // laisse le son de bonne reponse partir 1,1 s avant l'image quand les
          // temps visuels ont ete ralentis.
          setTimeout(() => gameAudio.correctHit(), REVEAL_REPONSE_MS);
          if (state.reveal?.fastest) setTimeout(() => gameAudio.fastestChime(), REVEAL_RAPIDE_MS);
        }
        break;
      }
      case 'round_end':
        gameAudio.fanfare();
        break;
      case 'cinematic':
        gameAudio.drumrollStart();
        break;
      case 'closing': {
        const ms = state.phaseEndsAt ? Math.max(1000, state.phaseEndsAt - Date.now()) : 5000;
        gameAudio.fadeOutAll(ms);
        break;
      }
      case 'end':
        if (from !== 'closing') gameAudio.fanfare();
        break;
    }
    if (from === 'cinematic' && to !== 'cinematic') gameAudio.drumrollStop();
  }, [state.status, state.reveal, state.mode, state.battle, state.phaseEndsAt]);

  // cues de la cinématique (une place dévoilée)
  useEffect(() => {
    const step = state.cinematic?.step ?? -1;
    if (state.status !== 'cinematic' || step === prevCineStep.current) return;
    prevCineStep.current = step;
    if (step >= 1 && step <= 5) {
      gameAudio.drumrollStop(false);
      gameAudio.rankHit(6 - step);
      if (step < 5) setTimeout(() => gameAudio.drumrollStart(), 1600);
    }
    if (step >= 6) gameAudio.drumrollStop(true);
  }, [state.status, state.cinematic?.step]);

  // Compte à rebours de la fenêtre de réponse. Programmé d'un bloc à l'entrée
  // en phase, sur l'horloge audio : piloté depuis React il suivait un timer à
  // 250 ms, donc chaque battement pouvait tomber un quart de seconde à côté du
  // chiffre affiché. La clé est la deadline de la phase, unique par question,
  // ce qui évite de reprogrammer à chaque rafraîchissement d'état.
  useEffect(() => {
    if (state.status !== 'question' || state.phaseEndsAt === null) {
      gameAudio.stopAnswerTimer();
      return;
    }
    const totalMs = state.phaseStartedAt
      ? state.phaseEndsAt - state.phaseStartedAt
      : state.config.questionMs;
    gameAudio.startAnswerTimer(state.phaseEndsAt - serverNow(), totalMs, String(state.phaseEndsAt));
    return () => gameAudio.stopAnswerTimer();
  }, [state.status, state.phaseEndsAt, state.phaseStartedAt, state.config.questionMs, soundOn]);

  // décompte de reprise après la pause, même mécanique de programmation
  useEffect(() => {
    if (state.status !== 'resuming' || state.phaseEndsAt === null) return;
    gameAudio.startResumeCountdown(state.phaseEndsAt - serverNow(), `resume-${state.phaseEndsAt}`);
    return () => gameAudio.stopAnswerTimer();
  }, [state.status, state.phaseEndsAt, soundOn]);

  return (
    <div className="game-bg relative flex h-dvh flex-col overflow-hidden text-white">
      {!soundOn && (
        <button
          type="button"
          onClick={() => {
            gameAudio.enable();
            setSoundOn(true);
          }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur"
        >
          <span className="text-6xl">🔊</span>
          <span className="text-2xl font-bold">Cliquer pour activer le son</span>
        </button>
      )}

      {/* toasts (arrivées + bonus) */}
      <div className="pointer-events-none absolute right-6 top-6 z-40 flex w-96 flex-col gap-2">
        {toasts.map((t) =>
          t.kind === 'joker' ? (
            // Joker : le pseudo porte l'information, le libelle est fixe et mis
            // en retrait. Or pour un gain, violet pour une activation.
            <div
              key={t.id}
              className="anim-slide-in flex items-center gap-4 rounded-2xl border-2 px-5 py-4 backdrop-blur"
              style={{
                borderColor: t.award ? 'rgba(255, 233, 85, 0.6)' : 'rgba(166, 100, 255, 0.6)',
                background: t.award ? 'rgba(255, 233, 85, 0.14)' : 'rgba(123, 43, 255, 0.22)',
              }}
            >
              <span className="anim-pop text-4xl leading-none">
                {t.award && !t.jokerType ? '🎁' : t.jokerType ? JOKER_DEFS[t.jokerType].emoji : '🎁'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-2xl font-black text-white">{t.text}</span>
                <span
                  className="block text-sm font-bold uppercase tracking-[0.2em]"
                  style={{ color: t.award ? 'rgba(255, 233, 85, 0.85)' : 'rgba(216, 190, 255, 0.85)' }}
                >
                  {t.award
                    ? t.jokerType
                      ? `gagne ${JOKER_DEFS[t.jokerType].label}`
                      : 'jokers distribués'
                    : `joue ${t.jokerType ? JOKER_DEFS[t.jokerType].label : 'un joker'}`}
                </span>
              </span>
            </div>
          ) : (
            <div
              key={t.id}
              className="anim-slide-in rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-3 text-lg font-bold text-cyan-100 backdrop-blur"
            >
              {t.text}
            </div>
          ),
        )}
      </div>

      <ProjectorBody state={state} remaining={remaining} answeredCount={answeredCount} />
    </div>
  );
}

export function ProjectorBody({
  state,
  remaining,
  answeredCount,
}: {
  state: PublicState;
  remaining: number | null;
  answeredCount: number;
}) {
  if (state.mode === 'battle') {
    return <BattleProjectorBody state={state} remaining={remaining} answeredCount={answeredCount} />;
  }
  switch (state.status) {
    case 'lobby':
      return <LobbyProjo state={state} />;
    case 'rules':
      return <RulesProjo state={state} />;
    case 'announce':
      return <AnnounceProjo state={state} remaining={remaining} />;
    case 'question':
    case 'locked':
      return <QuestionProjo state={state} remaining={remaining} answeredCount={answeredCount} />;
    case 'reveal':
      return <RevealProjo state={state} />;
    case 'leaderboard':
      return <LeaderboardProjo state={state} />;
    case 'cinematic':
      return <CinematicProjo state={state} />;
    case 'pause':
      return <PauseProjo state={state} remaining={null} />;
    case 'resuming':
      return <PauseProjo state={state} remaining={remaining} />;
    case 'rewards':
      return <RewardsProjo state={state} />;
    case 'end':
      return <EndProjo state={state} />;
    default:
      return null;
  }
}

export function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-10 py-8">{children}</div>;
}

// --- Lobby : accueil WiFi 2 étapes (partagé quiz / battle) -------------------

export function LobbyProjo({ state }: { state: PublicState }) {
  return (
    <FullCenter>
      <p className="text-2xl font-semibold uppercase tracking-[0.4em] text-cyan-300">
        {state.mode === 'battle' ? 'Battle Royale' : 'Quiz'}
      </p>
      <h1 className="anim-title-glow mb-10 mt-2 text-balance text-center text-6xl font-black">
        {state.quizName}
      </h1>
      {/* Deux etapes EMPILEES, un seul QR. Le QR wifi d'avant faisait deux
          codes cote a cote sur le mur : la salle scannait l'un pour l'autre et
          n'arrivait nulle part. Le wifi se lit et se tape, le QR sert a jouer. */}
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <div className="anim-fade-up flex items-center gap-8 rounded-3xl border border-white/10 bg-white/5 px-10 py-7">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-cyan-400/60 bg-cyan-400/10 text-4xl font-black text-cyan-300">
            1
          </span>
          <div className="min-w-0 text-left">
            <h2 className="text-3xl font-bold">Connecte-toi au WiFi</h2>
            <p className="mt-2 text-4xl font-black text-cyan-300">{state.config.wifiSsid}</p>
            {state.config.wifiPassword && (
              <p className="mt-1 text-2xl text-white/70">
                mot de passe <span className="font-black text-white">{state.config.wifiPassword}</span>
              </p>
            )}
          </div>
        </div>

        <div
          className="anim-fade-up flex items-center gap-8 rounded-3xl border-2 border-violet-400/40 bg-violet-500/10 px-10 py-7"
          style={{ animationDelay: '0.15s' }}
        >
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-violet-400/60 bg-violet-400/10 text-4xl font-black text-violet-300">
            2
          </span>
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-3xl font-bold">Scanne pour jouer</h2>
            <p className="mt-2 text-2xl text-white/70">
              Choisis ton pseudo d'équipe et c'est parti !
            </p>
            <p className="mt-2 text-xl text-white/40">
              ou {playUrl(state.joinCode).replace(/^https?:\/\//, '')}
            </p>
          </div>
          <div className="shrink-0">
            <QrCanvas value={playUrl(state.joinCode)} size={230} />
          </div>
        </div>
      </div>

      <div className="anim-pop mt-10 rounded-full border border-white/15 bg-white/5 px-8 py-3 text-2xl">
        <span className="font-black text-cyan-300 tabular-nums">{state.playerCount}</span>
        <span className="text-white/60"> joueur{state.playerCount > 1 ? 's' : ''} connecté{state.playerCount > 1 ? 's' : ''}</span>
      </div>
      {state.players.length > 0 && (
        <p className="mt-4 max-w-4xl text-center text-lg text-white/40">
          {state.players.slice(-14).map((p) => p.pseudo).join(' · ')}
        </p>
      )}
    </FullCenter>
  );
}

/**
 * Ecran de pause du projecteur.
 *
 * Une pause dure dix bonnes minutes : un titre fixe sur fond noir donne
 * l'impression que la soiree s'est arretee. Les pseudos des joueurs derivent
 * donc lentement vers le haut, melanges a quelques emojis de bar. Chacun se
 * cherche des yeux dans le flux, et l'ecran reste vivant sans rien demander a
 * personne.
 *
 * Tout est en CSS : positions, durees et delais sont derives du PSEUDO (hachage
 * stable), jamais tires au hasard. Deux consequences : le rendu ne saute pas a
 * chaque rafraichissement d'etat, et un joueur retrouve toujours sa bulle au
 * meme endroit du cycle. Les delais negatifs font demarrer l'ecran deja peuple
 * au lieu d'attendre vingt secondes que la premiere bulle monte.
 */
function PauseProjo({ state, remaining }: { state: PublicState; remaining: number | null }) {
  const EMOJIS = ['🍹', '🍺', '🥤', '🍕', '🎮', '🕹️', '🍿', '🥨'];

  // hachage stable : meme pseudo, meme trajectoire, d'un rendu a l'autre
  const graine = (texte: string): number => {
    let h = 0;
    for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  const bulles = state.players.slice(0, 18).map((p, i) => {
    const g = graine(p.pseudo + i);
    return {
      cle: `${p.pseudo}-${i}`,
      texte: p.pseudo,
      emoji: EMOJIS[g % EMOJIS.length],
      gauche: 3 + ((g >> 3) % 92),          // % de largeur
      duree: 26 + ((g >> 7) % 16),          // 26 a 41 s : lent, jamais agite
      retard: -((g >> 11) % 40),            // demarrage deja en cours
      derive: ((g >> 5) % 120) - 60,        // deviation laterale, en px
      inclinaison: (((g >> 9) % 9) - 4) / 2, // -2 a +2 degres
      taille: 1 + ((g >> 13) % 3) * 0.18,
    };
  });

  const resuming = state.status === 'resuming';
  const secondes = Math.max(1, Math.ceil((remaining ?? 0) / 1000));

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* le flux de pseudos, derriere le message */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {bulles.map((b) => (
          <span
            key={b.cle}
            className="anim-drift-up absolute bottom-0 inline-flex items-center gap-3 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.07] px-6 py-3 text-3xl font-bold text-white/70 backdrop-blur"
            style={{
              left: `${b.gauche}%`,
              animationDuration: `${b.duree}s`,
              animationDelay: `${b.retard}s`,
              fontSize: `${b.taille * 1.6}rem`,
              // variables lues par les keyframes
              ['--drift' as string]: `${b.derive}px`,
              ['--tilt' as string]: `${b.inclinaison}deg`,
            }}
          >
            <span>{b.emoji}</span>
            {b.texte}
          </span>
        ))}
      </div>

      {/* le message, bien lisible par-dessus. On NE CHANGE PAS de décor pour
          la reprise : le flux de pseudos continue derrière, seul le bloc
          central bascule en décompte. La salle voit la suite arriver au lieu
          de se reprendre l'écran de la question précédente. */}
      <div
        className={`anim-pop relative z-10 flex flex-col items-center rounded-[2.5rem] border border-white/10 px-20 py-14 text-center backdrop-blur-sm ${
          // pendant la pause le fond reste transparent, les pseudos qui
          // derivent font partie du spectacle ; pendant le decompte le chiffre
          // prime, on densifie le fond pour qu'aucune bulle ne vienne le lire
          // par-dessus
          resuming ? 'bg-black/80' : 'bg-black/45'
        }`}
      >
        {resuming ? (
          <>
            <p className="text-3xl font-bold uppercase tracking-[0.35em] text-cyan-300">
              Reprise dans
            </p>
            <div
              key={secondes}
              className="anim-pop my-4 font-black leading-none text-cyan-200"
              style={{ fontSize: '14rem', textShadow: '0 0 60px rgba(76,201,240,0.55)' }}
            >
              {secondes}
            </div>
            <p className="text-4xl font-bold text-white">Préparez-vous, ça repart !</p>
          </>
        ) : (
          <>
            <div className="mb-4 text-8xl">🍹</div>
            <h1 className="anim-breathe text-7xl font-black uppercase tracking-[0.2em] text-cyan-200">
              Pause
            </h1>
            <p className="mt-6 text-4xl font-bold text-white">
              C'est le moment d'aller reprendre des forces au bar !
            </p>
            {state.config.pauseText && (
              <p className="mt-5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-8 py-3 text-3xl font-bold text-cyan-300">
                {state.config.pauseText}
              </p>
            )}
            <p className="mt-8 text-2xl uppercase tracking-[0.3em] text-white/40">
              La suite arrive très vite
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Regles du projecteur : LA MEME SEQUENCE que les joueurs, en grand.
 *
 * Avant, le mur affichait une liste statique pendant que les telephones
 * jouaient une sequence animee : deux jeux de regles a maintenir, et deux
 * discours differents dans la meme salle. Tout est cadence sur phaseStartedAt,
 * donc le mur et les joueurs tournent la meme page au meme instant.
 */
function RulesProjo({ state }: { state: PublicState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <QuizRules phaseStartedAt={state.phaseStartedAt} embedded />
    </div>
  );
}

function AnnounceProjo({ state, remaining }: { state: PublicState; remaining: number | null }) {
  const q = state.question;
  if (!q) return null;
  const special = state.special ? SPECIAL_LABELS[state.special] : null;
  const progress = remaining !== null ? Math.max(0, Math.min(1, remaining / state.config.announceMs)) : 0;
  return (
    <FullCenter>
      <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-white/40">
        Question {q.index + 1} / {q.total}
      </p>
      <h1 className="anim-pop mt-6 text-balance text-center text-7xl font-black">{q.theme ?? 'Culture générale'}</h1>
      <div className="mt-8 flex items-center gap-4">
        <DifficultyBadge difficulty={q.difficulty} className="!px-6 !py-2 !text-2xl" />
        <span className="anim-glow rounded-full border border-cyan-400/50 bg-cyan-400/15 px-6 py-2 text-2xl font-black text-cyan-300">
          {q.type === 'estimation' ? 'JUSQU\u2019À ' : ''}{q.points} POINT{q.points > 1 ? 'S' : ''}
        </span>
        <span className="rounded-full border border-white/15 bg-white/5 px-6 py-2 text-2xl text-white/70">
          {TYPE_LABELS[q.type]}
        </span>
        {mediaLabel(q) && (
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-6 py-2 text-2xl font-bold uppercase text-cyan-300">
            {mediaLabel(q)}
          </span>
        )}
      </div>
      {special && (
        <div className="anim-pop mt-8 rounded-2xl border-2 border-amber-400/60 bg-amber-400/15 px-10 py-5 text-4xl font-black text-amber-300">
          {special.emoji} QUESTION SPÉCIALE : {special.label}
        </div>
      )}
      <p className="mt-12 text-2xl uppercase tracking-[0.3em] text-white/50">Jouez vos jokers maintenant !</p>
      <div className="mt-4 h-2 w-[420px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%`, transition: 'width 0.25s linear' }} />
      </div>
    </FullCenter>
  );
}

// --- Question ----------------------------------------------------------------

/**
 * Extrait audio de la question.
 *
 * Il se COUPE dès que la fenêtre de réponse se ferme. `QuestionProjo` reste
 * monté en phase 'locked' (l'écran garde la question à l'affiche), donc un
 * <audio autoPlay> continuait de jouer pendant que le ducking de la musique de
 * fond, lui, se levait : la salle entendait la musique du bar par-dessus
 * l'extrait de la question. Le volume passe par une propriété de l'élément et
 * non par un attribut, sinon l'extrait sort à 100 %, hors de portée du mixer.
 */
function QuestionAudio({ src, volume, playing }: { src: string; volume: number; playing: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, volume));
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, volume]);
  return <audio ref={ref} src={src} autoPlay />;
}

function QuestionProjo({
  state,
  remaining,
  answeredCount,
}: {
  state: PublicState;
  remaining: number | null;
  answeredCount: number;
}) {
  const q = state.question;
  if (!q) return null;
  const locked = state.status === 'locked';
  const totalMs = state.phaseEndsAt && state.phaseStartedAt ? state.phaseEndsAt - state.phaseStartedAt : state.config.questionMs;
  const hasVideo = Boolean(q.videoYoutube);
  const hasImage = Boolean(q.imageQuestionUrl);

  return (
    <div className={`flex flex-1 flex-col px-12 py-8 ${hasVideo ? 'bg-black' : ''}`}>
      <div className="mb-6 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-xl uppercase tracking-widest text-white/40">
            Question {q.index + 1}/{q.total} · {q.type === 'estimation' ? 'jusqu\u2019à ' : ''}{q.points} pt{q.points > 1 ? 's' : ''} · {q.difficulty}
          </p>
          <h1 className="mt-2 text-balance text-5xl font-black leading-tight">{q.question}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          {remaining !== null && !locked ? (
            <TimerRing remainingMs={remaining} totalMs={totalMs} size={110} />
          ) : (
            <span className="rounded-full bg-rose-500/20 px-5 py-2 text-2xl font-black text-rose-300">STOP</span>
          )}
          <span className="text-lg text-white/50 tabular-nums">{answeredCount} réponse{answeredCount > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex flex-1 gap-8">
        {(hasImage || hasVideo || q.musicUrl) && (
          <div className="flex flex-1 items-center justify-center">
            {hasVideo && q.videoYoutube ? (
              <div className="w-full max-w-3xl">
                <YoutubeClip
                  spec={q.videoYoutube}
                  volume={state.config.mediaVolume ?? 0.9}
                  playing={state.status === 'question'}
                />
              </div>
            ) : hasImage ? (
              <img src={q.imageQuestionUrl ?? ''} alt="" className="max-h-[52vh] w-full rounded-3xl object-contain" />
            ) : (
              <div className="anim-glow flex h-56 w-56 items-center justify-center rounded-full border-2 border-cyan-400/40 bg-cyan-400/10 text-8xl">
                🎵
                {q.musicUrl && (
                  <QuestionAudio
                    src={q.musicUrl}
                    volume={state.config.mediaVolume ?? 0.9}
                    playing={state.status === 'question'}
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className={`grid content-center gap-4 ${hasImage || hasVideo || q.musicUrl ? 'w-[46%]' : 'flex-1 grid-cols-2'}`}>
          {q.type === 'qcm' ? (
            (q.answers ?? []).map((a, i) => (
              <div key={i} className="anim-fade-up rounded-2xl border-2 border-white/15 bg-white/5 px-7 py-5 text-3xl font-bold" style={{ animationDelay: `${i * 0.08}s` }}>
                <span className="mr-3 font-black text-cyan-300">{String.fromCharCode(65 + i)}</span>
                {a}
              </div>
            ))
          ) : (
            <div className="col-span-2 text-center">
              <div className="text-7xl">{q.type === 'estimation' ? '🔢' : '⌨️'}</div>
              <p className="mt-4 text-3xl font-bold text-white/70">
                {q.type === 'estimation' ? 'Donne ton estimation sur ton écran !' : 'Tape ta réponse sur ton écran !'}
              </p>
            </div>
          )}
        </div>
      </div>

      {locked && (
        <div className="anim-pop mt-6 text-center text-4xl font-black uppercase tracking-widest text-rose-300">
          {state.judging ? 'Vérification des réponses...' : 'Temps écoulé !'}
        </div>
      )}
    </div>
  );
}

// --- Révélation ---------------------------------------------------------------

/**
 * Compteur anime de 0 vers `cible`, demarre quand `actif` passe a vrai.
 * Meme courbe que la barre, pour que le chiffre et la barre restent solidaires.
 */
function useCompteurAnime(cible: number, actif: boolean, dureeMs: number, delaiMs = 0): number {
  const [valeur, setValeur] = useState(0);
  useEffect(() => {
    if (!actif) {
      setValeur(0);
      return;
    }
    let raf = 0;
    let debut = 0;
    const tick = (t: number) => {
      if (!debut) debut = t;
      const p = Math.min(1, Math.max(0, (t - debut - delaiMs) / dureeMs));
      setValeur(Math.round(cible * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Filet de securite : rAF ne tourne pas si la page ne compose pas. Sans ce
    // timeout, le chiffre resterait bloque a 0 alors que la barre, elle, est
    // animee par le compositeur CSS et arriverait bien a destination.
    const filet = setTimeout(() => setValeur(cible), delaiMs + dureeMs + 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(filet);
    };
  }, [cible, actif, dureeMs, delaiMs]);
  return valeur;
}

/**
 * Une reponse a la revelation, sur le projecteur.
 *
 * La barre part de 0 et monte vers son pourcentage, avec un decalage par
 * reponse : la salle voit la repartition SE CONSTRUIRE au lieu de la decouvrir
 * figee, et devine peu a peu qui l'emporte. Le chiffre compte en meme temps.
 *
 * A ne PAS "simplifier" en posant la largeur finale des le premier rendu :
 * une transition CSS ne joue que sur un changement de valeur. C'etait le defaut
 * d'origine, les barres apparaissaient pleines d'un coup et la revelation
 * tombait a plat, sans que rien ne casse visiblement.
 */
function LigneReponseProjo({
  lettre,
  texte,
  pourcent,
  pourcentMax,
  ouvert,
  correcte,
  devoilee,
}: {
  lettre: string;
  texte: string;
  pourcent: number;
  /** plus haut pourcentage de la question, sert d'echelle de temps */
  pourcentMax: number;
  ouvert: boolean;
  correcte: boolean;
  devoilee: boolean;
}) {
  // MEME VITESSE POUR TOUTES LES BARRES. La duree est proportionnelle a la
  // cible : elles demarrent ensemble, avancent au meme rythme, et chacune
  // s'arrete en atteignant son pourcentage. La plus haute met REVEAL_BARRES_MS.
  // C'est ce qui donne la lecture progressive du resultat, alors qu'une duree
  // identique pour tous ferait arriver tout le monde en meme temps.
  const dureeMs = pourcentMax > 0 ? (pourcent / pourcentMax) * REVEAL_BARRES_MS : REVEAL_BARRES_MS;
  const affiche = useCompteurAnime(pourcent, ouvert, dureeMs);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 px-7 py-5 text-3xl font-bold transition-all duration-500 ${
        devoilee && correcte
          ? 'anim-pop scale-[1.02] border-emerald-400 bg-emerald-400/20 text-emerald-200'
          : devoilee
            ? 'border-white/10 bg-white/5 opacity-40'
            : 'border-white/15 bg-white/5'
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 ${devoilee && correcte ? 'bg-emerald-400/25' : 'bg-white/10'}`}
        style={{
          width: `${ouvert ? pourcent : 0}%`,
          // lineaire, et non easing : une courbe ferait ralentir les grandes
          // barres en fin de course, on ne verrait plus qu'elles avancent a la
          // meme vitesse que les petites.
          transition: `width ${Math.round(dureeMs)}ms linear, background-color 0.5s ease-out`,
        }}
      />
      <div className="relative flex items-center justify-between">
        <span>
          <span className="mr-3 font-black text-cyan-300">{lettre}</span>
          {texte}
          {devoilee && correcte && ' \u2714'}
        </span>
        <span className="text-2xl tabular-nums text-white/60">{affiche}%</span>
      </div>
    </div>
  );
}

function RevealProjo({ state }: { state: PublicState }) {
  const q = state.question;
  const reveal = state.reveal;
  // Quatre temps : les barres montent, la bonne reponse se detache, le podium
  // de vitesse arrive, puis celui des series.
  //
  // Cadence sur phaseStartedAt (HORLOGE SERVEUR) et non sur le montage : un
  // projecteur qui recharge en pleine revelation, ou qu'on rebranche, retombe
  // au bon moment de la sequence au lieu de la rejouer depuis le debut. Un
  // simple intervalle fait avancer les seuils ; aucun requestAnimationFrame,
  // suspendu des que la page cesse de composer.
  const [maintenant, setMaintenant] = useState(() => serverNow());
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(serverNow()), 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setOuvert(false);
    // une frame avant d'ouvrir : la transition CSS a besoin de voir la largeur
    // 0 rendue avant de partir vers sa cible. setTimeout et NON rAF, pour la
    // meme raison que ci-dessus.
    const t0 = setTimeout(() => setOuvert(true), 60);
    return () => clearTimeout(t0);
  }, [state.currentQuestionIndex]);

  const ecoule = maintenant - (state.phaseStartedAt ?? maintenant);
  const devoilee = ecoule >= REVEAL_REPONSE_MS;

  // IMAGE DE REPONSE : elle prend TOUTE la place des podiums pendant quelques
  // secondes, puis s'efface pour leur rendre la main. Avant, elle s'ajoutait
  // au-dessus d'eux et poussait la page hors de l'ecran : le projecteur du bar
  // se retrouvait avec une barre de defilement verticale.
  const imageReponse = state.question?.imageAnswerUrl ?? null;
  const finImage = REVEAL_REPONSE_MS + REVEAL_IMAGE_MS;
  const imageVisible = Boolean(imageReponse) && ecoule >= REVEAL_REPONSE_MS && ecoule < finImage;
  // les podiums attendent la fin de l'image quand il y en a une
  const tRapide = imageReponse ? finImage + 200 : REVEAL_RAPIDE_MS;
  const tSerie = imageReponse ? finImage + 2600 : REVEAL_SERIE_MS;
  const rapideDevoile = ecoule >= tRapide;
  const serieDevoilee = ecoule >= tSerie;

  if (!q || !reveal) return null;
  if (reveal.cancelled) {
    return (
      <FullCenter>
        <div className="anim-pop text-center">
          <div className="mb-6 text-8xl">🚫</div>
          <h1 className="text-5xl font-black">Question annulée</h1>
          <p className="mt-4 text-2xl text-white/60">Elle ne compte pas, on passe à la suite !</p>
        </div>
      </FullCenter>
    );
  }

  const allInWinners = Object.entries(reveal.results).filter(([, r]) => r.allIn && r.correct);
  const allInLosers = Object.entries(reveal.results).filter(([, r]) => r.allIn && !r.correct && r.answered);
  // Top 3 des series EN COURS, calcule depuis les resultats (aucun aller-retour
  // serveur : reveal.results porte deja le strike de chacun apres la question).
  // Seuil a 2 : une serie de 1 n'est pas une serie.
  //
  // Seuil a 1 et non 2 : des la premiere question, ceux qui ont trouve sont en
  // serie de 1 et doivent apparaitre, sinon le podium reste vide toute la
  // premiere manche. L'ordre entre ex-aequo est arbitraire et on ne cherche pas
  // a les departager : on annonce simplement combien d'autres joueurs avaient
  // le meme droit d'y figurer.
  const enSerie = Object.entries(reveal.results)
    .filter(([, r]) => (r.streak ?? 0) >= 1)
    .sort((a, b) => (b[1].streak ?? 0) - (a[1].streak ?? 0));
  const serieTop = enSerie
    .slice(0, 3)
    .map(([pseudo, r]) => ({ pseudo, streak: r.streak ?? 0, bonus: Boolean(r.streakBonus) }));
  const seuilPodium = serieTop[serieTop.length - 1]?.streak ?? 0;
  const exAequo = enSerie.filter(([, r]) => (r.streak ?? 0) >= seuilPodium).length - serieTop.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-12 py-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-balance text-4xl font-black">{q.question}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <DifficultyBadge difficulty={q.difficulty} className="!px-4 !py-1.5 !text-xl" />
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xl font-black text-cyan-300">
            {q.points} pt{q.points > 1 ? 's' : ''}
          </span>
          {q.theme && (
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xl font-bold text-white/70">
              {q.theme}
            </span>
          )}
          <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xl font-bold text-white/50">
            {TYPE_LABELS[q.type]}
          </span>
          {mediaLabel(q) && (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xl font-bold uppercase text-cyan-300">
              {mediaLabel(q)}
            </span>
          )}
        </div>
      </div>

      {q.type === 'qcm' && (
        <div className="grid min-h-0 flex-1 content-center gap-3 overflow-hidden">
          {(q.answers ?? []).map((a, i) => (
            <LigneReponseProjo
              key={i}
              lettre={String.fromCharCode(65 + i)}
              texte={a}
              pourcent={reveal.percents?.[i] ?? 0}
              pourcentMax={Math.max(1, ...(reveal.percents ?? [0]))}
              ouvert={ouvert}
              correcte={i === reveal.correctIndex}
              devoilee={devoilee}
            />
          ))}
        </div>
      )}

      {q.type === 'estimation' && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <p className="text-2xl uppercase tracking-widest text-white/40">La bonne réponse était</p>
          <p className="anim-pop my-6 text-8xl font-black text-emerald-300 tabular-nums">{reveal.expectedNumber}</p>
          <div className="mt-4 w-full max-w-2xl">
            {(reveal.bestEstimations ?? []).map((e, i) => (
              <div key={i} className="anim-fade-up flex items-center justify-between border-b border-white/10 px-4 py-3 text-2xl" style={{ animationDelay: `${i * 0.15}s` }}>
                <span className="font-bold">{i === 0 ? '🎯 ' : ''}{e.pseudo}</span>
                <span className="text-white/60 tabular-nums">{e.value} (écart {e.gap})</span>
                <span className="font-black text-cyan-300">+{e.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {q.type === 'free_text' && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <p className="text-2xl uppercase tracking-widest text-white/40">La bonne réponse était</p>
          <p className="anim-pop my-6 text-balance text-center text-6xl font-black text-emerald-300">{reveal.expectedAnswer}</p>
          <p className="text-3xl text-white/70">
            {Object.values(reveal.results).filter((r) => r.correct).length} bonne
            {Object.values(reveal.results).filter((r) => r.correct).length > 1 ? 's' : ''} réponse
            {Object.values(reveal.results).filter((r) => r.correct).length > 1 ? 's' : ''} acceptée
            {Object.values(reveal.results).filter((r) => r.correct).length > 1 ? 's' : ''} sur {reveal.answeredCount}
          </p>
        </div>
      )}

      {/* Zone basse : l'image de reponse OU les deux podiums, jamais les deux a
          la fois. Hauteur fixe, donc rien ne pousse et rien ne defile. */}
      {imageVisible && imageReponse ? (
        <div className="anim-pop mt-4 flex h-[430px] shrink-0 items-center justify-center">
          <img
            src={imageReponse}
            alt=""
            className="max-h-full max-w-full rounded-3xl border-2 border-white/15 object-contain"
          />
        </div>
      ) : (
      /* Deux podiums, devoiles l'un apres l'autre : d'abord la vitesse, puis
         les series en cours. Chacun monte du 3e vers le 1er, le 1er arrive en
         dernier et reste le plus gros. */
      /* Hors QCM, aucun bonus de rapidite n'est attribue (cf. scoring) : le
         podium des plus rapides n'aurait rien a montrer, les series prennent
         toute la largeur. */
      <div
        className={`mt-4 grid h-[430px] shrink-0 items-end gap-8 ${
          q.type === 'qcm' ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {q.type === 'qcm' && (
        <PodiumProjo
          titre="⚡ Les plus rapides"
          recompense={`+${SPEED_BONUS[0]} pour le 1er · +${SPEED_BONUS[1]} ensuite`}
          visible={rapideDevoile}
          ton="amber"
          entrees={(reveal.fastestTop ?? []).map((f, i) => ({
            pseudo: f.pseudo,
            valeur: (f.elapsedMs / 1000).toFixed(2),
            unite: 'secondes',
            note: `+${f.bonus ?? SPEED_BONUS[i] ?? 1} PT`,
            fort: i === 0,
          }))}
          vide="Personne n'a trouvé"
        />
        )}
        <PodiumProjo
          titre="🔥 Les plus grosses séries"
          recompense="séries en cours"
          visible={serieDevoilee}
          ton="flame"
          entrees={serieTop.map((x) => ({
            pseudo: x.pseudo,
            // le chiffre seul : « series en cours » est deja dit en en-tete, et
            // un decompte vers le bonus dans chaque tube faisait trop de texte
            valeur: String(x.streak),
            note: x.bonus ? '🔥 +1 PT' : undefined,
            fort: x.bonus,
          }))}
          surplus={exAequo}
          vide="Aucune série en cours"
        />
      </div>
      )}

      <div className="mt-3 flex min-h-[52px] shrink-0 flex-wrap items-center justify-center gap-4">
        {rapideDevoile && allInWinners.length > 0 && (
          <span className="anim-pop rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-6 py-2 text-2xl font-bold text-fuchsia-200">
            🎰 All-In ×3 : {allInWinners.map(([pseudo]) => pseudo).join(', ')}
          </span>
        )}
        {rapideDevoile && allInLosers.length > 0 && (
          <span className="rounded-full border border-white/15 bg-white/5 px-6 py-2 text-2xl text-white/50">
            🎰 All-In perdu : {allInLosers.map(([pseudo]) => pseudo).join(', ')}
          </span>
        )}
        {rapideDevoile && (reveal.special === 'shot' || reveal.special === 'goodies') && reveal.fastest && (
          <span className="anim-pop rounded-full border border-amber-400/60 bg-amber-400/20 px-6 py-2 text-2xl font-black text-amber-200">
            {reveal.special === 'shot' ? '🥃 Shot offert à' : '🎁 Goodies pour'} {reveal.fastest} !
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Podium du projecteur (vitesse, series...).
 *
 * Le 3e apparait d'abord, puis le 2e, puis le 1er : c'est l'ordre d'un vrai
 * palmares, et ca laisse le temps a la salle de reagir a chaque nom. La valeur
 * (temps, longueur de serie) vit DANS la marche, en tres gros : c'est le
 * chiffre qu'on lit de loin, le pseudo n'a besoin que d'etre reconnaissable.
 *
 * Les marches des series se remplissent a hauteur du chemin parcouru vers le
 * bonus : on voit d'un coup d'oeil qui approche du seuil et qui l'a franchi.
 *
 * Tout est en CSS (transitions + delais) : rien ne depend de rAF, donc rien ne
 * gele si le kiosque cesse de composer.
 */
function PodiumProjo({
  titre,
  recompense,
  entrees,
  visible,
  ton,
  vide,
  surplus = 0,
}: {
  titre: string;
  recompense: string;
  entrees: Array<{
    pseudo: string;
    valeur: string;
    unite?: string;
    note?: string;
    fort?: boolean;
  }>;
  visible: boolean;
  ton: 'amber' | 'flame';
  vide: string;
  /** joueurs a egalite avec le dernier du podium, annonces sous les marches */
  surplus?: number;
}) {
  const palette =
    ton === 'amber'
      ? {
          bord: 'border-amber-400/60',
          fond: 'bg-amber-400/10',
          texte: 'text-amber-300',
          doux: 'text-amber-200/70',
          marche: 'border-amber-400/60 bg-amber-400/15',
          lueur: 'rgba(255, 176, 32, 0.5)',
          ruban: 'border-amber-300/70 bg-amber-400/25 text-amber-100',
        }
      : {
          bord: 'border-orange-400/60',
          fond: 'bg-orange-500/10',
          texte: 'text-orange-300',
          doux: 'text-orange-200/70',
          marche: 'border-orange-400/60 bg-orange-500/15',
          lueur: 'rgba(255, 108, 32, 0.5)',
          ruban: 'border-orange-300/70 bg-orange-500/25 text-orange-100',
        };

  // ordre d'affichage : 2e, 1er, 3e (podium classique)
  const places = [1, 0, 2].filter((i) => i < entrees.length);
  const hauteurs = [168, 128, 100];
  const medailles = ['🥇', '🥈', '🥉'];

  return (
    <div
      className={`flex h-full flex-col justify-end rounded-3xl border-2 px-6 pb-5 pt-4 ${palette.bord} ${palette.fond}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 520ms ease, transform 560ms cubic-bezier(0.3, 1.15, 0.4, 1)',
      }}
    >
      <div className="flex items-center justify-center gap-4">
        <p className={`text-3xl font-black uppercase tracking-[0.15em] ${palette.texte}`}>{titre}</p>
        <span
          className={`rounded-full border-2 px-5 py-1.5 text-2xl font-black uppercase tracking-wider ${palette.ruban}`}
        >
          {recompense}
        </span>
      </div>

      {entrees.length === 0 ? (
        <p className="mt-10 text-center text-3xl text-white/35">{vide}</p>
      ) : (
        <div className="mt-4 flex items-end justify-center gap-6">
          {places.map((i) => {
            const e = entrees[i];
            // le 3e sort en premier, le 1er en dernier
            const delai = (entrees.length - 1 - i) * 0.65;
            const premier = i === 0;
            return (
              <div
                key={e.pseudo}
                className="flex w-52 flex-col items-center"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.85)',
                  transition: `opacity 420ms ease ${delai}s, transform 520ms cubic-bezier(0.25, 1.35, 0.4, 1) ${delai}s`,
                }}
              >
                <span className={premier ? 'text-6xl leading-none' : 'text-5xl leading-none'}>
                  {medailles[i]}
                </span>
                <span
                  className={`mt-3 max-w-full truncate font-black ${palette.texte} ${premier ? 'text-5xl' : 'text-4xl'}`}
                >
                  {e.pseudo}
                </span>

                {/* La note vit AU-DESSUS de la marche : dans le tube, elle se
                    faisait rogner sur les marches basses (3e place). */}
                {e.note && (
                  <span
                    className={`mt-1 rounded-full px-3 py-0.5 text-xl font-black uppercase tracking-wide ${
                      e.fort ? `border-2 ${palette.ruban}` : palette.doux
                    }`}
                  >
                    {e.note}
                  </span>
                )}

                {/* la marche : le chiffre y vit, lisible de tout le bar */}
                <div
                  className={`mt-2 flex w-full flex-col items-center justify-center rounded-t-2xl border-2 border-b-0 ${palette.marche}`}
                  style={{
                    height: hauteurs[i],
                    boxShadow: premier && visible ? `0 0 45px ${palette.lueur}` : undefined,
                  }}
                >
                  <span
                    className={`font-black tabular-nums leading-none text-white ${premier ? 'text-7xl' : 'text-6xl'}`}
                  >
                    {e.valeur}
                  </span>
                  {e.unite && (
                    <span className={`mt-1 text-xl font-bold uppercase tracking-wider ${palette.doux}`}>
                      {e.unite}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {surplus > 0 && (
        <p className={`mt-3 text-center text-xl font-bold ${palette.doux}`}>
          + {surplus} autre{surplus > 1 ? 's' : ''} joueur{surplus > 1 ? 's' : ''} à égalité
        </p>
      )}
    </div>
  );
}

// --- Classements ---------------------------------------------------------------

/**
 * Classement du projecteur.
 *
 * Pense pour un ecran regarde de loin, dans le bruit : le podium est detache et
 * enorme, le reste suit en deux colonnes. Retour terrain, l'ancienne version
 * alignait tout le monde dans des lignes de meme taille, on ne distinguait pas
 * les trois premiers et les points n'apparaissaient pas.
 */
/**
 * Classement du projecteur, DIMENSIONNE AU NOMBRE DE JOUEURS.
 *
 * Les soirees montent a 40, parfois 50 joueurs : l'ancienne grille fixe de deux
 * colonnes s'arretait au 23e et laissait la moitie de la salle hors de l'ecran.
 * On repartit desormais la suite du classement sur 2 a 4 colonnes selon
 * l'effectif, en resserrant la taille des lignes a mesure. Au-dela de la
 * capacite de l'ecran, le reliquat est annonce explicitement plutot que
 * silencieusement coupe.
 */
const LIGNES_PAR_COLONNE = 13;

function LeaderboardProjo({ state }: { state: PublicState }) {
  const standings = state.standings ?? [];
  const podium = standings.slice(0, 3);
  const reste = standings.slice(3);

  // 2 colonnes tant qu'on tient, jusqu'a 4 pour une salle pleine
  const colonnes = Math.max(2, Math.min(4, Math.ceil(reste.length / LIGNES_PAR_COLONNE)));
  const capacite = colonnes * LIGNES_PAR_COLONNE;
  const affiches = reste.slice(0, capacite);
  const surplus = reste.length - affiches.length;
  const dense = colonnes >= 3;

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-12 py-6">
      <h1 className="mb-4 shrink-0 text-center text-5xl font-black uppercase tracking-widest">
        Classement
        <span className="ml-4 text-2xl font-bold text-white/35">{standings.length} joueurs</span>
      </h1>

      {podium.length > 0 && (
        <div className={`grid shrink-0 grid-cols-3 gap-5 ${dense ? 'mb-4' : 'mb-6'}`}>
          {podium.map((s) => (
            <PodiumCard key={s.pseudo} s={s} compact={dense} />
          ))}
        </div>
      )}

      {affiches.length > 0 && (
        <div
          className="grid min-h-0 flex-1 content-start gap-x-8 gap-y-1.5"
          style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
        >
          {affiches.map((s) => (
            <StandingRow key={s.pseudo} s={s} big={!dense} />
          ))}
        </div>
      )}

      {surplus > 0 && (
        <p className="mt-2 shrink-0 text-center text-xl font-bold text-white/35">
          + {surplus} autre{surplus > 1 ? 's' : ''} joueur{surplus > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

/** Une marche du podium : rang, pseudo et points, en tres grand. */
function PodiumCard({ s, compact = false }: { s: StandingEntry; compact?: boolean }) {
  const deco =
    s.position === 1
      ? { medaille: '🥇', bord: 'border-amber-300/70', fond: 'bg-amber-300/15', texte: 'text-amber-200' }
      : s.position === 2
        ? { medaille: '🥈', bord: 'border-slate-200/60', fond: 'bg-slate-200/10', texte: 'text-slate-100' }
        : { medaille: '🥉', bord: 'border-orange-400/60', fond: 'bg-orange-400/10', texte: 'text-orange-200' };
  return (
    <div
      className={`anim-pop flex flex-col items-center rounded-3xl border-2 ${compact ? 'gap-1 px-5 py-4' : 'gap-2 px-6 py-7'} ${deco.bord} ${deco.fond}`}
      style={{ animationDelay: `${(4 - s.position) * 0.18}s` }}
    >
      <span className={compact ? 'text-4xl leading-none' : 'text-6xl leading-none'}>{deco.medaille}</span>
      <span className={`max-w-full truncate font-black ${compact ? 'text-3xl' : 'text-4xl'} ${deco.texte}`}>
        {s.pseudo}
      </span>
      {typeof s.score === 'number' && (
        <span className={`font-black tabular-nums text-cyan-300 ${compact ? 'text-4xl' : 'text-5xl'}`}>
          {s.score}
        </span>
      )}
      {s.positionChange > 0 && (
        <span className={`font-bold text-emerald-300 ${compact ? 'text-xl' : 'text-2xl'}`}>▲ {s.positionChange}</span>
      )}
      {s.positionChange < 0 && (
        <span className={`font-bold text-rose-400 ${compact ? 'text-xl' : 'text-2xl'}`}>▼ {Math.abs(s.positionChange)}</span>
      )}
    </div>
  );
}

function StandingRow({ s, big = false }: { s: StandingEntry; big?: boolean }) {
  const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : null;
  return (
    <div
      className={`anim-fade-up flex items-center rounded-xl border border-white/10 bg-white/5 ${big ? 'gap-5 px-6 py-3.5 text-3xl' : 'gap-3 px-4 py-2 text-2xl'}`}
      style={{ animationDelay: `${Math.min(s.position * 0.05, 1)}s` }}
    >
      <span className={`shrink-0 text-center font-black tabular-nums ${big ? 'w-14' : 'w-10'} ${s.position <= 3 ? 'text-amber-300' : 'text-white/40'}`}>
        {medal ?? s.position}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{s.pseudo}</span>
      {s.positionChange > 0 && <span className="text-emerald-300">▲{s.positionChange}</span>}
      {s.positionChange < 0 && <span className="text-rose-400">▼{Math.abs(s.positionChange)}</span>}
      {typeof s.score === 'number' && <span className="font-black text-cyan-300 tabular-nums">{s.score}</span>}
    </div>
  );
}

function CinematicProjo({ state }: { state: PublicState }) {
  const step = state.cinematic?.step ?? 0;
  const standings = state.standings ?? [];

  if (step === 0) {
    return (
      <FullCenter>
        <h1 className="anim-pop text-balance text-center text-7xl font-black uppercase tracking-widest">
          Le classement final
        </h1>
        <p className="mt-8 animate-pulse text-3xl text-white/50">🥁 Roulement de tambour...</p>
      </FullCenter>
    );
  }
  if (step >= 6) {
    return (
      <div className="flex flex-1 flex-col px-14 py-10">
        <h1 className="mb-8 text-center text-5xl font-black uppercase tracking-widest">🏆 Classement final</h1>
        <div className="grid flex-1 grid-cols-2 gap-12">
          <div className="flex flex-col gap-2">
            {standings.slice(0, 10).map((s) => <StandingRow key={s.pseudo} s={s} big />)}
          </div>
          <div className="flex flex-col gap-1.5 overflow-hidden">
            {standings.slice(10, 30).map((s) => <StandingRow key={s.pseudo} s={s} />)}
          </div>
        </div>
      </div>
    );
  }

  // steps 1..5 : 5e, 4e, 3e, 2e, 1er — le serveur ne publie que les rangs
  // déjà dévoilés, on cherche donc par position (jamais par index)
  const revealedRank = 6 - step; // 5,4,3,2,1
  const current = standings.find((s) => s.position === revealedRank);
  const already = standings.filter((s) => s.position > revealedRank && s.position <= 5);
  const isWinner = revealedRank === 1;

  return (
    <FullCenter>
      <p className="text-3xl uppercase tracking-[0.4em] text-white/40">
        {isWinner ? 'Et le grand gagnant est...' : `À la ${revealedRank}ème place...`}
      </p>
      {current ? (
        <div
          className={`anim-pop mt-10 flex flex-col items-center rounded-3xl border-4 px-20 py-12 ${
            isWinner
              ? 'border-amber-400 bg-amber-400/15'
              : 'border-cyan-400/60 bg-cyan-400/10'
          }`}
        >
          <span className="text-8xl">{isWinner ? '👑' : revealedRank === 2 ? '🥈' : revealedRank === 3 ? '🥉' : '⭐'}</span>
          <span className={`mt-6 text-balance text-center text-8xl font-black ${isWinner ? 'text-amber-300' : ''}`}>
            {current.pseudo}
          </span>
        </div>
      ) : (
        <p className="mt-10 text-4xl text-white/40">...</p>
      )}
      {already.length > 0 && (
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4 text-2xl text-white/50">
          {already.sort((a, b) => b.position - a.position).map((s) => (
            <span key={s.pseudo} className="rounded-full border border-white/15 px-5 py-1.5">
              {s.position}. {s.pseudo}
            </span>
          ))}
        </div>
      )}
    </FullCenter>
  );
}

// --- Récompenses + fin ----------------------------------------------------------

const REWARD_DEFS = [
  { key: 'fastest', emoji: '⚡', title: 'La gâchette', sub: 'Meilleur temps de réponse moyen' },
  { key: 'bestRatio', emoji: '🧠', title: 'Le cerveau', sub: 'Meilleur taux de bonnes réponses' },
  { key: 'bestStrike', emoji: '🔥', title: 'La série', sub: 'Plus longue série de bonnes réponses' },
  { key: 'bonnetDane', emoji: '🫏', title: 'Le bonnet d\'âne', sub: 'On ne le félicite pas' },
] as const;

function RewardsProjo({ state }: { state: PublicState }) {
  const rewards = state.rewards;
  if (!rewards) return null;
  return (
    <FullCenter>
      <h1 className="mb-12 text-6xl font-black uppercase tracking-widest">🏅 Les mentions spéciales</h1>
      <div className="grid w-full max-w-5xl grid-cols-2 gap-8">
        {REWARD_DEFS.map((def, i) => {
          const revealed = rewards.revealed > i;
          const value = rewards[def.key];
          return (
            <div
              key={def.key}
              className={`rounded-3xl border px-8 py-8 text-center transition-all ${
                revealed ? 'anim-pop border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-white/5 opacity-30'
              }`}
            >
              <div className="text-6xl">{def.emoji}</div>
              <h2 className="mt-3 text-3xl font-black">{def.title}</h2>
              <p className="text-lg text-white/50">{def.sub}</p>
              <p className="mt-4 text-4xl font-black text-cyan-300">
                {revealed ? (value ? ('pseudo' in value ? value.pseudo : '?') : 'Personne !') : '???'}
              </p>
            </div>
          );
        })}
      </div>
    </FullCenter>
  );
}

function EndProjo({ state }: { state: PublicState }) {
  const podium = (state.standings ?? []).slice(0, 3);
  return (
    <FullCenter>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-3xl"
            style={{
              left: `${(i * 41) % 100}%`,
              animation: `game-confetti-fall ${5 + (i % 5)}s linear ${(i % 10) * 0.6}s infinite`,
            }}
          >
            {['🎉', '✨', '🎊'][i % 3]}
          </span>
        ))}
      </div>
      <h1 className="anim-pop text-balance text-center text-6xl font-black leading-tight">
        {state.endTexts?.winnerText}
      </h1>
      <div className="mt-14 flex items-end gap-8">
        {podium[1] && <PodiumBlock s={podium[1]} height="h-40" medal="🥈" />}
        {podium[0] && <PodiumBlock s={podium[0]} height="h-56" medal="👑" winner />}
        {podium[2] && <PodiumBlock s={podium[2]} height="h-32" medal="🥉" />}
      </div>
      <p className="mt-12 text-3xl text-white/60">{state.endTexts?.endText}</p>
    </FullCenter>
  );
}

function PodiumBlock({ s, height, medal, winner = false }: { s: StandingEntry; height: string; medal: string; winner?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-6xl">{medal}</span>
      <span className={`text-balance text-center text-3xl font-black ${winner ? 'text-amber-300' : ''}`}>{s.pseudo}</span>
      {typeof s.score === 'number' && <span className="text-xl text-white/60 tabular-nums">{s.score} pts</span>}
      <div className={`w-40 rounded-t-2xl border border-white/15 ${winner ? 'bg-amber-400/25' : 'bg-white/10'} ${height}`} />
    </div>
  );
}
