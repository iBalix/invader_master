/**
 * Briques visuelles du tournoi sur les écrans du bar (1920x1080, lus de loin).
 * Même DA que le quiz : fond game-bg, cyan pour l'information, ambre pour le
 * podium, émeraude pour la victoire, violet pour l'inscription.
 */

import { useEffect, useRef, useState } from 'react';
import { QrCanvas } from '../../ui/bits';
import {
  currentRoundOf,
  fmtScore,
  hasResults,
  pseudoOf,
  rankLabel,
  roundLabel,
  tournamentUrl,
} from '../tournamentClient';
import type { ChessSide, TFeed, TMatch, TournamentPublicState, TStanding } from '../tournamentTypes';

// ---------------------------------------------------------------------------
// Petits éléments
// ---------------------------------------------------------------------------

export function ColorDot({ color, size = 18 }: { color: ChessSide | null; size?: number }) {
  if (!color) return null;
  return (
    <span
      className="inline-block shrink-0 rounded-full border-2 border-white/50"
      style={{ width: size, height: size, background: color === 'w' ? '#F5F2FF' : '#14101B' }}
      title={color === 'w' ? 'Blancs' : 'Noirs'}
    />
  );
}

export function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span>🥇</span>;
  if (rank === 2) return <span>🥈</span>;
  if (rank === 3) return <span>🥉</span>;
  return <span className="tabular-nums">{rank}</span>;
}

/** chip de genre de l'événement : « ♞ Rondes suisses · Échecs » */
export function EventChip({ state, big = false }: { state: TournamentPublicState; big?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-3 rounded-full border border-cyan-400/40 bg-cyan-400/10 font-bold uppercase tracking-[0.3em] text-cyan-300 ${
        big ? 'px-7 py-2.5 text-2xl' : 'px-5 py-1.5 text-lg'
      }`}
    >
      <span className="text-[1.3em] leading-none">♞</span>
      {state.formatLabel} · {state.gameLabel}
      {state.config.testMode && <span className="rounded-full bg-amber-500 px-2 text-sm text-white">TEST</span>}
    </span>
  );
}

/** barre fine de progression de l'écran courant */
export function ScreenProgress({ start, endsAt, now }: { start: number | null; endsAt: number | null; now: number }) {
  if (!endsAt || !start || endsAt <= start) return null;
  const ratio = Math.min(1, Math.max(0, (now - start) / (endsAt - start)));
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5">
      <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${ratio * 100}%`, transition: 'width 0.5s linear' }} />
    </div>
  );
}

/** QR compact d'inscription, dans l'angle des écrans du projecteur */
export function JoinCorner({ state, size = 110 }: { state: TournamentPublicState; size?: number }) {
  if (state.phase === 'final' || (!state.config.lateJoin && state.phase !== 'registration')) return null;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-violet-400/40 bg-violet-500/10 px-4 py-3">
      <QrCanvas value={tournamentUrl(state.joinCode)} size={size} />
      <div className="text-left">
        <p className="text-lg font-bold uppercase tracking-[0.2em] text-violet-200">
          {state.phase === 'registration' ? 'Inscris-toi' : 'Rejoins le tournoi'}
        </p>
        <p className="font-mono text-4xl font-black tracking-[0.25em] text-white">{state.joinCode}</p>
      </div>
    </div>
  );
}

