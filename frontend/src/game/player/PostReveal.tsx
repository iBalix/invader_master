/**
 * Séquence personnelle post-reveal, le nouveau cœur du rythme côté joueur.
 *
 * Quatre temps, en SEUILS depuis phaseStartedAt (horloge serveur) :
 *   [REVEAL_JOUEUR_MS .. SEQ_SERIE_MS[   le verdict + le podium vitesse
 *   [SEQ_SERIE_MS .. SEQ_JOKERS_MS[      la série (progresse / casse / +1)
 *   [SEQ_JOKERS_MS .. SEQ_ATTENTE_MS[    la main de jokers, roue si gain
 *   [SEQ_ATTENTE_MS .. ∞[                l'attente : « prépare-toi », le GM parle
 *
 * Des seuils et non des setTimeout en cascade : un joueur qui recharge sa page
 * retombe exactement au bon endroit de la séquence (pattern du tutoriel
 * blackjack). Le backend garantit REVEAL_MIN_MS, le GM ne peut pas couper.
 *
 * TOUTES les animations sont en CSS (classes anim-* + transitions par seuil),
 * JAMAIS pilotées par requestAnimationFrame : rAF est suspendu quand la page ne
 * composite pas, et l'écran resterait figé à l'état initial. Les animations et
 * transitions CSS, elles, avancent avec l'horloge même sans peinture.
 *
 * L'anti-spoiler d'avant REVEAL_JOUEUR_MS est géré par l'appelant
 * (RevealScreen), pas ici.
 */

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import JokerWheel from '../components/JokerWheel';
import {
  JOKER_DEFS,
  JOKER_HAND_MAX,
  REVEAL_JOUEUR_MS,
  SPEED_BONUS,
  SEQ_ATTENTE_MS,
  SEQ_JOKERS_MS,
  SEQ_SERIE_MS,
  serverNow,
  STREAK_BONUS_FROM,
  type JokerType,
  type PublicState,
  type You,
} from '../lib/gameClient';

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  state: PublicState;
  you: You;
  embedded?: boolean;
}

/** apparition par seuil : transition CSS, robuste au non-rendu */
function Seuil({
  visible,
  children,
  className = '',
}: {
  visible: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.92)',
        transition: 'opacity 420ms ease, transform 460ms cubic-bezier(0.3, 1.2, 0.4, 1)',
      }}
    >
      {children}
    </div>
  );
}

