/**
 * Branches joueur du mode BATTLE ROYALE (/play, dispatch depuis PlayerApp).
 *
 * Le téléphone affiche : barre EN VIE / ÉLIMINÉ, la question (les éliminés
 * continuent de répondre pour des points bonus hors finale), le verdict en
 * suspense, le résultat personnel, la place au général en fin de manche.
 */

import { useEffect, useRef, useState } from 'react';
import { ApiError, gameApi, questionShownAt, type PublicState, type You } from '../lib/gameClient';
import { usePhaseCountdown } from '../hooks/useGameSession';
import { DifficultyBadge, TimerRing } from '../ui/bits';
import { ANSWER_COLORS, BigMessage, Center, Spinner, type ScreenProps } from './PlayerApp';

type BattleProps = ScreenProps & { you: You };

export function BattlePlayerScreen(props: BattleProps) {
  const { state, you } = props;
  const b = state.battle;
  const yb = you.battle;

  const body = (() => {
    // états de joueur qui priment sur la phase
    if (you.status === 'spectator') return <SpectatorScreen state={state} you={you} />;
    if (you.status === 'waiting' && state.status !== 'end' && state.status !== 'closing') {
      return (
        <Center>
          <BigMessage
            emoji="🕐"
            title="Tu entres en jeu à la prochaine manche !"
            sub="La manche en cours se termine, reste prêt."
          />
        </Center>
      );
    }

    switch (state.status) {
      case 'lobby':
        return <BattleLobbyScreen {...props} />;
      case 'rules':
        return <BattleRulesScreen />;
      case 'round_intro':
        return (
          <Center>
            <div className="anim-stomp text-center">
              <div className="mb-3 text-5xl">{b?.isFinal ? '👑' : '⚔️'}</div>
              <h2 className="text-3xl font-black uppercase">
                {b?.isFinal ? 'LA FINALE' : `Manche ${b?.roundNumber ?? 1}`}
              </h2>
              <p className="mt-2 text-white/60">
                {b?.survivorCount} combattant{(b?.survivorCount ?? 0) > 1 ? 's' : ''}, 1 seul survivant !
              </p>
            </div>
          </Center>
        );
      case 'announce':
        return <BattleAnnounceScreen state={state} />;
      case 'question':
      case 'locked':
        return <BattleQuestionScreen {...props} />;
      case 'verdict':
        return (
          <Center>
            <div className="anim-suspense text-center">
              <div className="mb-4 text-5xl">🔎</div>
              <h2 className="text-2xl font-extrabold">Vérification...</h2>
              <p className="mt-2 text-white/60">Qui survit ? Regarde l'écran principal !</p>
            </div>
          </Center>
        );
      case 'reveal':
        return <BattleRevealScreen state={state} you={you} />;
      case 'round_end':
        return <BattleRoundEndScreen state={state} you={you} />;
      case 'pause':
        return (
          <Center>
            <BigMessage emoji="🍹" title="C'est la pause !" sub={state.config.pauseText} />
          </Center>
        );
      case 'closing':
        return (
          <Center>
            <BigMessage emoji="🌙" title="La partie se termine..." sub="Merci d'avoir combattu !" />
          </Center>
        );
      case 'end':
        return <BattleEndScreen state={state} you={you} />;
      default:
        return <Center><Spinner /></Center>;
    }
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <BattleStatusBar state={state} you={you} />
      {you.status === 'eliminated' && !yb?.isFinal && state.status !== 'end' && (
        <div className="anim-bg-pulse-red border-b border-rose-500/30 px-4 py-1.5 text-center text-xs font-bold text-rose-200">
          Continue de répondre pour gagner des points bonus !
        </div>
      )}
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre de statut EN VIE / ÉLIMINÉ
// ---------------------------------------------------------------------------

function BattleStatusBar({ state, you }: { state: PublicState; you: You }) {
  const styles: Record<string, { text: string; cls: string }> = {
    active: { text: '💚 EN VIE', cls: 'bg-emerald-400/15 text-emerald-300' },
    eliminated: { text: '💀 ÉLIMINÉ', cls: 'bg-rose-500/20 text-rose-300' },
    waiting: { text: '🕐 EN ATTENTE', cls: 'bg-amber-400/15 text-amber-300' },
    spectator: { text: '👀 SPECTATEUR', cls: 'bg-white/10 text-white/60' },
  };
  const s = styles[you.status] ?? styles.active;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-4 py-2.5 text-sm">
      <span className="truncate font-bold">{you.pseudo}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums">
          {you.score} pt{you.score > 1 ? 's' : ''}
        </span>
        {state.battle && (
          <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs font-bold text-cyan-300 tabular-nums">
            {state.battle.survivorCount} en vie
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${s.cls}`}>{s.text}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lobby / règles
// ---------------------------------------------------------------------------

function BattleLobbyScreen({ state, you, sessionRef, playerToken, onLeft }: BattleProps) {
  return (
    <Center>
      <div className="anim-fade-up text-center">
        <div className="mb-2 text-5xl">⚔️</div>
        <h2 className="text-2xl font-extrabold">Tu es dans l'arène !</h2>
        <p className="mt-2 text-white/60">
          La battle démarre bientôt : une erreur et tu es éliminé, reste concentré.
        </p>
        <p className="mt-6 text-sm text-white/40">
          {state.playerCount} combattant{state.playerCount > 1 ? 's' : ''} inscrit{state.playerCount > 1 ? 's' : ''}
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

function BattleRulesScreen() {
  return (
    <Center>
      <div className="anim-fade-up max-w-sm">
        <h2 className="mb-5 text-center text-2xl font-black uppercase tracking-wider">Les règles</h2>
        <ul className="space-y-3 text-white/80">
          <li className="flex gap-3"><span>⚔️</span><span>Mauvaise réponse ou pas de réponse = ÉLIMINÉ de la manche.</span></li>
          <li className="flex gap-3"><span>⭐</span><span>Chaque bonne réponse rapporte 1 point, même éliminé !</span></li>
          <li className="flex gap-3"><span>🏅</span><span>En fin de manche, ta place rapporte gros : 25 points au dernier survivant.</span></li>
          <li className="flex gap-3"><span>👑</span><span>Le top 10 du classement général s'affronte en FINALE.</span></li>
        </ul>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// Annonce + question
// ---------------------------------------------------------------------------

function BattleAnnounceScreen({ state }: { state: PublicState }) {
  const q = state.question;
  if (!q) return <Center><Spinner /></Center>;
  return (
    <Center>
      <div className="anim-pop w-full max-w-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          {state.battle?.isFinal ? 'Finale' : `Manche ${state.battle?.roundNumber ?? 1}`} · Question{' '}
          {state.battle?.questionInRound ?? q.index + 1}
        </p>
        <h2 className="mt-2 text-balance text-2xl font-black">{q.theme ?? 'Culture générale'}</h2>
        <div className="mt-3 flex items-center justify-center gap-2">
          <DifficultyBadge difficulty={q.difficulty} />
        </div>
        <p className="mt-8 animate-pulse text-sm uppercase tracking-widest text-white/40">
          Prépare-toi...
        </p>
      </div>
    </Center>
  );
}

function BattleQuestionScreen({ state, you, sessionRef, playerToken, refresh }: BattleProps) {
  const remaining = usePhaseCountdown(state.phaseEndsAt);
  const q = state.question;
  const grace = state.status === 'locked';
  // Reference persistee, cf. questionShownAt() : une sortie/retour ne doit
  // pas offrir le bonus de rapidite.
  const shownAtRef = useRef<number>(0);
  const questionIndexRef = useRef<number>(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'recorded' | 'failed'>(
    you.answered ? 'recorded' : 'idle',
  );

  useEffect(() => {
    if (q && q.index !== questionIndexRef.current) {
      questionIndexRef.current = q.index;
      shownAtRef.current = questionShownAt(state.id, q.index);
      setSelected(null);
      setSendState(you.answered ? 'recorded' : 'idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.index]);

  useEffect(() => {
    if (you.answered && sendState === 'idle') setSendState('recorded');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you.answered]);

  useEffect(() => {
    if (state.status === 'question' && 'vibrate' in navigator) {
      try { navigator.vibrate?.(80); } catch { /* iOS */ }
    }
  }, [state.status]);

  if (!q) return <Center><Spinner /></Center>;

  const send = async (choice: number) => {
    if (!playerToken || sendState === 'sending' || sendState === 'recorded') return;
    setSendState('sending');
    const shownAt = shownAtRef.current || questionShownAt(state.id, q.index);
    const elapsedMs = Math.round(Date.now() - shownAt);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await gameApi.answer(sessionRef, {
          playerToken,
          questionIndex: q.index,
          answer: { choice },
          elapsedMs,
        });
        setSendState('recorded');
        void refresh();
        return;
      } catch (err) {
        if (err instanceof ApiError && err.httpStatus !== 500 && err.httpStatus !== 0) {
          setSendState('failed');
          setSelected(null);
          return;
        }
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    setSendState('failed');
  };

  const answered = sendState === 'recorded';
  const totalMs =
    state.phaseEndsAt && state.phaseStartedAt
      ? state.phaseEndsAt - state.phaseStartedAt
      : state.config.questionMs;

  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {q.difficulty} · 1 pt · {state.battle?.survivorCount} en vie
          </p>
          <h2 className="text-balance text-lg font-bold leading-snug">{q.question}</h2>
        </div>
        {remaining !== null && !grace && (
          <TimerRing remainingMs={remaining} totalMs={totalMs} size={60} />
        )}
      </div>

      {grace && !answered && (
        <p className="anim-pop mb-2 text-center text-sm font-black uppercase text-amber-300">
          ⏳ Dernière chance !
        </p>
      )}

      <div className="grid flex-1 content-start gap-2.5">
        {(q.answers ?? []).map((a, i) => (
          <button
            key={i}
            type="button"
            disabled={answered}
            onClick={() => {
              setSelected(i);
              void send(i);
            }}
            className={`rounded-xl border-2 px-4 py-3.5 text-left text-base font-semibold leading-snug transition-transform active:scale-[0.98] ${
              selected === i ? 'border-white bg-white/20' : ANSWER_COLORS[i % 4]
            } ${answered && selected !== i ? 'opacity-40' : ''}`}
          >
            <span className="mr-2 font-black text-white/50">{String.fromCharCode(65 + i)}</span>
            {a}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[44px] text-center">
        {sendState === 'recorded' && (
          <p className="anim-pop inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 font-bold text-emerald-300">
            ✓ Réponse enregistrée
          </p>
        )}
        {sendState === 'sending' && <p className="text-sm text-white/50">Envoi...</p>}
        {sendState === 'failed' && (
          <p className="anim-shake text-sm font-semibold text-rose-400">Échec de l'envoi, réessaie !</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Résultat personnel de la question
// ---------------------------------------------------------------------------

function BattleRevealScreen({ state, you }: { state: PublicState; you: You }) {
  const reveal = state.battle?.reveal;
  if (!reveal) return <Center><Spinner /></Center>;
  if (reveal.cancelled) {
    return (
      <Center>
        <BigMessage emoji="🚫" title="Question annulée" sub="Elle ne compte pas, on continue !" />
      </Center>
    );
  }

  const correct = reveal.correctPseudos.includes(you.pseudo);
  const eliminatedNow = reveal.eliminated.some((e) => e.pseudo === you.pseudo);
  const wasAlreadyEliminated = you.status === 'eliminated' && !eliminatedNow;

  return (
    <div className={`flex flex-1 flex-col ${eliminatedNow ? 'anim-bg-pulse-red' : ''}`}>
      <Center>
        <div className="anim-pop w-full max-w-sm text-center">
          {reveal.repechage ? (
            <>
              <div className="mb-3 text-6xl">🛟</div>
              <h2 className="text-3xl font-black text-amber-300">ÉGALITÉ, REPÊCHAGE !</h2>
              <p className="mt-2 text-white/70">Tout le monde reste en vie pour cette fois...</p>
            </>
          ) : eliminatedNow ? (
            <>
              <div className="mb-3 text-6xl">💀</div>
              <h2 className="text-3xl font-black text-rose-400">ÉLIMINÉ !</h2>
              {you.battle?.roundRank && (
                <p className="mt-2 text-xl font-bold">
                  {you.battle.roundRank}
                  {you.battle.roundRank === 1 ? 'er' : 'e'} de la manche
                </p>
              )}
              {!you.battle?.isFinal && (
                <p className="mt-2 text-sm text-white/60">
                  Continue de répondre : chaque bonne réponse = 1 point bonus !
                </p>
              )}
            </>
          ) : correct ? (
            <>
              <div className="mb-3 text-6xl">🎉</div>
              <h2 className="text-3xl font-black text-emerald-300">BONNE RÉPONSE !</h2>
              <p className="mt-2 text-xl font-bold">
                +1 point{wasAlreadyEliminated ? ' bonus' : ''}
              </p>
              {!wasAlreadyEliminated && <p className="mt-1 text-white/60">Tu restes EN VIE 💚</p>}
            </>
          ) : you.status === 'active' ? (
            <>
              <div className="mb-3 text-6xl">😮‍💨</div>
              <h2 className="text-2xl font-black text-emerald-300">Tu survis !</h2>
            </>
          ) : (
            <>
              <div className="mb-3 text-6xl">💥</div>
              <h2 className="text-2xl font-black text-rose-400">Raté !</h2>
              <p className="mt-1 text-white/60">Pas de point bonus cette fois.</p>
            </>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-white/40">La bonne réponse</p>
            <p className="mt-1 text-lg font-bold text-emerald-300">{reveal.correctAnswer}</p>
          </div>
          <p className="mt-4 text-sm text-white/50">
            {reveal.survivorsAfter} survivant{reveal.survivorsAfter > 1 ? 's' : ''}
            {reveal.milestone !== null && (
              <span className="ml-2 font-black text-amber-300">PLUS QUE {reveal.milestone} !</span>
            )}
          </p>
        </div>
      </Center>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fin de manche, spectateur, fin de partie
// ---------------------------------------------------------------------------

function BattleRoundEndScreen({ state, you }: { state: PublicState; you: You }) {
  const b = state.battle;
  const myRound = b?.roundResult?.entries.find((e) => e.pseudo === you.pseudo);
  const myGeneral = b?.generalStandings?.find((s) => s.pseudo === you.pseudo);
  return (
    <Center>
      <div className="anim-fade-up w-full max-w-sm text-center">
        <div className="mb-3 text-5xl">🏁</div>
        <h2 className="text-2xl font-extrabold">Fin de la manche {b?.roundResult?.roundNumber}</h2>
        {myRound && (
          <div className="anim-pop mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-6 py-4">
            <p className="text-sm uppercase tracking-widest text-white/40">Ta manche</p>
            <p className="mt-1 text-3xl font-black text-cyan-300">
              {myRound.rank}
              {myRound.rank === 1 ? 'er' : 'e'}
            </p>
            <p className="text-lg font-bold text-emerald-300">+{myRound.bonus} points</p>
          </div>
        )}
        {myGeneral && (
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 px-6 py-4">
            <p className="text-sm uppercase tracking-widest text-white/40">Classement général</p>
            <p className="mt-1 text-2xl font-black">
              #{myGeneral.position}
              {myGeneral.positionChange > 0 && (
                <span className="ml-2 text-lg text-emerald-300">▲{myGeneral.positionChange}</span>
              )}
              {myGeneral.positionChange < 0 && (
                <span className="ml-2 text-lg text-rose-400">▼{Math.abs(myGeneral.positionChange)}</span>
              )}
            </p>
            <p className="text-sm text-white/60">{myGeneral.score} points</p>
            {myGeneral.qualifiedForFinal && (
              <p className="mt-2 rounded-full bg-amber-400/15 px-3 py-1 text-sm font-black text-amber-300">
                👑 EN ROUTE POUR LA FINALE
              </p>
            )}
          </div>
        )}
      </div>
    </Center>
  );
}

function SpectatorScreen({ state, you }: { state: PublicState; you: You }) {
  if (state.status === 'end') return <BattleEndScreen state={state} you={you} />;
  return (
    <Center>
      <div className="anim-fade-up text-center">
        <div className="mb-4 text-5xl">👀</div>
        <h2 className="text-2xl font-extrabold">La finale se joue sans toi...</h2>
        <p className="mt-2 text-white/60">
          Tu termines #{you.battle?.generalRank ?? '?'} au général. Encourage les finalistes !
        </p>
      </div>
    </Center>
  );
}

function BattleEndScreen({ state, you }: { state: PublicState; you: You }) {
  const b = state.battle;
  const mine =
    b?.finalStandings?.find((s) => s.pseudo === you.pseudo) ??
    b?.generalStandings?.find((s) => s.pseudo === you.pseudo);
  const isWinner = b?.winner?.pseudo === you.pseudo;
  return (
    <Center>
      <div className="anim-pop w-full max-w-sm text-center">
        <div className="mb-3 text-6xl">{isWinner ? '👑' : '🏁'}</div>
        <h2 className="text-balance text-2xl font-black">
          {isWinner ? 'VICTOIRE ROYALE !' : state.endTexts?.winnerText}
        </h2>
        {mine && (
          <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 px-6 py-4">
            <p className="text-sm uppercase tracking-widest text-white/40">Ton résultat</p>
            <p className="mt-1 text-3xl font-black text-cyan-300">#{mine.position}</p>
            <p className="text-lg font-bold">{mine.score} points</p>
          </div>
        )}
        <p className="mt-6 text-white/50">{state.endTexts?.endText}</p>
      </div>
    </Center>
  );
}
