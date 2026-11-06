/**
 * Briques visuelles du tournoi sur les écrans du bar (1920x1080, lus de loin).
 * Identité arcade Invader (cf. ../arcade) : HUD de borne en haut, cartes
 * « VS » de jeu de combat pour les matchs, table de high score pour le
 * classement, podium en blocs de pixels, tableau à connecteurs.
 *
 * Couleurs : cyan pour ce qui se joue, rose pour l'inscription, or / argent /
 * bronze pour les rangs, menthe pour la victoire, ambre pour les annonces.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  currentRoundOf,
  fmtScore,
  hasResults,
  pseudoOf,
  roundLabel,
  tournamentUrl,
} from '../tournamentClient';
import type { TBracketMatch, TFeed, TMatch, TournamentPublicState, TStanding } from '../tournamentTypes';
import {
  Chrome,
  chromeSize,
  Crown,
  GameTag,
  Invader,
  JoinSteps,
  Meter,
  Pawn,
  QrFrame,
  Trophy,
  invaderTone,
  rankClass,
  rankText,
} from '../arcade/kit';
import { CHECK, CUP, DOOR, HOURGLASS, PixelSprite, STAR } from '../arcade/pixel';

// ---------------------------------------------------------------------------
// Petits éléments
// ---------------------------------------------------------------------------

/** étiquette du jeu et du format (« ÉCHECS · RONDES SUISSES ») */
export function EventChip({ state, big = false }: { state: TournamentPublicState; big?: boolean }) {
  return <GameTag state={state} size={big ? 'xl' : 'lg'} />;
}

/** barre de progression de l'écran courant, en segments, au ras du bas */
export function ScreenProgress({ start, endsAt, now }: { start: number | null; endsAt: number | null; now: number }) {
  if (!endsAt || !start || endsAt <= start) return null;
  const ratio = Math.min(1, Math.max(0, (now - start) / (endsAt - start)));
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[61] h-3 bg-black/40">
      <div
        className="h-full"
        style={{
          width: `${ratio * 100}%`,
          background: 'repeating-linear-gradient(90deg, #ff2bd6 0 18px, #33e2ff 18px 36px)',
          transition: 'width 0.5s steps(4, end)',
        }}
      />
    </div>
  );
}

/** l'inscription est-elle encore ouverte ? (QR affiché ou non) */
export function joinOpen(state: TournamentPublicState): boolean {
  if (state.phase === 'final' || state.phase === 'bracket') return false;
  return state.phase === 'registration' || state.config.lateJoin;
}

/** QR compact d'inscription, dans l'angle des écrans du projecteur */
export function JoinCorner({ state, size = 110 }: { state: TournamentPublicState; size?: number }) {
  if (!joinOpen(state)) return null;
  return (
    <div className="ia-px ia-px--lg ia-px--pink flex items-center gap-5 py-3 pl-3 pr-6">
      <QrFrame value={tournamentUrl(state.joinCode)} size={size} />
      <div className="text-left">
        <p className="ia-pixel text-xl text-ia-pink">{state.phase === 'registration' ? 'Inscris-toi' : 'Encore ouvert'}</p>
        <p className="ia-pixel mt-2 text-5xl tracking-[0.1em] text-white">{state.joinCode}</p>
      </div>
    </div>
  );
}

