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
import { EtapesConnexionVue } from '../../screen/ScreenApp';
import {
  currentRoundOf,
  fmtScore,
  formatSummary,
  pseudoOf,
  rankLabel,
  roundLabel,
  tournamentUrl,
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
  MatchCard,
  PodiumStep,
  ScreenProgress,
  StandingsGrid,
  TopBar,
  WaitingCard,
  matchLayout,
} from './parts';
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
  const rotation = projoView(state, now, cycle);
  const { view, key, endsAt } = rotation;
  // début de l'écran courant (progression) : mémorisé à chaque bascule
  const startRef = useRef<{ key: string; at: number }>({ key, at: now });
  if (startRef.current.key !== key) startRef.current = { key, at: now };

  return (
    <div className="game-bg relative flex h-full w-full flex-col overflow-hidden text-white">
      <div key={key} className="flex min-h-0 flex-1 flex-col">
        <ViewBody state={state} view={view} now={now} renderLive={renderLive} />
      </div>
      {/* le podium raconte seul la fin : pas de bandeaux par-dessus */}
      {view.kind !== 'final_podium' && view.kind !== 'final_standings' && <FeedToasts state={state} />}
      <ScreenProgress start={startRef.current.at} endsAt={endsAt} now={now} />
    </div>
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

function Countdown({ state, now }: { state: TournamentPublicState; now: number }) {
  if (state.waitingForPlayers || !state.phaseEndsAt) {
    return (
      <div className="anim-suspense rounded-3xl border border-amber-300/40 bg-amber-400/10 px-10 py-6 text-center">
        <p className="text-4xl font-black uppercase tracking-[0.2em] text-amber-200">En attente de joueurs</p>
        <p className="mt-2 text-2xl text-amber-100/70">Il faut au moins deux inscrits pour lancer la ronde 1</p>
      </div>
    );
  }
  const reste = Math.max(0, state.phaseEndsAt - now);
  if (reste <= 0) {
    return (
      <p className="anim-suspense text-6xl font-black uppercase tracking-[0.25em] text-amber-300">⏳ Tirage imminent !</p>
    );
  }
  const mm = Math.floor(reste / 60_000);
  const ss = Math.floor((reste % 60_000) / 1000);
  const urgent = reste <= 10_000;
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-2xl font-bold uppercase tracking-[0.3em] text-white/50">Début du tournoi dans</span>
      <span
        key={urgent ? ss : 'normal'}
        className={`rounded-3xl border-2 px-10 py-2 font-black tabular-nums leading-none ${
          urgent
            ? 'anim-pop border-rose-400/60 bg-rose-500/15 text-rose-200'
            : 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
        }`}
        style={{ fontSize: '9rem' }}
      >
        {mm}:{String(ss).padStart(2, '0')}
      </span>
    </div>
  );
}

