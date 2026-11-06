/**
 * Projecteur pendant un tournoi : corps PUR (état + horloge), monté tel quel
 * par ScreenApp et par le laboratoire.
 *
 *   inscriptions : titre, format, grand compte à rebours, inscrits, QR
 *   tirage       : « Ronde N », les matchs révélés un par un
 *   ronde        : classement 30 s / matchs 30 s / match en direct 3 min
 *   fin de ronde : résultats et classement en alternance
 *   final        : podium dévoilé, puis classement complet
 */

import { useMemo, useRef, useState } from 'react';
import {
  currentRoundOf,
  fmtScore,
  formatSummary,
  pseudoOf,
  rankLabel,
  roundLabel,
} from '../tournamentClient';
import type { TournamentPublicState, TRound } from '../tournamentTypes';
import {
  DRAW_INTRO_MS,
  DRAW_STEP_MS,
  MATCHES_PER_PAGE,
  STANDINGS_PER_PAGE,
  projoView,
  type RoundCycle,
  stableHash,
  type LiveCandidate,
  type ProjoView,
} from './rotation';
import {
  EventChip,
  FeedToasts,
  LobbyScreen,
  MatchCard,
  PageDots,
  PodiumStep,
  ScreenProgress,
  SectionHead,
  StandingsGrid,
  StandingsLegend,
  TopBar,
  WaitingCard,
  matchLayout,
} from './parts';
import WavesProjo from './WavesProjo';
import { ArcadeStage, Chrome, PixelConfetti } from '../arcade/kit';
import { CHECK, CUP, PixelSprite } from '../arcade/pixel';
import { LiveChessBoard } from '../../../tables/games/chess/components/SpectatorBoard';
import type { ChessColor, ChessPublicState } from '../../../tables/games/chess/lib/chessTypes';

export interface TournamentProjoProps {
  state: TournamentPublicState;
  now: number;
  /**
   * Rendu de la partie en direct. Injecté : le labo le remplace par un
   * plateau factice, le vrai projecteur par une partie suivie en temps réel.
   */
  renderLive?: (candidate: LiveCandidate, state: TournamentPublicState) => React.ReactNode;
}

export default function TournamentProjo({ state, now, renderLive }: TournamentProjoProps) {
  // position du tour de ronde, gardée d'un rendu à l'autre (cf. rotation.ts)
  const cycle = useRef<RoundCycle | null>(null);
  const startRef = useRef<{ key: string; at: number }>({ key: 'lobby', at: now });
  if (state.format === 'waves') return <WavesProjo state={state} now={now} />;
  const rotation = projoView(state, now, cycle);
  const { view, key, endsAt } = rotation;
  if (startRef.current.key !== key) startRef.current = { key, at: now };

  const lobby = view.kind === 'lobby' || view.kind === 'final_podium';
  return (
    <ArcadeStage className="flex h-full w-full flex-col overflow-hidden" floor={lobby ? 0.22 : 0.14} floorOpacity={lobby ? 0.45 : 0.25}>
      <div key={key} className="flex min-h-0 flex-1 flex-col">
        <ViewBody state={state} view={view} now={now} renderLive={renderLive} />
      </div>
      {/* le podium raconte seul la fin : pas de bandeaux par-dessus */}
      {view.kind !== 'final_podium' && view.kind !== 'final_standings' && <FeedToasts state={state} />}
      <ScreenProgress start={startRef.current.at} endsAt={endsAt} now={now} />
    </ArcadeStage>
  );
}