/** HUD de borne : jeu, titre, phase et avancement, QR */
export function TopBar({
  state,
  right,
  phase,
}: {
  state: TournamentPublicState;
  right?: ReactNode;
  /** remplace le bloc « Ronde » (salves, tableau) */
  phase?: ReactNode;
}) {
  const round = currentRoundOf(state);
  const done = round ? round.matches.filter((m) => m.status === 'done' || m.status === 'cancelled').length : 0;
  const total = round ? round.matches.length : 0;
  const roundBlock =
    phase ??
    (round && state.phase !== 'final' ? (
      <div className="w-[22rem] text-right">
        <p className="ia-display text-6xl text-white">{roundLabel(state, round.number)}</p>
        <Meter ratio={total ? done / total : 0} className="mt-2" height={18} />
        <p className="ia-pixel mt-2 text-xl text-ia-soft">
          <span className="text-ia-mint">{done}</span>/{total} {total > 1 ? 'matchs finis' : 'match fini'}
        </p>
      </div>
    ) : null);
  return (
    <div className="relative flex shrink-0 items-center justify-between gap-10 px-12 pb-5 pt-6">
      <div className="min-w-0">
        <EventChip state={state} />
        {/* jamais `truncate` sur un titre chromé : Chrome y dessine un rectangle */}
        <h1 className={`mt-3 leading-tight ${chromeSize(state.title, right ? ['text-5xl', 'text-4xl', 'text-3xl', 'text-2xl'] : ['text-6xl', 'text-5xl', 'text-4xl', 'text-3xl'])}`}>
          <Chrome>{state.title}</Chrome>
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-8">
        {right}
        {roundBlock}
        <JoinCorner state={state} size={96} />
      </div>
      <div
        className="absolute bottom-0 left-12 right-12 h-1"
        style={{ background: 'linear-gradient(90deg, #ff2bd6, #8b3dff 40%, #33e2ff)' }}
        aria-hidden
      />
    </div>
  );
}

/** en-tête de section : picto + titre pixel + note + pagination */
export function SectionHead({
  icon,
  title,
  note,
  right,
}: {
  icon?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-6">
      <h2 className="flex min-w-0 items-center gap-5">
        {icon}
        <span className="ia-pixel text-5xl text-white">{title}</span>
        {note && <span className="ia-pixel truncate text-2xl text-ia-gold">{note}</span>}
      </h2>
      {right}
    </div>
  );
}