/** en-tête des écrans de ronde : genre, titre, ronde et avancement, QR */
export function TopBar({ state, right }: { state: TournamentPublicState; right?: React.ReactNode }) {
  const round = currentRoundOf(state);
  const done = round ? round.matches.filter((m) => m.status === 'done' || m.status === 'cancelled').length : 0;
  const total = round ? round.matches.length : 0;
  return (
    <div className="flex shrink-0 items-center justify-between gap-8 border-b border-white/10 px-12 py-5">
      <div className="min-w-0">
        <EventChip state={state} />
        <h1 className="mt-2 truncate text-5xl font-black">{state.title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-6">
        {right}
        {round && state.phase !== 'final' && (
          <div className="text-right">
            <p className="text-4xl font-black text-white">{roundLabel(state, round.number)}</p>
            <p className="mt-1 text-2xl font-bold text-white/55">
              <span className="text-cyan-300 tabular-nums">{done}</span>/{total} {total > 1 ? 'matchs terminés' : 'match terminé'}
            </p>
          </div>
        )}
        <JoinCorner state={state} size={96} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

function pointsOf(state: TournamentPublicState, playerId: string | null): number | null {
  if (!playerId) return null;
  return state.standings.find((s) => s.playerId === playerId)?.points ?? null;
}

type SideLook = 'win' | 'loss' | 'draw' | 'neutral';

function sideLooks(m: TMatch): { a: SideLook; b: SideLook } {
  if (!m.result || m.result === 'cancelled') return { a: 'neutral', b: 'neutral' };
  if (m.result === 'draw') return { a: 'draw', b: 'draw' };
  const aWins = m.result === 'a' || m.result === 'forfeit_a';
  return aWins ? { a: 'win', b: 'loss' } : { a: 'loss', b: 'win' };
}

const LOOK_CLASS: Record<SideLook, string> = {
  win: 'text-emerald-300',
  loss: 'text-white/35 line-through decoration-2',
  draw: 'text-amber-200',
  neutral: 'text-white',
};

export function MatchStatusPill({ m, small = false }: { m: TMatch; small?: boolean }) {
  const txt = small ? 'px-3 py-0.5 text-base' : 'px-4 py-1 text-xl';
  if (m.status === 'playing') {
    return (
      <span className={`anim-suspense inline-flex items-center gap-2 rounded-full border border-cyan-300/50 bg-cyan-400/15 font-black uppercase tracking-wider text-cyan-200 ${txt}`}>
        ♟ En cours
      </span>
    );
  }
  if (m.status === 'pending') {
    return (
      <span className={`rounded-full border border-white/15 bg-white/5 font-bold uppercase tracking-wider text-white/50 ${txt}`}>
        {m.games.length > 0 ? 'Partie suivante' : 'À jouer'}
      </span>
    );
  }
  if (m.status === 'cancelled') {
    return <span className={`rounded-full bg-white/5 font-bold uppercase tracking-wider text-white/40 ${txt}`}>Annulé</span>;
  }
  const forfeit = m.result === 'forfeit_a' || m.result === 'forfeit_b';
  return (
    <span className={`rounded-full border border-emerald-300/40 bg-emerald-400/10 font-black uppercase tracking-wider text-emerald-200 ${txt}`}>
      {m.result === 'draw' ? 'Nul' : forfeit ? 'Forfait' : 'Terminé'}
    </span>
  );
}

/** score du match au centre de la carte (parties gagnées, demi-points) */
function CenterScore({ m, small = false }: { m: TMatch; small?: boolean }) {
  if (m.games.length === 0 && m.status !== 'done') {
    return <span className={`font-black text-white/25 ${small ? 'text-xl' : 'text-3xl'}`}>contre</span>;
  }
  if (small) {
    if (m.status === 'done' && m.games.length === 0) return null;
    return (
      <span className="text-3xl font-black tabular-nums text-white">
        {fmtScore(m.score.a)}
        <span className="mx-1.5 text-white/30">-</span>
        {fmtScore(m.score.b)}
      </span>
    );
  }
  if (m.status === 'done' && m.games.length === 0) {
    // résultat imposé (GM, forfait) : pas de score de parties
    return <span className="text-2xl font-bold uppercase tracking-wider text-white/40">décision</span>;
  }
  return (
    <span className="text-5xl font-black tabular-nums text-white">
      {fmtScore(m.score.a)}
      <span className="mx-2 text-white/30">-</span>
      {fmtScore(m.score.b)}
    </span>
  );
}

export type CardSize = 'lg' | 'md' | 'sm';

const CARD: Record<CardSize, { pad: string; name: string; board: string; sub: string; dot: number }> = {
  lg: { pad: 'py-5', name: 'text-4xl', board: 'text-4xl', sub: 'text-xl', dot: 22 },
  md: { pad: 'py-3.5', name: 'text-3xl', board: 'text-3xl', sub: 'text-lg', dot: 18 },
  sm: { pad: 'py-2', name: 'text-2xl', board: 'text-2xl', sub: 'text-base', dot: 16 },
};

/**
 * Taille des cartes de match selon ce qu'il faut faire tenir sur 1080 px :
 * une colonne tant qu'on est peu nombreux, puis deux, puis trois.
 */
export function matchLayout(count: number, maxCols = 3): { cols: number; size: CardSize } {
  const cols = Math.min(maxCols, count <= 5 ? 1 : count <= 18 ? 2 : 3);
  const rows = Math.ceil(count / cols);
  return { cols, size: rows <= 4 ? 'lg' : rows <= 6 ? 'md' : 'sm' };
}

export function MatchCard({
  state,
  m,
  size = 'md',
  style,
}: {
  state: TournamentPublicState;
  m: TMatch;
  size?: CardSize;
  style?: React.CSSProperties;
}) {
  const looks = sideLooks(m);
  const c = CARD[size];
  if (m.kind === 'bye') {
    return (
      <div className={`flex items-center gap-5 rounded-2xl border border-amber-300/30 bg-amber-300/5 px-6 ${c.pad}`} style={style}>
        <span className={`w-20 shrink-0 text-center font-black text-white/35 ${c.board}`}>#{m.board}</span>
        <span className={`flex-1 truncate font-black text-amber-100 ${c.name}`}>{pseudoOf(state, m.a)}</span>
        <span className={`font-bold text-amber-200 ${c.sub}`}>exempt · +{fmtScore(m.points.a)}</span>
      </div>
    );
  }
  const colorB: ChessSide | null = m.colorA ? (m.colorA === 'w' ? 'b' : 'w') : null;
  const ptsA = pointsOf(state, m.a);
  const ptsB = pointsOf(state, m.b);
  const showPts = size !== 'sm';
  return (
    <div
      className={`grid items-center gap-4 rounded-2xl border px-5 ${c.pad} ${
        m.status === 'playing' ? 'border-cyan-300/40 bg-cyan-400/[0.07]' : 'border-white/10 bg-white/5'
      }`}
      style={{ gridTemplateColumns: `${size === 'sm' ? '3.5rem' : '5rem'} minmax(0,1fr) auto minmax(0,1fr)`, ...style }}
    >
      <div className="text-center">
        {size !== 'sm' && <p className="text-sm font-bold uppercase tracking-widest text-white/35">Match</p>}
        <p className={`font-black text-white/60 ${c.board}`}>{size === 'sm' ? `#${m.board}` : m.board}</p>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-3 text-right">
        <div className="min-w-0">
          <p className={`truncate font-black ${c.name} ${LOOK_CLASS[looks.a]}`}>{pseudoOf(state, m.a)}</p>
          {ptsA !== null && showPts && <p className={`tabular-nums text-white/40 ${c.sub}`}>{fmtScore(ptsA)} pts</p>}
        </div>
        <ColorDot color={m.colorA} size={c.dot} />
      </div>
      <div className={`flex flex-col items-center gap-1.5 ${size === 'sm' ? 'min-w-[9rem]' : 'min-w-[11rem]'}`}>
        <CenterScore m={m} small={size === 'sm'} />
        <MatchStatusPill m={m} small={size === 'sm'} />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <ColorDot color={colorB} size={c.dot} />
        <div className="min-w-0">
          <p className={`truncate font-black ${c.name} ${LOOK_CLASS[looks.b]}`}>{pseudoOf(state, m.b)}</p>
          {m.kind === 'floater' ? (
            <p className={`truncate font-bold text-violet-300 ${c.sub}`}>partie bonus · compte pour {pseudoOf(state, m.a)}</p>
          ) : (
            ptsB !== null && showPts && <p className={`tabular-nums text-white/40 ${c.sub}`}>{fmtScore(ptsB)} pts</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** l'exempt qui attend encore son adversaire */
export function WaitingCard({
  state,
  playerId,
  style,
  size = 'md',
}: {
  state: TournamentPublicState;
  playerId: string;
  style?: React.CSSProperties;
  size?: CardSize;
}) {
  const c = CARD[size];
  return (
    <div className={`flex items-center gap-5 rounded-2xl border border-violet-300/40 bg-violet-500/10 px-6 ${c.pad}`} style={style}>
      <span className={size === 'sm' ? 'text-3xl' : 'text-4xl'}>⏳</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-black text-violet-100 ${c.name}`}>{pseudoOf(state, playerId)} est exempt</p>
        <p className={`truncate text-violet-200/80 ${c.sub}`}>il affrontera un joueur du premier match terminé</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

export function StandingLine({ s, state, big }: { s: TStanding; state: TournamentPublicState; big: boolean }) {
  const round = currentRoundOf(state);
  const inMatch =
    state.phase === 'round' &&
    round?.matches.some((m) => m.status === 'playing' && (m.a === s.playerId || m.b === s.playerId));
  const waiting = state.phase === 'round' && round?.waiting === s.playerId;
  const gone = s.status !== 'active';
  // avant le premier résultat, tout le monde est 1er ex æquo : ni médaille ni « = »
  const ranked = hasResults(state);
  const podium = ranked && s.rank <= 3 && !gone;
  return (
    <div
      className={`flex items-center rounded-xl border ${big ? 'gap-5 px-6 py-3' : 'gap-4 px-5 py-2.5'} ${
        podium ? 'border-amber-300/30 bg-amber-300/[0.06]' : 'border-white/10 bg-white/5'
      } ${gone ? 'opacity-45' : ''}`}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap font-black ${big ? 'w-24 text-4xl' : 'w-20 text-3xl'} ${
          podium ? 'text-amber-300' : 'text-white/45'
        }`}
      >
        {ranked ? <Medal rank={s.rank} /> : <span className="text-white/25">·</span>}
        {ranked && s.tied && <span className="text-xl text-white/45">=</span>}
      </span>
      <span className={`min-w-0 flex-1 truncate font-black ${big ? 'text-4xl' : 'text-3xl'}`}>
        {s.pseudo}
        {inMatch && <span className="ml-3 align-middle text-2xl text-cyan-300">♟</span>}
        {waiting && <span className="ml-3 align-middle text-2xl text-violet-300">⏳</span>}
        {s.status === 'left' && <span className="ml-3 align-middle text-xl font-bold text-white/50">a quitté</span>}
        {s.status === 'excluded' && <span className="ml-3 align-middle text-xl font-bold text-rose-300/80">exclu</span>}
      </span>
      <span className={`shrink-0 font-bold tabular-nums text-white/50 ${big ? 'text-2xl' : 'text-xl'}`}>
        {s.wins}V {s.draws}N {s.losses}D
      </span>
      <span className={`shrink-0 text-right font-black tabular-nums text-cyan-300 ${big ? 'w-32 text-5xl' : 'w-24 text-4xl'}`}>
        {fmtScore(s.points)}
      </span>
    </div>
  );
}

/** grille de classement paginée : 12 lignes par colonne, 2 colonnes au-delà de 12 */
export function StandingsGrid({
  state,
  page,
  perPage,
  revealFrom,
}: {
  state: TournamentPublicState;
  page: number;
  perPage: number;
  /** apparition échelonnée (ms depuis le montage), désactivée si absente */
  revealFrom?: boolean;
}) {
  const rows = state.standings.slice(page * perPage, (page + 1) * perPage);
  const twoCols = rows.length > 10;
  // colonnes équilibrées (7 / 6 plutôt que 12 / 1)
  const perCol = twoCols ? Math.ceil(rows.length / 2) : Math.max(1, rows.length);
  const big = perCol <= 8;
  return (
    <div
      className="grid min-h-0 flex-1 content-start gap-x-8 gap-y-2"
      style={{
        gridTemplateColumns: twoCols ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        gridTemplateRows: `repeat(${perCol}, minmax(0, auto))`,
        gridAutoFlow: 'column',
      }}
    >
      {rows.map((s, i) => (
        <div key={s.playerId} className={revealFrom ? 'anim-fade-up' : ''} style={revealFrom ? { animationDelay: `${Math.min(i * 0.05, 1.2)}s` } : undefined}>
          <StandingLine s={s} state={state} big={big} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

export function PodiumStep({
  s,
  place,
  visible,
}: {
  s: TStanding | undefined;
  place: 1 | 2 | 3;
  visible: boolean;
}) {
  const heights = { 1: 'h-72', 2: 'h-52', 3: 'h-40' } as const;
  const medals = { 1: '👑', 2: '🥈', 3: '🥉' } as const;
  const tones = {
    1: 'border-amber-300/70 bg-amber-300/20',
    2: 'border-slate-200/50 bg-slate-200/10',
    3: 'border-orange-400/50 bg-orange-400/10',
  } as const;
  return (
    <div
      className="flex w-[22rem] flex-col items-center gap-3"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.94)',
        transition: 'opacity 500ms ease, transform 600ms cubic-bezier(0.3, 1.25, 0.4, 1)',
      }}
    >
      <span className="text-7xl">{medals[place]}</span>
      <span className={`max-w-full truncate text-5xl font-black ${place === 1 ? 'text-amber-200' : 'text-white'}`}>
        {s?.pseudo ?? '...'}
      </span>
      {s && <span className="text-3xl font-black tabular-nums text-cyan-300">{fmtScore(s.points)} pts</span>}
      <div className={`w-full rounded-t-3xl border-2 ${heights[place]} ${tones[place]} flex items-start justify-center pt-4`}>
        <span className="text-5xl font-black text-white/70">{rankLabel(place)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bandeaux de faits (résultats, arrivées) sur le projecteur
// ---------------------------------------------------------------------------

const FEED_TONE: Record<TFeed['kind'], string> = {
  result: 'border-emerald-300/50 bg-emerald-500/20 text-emerald-100',
  join: 'border-cyan-300/50 bg-cyan-500/20 text-cyan-100',
  floater: 'border-violet-300/50 bg-violet-500/20 text-violet-100',
  round: 'border-white/20 bg-white/10 text-white',
  leave: 'border-white/15 bg-white/5 text-white/70',
  final: 'border-amber-300/60 bg-amber-400/20 text-amber-100',
};

const FEED_ICON: Record<TFeed['kind'], string> = {
  result: '🏁',
  join: '👋',
  floater: '🎲',
  round: '📣',
  leave: '🚪',
  final: '🏆',
};

/**
 * Bandeaux des nouveautés : seuls les faits arrivés APRÈS le montage
 * s'affichent (un projecteur rechargé ne rejoue pas l'historique).
 */
export function FeedToasts({ state }: { state: TournamentPublicState }) {
  const lastSeen = useRef<number | null>(null);
  const [shown, setShown] = useState<TFeed[]>([]);
  // minuteries de retrait gardées hors de l'effet : chaque instantané reçu
  // (sync, sondage) recrée state.feed et relance l'effet ; nettoyer la
  // minuterie à ce moment-là laissait les bandeaux affichés pour toujours
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const maxSeq = state.feed.reduce((m, f) => Math.max(m, f.seq), 0);
    if (lastSeen.current === null) {
      lastSeen.current = maxSeq;
      return;
    }
    const since = lastSeen.current;
    const fresh = state.feed.filter((f) => f.seq > since && f.kind !== 'round');
    lastSeen.current = Math.max(since, maxSeq);
    if (fresh.length === 0) return;
    setShown((prev) => [...prev, ...fresh].slice(-4));
    const ids = fresh.map((f) => f.seq);
    const t = window.setTimeout(() => {
      setShown((prev) => prev.filter((f) => !ids.includes(f.seq)));
      timers.current = timers.current.filter((x) => x !== t);
    }, 6500);
    timers.current.push(t);
  }, [state.feed]);
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-8 right-10 z-40 flex w-[40rem] flex-col items-end gap-3">
      {shown.map((f) => (
        <div key={f.seq} className={`anim-slide-in flex items-center gap-4 rounded-2xl border-2 px-6 py-4 text-3xl font-black shadow-2xl backdrop-blur ${FEED_TONE[f.kind]}`}>
          <span className="text-4xl">{FEED_ICON[f.kind]}</span>
          <span className="text-balance">{f.text}</span>
        </div>
      ))}
    </div>
  );
}
