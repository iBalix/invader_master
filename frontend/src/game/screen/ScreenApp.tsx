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
  type PublicState,
  type StandingEntry,
} from '../lib/gameClient';
import { useGameSession, usePhaseCountdown } from '../hooks/useGameSession';
import {
  DifficultyBadge,
  QrCanvas,
  SPECIAL_LABELS,
  TimerRing,
  TYPE_LABELS,
  wifiQrValue,
  YoutubeClip,
} from '../ui/bits';
import { gameAudio } from './audio';
import { BattleProjectorBody } from './BattleScreens';
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

  const [toasts, setToasts] = useState<Array<{ id: number; text: string; kind: string }>>([]);
  const toastId = useRef(0);
  const pushToast = (text: string, kind = 'join') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const [answeredCount, setAnsweredCount] = useState(0);

  const { state } = useGameSession(sessionId, {
    onEvent: (e) => {
      if (!isProjector) return;
      if (e.event === 'player-joined') pushToast(`${e.payload.pseudo} rejoint la partie !`, 'join');
      if (e.event === 'bonus') {
        pushToast(`🎲 ${e.payload.pseudo} tente le QUITTE OU DOUBLE !`, 'bonus');
        gameAudio.bonusBlip();
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
    <div className="game-bg flex min-h-dvh flex-col items-center justify-center overflow-hidden text-white">
      <h1 className="anim-title-glow text-6xl font-black tracking-[0.3em]">INVADER</h1>
      <p className="mt-4 text-white/30">{hostname}</p>
    </div>
  );
}

function BarScreen({ state }: { state: PublicState }) {
  return (
    <div className="game-bg flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-8 text-center text-white">
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
  toasts: Array<{ id: number; text: string; kind: string }>;
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
  const lastTickSecond = useRef(-1);

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
    const mediaPlaying = state.status === 'question' && Boolean(q?.musicUrl || q?.videoYoutube);
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
          // cales sur RevealProjo : revelation a 2200 ms, plus rapide a 3400 ms
          setTimeout(() => gameAudio.correctHit(), 2200);
          if (state.reveal?.fastest) setTimeout(() => gameAudio.fastestChime(), 3400);
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

  // tics des 5 dernières secondes de question
  useEffect(() => {
    if (state.status !== 'question' || remaining === null) return;
    const s = Math.ceil(remaining / 1000);
    if (s <= 5 && s >= 1 && s !== lastTickSecond.current) {
      lastTickSecond.current = s;
      gameAudio.tick(s <= 3);
    }
  }, [remaining, state.status]);

  return (
    <div className="game-bg relative flex min-h-dvh flex-col overflow-hidden text-white">
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
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`anim-slide-in rounded-xl border px-4 py-3 text-lg font-bold backdrop-blur ${
              t.kind === 'bonus'
                ? 'border-violet-400/50 bg-violet-500/25 text-violet-100'
                : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      <ProjectorBody state={state} remaining={remaining} answeredCount={answeredCount} />
    </div>
  );
}

function ProjectorBody({
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
      return <RulesProjo />;
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
      return (
        <FullCenter>
          <div className="anim-pop text-center">
            <div className="mb-6 text-7xl">🍹</div>
            <h1 className="text-6xl font-black uppercase tracking-wider">C'est la pause !</h1>
            <p className="mt-6 text-3xl text-cyan-300">{state.config.pauseText}</p>
          </div>
        </FullCenter>
      );
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
      <div className="grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="anim-fade-up rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="mb-1 text-xl font-black text-cyan-300">ÉTAPE 1</p>
          <h2 className="mb-4 text-3xl font-bold">Connecte-toi au WiFi</h2>
          <div className="flex justify-center"><QrCanvas value={wifiQrValue(state.config.wifiSsid, state.config.wifiPassword)} size={220} /></div>
          <p className="mt-4 text-xl text-white/70">
            Scanne, ou choisis le réseau{' '}
            <span className="font-black text-white">{state.config.wifiSsid}</span>
            {state.config.wifiPassword && (
              <>
                <br />
                mot de passe <span className="font-black text-white">{state.config.wifiPassword}</span>
              </>
            )}
          </p>
        </div>
        <div className="anim-fade-up rounded-3xl border border-white/10 bg-white/5 p-8 text-center" style={{ animationDelay: '0.15s' }}>
          <p className="mb-1 text-xl font-black text-violet-300">ÉTAPE 2</p>
          <h2 className="mb-4 text-3xl font-bold">Scanne pour jouer</h2>
          <div className="flex justify-center"><QrCanvas value={playUrl(state.joinCode)} size={220} /></div>
          <p className="mt-4 text-xl text-white/70">
            Choisis ton pseudo d'équipe et c'est parti !
          </p>
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

function RulesProjo() {
  const rules = [
    { emoji: '📱', text: 'Réponds sur ton téléphone avant la fin du temps' },
    { emoji: '⭐', text: 'Chaque question annonce ses points : Facile 1, Moyen 2, Difficile 3 (jusqu\'à 5 !)' },
    { emoji: '⚡', text: 'Le plus rapide des bons répondeurs gagne +1 point' },
    { emoji: '🎲', text: '2 QUITTE OU DOUBLE par équipe : active-le avant la question, bonne réponse = x2, mauvaise = rien à perdre' },
    { emoji: '🏆', text: 'Classement final en cinématique... et des récompenses à gagner !' },
  ];
  return (
    <FullCenter>
      <h1 className="mb-12 text-6xl font-black uppercase tracking-wider">Les règles</h1>
      <div className="flex max-w-4xl flex-col gap-6">
        {rules.map((r, i) => (
          <div key={i} className="anim-fade-up flex items-center gap-6 rounded-2xl border border-white/10 bg-white/5 px-8 py-5" style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="text-5xl">{r.emoji}</span>
            <span className="text-2xl font-semibold">{r.text}</span>
          </div>
        ))}
      </div>
    </FullCenter>
  );
}

// --- Annonce -----------------------------------------------------------------

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
      </div>
      {special && (
        <div className="anim-pop mt-8 rounded-2xl border-2 border-amber-400/60 bg-amber-400/15 px-10 py-5 text-4xl font-black text-amber-300">
          {special.emoji} QUESTION SPÉCIALE : {special.label}
        </div>
      )}
      {state.qdFeed.length > 0 && (
        <div className="anim-pop mt-8 rounded-2xl border border-violet-400/40 bg-violet-500/15 px-8 py-4 text-center">
          <p className="text-2xl font-bold text-violet-200">
            🎲 {state.qdFeed.length} audacieux : {state.qdFeed.slice(-8).join(', ')}
          </p>
        </div>
      )}
      <p className="mt-12 text-2xl uppercase tracking-[0.3em] text-white/50">Activez vos bonus maintenant !</p>
      <div className="mt-4 h-2 w-[420px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%`, transition: 'width 0.25s linear' }} />
      </div>
    </FullCenter>
  );
}

// --- Question ----------------------------------------------------------------

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
                <YoutubeClip spec={q.videoYoutube} volume={state.config.mediaVolume ?? 0.9} />
              </div>
            ) : hasImage ? (
              <img src={q.imageQuestionUrl ?? ''} alt="" className="max-h-[52vh] w-full rounded-3xl object-contain" />
            ) : (
              <div className="anim-glow flex h-56 w-56 items-center justify-center rounded-full border-2 border-cyan-400/40 bg-cyan-400/10 text-8xl">
                🎵
                {q.musicUrl && (
                  <audio
                    src={q.musicUrl}
                    autoPlay
                    // le volume d'un <audio> ne se pose pas en attribut : sans ce
                    // ref l'extrait sortait a 100 %, hors de portee du mixer
                    ref={(el) => {
                      if (el) el.volume = Math.min(1, Math.max(0, state.config.mediaVolume ?? 0.9));
                    }}
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
                {q.type === 'estimation' ? 'Donne ton estimation sur ton téléphone !' : 'Tape ta réponse sur ton téléphone !'}
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
      setValeur(Math.round(cible * (1 - Math.pow(1 - p, 3))));
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
  ouvert,
  rang,
  correcte,
  devoilee,
}: {
  lettre: string;
  texte: string;
  pourcent: number;
  ouvert: boolean;
  rang: number;
  correcte: boolean;
  devoilee: boolean;
}) {
  const delaiMs = rang * 120;
  const affiche = useCompteurAnime(pourcent, ouvert, 1600, delaiMs);
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
          transition: 'width 1.6s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.5s ease-out',
          transitionDelay: `${delaiMs}ms`,
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
  // Trois temps : les barres montent, puis la bonne reponse se detache, puis le
  // plus rapide arrive. Chaque etape a son son (cf. sequencement audio).
  const [phase, setPhase] = useState<'grow' | 'answer' | 'fastest'>('grow');
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    setPhase('grow');
    setOuvert(false);
    // deux frames avant d'ouvrir : la transition CSS a besoin de voir la
    // largeur 0 rendue avant de partir vers sa cible.
    // setTimeout et NON requestAnimationFrame : rAF est completement suspendu
    // quand la page ne compose pas (fenetre occultee, onglet en arriere-plan).
    // Sur un kiosque, la revelation serait alors restee figee a 0 %. Un timeout
    // est throttle dans ce cas, mais il finit toujours par se declencher.
    const t0 = setTimeout(() => setOuvert(true), 60);
    const t1 = setTimeout(() => setPhase('answer'), 2200);
    const t2 = setTimeout(() => setPhase('fastest'), 3400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.currentQuestionIndex]);

  const devoilee = phase !== 'grow';
  const rapideDevoile = phase === 'fastest';

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

  const qdWinners = Object.entries(reveal.results).filter(([, r]) => r.qd && r.correct);
  const qdLosers = Object.entries(reveal.results).filter(([, r]) => r.qd && !r.correct);

  return (
    <div className="flex flex-1 flex-col px-12 py-10">
      <h1 className="mb-8 text-balance text-4xl font-black">{q.question}</h1>

      {q.type === 'qcm' && (
        <div className="grid flex-1 content-center gap-4">
          {(q.answers ?? []).map((a, i) => (
            <LigneReponseProjo
              key={i}
              lettre={String.fromCharCode(65 + i)}
              texte={a}
              pourcent={reveal.percents?.[i] ?? 0}
              ouvert={ouvert}
              rang={i}
              correcte={i === reveal.correctIndex}
              devoilee={devoilee}
            />
          ))}
        </div>
      )}

      {q.type === 'estimation' && (
        <div className="flex flex-1 flex-col items-center justify-center">
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
        <div className="flex flex-1 flex-col items-center justify-center">
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

      {q.imageQuestionUrl && devoilee && state.question?.imageAnswerUrl && (
        <div className="flex justify-center"><img src={state.question.imageAnswerUrl} alt="" className="max-h-[30vh] rounded-2xl object-contain" /></div>
      )}

      <div className="mt-6 flex min-h-[56px] flex-wrap items-center justify-center gap-4">
        {rapideDevoile && reveal.fastest && (
          <span className="anim-pop rounded-full border border-amber-400/50 bg-amber-400/15 px-6 py-2.5 text-2xl font-black text-amber-300">
            ⚡ Le plus rapide : {reveal.fastest} (+1 pt)
          </span>
        )}
        {rapideDevoile && qdWinners.length > 0 && (
          <span className="anim-pop rounded-full border border-violet-400/50 bg-violet-500/15 px-6 py-2.5 text-2xl font-bold text-violet-200">
            🎲 x2 gagné : {qdWinners.map(([pseudo]) => pseudo).join(', ')}
          </span>
        )}
        {rapideDevoile && qdLosers.length > 0 && (
          <span className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-2xl text-white/50">
            🎲 raté : {qdLosers.map(([pseudo]) => pseudo).join(', ')}
          </span>
        )}
        {rapideDevoile && (reveal.special === 'shot' || reveal.special === 'goodies') && reveal.fastest && (
          <span className="anim-pop rounded-full border border-amber-400/60 bg-amber-400/20 px-6 py-2.5 text-2xl font-black text-amber-200">
            {reveal.special === 'shot' ? '🥃 Shot offert à' : '🎁 Goodies pour'} {reveal.fastest} !
          </span>
        )}
      </div>
    </div>
  );
}

// --- Classements ---------------------------------------------------------------

function LeaderboardProjo({ state }: { state: PublicState }) {
  const standings = state.standings ?? [];
  const left = standings.slice(0, 10);
  const right = standings.slice(10, 30);
  return (
    <div className="flex flex-1 flex-col px-14 py-10">
      <h1 className="mb-8 text-center text-5xl font-black uppercase tracking-widest">Classement</h1>
      <div className="grid flex-1 grid-cols-2 gap-12">
        <div className="flex flex-col gap-2">
          {left.map((s) => <StandingRow key={s.pseudo} s={s} big />)}
        </div>
        <div className="flex flex-col gap-1.5 overflow-hidden">
          {right.map((s) => <StandingRow key={s.pseudo} s={s} />)}
        </div>
      </div>
    </div>
  );
}

function StandingRow({ s, big = false }: { s: StandingEntry; big?: boolean }) {
  const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : null;
  return (
    <div
      className={`anim-fade-up flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 ${big ? 'py-3 text-2xl' : 'py-1.5 text-lg'}`}
      style={{ animationDelay: `${Math.min(s.position * 0.05, 1)}s` }}
    >
      <span className={`w-10 shrink-0 text-center font-black tabular-nums ${s.position <= 3 ? 'text-amber-300' : 'text-white/40'}`}>
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