/** pagination : petits carrés, le courant est allongé */
export function PageDots({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="ia-pixel mr-2 text-2xl text-ia-muted">
        {page + 1}/{pages}
      </span>
      {Array.from({ length: pages }, (_, i) => (
        <span key={i} className={`h-4 ${i === page ? 'w-12 bg-ia-cyan' : 'w-4 bg-ia-line'}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match : carte « VS »
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
  win: 'text-ia-mint ia-neon',
  loss: 'text-ia-muted',
  draw: 'text-ia-amber',
  neutral: 'text-white',
};

/** état du match en étiquette pixel */
export function MatchStatusPill({ m, small = false }: { m: TMatch; small?: boolean }) {
  const txt = small ? 'px-2.5 py-1 text-base' : 'px-3 py-1.5 text-xl';
  const base = `ia-pixel ia-clip ia-clip--sm inline-flex items-center gap-2 whitespace-nowrap ${txt}`;
  if (m.status === 'playing') {
    return (
      <span className={`${base} bg-ia-cyan text-ia-night`}>
        <span className="ia-blink inline-block h-2 w-2 bg-ia-night" /> En cours
      </span>
    );
  }
  if (m.status === 'pending') {
    return <span className={`${base} bg-ia-line text-ia-soft`}>{m.games.length > 0 ? 'Partie suivante' : 'À jouer'}</span>;
  }
  if (m.status === 'cancelled') return <span className={`${base} bg-white/10 text-ia-muted`}>Annulé</span>;
  const forfeit = m.result === 'forfeit_a' || m.result === 'forfeit_b';
  if (m.result === 'draw') return <span className={`${base} bg-ia-amber text-ia-night`}>Nul</span>;
  return <span className={`${base} bg-ia-mint text-ia-night`}>{forfeit ? 'Forfait' : 'Terminé'}</span>;
}

/** centre de la carte : VS, score, ou décision */
function CenterScore({ m, small = false }: { m: TMatch; small?: boolean }) {
  if (m.games.length === 0 && m.status !== 'done') {
    return (
      <span
        className={`ia-pixel italic text-ia-pink ${small ? 'text-2xl' : 'text-4xl'}`}
        style={{ textShadow: '3px 3px 0 #33e2ff' }}
      >
        VS
      </span>
    );
  }
  if (m.status === 'done' && m.games.length === 0) {
    // résultat imposé (GM, forfait) : pas de score de parties
    return small ? null : <span className="ia-pixel text-xl text-ia-muted">Décision</span>;
  }
  return (
    <span className={`ia-display tabular-nums text-white ${small ? 'text-4xl' : 'text-7xl'}`}>
      {fmtScore(m.score.a)}
      <span className="mx-2 text-ia-muted">-</span>
      {fmtScore(m.score.b)}
    </span>
  );
}

export type CardSize = 'lg' | 'md' | 'sm';

const CARD: Record<CardSize, { pad: string; name: string; board: string; sub: string; pawn: number; center: string }> = {
  lg: { pad: 'py-5', name: 'text-6xl', board: 'text-6xl', sub: 'text-2xl', pawn: 5, center: 'min-w-[13rem]' },
  md: { pad: 'py-3.5', name: 'text-5xl', board: 'text-5xl', sub: 'text-xl', pawn: 4, center: 'min-w-[11rem]' },
  sm: { pad: 'py-2', name: 'text-4xl', board: 'text-4xl', sub: 'text-lg', pawn: 3, center: 'min-w-[14rem]' },
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
  style?: CSSProperties;
}) {
  const looks = sideLooks(m);
  const c = CARD[size];
  if (m.kind === 'bye') {
    return (
      <div className={`ia-px ia-px--lg ia-px--amber flex items-center gap-6 px-7 ${c.pad}`} style={style}>
        <BoardNumber n={m.board} size={size} />
        <span className={`ia-display min-w-0 flex-1 truncate text-ia-gold ${c.name}`}>{pseudoOf(state, m.a)}</span>
        <span className={`ia-pixel text-ia-amber ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>Exempt +{fmtScore(m.points.a)}</span>
      </div>
    );
  }
  const colorB = m.colorA ? (m.colorA === 'w' ? 'b' : 'w') : null;
  const ptsA = pointsOf(state, m.a);
  const ptsB = pointsOf(state, m.b);
  const showPts = size !== 'sm';
  const playing = m.status === 'playing';
  return (
    <div
      className={`ia-px ia-px--lg grid items-center gap-5 px-6 ${c.pad} ${playing ? 'ia-px--cyan' : 'ia-px--ghost'}`}
      style={{ gridTemplateColumns: `${size === 'sm' ? '3.5rem' : '5rem'} minmax(0,1fr) auto minmax(0,1fr)`, ...style }}
    >
      <BoardNumber n={m.board} size={size} />
      <div className="flex min-w-0 items-center justify-end gap-4 text-right">
        <div className="min-w-0">
          <p className={`ia-display truncate ${c.name} ${LOOK_CLASS[looks.a]}`}>{pseudoOf(state, m.a)}</p>
          {ptsA !== null && showPts && <p className={`ia-pixel mt-1 text-ia-muted ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>{fmtScore(ptsA)} pts</p>}
        </div>
        <Pawn color={m.colorA} scale={c.pawn} />
      </div>
      {/* petites cartes (16 matchs par page) : score et état côte à côte pour tenir en 1080 px */}
      <div className={`flex items-center ${size === 'sm' ? 'flex-row justify-center gap-3' : 'flex-col gap-2'} ${c.center}`}>
        <CenterScore m={m} small={size === 'sm'} />
        <MatchStatusPill m={m} small={size !== 'lg'} />
      </div>
      <div className="flex min-w-0 items-center gap-4">
        <Pawn color={colorB} scale={c.pawn} />
        <div className="min-w-0">
          <p className={`ia-display truncate ${c.name} ${LOOK_CLASS[looks.b]}`}>{pseudoOf(state, m.b)}</p>
          {m.kind === 'floater' ? (
            <p className={`ia-pixel mt-1 truncate text-ia-violet ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>Bonus · compte pour {pseudoOf(state, m.a)}</p>
          ) : (
            ptsB !== null && showPts && <p className={`ia-pixel mt-1 text-ia-muted ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>{fmtScore(ptsB)} pts</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BoardNumber({ n, size }: { n: number; size: CardSize }) {
  return (
    <div className="text-center">
      {size !== 'sm' && <p className="ia-pixel text-base text-ia-muted">Match</p>}
      <p className={`ia-display text-ia-soft ${CARD[size].board}`}>{n}</p>
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
  style?: CSSProperties;
  size?: CardSize;
}) {
  const c = CARD[size];
  return (
    <div className={`ia-px ia-px--lg ia-px--violet flex items-center gap-6 px-7 ${c.pad}`} style={style}>
      <PixelSprite sprite={HOURGLASS} scale={size === 'sm' ? 4 : 6} className="text-ia-violet" />
      <div className="min-w-0 flex-1">
        <p className={`ia-display truncate text-white ${c.name}`}>{pseudoOf(state, playerId)} est exempt</p>
        <p className={`truncate text-ia-soft ${c.sub}`}>il affrontera un joueur du premier match terminé</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement : table de high score
// ---------------------------------------------------------------------------

/** marque d'état d'un joueur pendant la ronde */
function PlayerFlag({ children, tone }: { children: ReactNode; tone: 'cyan' | 'violet' | 'muted' | 'red' }) {
  const tones = {
    cyan: 'bg-ia-cyan text-ia-night',
    violet: 'bg-ia-violet text-white',
    muted: 'bg-white/10 text-ia-soft',
    red: 'bg-ia-red text-ia-night',
  };
  return <span className={`ia-pixel ia-clip ia-clip--sm ml-4 inline-flex items-center gap-2 px-2.5 py-1 align-middle text-lg ${tones[tone]}`}>{children}</span>;
}

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
  // V-N-D n'a de sens qu'aux échecs (salves : places et points seulement)
  const record = state.format !== 'waves';
  const tone = podium ? (s.rank === 1 ? 'ia-px--gold' : s.rank === 2 ? 'ia-px--silver' : 'ia-px--amber') : 'ia-px--deep';
  return (
    <div className={`ia-px flex items-center ${tone} ${big ? 'gap-5 px-6 py-3' : 'gap-4 px-5 py-2'} ${gone ? 'opacity-45' : ''}`}>
      <span className={`ia-pixel inline-flex shrink-0 items-baseline justify-end gap-1 ${big ? 'w-28 text-4xl' : 'w-24 text-3xl'} ${rankClass(s.rank, ranked && !gone)}`}>
        {ranked ? rankText(s.rank) : '--'}
        {ranked && s.tied && <span className="text-xl text-ia-muted">=</span>}
      </span>
      <span className="flex w-10 shrink-0 justify-center">
        {ranked && s.rank === 1 && !gone ? <Crown scale={big ? 3 : 2} /> : <Invader seed={s.playerId} scale={big ? 3 : 2} className={invaderTone(s.playerId)} />}
      </span>
      <span className={`ia-display min-w-0 truncate ${big ? 'text-5xl' : 'text-4xl'} ${podium ? rankClass(s.rank) : 'text-white'}`}>
        {s.pseudo}
        {inMatch && <PlayerFlag tone="cyan">En jeu</PlayerFlag>}
        {waiting && <PlayerFlag tone="violet">Exempt</PlayerFlag>}
        {s.status === 'left' && <PlayerFlag tone="muted">Parti</PlayerFlag>}
        {s.status === 'excluded' && <PlayerFlag tone="red">Exclu</PlayerFlag>}
      </span>
      <span className={`ia-dots ${podium ? rankClass(s.rank) : 'text-ia-soft'}`} />
      {record && (
        <span className={`ia-pixel shrink-0 text-ia-muted ${big ? 'text-2xl' : 'text-xl'}`}>
          {s.wins}-{s.draws}-{s.losses}
        </span>
      )}
      <span className={`ia-display shrink-0 text-right tabular-nums ${big ? 'w-28 text-6xl' : 'w-24 text-5xl'} ${podium ? rankClass(s.rank) : 'text-ia-cyan'}`}>
        {fmtScore(s.points)}
      </span>
    </div>
  );
}

/** légende des colonnes au-dessus de la table */
export function StandingsLegend({ record = true }: { record?: boolean }) {
  return (
    <span className="ia-pixel text-2xl text-ia-muted">
      {record && 'V-N-D · '}
      <span className="text-ia-cyan">pts</span>
    </span>
  );
}

/** grille de classement paginée : 12 lignes par colonne, 2 colonnes au-delà de 10 */
export function StandingsGrid({
  state,
  page,
  perPage,
  revealFrom,
}: {
  state: TournamentPublicState;
  page: number;
  perPage: number;
  /** apparition échelonnée des lignes */
  revealFrom?: boolean;
}) {
  const rows = state.standings.slice(page * perPage, (page + 1) * perPage);
  const twoCols = rows.length > 10;
  // colonnes équilibrées (7 / 6 plutôt que 12 / 1)
  const perCol = twoCols ? Math.ceil(rows.length / 2) : Math.max(1, rows.length);
  const big = perCol <= 8;
  return (
    <div
      className="grid min-h-0 flex-1 content-start gap-x-10 gap-y-2.5"
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

const PODIUM_LOOK = {
  1: { height: 'h-64', tone: 'ia-px--gold', glow: 'ia-glow-gold', name: 'ia-rank-1', metal: 'gold' as const },
  2: { height: 'h-48', tone: 'ia-px--silver', glow: '', name: 'ia-rank-2', metal: 'silver' as const },
  3: { height: 'h-36', tone: 'ia-px--amber', glow: '', name: 'ia-rank-3', metal: 'bronze' as const },
};

export function PodiumStep({
  s,
  place,
  visible,
  trophy = place === 1,
  width = '24rem',
}: {
  s: TStanding | undefined;
  place: 1 | 2 | 3;
  visible: boolean;
  /** trophée au-dessus de la marche (le vainqueur) */
  trophy?: boolean;
  width?: string;
}) {
  const look = PODIUM_LOOK[place];
  return (
    <div
      className="flex flex-col items-center gap-3"
      style={{
        width,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 420ms steps(5, end), transform 520ms steps(6, end)',
      }}
    >
      {trophy ? (
        <div className="ia-float">
          <Trophy scale={6} />
        </div>
      ) : (
        <Trophy scale={3} metal={look.metal} />
      )}
      <span className={`ia-display max-w-full truncate ${place === 1 ? 'text-8xl' : 'text-6xl'} ${look.name}`}>{s?.pseudo ?? '...'}</span>
      {s && <span className="ia-pixel text-3xl text-ia-cyan">{fmtScore(s.points)} pts</span>}
      <div className={`ia-px ia-px--lg ${look.tone} ${look.glow} flex w-full ${look.height} items-start justify-center pt-6`}>
        <span className={`ia-pixel text-8xl ${look.name}`}>{place}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase finale : tableau à connecteurs
// ---------------------------------------------------------------------------

const ROUND_ORDER: Array<TBracketMatch['round']> = ['qf', 'sf', 'semi', 'final'];
const ROUND_TITLE: Record<TBracketMatch['round'], string> = {
  qf: 'Quarts',
  sf: 'Demies',
  semi: 'Demies',
  final: 'Finale',
};

/** nombre de qualifiés d'un match du tableau (affichage seulement) */
function qualifiedCount(m: TBracketMatch): number {
  return m.round === 'semi' ? 2 : 1;
}

function BracketBox({ state, m, size, smash, wide }: { state: TournamentPublicState; m: TBracketMatch; size: 'lg' | 'md'; smash: boolean; wide: boolean }) {
  const ordered = m.places ?? m.playerIds;
  const live = m.status === 'pending' && m.playerIds.length >= 2;
  const done = m.status === 'done';
  const tone = live ? 'ia-px--cyan ia-glow-cyan' : done ? 'ia-px--plain' : 'ia-px--ghost';
  const final = m.round === 'final';
  // deux colonnes seulement (demies + finale) : la place permet des noms plus grands
  const nameSize =
    size === 'lg'
      ? wide
        ? ordered.length > 2 ? 'text-5xl' : 'text-6xl'
        : ordered.length > 2 ? 'text-4xl' : 'text-5xl'
      : ordered.length > 2 ? 'text-3xl' : 'text-4xl';
  return (
    <div className={`ia-px ia-px--lg ${final && done ? 'ia-px--gold ia-glow-gold' : tone} w-full px-5 py-4`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={`ia-pixel truncate ${size === 'lg' ? 'text-xl' : 'text-lg'} ${final ? 'text-ia-gold' : live ? 'text-ia-cyan' : 'text-ia-muted'}`}>{m.label}</span>
        {live && <span className={`ia-pixel ia-blink text-ia-cyan ${size === 'lg' ? 'text-lg' : 'text-base'}`}>● En jeu</span>}
        {done && smash && m.loserGames !== null && <span className="ia-pixel text-2xl text-ia-gold">3-{m.loserGames}</span>}
      </div>
      {ordered.length === 0 ? (
        <p className="ia-pixel py-3 text-xl text-ia-muted">En attente des qualifiés</p>
      ) : (
        <ul className="space-y-1">
          {ordered.map((id, i) => {
            const through = done && i < qualifiedCount(m);
            const out = done && !through;
            return (
              <li key={id} className="flex items-center gap-3">
                {m.places ? (
                  <span className={`ia-pixel w-10 shrink-0 text-2xl ${through ? (final ? rankClass(i + 1) : 'text-ia-mint') : 'text-ia-muted'}`}>{i + 1}</span>
                ) : (
                  <Invader seed={id} scale={2} className={`w-10 ${invaderTone(id)}`} />
                )}
                <span className={`ia-display min-w-0 truncate ${nameSize} ${through ? (final ? rankClass(i + 1) : 'text-ia-mint') : out ? 'text-ia-muted' : 'text-white'}`}>
                  {pseudoOf(state, id)}
                </span>
                {through && !final && <PixelSprite sprite={CHECK} scale={3} className="ml-auto text-ia-mint" />}
                {through && final && i === 0 && <Crown scale={2} className="ml-auto" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Tableau de la phase finale : une colonne par tour, les matchs d'un tour
 * alimentent la colonne suivante par paires (traits de connexion en pixels).
 * Les formes produites par le serveur sont toujours des moitiés successives
 * (quarts 4, demies 2, finale 1) ; sinon, simples colonnes.
 */
export function BracketTree({ state, size = 'lg' }: { state: TournamentPublicState; size?: 'lg' | 'md' }) {
  const matches = state.bracket?.matches ?? [];
  const smash = state.game === 'smash';
  const rounds = ROUND_ORDER.map((r) => matches.filter((m) => m.round === r).sort((a, b) => a.board - b.board)).filter((l) => l.length > 0);
  const halving = rounds.every((col, i) => i === 0 || col.length * 2 === rounds[i - 1].length);
  const rows = rounds[0]?.length ?? 1;
  const gap = size === 'lg' ? 72 : 52;
  const line = '#4b3a86';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 grid" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`, columnGap: gap }}>
        {rounds.map((col) => (
          <p key={col[0].round} className={`ia-pixel text-center text-2xl ${col[0].round === 'final' ? 'text-ia-gold' : 'text-ia-soft'}`}>
            {ROUND_TITLE[col[0].round]}
          </p>
        ))}
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`, columnGap: gap }}>
        {rounds.map((col, ci) => {
          const span = halving ? rows / col.length : 1;
          return (
            <div key={col[0].round} className="grid min-h-0" style={{ gridTemplateRows: `repeat(${halving ? rows : col.length}, minmax(0, 1fr))`, rowGap: 16 }}>
              {col.map((m, mi) => {
                const feedsNext = halving && ci < rounds.length - 1;
                const top = mi % 2 === 0;
                return (
                  <div key={m.id} className="relative flex items-center" style={{ gridRow: `span ${span} / span ${span}` }}>
                    <BracketBox state={state} m={m} size={size} smash={smash} wide={rounds.length <= 2} />
                    {feedsNext && (
                      <>
                        {/* trait horizontal vers la droite */}
                        <span className="absolute top-1/2 h-1" style={{ right: -gap / 2, width: gap / 2, background: line }} aria-hidden />
                        {/* demi-trait vertical vers le milieu de la paire */}
                        <span
                          className="absolute w-1"
                          style={{
                            right: -gap / 2,
                            top: top ? '50%' : 'calc(-8px)',
                            bottom: top ? 'calc(-8px)' : '50%',
                            background: line,
                          }}
                          aria-hidden
                        />
                      </>
                    )}
                    {halving && ci > 0 && (
                      <span className="absolute top-1/2 h-1" style={{ left: -gap / 2, width: gap / 2, background: line }} aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bandeaux de faits (résultats, arrivées) sur le projecteur
// ---------------------------------------------------------------------------

const FEED_TONE: Record<TFeed['kind'], string> = {
  result: 'ia-px--mint',
  join: 'ia-px--cyan',
  floater: 'ia-px--violet',
  round: 'ia-px--plain',
  leave: 'ia-px--deep',
  final: 'ia-px--gold',
};

function FeedIcon({ kind }: { kind: TFeed['kind'] }) {
  if (kind === 'result') return <PixelSprite sprite={CHECK} scale={5} className="text-ia-mint" />;
  if (kind === 'join') return <Invader seed={2} scale={4} className="text-ia-cyan" />;
  if (kind === 'floater') return <PixelSprite sprite={STAR} scale={4} className="text-ia-violet" />;
  if (kind === 'leave') return <PixelSprite sprite={DOOR} scale={5} className="text-ia-soft" />;
  if (kind === 'final') return <PixelSprite sprite={CUP} scale={4} className="text-ia-gold" />;
  return <PixelSprite sprite={STAR} scale={4} className="text-white" />;
}

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
  return <FeedStack items={shown} />;
}

/** pile des bandeaux (exportée pour le labo) */
export function FeedStack({ items }: { items: TFeed[] }) {
  return (
    <div className="pointer-events-none absolute bottom-10 right-10 z-40 flex w-[44rem] flex-col items-end gap-3">
      {items.map((f) => (
        <div key={f.seq} className={`anim-slide-in ia-px ia-px--lg ${FEED_TONE[f.kind]} flex items-center gap-5 px-6 py-4`}>
          <FeedIcon kind={f.kind} />
          <span className="text-balance text-3xl font-black text-white">{f.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inscrits (salle d'attente)
// ---------------------------------------------------------------------------

/** pseudos des inscrits en étiquettes « sélection du joueur » */
export function PlayerTags({ names, dense }: { names: Array<{ id: string; pseudo: string }>; dense: boolean }) {
  return (
    <div className={`flex min-h-0 flex-wrap content-start overflow-hidden ${dense ? 'gap-2.5' : 'gap-3'}`}>
      {names.map((p) => (
        <span key={p.id} className={`anim-pop ia-px ia-px--ghost inline-flex items-center ${dense ? 'gap-3 px-4 py-2' : 'gap-4 px-5 py-2.5'}`}>
          <Invader seed={p.id} scale={dense ? 2 : 3} className={invaderTone(p.id)} />
          <span className={`ia-display text-white ${dense ? 'text-3xl' : 'text-4xl'}`}>{p.pseudo}</span>
        </span>
      ))}
    </div>
  );
}

/** grand compte à rebours de borne (inscriptions) */
export function BigCountdown({
  endsAt,
  now,
  waiting,
  waitingSub = 'Il faut au moins deux inscrits pour lancer le tournoi',
  label = 'Départ dans',
  digits = 'text-[8.5rem]',
}: {
  endsAt: number | null;
  now: number;
  waiting: boolean;
  waitingSub?: string;
  label?: string;
  digits?: string;
}) {
  if (waiting || !endsAt) {
    return (
      <div className="ia-px ia-px--lg ia-px--amber inline-flex flex-col gap-3 px-10 py-7">
        <p className="ia-pixel ia-blink text-3xl text-ia-gold">En attente de joueurs</p>
        <p className="text-2xl text-ia-soft">{waitingSub}</p>
      </div>
    );
  }
  const reste = Math.max(0, endsAt - now);
  if (reste <= 0) {
    return (
      <div className="ia-px ia-px--lg ia-px--gold ia-glow-gold inline-flex items-center gap-6 px-10 py-7">
        <PixelSprite sprite={HOURGLASS} scale={7} className="text-ia-gold" />
        <p className="ia-pixel ia-blink text-5xl text-ia-gold">Tirage imminent !</p>
      </div>
    );
  }
  const s = Math.floor(reste / 1000);
  const urgent = reste <= 10_000;
  return (
    <div className={`ia-px ia-px--lg inline-flex flex-col gap-4 px-10 py-6 ${urgent ? 'ia-px--red ia-glow-red' : 'ia-px--cyan'}`}>
      <span className={`ia-pixel text-3xl ${urgent ? 'text-ia-red' : 'text-ia-cyan'}`}>{label}</span>
      <span key={urgent ? s : 'n'} className={`ia-pixel leading-none tabular-nums ${digits} ${urgent ? 'anim-pop text-white' : 'text-white ia-neon'}`}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salle d'attente
// ---------------------------------------------------------------------------

/**
 * Salle d'attente commune (échecs et salves) : titre chromé, compte à
 * rebours de borne, inscrits en « sélection du joueur », et les deux étapes
 * pour s'inscrire.
 */
export function LobbyScreen({
  state,
  now,
  qrText,
  summary,
}: {
  state: TournamentPublicState;
  now: number;
  qrText: string;
  summary: string;
}) {
  const actifs = state.players.filter((p) => p.status === 'active');
  const dense = actifs.length > 20;
  return (
    <div className="flex min-h-0 flex-1 gap-14 px-14 py-12">
      <div className="flex min-w-0 flex-1 flex-col">
        <EventChip state={state} big />
        <h1 className={`mt-7 text-balance leading-[1.08] ${chromeSize(state.title, ['text-[6.5rem]', 'text-[5.25rem]', 'text-[4.25rem]', 'text-[3.4rem]'])}`}>
          <Chrome>{state.title}</Chrome>
        </h1>
        <p className="mt-3 text-3xl text-ia-soft">{summary}</p>
        <div className="mt-9">
          <BigCountdown endsAt={state.phaseEndsAt} now={now} waiting={state.waitingForPlayers} />
        </div>
        <div className="mt-9 flex min-h-0 flex-1 flex-col">
          <p className="mb-5 flex items-baseline gap-4">
            <span className="ia-pixel text-6xl text-ia-cyan">{actifs.length}</span>
            <span className="ia-pixel text-3xl text-ia-soft">{actifs.length > 1 ? 'joueurs inscrits' : 'joueur inscrit'}</span>
          </p>
          {actifs.length === 0 ? (
            <p className="ia-pixel ia-blink text-3xl text-ia-pink">Sois le premier à t'inscrire !</p>
          ) : (
            <PlayerTags names={actifs} dense={dense} />
          )}
        </div>
      </div>
      <div className="flex w-[47rem] shrink-0 flex-col justify-center">
        <JoinSteps
          wifiSsid={state.config.wifiSsid}
          wifiPassword={state.config.wifiPassword}
          url={tournamentUrl(state.joinCode)}
          title="Scanne pour t'inscrire"
          text={qrText}
          code={state.joinCode}
          qrSize={250}
        />
      </div>
    </div>
  );
}


/** colonne de gauche des TV : jeu, titre chromé, message */
export function BarHeading({ state, message }: { state: TournamentPublicState; message: string }) {
  return (
    <>
      <EventChip state={state} big />
      <h1 className={`mt-6 text-balance leading-[1.08] ${chromeSize(state.title, ['text-[5.5rem]', 'text-[4.5rem]', 'text-[3.75rem]', 'text-[3rem]'])}`}>
        <Chrome>{state.title}</Chrome>
      </h1>
      <p className="mt-4 max-w-4xl text-3xl leading-snug text-ia-soft">{message}</p>
    </>
  );
}