function ViewBody({
  state,
  view,
  now,
  renderLive,
}: {
  state: TournamentPublicState;
  view: ProjoView;
  now: number;
  renderLive?: TournamentProjoProps['renderLive'];
}) {
  switch (view.kind) {
    case 'lobby':
      return <LobbyView state={state} now={now} />;
    case 'draw':
      return <DrawView state={state} round={view.round} elapsed={view.elapsed} />;
    case 'standings':
      return <StandingsView state={state} page={view.page} pages={view.pages} note={view.note} />;
    case 'round':
      return <RoundView state={state} round={view.round} page={view.page} pages={view.pages} />;
    case 'live':
      return (
        <LiveView
          state={state}
          candidates={view.candidates}
          slotKey={view.slotKey}
          pinnedMatchId={view.pinnedMatchId}
          renderLive={renderLive}
        />
      );
    case 'final_podium':
      return <FinalPodium state={state} elapsed={view.elapsed} />;
    case 'final_standings':
      return <StandingsView state={state} page={view.page} pages={view.pages} note="Classement final" final />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Inscriptions
// ---------------------------------------------------------------------------

function LobbyView({ state, now }: { state: TournamentPublicState; now: number }) {
  return <LobbyScreen state={state} now={now} qrText="Un pseudo, et tu es dans le tournoi." summary={formatSummary(state)} />;
}

// ---------------------------------------------------------------------------
// Tirage
// ---------------------------------------------------------------------------

function DrawView({ state, round, elapsed }: { state: TournamentPublicState; round: TRound; elapsed: number }) {
  const matches = round.matches;
  const layout = matchLayout(matches.length + (round.waiting ? 1 : 0));
  const revealAt = (i: number) => DRAW_INTRO_MS + i * DRAW_STEP_MS;
  const extraIndex = matches.length;
  const appear = (i: number): React.CSSProperties => ({
    opacity: elapsed >= revealAt(i) ? 1 : 0,
    transform: elapsed >= revealAt(i) ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
    transition: 'opacity 300ms steps(4, end), transform 420ms steps(5, end)',
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col px-14 py-10">
      <div className="mb-8 flex items-end justify-between gap-10">
        <div>
          <p className="ia-pixel text-4xl text-ia-cyan">Tirage des matchs</p>
          <h1 className="ia-zoom mt-4 text-[9rem] leading-none">
            <Chrome>{roundLabel(state, round.number)}</Chrome>
          </h1>
        </div>
        <p className="max-w-2xl text-right text-3xl leading-snug text-ia-soft">
          {round.number === 1 ? 'Premier tour tiré au sort.' : 'Les premiers du classement s’affrontent : 1 contre 2, 3 contre 4...'}
        </p>
      </div>
      <div
        className={`grid min-h-0 flex-1 content-start ${layout.size === 'sm' ? 'gap-2.5' : 'gap-4'} ${layout.cols === 1 ? 'px-40' : ''}`}
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
      >
        {matches.map((m, i) => (
          <MatchCard key={m.id} state={state} m={m} size={layout.size} style={appear(i)} />
        ))}
        {round.waiting && <WaitingCard state={state} playerId={round.waiting} size={layout.size} style={appear(extraIndex)} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement / matchs de la ronde
// ---------------------------------------------------------------------------

function StandingsView({
  state,
  page,
  pages,
  note,
  final = false,
}: {
  state: TournamentPublicState;
  page: number;
  pages: number;
  note: string | null;
  final?: boolean;
}) {
  return (
    <>
      <TopBar state={state} />
      <div className="flex min-h-0 flex-1 flex-col px-12 pb-8 pt-6">
        <SectionHead
          icon={<PixelSprite sprite={CUP} scale={4} className="text-ia-gold" />}
          title={final ? 'Classement final' : 'Classement'}
          note={note && !final ? note : undefined}
          right={
            <div className="flex items-center gap-10">
              <StandingsLegend />
              <PageDots page={page} pages={pages} />
            </div>
          }
        />
        {state.standings.length === 0 ? (
          <p className="ia-pixel text-2xl text-ia-muted">Aucun joueur pour l'instant.</p>
        ) : (
          <StandingsGrid state={state} page={page} perPage={STANDINGS_PER_PAGE} revealFrom />
        )}
      </div>
    </>
  );
}

function RoundView({ state, round, page, pages }: { state: TournamentPublicState; round: TRound; page: number; pages: number }) {
  const all = round.matches;
  const shown = all.slice(page * MATCHES_PER_PAGE, (page + 1) * MATCHES_PER_PAGE);
  const withWaiting = page === pages - 1 && round.waiting ? 1 : 0;
  const finished = state.phase === 'round_done';
  // le bandeau de fin de ronde prend une rangée : on compte large
  const layout = matchLayout(shown.length + withWaiting + (finished ? 2 : 0), 2);
  return (
    <>
      <TopBar state={state} />
      <div className="flex min-h-0 flex-1 flex-col px-12 pb-8 pt-6">
        <SectionHead
          title={finished ? `Résultats · ${roundLabel(state, round.number)}` : `Matchs · ${roundLabel(state, round.number)}`}
          right={<PageDots page={page} pages={pages} />}
        />
        {finished && (
          <div className="anim-pop ia-px ia-px--lg ia-px--gold mb-5 flex items-center gap-6 px-8 py-4">
            <PixelSprite sprite={CHECK} scale={5} className="text-ia-gold" />
            <p className="ia-pixel text-3xl leading-snug text-ia-gold">
              Ronde {round.number} terminée · la suite arrive, restez dans le coin !
            </p>
          </div>
        )}
        <div
          className={`grid min-h-0 flex-1 content-start gap-x-6 ${layout.size === 'sm' ? 'gap-y-2.5' : 'gap-y-3'} ${layout.cols === 1 ? 'px-32' : ''}`}
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
        >
          {shown.map((m, i) => (
            <div key={m.id} className="anim-fade-up" style={{ animationDelay: `${Math.min(i * 0.06, 0.9)}s` }}>
              <MatchCard state={state} m={m} size={layout.size} />
            </div>
          ))}
          {withWaiting > 0 && round.waiting && <WaitingCard state={state} playerId={round.waiting} size={layout.size} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Match en direct
// ---------------------------------------------------------------------------

/**
 * Choix de la partie montrée pendant le créneau : elle reste la même tant
 * qu'elle est montrable (en cours, ou finie depuis moins de 10 s), même si
 * d'autres parties démarrent entre-temps.
 */
function useStickyCandidate(candidates: LiveCandidate[], slotKey: string, pinnedMatchId: string | null): LiveCandidate | null {
  const chosen = useRef<{ slot: string; ref: string } | null>(null);
  if (pinnedMatchId) {
    const pinned = candidates.find((c) => c.match.id === pinnedMatchId);
    if (pinned) return pinned;
  }
  if (candidates.length === 0) return null;
  const current = chosen.current;
  if (current && current.slot === slotKey) {
    const still = candidates.find((c) => c.ref === current.ref);
    if (still) return still;
  }
  // parties en cours d'abord ; tirage stable par créneau
  const live = candidates.filter((c) => !c.finished);
  const pool = live.length > 0 ? live : candidates;
  const pick = pool[stableHash(slotKey) % pool.length];
  chosen.current = { slot: slotKey, ref: pick.ref };
  return pick;
}

function LiveView({
  state,
  candidates,
  slotKey,
  pinnedMatchId,
  renderLive,
}: {
  state: TournamentPublicState;
  candidates: LiveCandidate[];
  slotKey: string;
  pinnedMatchId: string | null;
  renderLive?: TournamentProjoProps['renderLive'];
}) {
  const cand = useStickyCandidate(candidates, slotKey, pinnedMatchId);
  const round = currentRoundOf(state);
  const pinnedMatch = pinnedMatchId ? round?.matches.find((m) => m.id === pinnedMatchId) ?? null : null;
  if (!cand) {
    return (
      <>
        <TopBar state={state} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-12">
          {pinnedMatch ? (
            <div className="w-[76rem]">
              <MatchCard state={state} m={pinnedMatch} size="lg" />
              <p className="ia-pixel mt-8 text-center text-3xl text-ia-soft">
                {pinnedMatch.status === 'done' || pinnedMatch.status === 'cancelled'
                  ? 'Match terminé.'
                  : pinnedMatch.games.length > 0
                    ? 'La partie suivante va commencer.'
                    : "La partie n'a pas encore commencé."}
              </p>
            </div>
          ) : (
            <p className="ia-pixel text-4xl text-ia-muted">Aucune partie en cours pour l'instant.</p>
          )}
        </div>
      </>
    );
  }
  const m = cand.match;
  return (
    <>
      <TopBar
        state={state}
        right={
          <span className="ia-px ia-px--lg ia-px--red ia-glow-red inline-flex items-center gap-4 px-6 py-4">
            <span className="ia-blink inline-block h-5 w-5 bg-ia-red" />
            <span className="ia-pixel text-3xl text-white">En direct</span>
          </span>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <p className="mb-5 flex items-center gap-5 text-3xl">
          <span className="ia-pixel text-2xl text-ia-muted">Match {m.board}</span>
          <span className="ia-display text-5xl text-white">{pseudoOf(state, m.a)}</span>
          <span className="ia-pixel text-2xl italic text-ia-pink" style={{ textShadow: '2px 2px 0 #33e2ff' }}>VS</span>
          <span className="ia-display text-5xl text-white">{pseudoOf(state, m.b)}</span>
          {m.kind === 'floater' && <span className="ia-pixel text-xl text-ia-violet">partie bonus</span>}
          {state.config.match.games > 1 && (
            <span className="ia-pixel text-2xl text-ia-cyan">
              match {fmtScore(m.score.a)}-{fmtScore(m.score.b)}
            </span>
          )}
        </p>
        {renderLive ? renderLive(cand, state) : <DefaultLiveChess candidate={cand} state={state} />}
      </div>
    </>
  );
}

/** vraie partie suivie en temps réel (écran du bar) */
function DefaultLiveChess({ candidate, state }: { candidate: LiveCandidate; state: TournamentPublicState }) {
  const [chess, setChess] = useState<ChessPublicState | null>(null);
  const ranks = useMemo(() => new Map(state.standings.map((s) => [s.pseudo.toLowerCase(), s])), [state.standings]);
  const extra = (side: ChessColor) => {
    const seat = chess?.seats[side];
    const s = seat ? ranks.get(seat.pseudo.toLowerCase()) : undefined;
    if (!s) return null;
    return (
      <div className="ia-px ia-px--deep px-4 py-3 text-center">
        <p className="ia-display text-5xl tabular-nums text-ia-cyan">{fmtScore(s.points)} pts</p>
        {state.standings.some((x) => x.played > 0) && (
          <p className="ia-pixel mt-1 text-lg text-ia-soft">{rankLabel(s.rank)} au classement</p>
        )}
      </div>
    );
  };
  return (
    <div className="relative">
      <LiveChessBoard
        chessId={candidate.ref}
        boardSize={720}
        panelWidth={330}
        onState={setChess}
        panelExtra={extra}
        fallback={<p className="ia-pixel ia-blink text-3xl text-ia-muted">Chargement de la partie...</p>}
      />
      {chess?.result && <ResultBanner chess={chess} />}
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  checkmate: 'échec et mat',
  resign: 'abandon',
  timeout: 'au temps',
  stalemate: 'pat',
  repetition: 'répétition',
  fifty_moves: 'règle des 50 coups',
  insufficient_material: 'matériel insuffisant',
  timeout_vs_insufficient: 'temps contre matériel insuffisant',
  draw_agreed: 'nulle acceptée',
};

export function ResultBanner({ chess }: { chess: Pick<ChessPublicState, 'result' | 'seats'> }) {
  const r = chess.result;
  if (!r) return null;
  const winner = r.winner ? chess.seats[r.winner]?.pseudo ?? '?' : null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className={`ia-zoom ia-px ia-px--lg ${winner ? 'ia-px--mint ia-glow-mint' : 'ia-px--amber'} px-14 py-9 text-center`}>
        <p className={`ia-display text-[7rem] leading-none ${winner ? 'text-ia-mint' : 'text-ia-amber'}`}>{winner ? `${winner} gagne !` : 'Partie nulle'}</p>
        <p className="ia-pixel mt-4 text-3xl text-ia-soft">{REASON_LABELS[r.reason] ?? r.reason}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final
// ---------------------------------------------------------------------------

const PODIUM_T3 = 1_500;
const PODIUM_T2 = 4_000;
const PODIUM_T1 = 8_000;

function FinalPodium({ state, elapsed }: { state: TournamentPublicState; elapsed: number }) {
  const ranked = state.standings.filter((s) => s.status !== 'excluded');
  const [first, second, third] = [ranked[0], ranked[1], ranked[2]];
  const winnerText = state.config.texts.winner.replace(/#winner#/g, first?.pseudo ?? '');
  const premier = elapsed >= PODIUM_T1;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-end px-12 pb-0 pt-10">
      {premier && <PixelConfetti count={40} size={16} />}
      <EventChip state={state} big />
      <h1 className="mt-5 text-center text-7xl">
        <Chrome>Classement final</Chrome>
      </h1>
      <p
        className="mt-4 min-h-[4.5rem] text-balance text-center text-6xl"
        style={{ opacity: premier ? 1 : 0, transition: 'opacity 500ms steps(5, end)' }}
      >
        <Chrome gold>{winnerText}</Chrome>
      </p>
      <div className="mt-4 flex items-end gap-12">
        <PodiumStep s={second} place={2} visible={elapsed >= PODIUM_T2} />
        <PodiumStep s={first} place={1} visible={premier} />
        <PodiumStep s={third} place={3} visible={elapsed >= PODIUM_T3} />
      </div>
    </div>
  );
}