export default function PostRevealSequence({ state, you, embedded }: Props) {
  const reveal = state.reveal;
  const debut = state.phaseStartedAt ?? serverNow();
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(t);
  }, []);
  const elapsed = now - debut;

  const mine = reveal?.results[you.pseudo];
  const phase: 'verdict' | 'serie' | 'jokers' | 'attente' =
    elapsed < SEQ_SERIE_MS
      ? 'verdict'
      : elapsed < SEQ_JOKERS_MS
        ? 'serie'
        : elapsed < SEQ_ATTENTE_MS
          ? 'jokers'
          : 'attente';

  if (!reveal) return null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-4">
      {/* key = re-jeu de l'animation d'entree a chaque changement de temps */}
      <div key={phase} className="anim-fade-up w-full">
        {phase === 'verdict' && <VerdictScreen state={state} you={you} embedded={embedded} elapsed={elapsed} />}
        {phase === 'serie' && (
          <SerieScreen
            streak={mine?.streak ?? you.strike}
            streakBefore={mine?.streakBefore ?? 0}
            correct={Boolean(mine?.correct)}
            answered={Boolean(mine?.answered)}
            streakBonus={Boolean(mine?.streakBonus)}
            elapsedInStep={elapsed - SEQ_SERIE_MS}
            embedded={embedded}
          />
        )}
        {phase === 'jokers' && <JokersScreen state={state} you={you} embedded={embedded} />}
        {phase === 'attente' && <AttenteScreen embedded={embedded} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Temps 4 : l'attente de l'animateur
// ---------------------------------------------------------------------------

/**
 * La séquence personnelle est terminée : si l'animateur commente ou fait
 * durer, le joueur sait que tout va bien et que la suite arrive. Sans cet
 * écran, la main de jokers restait figée et donnait l'impression d'un blocage.
 */
function AttenteScreen({ embedded }: { embedded?: boolean }) {
  const grand = Boolean(embedded);
  return (
    <div className="w-full text-center">
      <div className={`anim-breathe ${grand ? 'text-8xl' : 'text-6xl'}`}>⏳</div>
      <h2 className={`mt-5 font-black ${grand ? 'text-4xl' : 'text-2xl'}`}>Prépare-toi !</h2>
      <p className={`mt-2 text-white/60 ${grand ? 'text-2xl' : 'text-base'}`}>
        La prochaine question arrive... en attente de l'animateur.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Temps 1 : le verdict
// ---------------------------------------------------------------------------

function VerdictScreen({
  state,
  you,
  embedded,
  elapsed,
}: Props & { elapsed: number }) {
  const reveal = state.reveal!;
  const mine = reveal.results[you.pseudo];
  const monRang = (reveal.fastestTop ?? []).findIndex((f) => f.pseudo === you.pseudo);
  const grand = Boolean(embedded);
  // seuils relatifs a l'entree du verdict (l'anti-spoiler nous fait entrer ici
  // a REVEAL_JOUEUR_MS, on echelonne la suite)
  const dans = elapsed - REVEAL_JOUEUR_MS;

  const fete = useRef(false);
  useEffect(() => {
    if (fete.current || !mine?.correct || REDUCED) return;
    fete.current = true;
    try {
      confetti({
        particleCount: 60,
        spread: 65,
        startVelocity: 38,
        origin: { y: 0.6 },
        colors: ['#5ED9A1', '#33E2FF', '#F5F2FF'],
        disableForReducedMotion: true,
      });
    } catch {
      /* rien */
    }
  }, [mine?.correct]);

  if (!mine || !mine.answered) {
    return (
      <div className="text-center">
        <div className={`anim-pop ${grand ? 'text-8xl' : 'text-6xl'}`}>😴</div>
        <h2 className={`mt-3 font-black ${grand ? 'text-5xl' : 'text-3xl'}`}>Pas de réponse</h2>
        <p className={`mt-2 text-white/50 ${grand ? 'text-2xl' : 'text-sm'}`}>
          Sois plus rapide la prochaine fois !
        </p>
        <BonneReponse reveal={reveal} grand={grand} visible={dans >= 500} />
      </div>
    );
  }

  if (!mine.correct) {
    return (
      <div className="text-center">
        <div className={`anim-shake ${grand ? 'text-8xl' : 'text-6xl'}`}>💥</div>
        <h2 className={`anim-pop mt-3 font-black text-rose-400 ${grand ? 'text-6xl' : 'text-3xl'}`}>
          RATÉ !
        </h2>
        {mine.allIn && (
          <p className={`mt-2 font-bold text-fuchsia-300 ${grand ? 'text-3xl' : 'text-lg'}`}>
            🎰 All-In perdu : {mine.points} points
          </p>
        )}
        {!mine.allIn && mine.points < 0 && (
          <p className={`mt-1 font-bold text-rose-300 ${grand ? 'text-2xl' : ''}`}>{mine.points} points</p>
        )}
        <BonneReponse reveal={reveal} grand={grand} gap={mine.gap} visible={dans >= 500} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className={`anim-pop ${grand ? 'text-8xl' : 'text-6xl'}`}>
        {monRang >= 0 ? '⚡' : '🎉'}
      </div>
      <h2 className={`anim-pop mt-3 font-black text-emerald-300 ${grand ? 'text-6xl' : 'text-3xl'}`}>
        BONNE RÉPONSE !
      </h2>
      <Seuil visible={dans >= 320}>
        <p className={`mt-2 font-black tabular-nums ${grand ? 'text-4xl' : 'text-2xl'}`}>
          +{mine.points} point{Math.abs(mine.points) > 1 ? 's' : ''}
          {mine.allIn && <span className="text-fuchsia-300"> 🎰 ×3 !</span>}
        </p>
      </Seuil>
      {monRang >= 0 && (
        <Seuil visible={dans >= 650}>
          <p
            className={`mt-3 inline-block rounded-full bg-amber-400/15 px-4 py-1.5 font-bold text-amber-300 ${grand ? 'text-2xl' : ''}`}
          >
            {['🥇', '🥈', '🥉'][monRang]} {monRang + 1}
            {monRang === 0 ? 'er' : 'e'} plus rapide · +
            {reveal.fastestTop?.[monRang]?.bonus ?? SPEED_BONUS[monRang] ?? 1} pt
          </p>
        </Seuil>
      )}
      <BonneReponse reveal={reveal} grand={grand} gap={mine.gap} visible={dans >= 900} />
    </div>
  );
}

function BonneReponse({
  reveal,
  grand,
  gap,
  visible,
}: {
  reveal: NonNullable<PublicState['reveal']>;
  grand: boolean;
  gap?: number;
  visible: boolean;
}) {
  return (
    <Seuil visible={visible} className="flex justify-center">
      <div className={`mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 ${grand ? 'min-w-[28rem]' : 'w-full max-w-sm'}`}>
        <p className={`uppercase tracking-widest text-white/40 ${grand ? 'text-base' : 'text-xs'}`}>
          La bonne réponse
        </p>
        <p className={`mt-1 font-bold text-emerald-300 ${grand ? 'text-3xl' : 'text-lg'}`}>
          {reveal.correctAnswer ?? reveal.expectedAnswer ?? reveal.expectedNumber}
        </p>
        {typeof gap === 'number' && (
          <p className={`mt-1 text-white/50 ${grand ? 'text-xl' : 'text-sm'}`}>Ton écart : {gap}</p>
        )}
      </div>
    </Seuil>
  );
}

// ---------------------------------------------------------------------------
// Temps 2 : la série
// ---------------------------------------------------------------------------

function SerieScreen({
  streak,
  streakBefore,
  correct,
  answered,
  streakBonus,
  elapsedInStep,
  embedded,
}: {
  streak: number;
  streakBefore: number;
  correct: boolean;
  answered: boolean;
  streakBonus: boolean;
  elapsedInStep: number;
  embedded?: boolean;
}) {
  const grand = Boolean(embedded);
  const cassee = !correct && streakBefore >= 2;

  const fete = useRef(false);
  useEffect(() => {
    if (fete.current || !streakBonus || REDUCED) return;
    fete.current = true;
    try {
      confetti({
        particleCount: 80,
        spread: 80,
        startVelocity: 45,
        origin: { y: 0.55 },
        colors: ['#FFE955', '#FFB020', '#F5F2FF'],
        disableForReducedMotion: true,
      });
    } catch {
      /* rien */
    }
  }, [streakBonus]);

  // série anecdotique : un écran calme
  if (!cassee && streak <= 1) {
    return (
      <div className="text-center">
        <p className={`uppercase tracking-[0.3em] text-white/40 ${grand ? 'text-xl' : 'text-xs'}`}>
          Ta série
        </p>
        <div className={`anim-pop mt-4 ${grand ? 'text-7xl' : 'text-5xl'}`}>{correct ? '🔥' : '🧊'}</div>
        <p className={`mt-3 font-black ${grand ? 'text-5xl' : 'text-3xl'}`}>
          {correct ? 'Série lancée !' : answered ? 'Pas de série' : 'Série en pause'}
        </p>
        <p className={`mt-2 text-white/50 ${grand ? 'text-2xl' : 'text-sm'}`}>
          {STREAK_BONUS_FROM} bonnes réponses d'affilée = +1 pt à chaque bonne réponse
        </p>
      </div>
    );
  }

  if (cassee) {
    return (
      <div className="text-center">
        <p className={`uppercase tracking-[0.3em] text-white/40 ${grand ? 'text-xl' : 'text-xs'}`}>
          Ta série
        </p>
        <div className={`anim-shake mt-4 ${grand ? 'text-8xl' : 'text-6xl'}`}>💔</div>
        <p className={`anim-pop mt-3 font-black text-rose-400 ${grand ? 'text-6xl' : 'text-4xl'}`}>
          Série de {streakBefore} brisée
        </p>
        <p className={`mt-2 text-white/50 ${grand ? 'text-2xl' : 'text-sm'}`}>
          On repart de zéro. La prochaine commence maintenant !
        </p>
      </div>
    );
  }

  // série qui monte : maillons qui s'allument un par un
  const maillons = Math.min(streak, STREAK_BONUS_FROM + 2);
  const finMaillons = 300 + maillons * 180;
  return (
    <div className="text-center">
      <p className={`uppercase tracking-[0.3em] text-white/40 ${grand ? 'text-xl' : 'text-xs'}`}>
        Ta série
      </p>
      <div className={`mt-5 flex items-center justify-center ${grand ? 'gap-3' : 'gap-2'}`}>
        {Array.from({ length: maillons }, (_, i) => {
          const dernier = i === streak - 1;
          const visible = elapsedInStep >= 300 + i * 180;
          const paye = i + 1 >= STREAK_BONUS_FROM;
          return (
            <span
              key={i}
              className={`flex items-center justify-center rounded-full border-2 font-black tabular-nums ${
                grand ? 'h-16 w-16 text-3xl' : 'h-10 w-10 text-lg'
              } ${
                paye
                  ? 'border-amber-300 bg-amber-400/25 text-amber-200'
                  : 'border-orange-400/60 bg-orange-400/15 text-orange-200'
              }`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1)' : 'scale(0.3)',
                transition: 'opacity 300ms ease, transform 380ms cubic-bezier(0.22, 1.4, 0.36, 1)',
                boxShadow: dernier && paye && visible ? '0 0 26px rgba(255, 233, 85, 0.5)' : undefined,
              }}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <Seuil visible={elapsedInStep >= finMaillons}>
        <p className={`mt-5 font-black ${grand ? 'text-5xl' : 'text-3xl'}`}>🔥 {streak} d'affilée !</p>
      </Seuil>
      {streakBonus ? (
        <Seuil visible={elapsedInStep >= finMaillons + 380}>
          <p
            className={`mt-3 inline-block rounded-full border-2 border-amber-300 bg-amber-400/20 px-5 py-2 font-black text-amber-200 ${
              grand ? 'text-3xl' : 'text-xl'
            }`}
            style={{ boxShadow: '0 0 30px rgba(255, 233, 85, 0.4)' }}
          >
            +1 pt de série !
          </p>
        </Seuil>
      ) : (
        <Seuil visible={elapsedInStep >= finMaillons + 250}>
          <p className={`mt-2 text-white/50 ${grand ? 'text-2xl' : 'text-sm'}`}>
            {streak === STREAK_BONUS_FROM - 1
              ? 'Encore une et chaque bonne réponse paie +1 !'
              : `À ${STREAK_BONUS_FROM}, chaque bonne réponse paie +1`}
          </p>
        </Seuil>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Temps 3 : les jokers
// ---------------------------------------------------------------------------

function JokersScreen({ state, you, embedded }: Props) {
  const grand = Boolean(embedded);
  const reveal = state.reveal!;
  const qi = state.currentQuestionIndex;

  // Mes gains sur cette question. La roue joue chaque gain UNE fois : la
  // signature question+type vit en sessionStorage pour survivre a un remontage
  // (refresh d'etat, aller-retour vers la carte de la borne).
  const mesGains = (reveal.jokerAwards ?? []).filter((a) => a.pseudo === you.pseudo);
  const [aJouer, setAJouer] = useState<JokerType | null>(null);
  const rejouees = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (aJouer) return;
    for (const g of mesGains) {
      const cle = `jw:${state.id}:${qi}:${g.type}`;
      if (rejouees.current.has(cle)) continue;
      let deja = false;
      try {
        deja = sessionStorage.getItem(cle) === '1';
      } catch {
        /* stockage indisponible : la roue rejouera, sans gravite */
      }
      if (!deja) {
        rejouees.current.add(cle);
        try {
          sessionStorage.setItem(cle, '1');
        } catch {
          /* rien */
        }
        setAJouer(g.type);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesGains.length, aJouer]);

  return (
    <div className="w-full text-center">
      <p className={`uppercase tracking-[0.3em] text-white/40 ${grand ? 'text-xl' : 'text-xs'}`}>
        Tes jokers
      </p>
      <div className={`mx-auto mt-5 flex items-stretch justify-center ${grand ? 'gap-6' : 'gap-3'}`}>
        {Array.from({ length: JOKER_HAND_MAX }, (_, i) => {
          const t = you.jokers[i];
          const def = t ? JOKER_DEFS[t] : null;
          return (
            <div
              key={i}
              className={`anim-pop flex flex-col items-center justify-center rounded-2xl border-2 ${
                grand ? 'h-52 w-44' : 'h-36 w-28'
              } ${def ? '' : 'border-dashed border-white/15 bg-white/[0.03]'}`}
              style={{
                animationDelay: `${0.12 + i * 0.15}s`,
                ...(def
                  ? {
                      borderColor: def.couleur,
                      background: `${def.couleur}14`,
                      boxShadow: `0 0 22px ${def.ombre}`,
                    }
                  : {}),
              }}
            >
              {def ? (
                <>
                  <span className={grand ? 'text-6xl' : 'text-4xl'}>{def.emoji}</span>
                  <span
                    className={`mt-2 font-black uppercase tracking-wide ${grand ? 'text-xl' : 'text-xs'}`}
                    style={{ color: def.couleur }}
                  >
                    {def.label}
                  </span>
                </>
              ) : (
                <span className={`text-white/25 ${grand ? 'text-xl' : 'text-xs'}`}>Vide</span>
              )}
            </div>
          );
        })}
      </div>
      <p className={`mt-5 text-white/50 ${grand ? 'text-2xl' : 'text-sm'}`}>
        {you.jokers.length >= JOKER_HAND_MAX
          ? 'Main pleine — joue-les pour en gagner d’autres !'
          : 'Chaque bonne réponse peut en faire gagner un. Les derniers du classement ont plus de chances !'}
      </p>

      {aJouer && (
        <JokerWheel
          type={aJouer}
          reason="Tu gagnes un joker !"
          reduced={REDUCED}
          onDone={() => setAJouer(null)}
        />
      )}
    </div>
  );
}
