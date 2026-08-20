/**
 * Écrans projecteur du mode BATTLE ROYALE (dispatch depuis ScreenApp).
 *
 * round_intro (MANCHE N), announce, question (compteur SURVIVANTS), verdict
 * (habillage suspense, compteur inchangé), reveal (décompte des éliminés,
 * repêchage, milestones), round_end (podium + général paginé + zone top 10),
 * closing (fondu), end (victoire couronne + confettis).
 */

import { useEffect, useState } from 'react';
import type { BattleStandingEntry, PublicState } from '../lib/gameClient';
import { DifficultyBadge, TimerRing } from '../ui/bits';
import { FullCenter, LobbyProjo } from './ScreenApp';

const STANDINGS_PAGE_MS = 10000;

export function BattleProjectorBody({
  state,
  remaining,
  answeredCount,
}: {
  state: PublicState;
  remaining: number | null;
  answeredCount: number;
}) {
  switch (state.status) {
    case 'lobby':
      return <LobbyProjo state={state} />;
    case 'rules':
      return <BattleRulesProjo />;
    case 'round_intro':
      return <RoundIntroProjo state={state} />;
    case 'announce':
      return <BattleAnnounceProjo state={state} remaining={remaining} />;
    case 'question':
    case 'locked':
      return <BattleQuestionProjo state={state} remaining={remaining} answeredCount={answeredCount} />;
    case 'verdict':
      return <VerdictProjo state={state} />;
    case 'reveal':
      return <BattleRevealProjo state={state} />;
    case 'round_end':
      return <RoundEndProjo state={state} />;
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
    case 'closing':
      return <ClosingProjo />;
    case 'end':
      return <BattleEndProjo state={state} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Règles + intro de manche
// ---------------------------------------------------------------------------

function BattleRulesProjo() {
  const rules = [
    { emoji: '⚔️', text: 'Mauvaise réponse ou pas de réponse = ÉLIMINÉ de la manche' },
    { emoji: '⭐', text: 'Chaque bonne réponse rapporte 1 point, même une fois éliminé !' },
    { emoji: '🏅', text: 'Fin de manche : ta place rapporte gros, 25 points au dernier survivant' },
    { emoji: '👑', text: 'Le TOP 10 du classement général s\'affronte en FINALE' },
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

function RoundIntroProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const isFinal = b?.isFinal ?? false;
  return (
    <FullCenter>
      <h1
        className={`anim-stomp text-center text-9xl font-black uppercase tracking-widest ${
          isFinal ? 'text-amber-300' : ''
        }`}
      >
        {isFinal ? '👑 LA FINALE' : `MANCHE ${b?.roundNumber ?? 1}`}
      </h1>
      <p className="anim-fade-up mt-10 text-4xl font-bold text-cyan-300" style={{ animationDelay: '0.5s' }}>
        {b?.survivorCount} COMBATTANT{(b?.survivorCount ?? 0) > 1 ? 'S' : ''}, 1 SEUL SURVIVANT
      </p>
      {state.players.length > 0 && (
        <p className="anim-fade-up mt-10 max-w-5xl text-center text-xl text-white/40" style={{ animationDelay: '0.8s' }}>
          {state.players.slice(0, 30).map((p) => p.pseudo).join(' · ')}
          {state.players.length > 30 ? ' · ...' : ''}
        </p>
      )}
    </FullCenter>
  );
}

// ---------------------------------------------------------------------------
// Annonce + question + verdict
// ---------------------------------------------------------------------------

function BattleAnnounceProjo({ state, remaining }: { state: PublicState; remaining: number | null }) {
  const q = state.question;
  if (!q) return null;
  const progress = remaining !== null ? Math.max(0, Math.min(1, remaining / state.config.announceMs)) : 0;
  return (
    <FullCenter>
      <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-white/40">
        {state.battle?.isFinal ? 'Finale' : `Manche ${state.battle?.roundNumber}`} · Question{' '}
        {state.battle?.questionInRound ?? q.index + 1}
      </p>
      <h1 className="anim-pop mt-6 text-balance text-center text-7xl font-black">{q.theme ?? 'Culture générale'}</h1>
      <div className="mt-8 flex items-center gap-4">
        <DifficultyBadge difficulty={q.difficulty} className="!px-6 !py-2 !text-2xl" />
        <span className="rounded-full border border-cyan-400/50 bg-cyan-400/15 px-6 py-2 text-2xl font-black text-cyan-300">
          {state.battle?.survivorCount} SURVIVANT{(state.battle?.survivorCount ?? 0) > 1 ? 'S' : ''}
        </span>
      </div>
      <p className="mt-12 text-2xl uppercase tracking-[0.3em] text-white/50">Préparez-vous...</p>
      <div className="mt-4 h-2 w-[420px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%`, transition: 'width 0.25s linear' }} />
      </div>
    </FullCenter>
  );
}

function BattleQuestionProjo({
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
  const grace = state.status === 'locked';
  const totalMs = state.phaseEndsAt && state.phaseStartedAt ? state.phaseEndsAt - state.phaseStartedAt : state.config.questionMs;

  return (
    <div className="flex flex-1 flex-col px-12 py-8">
      <div className="mb-6 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-xl uppercase tracking-widest text-white/40">
            {q.difficulty} · {state.battle?.survivorCount} survivant{(state.battle?.survivorCount ?? 0) > 1 ? 's' : ''} · {answeredCount} réponse{answeredCount > 1 ? 's' : ''}
          </p>
          <h1 className="mt-2 text-balance text-5xl font-black leading-tight">{q.question}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          {remaining !== null ? (
            <TimerRing remainingMs={remaining} totalMs={totalMs} size={110} />
          ) : (
            <span className="rounded-full bg-rose-500/20 px-5 py-2 text-2xl font-black text-rose-300">STOP</span>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 content-center gap-4">
        {(q.answers ?? []).map((a, i) => (
          <div key={i} className="anim-fade-up rounded-2xl border-2 border-white/15 bg-white/5 px-7 py-5 text-3xl font-bold" style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="mr-3 font-black text-cyan-300">{String.fromCharCode(65 + i)}</span>
            {a}
          </div>
        ))}
      </div>

      {grace && (
        <div className="anim-pop mt-6 text-center text-4xl font-black uppercase tracking-widest text-amber-300">
          ⏳ Dernière chance !
        </div>
      )}
    </div>
  );
}

function VerdictProjo({ state }: { state: PublicState }) {
  return (
    <FullCenter>
      <div className="anim-suspense text-center">
        <div className="mb-8 text-8xl">🔎</div>
        <h1 className="text-6xl font-black uppercase tracking-widest">Vérification...</h1>
      </div>
      <p className="mt-10 text-3xl text-white/50">
        {state.battle?.survivorCount} survivant{(state.battle?.survivorCount ?? 0) > 1 ? 's' : ''} avant le verdict
      </p>
      <p className="mt-4 animate-pulse text-2xl uppercase tracking-[0.3em] text-rose-300">
        Qui tombe au combat ?
      </p>
    </FullCenter>
  );
}

// ---------------------------------------------------------------------------
// Révélation
// ---------------------------------------------------------------------------

function BattleRevealProjo({ state }: { state: PublicState }) {
  const q = state.question;
  const reveal = state.battle?.reveal;
  const [revealedNames, setRevealedNames] = useState(0);

  useEffect(() => {
    setRevealedNames(0);
    if (!reveal || reveal.eliminated.length === 0) return;
    const interval = setInterval(() => {
      setRevealedNames((n) => {
        if (n >= (reveal?.eliminated.length ?? 0)) {
          clearInterval(interval);
          return n;
        }
        return n + 1;
      });
    }, 550);
    return () => clearInterval(interval);
  }, [state.currentQuestionIndex, reveal]);

  if (!reveal) return null;
  if (reveal.cancelled) {
    return (
      <FullCenter>
        <div className="anim-pop text-center">
          <div className="mb-6 text-8xl">🚫</div>
          <h1 className="text-5xl font-black">Question annulée</h1>
          <p className="mt-4 text-2xl text-white/60">Elle ne compte pas, on continue !</p>
        </div>
      </FullCenter>
    );
  }

  return (
    <div className="flex flex-1 flex-col px-12 py-10">
      {q && (
        <div className="mb-6">
          <h1 className="text-balance text-3xl font-black text-white/70">{q.question}</h1>
          <p className="anim-pop mt-3 inline-block rounded-2xl border-2 border-emerald-400 bg-emerald-400/15 px-6 py-3 text-3xl font-black text-emerald-200">
            ✔ {reveal.correctAnswer}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center">
        {reveal.repechage ? (
          <div className="anim-stomp text-center">
            <div className="mb-4 text-8xl">🛟</div>
            <h2 className="text-7xl font-black uppercase text-amber-300">ÉGALITÉ, REPÊCHAGE !</h2>
            <p className="mt-4 text-3xl text-white/70">Tout le monde reste en vie</p>
          </div>
        ) : reveal.eliminated.length === 0 ? (
          <div className="anim-pop text-center">
            <div className="mb-4 text-8xl">🛡️</div>
            <h2 className="text-6xl font-black text-emerald-300">AUCUN ÉLIMINÉ !</h2>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="anim-pop text-6xl font-black uppercase text-rose-400">
              💀 {reveal.eliminated.length} ÉLIMINÉ{reveal.eliminated.length > 1 ? 'S' : ''}
            </h2>
            <div className="mt-8 flex max-w-5xl flex-wrap items-center justify-center gap-3">
              {reveal.eliminated.slice(0, revealedNames).map((e) => (
                <span
                  key={e.pseudo}
                  className="anim-pop rounded-full border border-rose-400/50 bg-rose-500/15 px-5 py-2 text-2xl font-bold text-rose-200"
                >
                  {e.pseudo}
                  {e.reason === 'timeout' ? ' 😴' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        {reveal.endRoundTie && (
          <p className="anim-fade-up mt-8 text-3xl font-bold text-amber-300">
            Tous à égalité : la manche s'arrête, rang 1 partagé !
          </p>
        )}
      </div>

      <div className="flex min-h-[80px] items-center justify-center gap-6">
        <span className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-2xl text-white/70 tabular-nums">
          {reveal.survivorsBefore} → <span className="font-black text-cyan-300">{reveal.survivorsAfter}</span> survivant{reveal.survivorsAfter > 1 ? 's' : ''}
        </span>
        {reveal.milestone !== null && (
          <span className="anim-banner-in rounded-xl border-2 border-amber-400 bg-amber-400/20 px-8 py-3 text-4xl font-black uppercase text-amber-300">
            PLUS QUE {reveal.milestone} !
          </span>
        )}
        {reveal.victory && (
          <span className="anim-pop rounded-xl border-2 border-amber-400 bg-amber-400/20 px-8 py-3 text-4xl font-black uppercase text-amber-300">
            👑 ET LE VAINQUEUR EST...
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fin de manche : podium + général paginé + zone top 10
// ---------------------------------------------------------------------------

function BattleStandingRow({ s, big = false }: { s: BattleStandingEntry; big?: boolean }) {
  const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : null;
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-5 ${
        s.qualifiedForFinal ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/5'
      } ${big ? 'py-3 text-2xl' : 'py-1.5 text-lg'} ${s.isSpectator ? 'opacity-50' : ''}`}
    >
      <span className={`w-10 shrink-0 text-center font-black tabular-nums ${s.position <= 3 ? 'text-amber-300' : 'text-white/40'}`}>
        {medal ?? s.position}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{s.pseudo}</span>
      {s.positionChange > 0 && <span className="text-emerald-300">▲{s.positionChange}</span>}
      {s.positionChange < 0 && <span className="text-rose-400">▼{Math.abs(s.positionChange)}</span>}
      <span className="font-black text-cyan-300 tabular-nums">{s.score}</span>
    </div>
  );
}

function RoundEndProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const standings = b?.generalStandings ?? [];
  const finalSize = b?.finalSize ?? 10;
  const top = standings.slice(0, finalSize);
  const rest = standings.slice(finalSize);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(rest.length / pageSize));
  const [page, setPage] = useState(0);

  // rotation lente des pages hors top 10 (retour terrain : ~10 s)
  useEffect(() => {
    setPage(0);
    if (pageCount <= 1) return;
    const interval = setInterval(() => setPage((p) => (p + 1) % pageCount), STANDINGS_PAGE_MS);
    return () => clearInterval(interval);
  }, [pageCount, state.status]);

  const visible = rest.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-1 flex-col px-14 py-10">
      <h1 className="mb-2 text-center text-5xl font-black uppercase tracking-widest">
        Fin de la manche {b?.roundResult?.roundNumber}
      </h1>
      <p className="mb-8 text-center text-2xl text-white/50">Classement général</p>
      <div className="grid flex-1 grid-cols-2 gap-12">
        <div className="flex flex-col gap-2">
          <p className="anim-glow mb-1 rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-1.5 text-center text-xl font-black uppercase tracking-widest text-amber-300">
            👑 En route pour la finale
          </p>
          {top.map((s) => <BattleStandingRow key={s.pseudo} s={s} big />)}
        </div>
        <div className="flex flex-col gap-1.5 overflow-hidden">
          {rest.length > 0 && (
            <p className="mb-1 px-4 text-center text-lg uppercase tracking-widest text-white/40">
              {pageCount > 1 ? `Page ${page + 1}/${pageCount}` : 'Le peloton'}
            </p>
          )}
          {visible.map((s) => <BattleStandingRow key={s.pseudo} s={s} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fondu de fin + victoire
// ---------------------------------------------------------------------------

function ClosingProjo() {
  return (
    <div className="anim-fade-to-black flex flex-1 flex-col items-center justify-center">
      <h1 className="anim-title-glow text-7xl font-black tracking-[0.3em]">INVADER</h1>
      <p className="mt-6 text-3xl text-white/50">Merci d'avoir combattu !</p>
    </div>
  );
}

function BattleEndProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const standings = b?.finalStandings ?? b?.generalStandings ?? [];
  const winner = b?.winner;
  return (
    <div className="relative flex flex-1 flex-col px-14 py-10">
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
            {['🎉', '✨', '👑'][i % 3]}
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center">
        <span className="anim-stomp text-8xl">👑</span>
        <h1 className="anim-pop mt-4 text-balance text-center text-7xl font-black text-amber-300">
          {winner?.pseudo ?? '?'}
        </h1>
        <p className="mt-4 text-balance text-center text-3xl text-white/80">{state.endTexts?.winnerText}</p>
      </div>
      <div className="mx-auto mt-10 grid w-full max-w-6xl flex-1 grid-cols-2 gap-x-12 gap-y-1.5 content-start overflow-hidden">
        {standings.slice(0, 20).map((s) => (
          <BattleStandingRow key={s.pseudo} s={{ ...s, qualifiedForFinal: false }} big={s.position <= 3} />
        ))}
      </div>
      <p className="mt-6 text-center text-2xl text-white/50">{state.endTexts?.endText}</p>
    </div>
  );
}