function LobbyView({ state, now }: { state: TournamentPublicState; now: number }) {
  const actifs = state.players.filter((p) => p.status === 'active');
  const dense = actifs.length > 24;
  return (
    <div className="flex min-h-0 flex-1 gap-12 px-14 py-12">
      <div className="flex min-w-0 flex-1 flex-col">
        <EventChip state={state} big />
        <h1 className="anim-title-glow mt-5 text-balance text-8xl font-black leading-[1.05]">{state.title}</h1>
        <p className="mt-4 text-3xl text-white/60">{formatSummary(state)}</p>
        <div className="mt-10">
          <Countdown state={state} now={now} />
        </div>
        <div className="mt-10 flex min-h-0 flex-1 flex-col">
          <p className="mb-4 text-3xl font-bold">
            <span className="font-black text-cyan-300 tabular-nums">{actifs.length}</span>
            <span className="text-white/60"> inscrit{actifs.length > 1 ? 's' : ''}</span>
          </p>
          {actifs.length === 0 ? (
            <p className="text-2xl text-white/35">Sois le premier à t'inscrire !</p>
          ) : (
            <div className="flex min-h-0 flex-wrap content-start gap-3 overflow-hidden">
              {actifs.map((p) => (
                <span
                  key={p.id}
                  className={`anim-pop rounded-full border border-white/15 bg-white/5 font-bold ${dense ? 'px-5 py-2 text-2xl' : 'px-6 py-2.5 text-3xl'}`}
                >
                  {p.pseudo}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex w-[46rem] shrink-0 flex-col justify-center">
        <EtapesConnexionVue
          wifiSsid={state.config.wifiSsid}
          wifiPassword={state.config.wifiPassword}
          url={tournamentUrl(state.joinCode)}
          titreQr="Scanne pour t'inscrire"
          texteQr="Un pseudo, et tu es dans le tournoi."
          code={state.joinCode}
          qrSize={260}
        />
      </div>
    </div>
  );
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
    transition: 'opacity 380ms ease, transform 480ms cubic-bezier(0.3, 1.25, 0.4, 1)',
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col px-14 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold uppercase tracking-[0.35em] text-cyan-300">Tirage des matchs</p>
          <h1 className="anim-stomp text-9xl font-black leading-none">{roundLabel(state, round.number)}</h1>
        </div>
        <p className="max-w-2xl text-right text-2xl text-white/55">
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

function PageDots({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: pages }, (_, i) => (
        <span key={i} className={`h-3 rounded-full transition-all ${i === page ? 'w-10 bg-cyan-300' : 'w-3 bg-white/20'}`} />
      ))}
    </div>
  );
}

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
      <div className="flex min-h-0 flex-1 flex-col px-12 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-5xl font-black uppercase tracking-widest">
            {final ? '🏆 Classement final' : 'Classement'}
            {note && !final && <span className="ml-5 align-middle text-3xl font-bold normal-case tracking-normal text-amber-200">{note}</span>}
          </h2>
          <div className="flex items-center gap-6">
            <span className="text-2xl text-white/45">points · V / N / D</span>
            <PageDots page={page} pages={pages} />
          </div>
        </div>
        {state.standings.length === 0 ? (
          <p className="text-3xl text-white/40">Aucun joueur pour l'instant.</p>
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
      <div className="flex min-h-0 flex-1 flex-col px-12 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-5xl font-black uppercase tracking-widest">
            {finished ? `Résultats · ${roundLabel(state, round.number)}` : `Matchs · ${roundLabel(state, round.number)}`}
          </h2>
          <PageDots page={page} pages={pages} />
        </div>
        {finished && (
          <div className="anim-pop mb-5 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-8 py-4 text-3xl font-black text-amber-100">
            ✅ Ronde {round.number} terminée · la suite arrive, restez dans le coin !
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
            <div className="w-[70rem]">
              <MatchCard state={state} m={pinnedMatch} size="lg" />
              <p className="mt-6 text-center text-3xl text-white/50">
                {pinnedMatch.status === 'done' || pinnedMatch.status === 'cancelled'
                  ? 'Match terminé.'
                  : pinnedMatch.games.length > 0
                    ? 'La partie suivante va commencer.'
                    : "La partie n'a pas encore commencé."}
              </p>
            </div>
          ) : (
            <p className="text-4xl text-white/40">Aucune partie en cours pour l'instant.</p>
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
          <span className="anim-suspense rounded-full border border-rose-400/60 bg-rose-500/20 px-6 py-2 text-3xl font-black uppercase tracking-[0.25em] text-rose-100">
            ● En direct
          </span>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <p className="mb-4 text-3xl font-bold text-white/60">
          Match {m.board} · {pseudoOf(state, m.a)} contre {pseudoOf(state, m.b)}
          {m.kind === 'floater' && <span className="ml-3 text-violet-300">(partie bonus)</span>}
          {state.config.match.games > 1 && (
            <span className="ml-3 text-cyan-300">
              score du match {fmtScore(m.score.a)}-{fmtScore(m.score.b)}
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
      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
        <p className="text-4xl font-black tabular-nums text-cyan-300">{fmtScore(s.points)} pts</p>
        {state.standings.some((x) => x.played > 0) && (
          <p className="text-xl font-bold text-white/55">{rankLabel(s.rank)} au classement</p>
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
        fallback={<p className="text-3xl text-white/40">Chargement de la partie...</p>}
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
      <div className="anim-pop rounded-3xl border-2 border-emerald-300/60 bg-black/80 px-14 py-8 text-center shadow-2xl backdrop-blur">
        <p className="text-7xl font-black text-emerald-200">{winner ? `${winner} gagne !` : 'Partie nulle'}</p>
        <p className="mt-2 text-3xl font-bold text-white/60">{REASON_LABELS[r.reason] ?? r.reason}</p>
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
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-12">
      {premier && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-4xl"
              style={{
                left: `${(i * 37) % 100}%`,
                animation: `game-confetti-fall ${5 + (i % 5)}s linear ${(i % 10) * 0.5}s infinite`,
              }}
            >
              {['🎉', '✨', '🏆', '♞'][i % 4]}
            </span>
          ))}
        </div>
      )}
      <EventChip state={state} big />
      <h1 className="mt-4 text-center text-7xl font-black uppercase tracking-widest">Classement final</h1>
      <p
        className="mt-4 min-h-[5rem] text-balance text-center text-5xl font-black text-amber-200"
        style={{ opacity: premier ? 1 : 0, transition: 'opacity 600ms ease' }}
      >
        {winnerText}
      </p>
      <div className="mt-10 flex items-end gap-10">
        <PodiumStep s={second} place={2} visible={elapsed >= PODIUM_T2} />
        <PodiumStep s={first} place={1} visible={premier} />
        <PodiumStep s={third} place={3} visible={elapsed >= PODIUM_T3} />
      </div>
    </div>
  );
}

