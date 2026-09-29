/**
 * Laboratoire du TOURNOI : chaque écran (projecteur, TV du bar, téléphone,
 * console, pastilles des tables) monté avec des états factices, sans aucune
 * session réelle. Branché dans /game-lab (jeu « Tournoi »).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import TournamentProjo, { ResultBanner } from '../tournament/screen/TournamentProjo';
import TournamentBar from '../tournament/screen/TournamentBar';
import { TournamentPlayerScreen } from '../tournament/player/TournamentPlayerApp';
import { TournamentGmBody } from '../../components/Tournament/TournamentGmBody';
import TemplateForm, { mergeConfig } from '../../components/Tournament/TemplateForm';
import { SpectatorBoardView } from '../../tables/games/chess/components/SpectatorBoard';
import {
  LobbyTournamentChip,
  TournamentGameBadge,
  TournamentPseudoHint,
  TournamentResultLine,
} from '../../tables/games/chess/components/TournamentBadge';
import type { ChessTournamentContext, TournamentLookup } from '../../tables/games/chess/lib/tournamentLookup';
import { pseudoOf } from '../tournament/tournamentClient';
import type { LiveCandidate } from '../tournament/screen/rotation';
import type { TournamentPublicState } from '../tournament/tournamentTypes';
import {
  TOURNAMENT_SCENARIOS,
  TOURNAMENT_SURFACES,
  labChessState,
  labGmState,
  type TournamentLabScenario,
} from './labTournamentFixtures';

export function TournamentScenarioList({ selected, onSelect }: { selected: string; onSelect: (cle: string) => void }) {
  return (
    <>
      {TOURNAMENT_SURFACES.map((surface) => {
        const list = TOURNAMENT_SCENARIOS.filter((s) => s.surface === surface.cle);
        if (list.length === 0) return null;
        return (
          <div key={surface.cle} className="mt-4">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-white/35">{surface.label}</p>
            <div className="flex flex-col gap-1">
              {list.map((s) => (
                <button
                  key={s.cle}
                  type="button"
                  onClick={() => onSelect(s.cle)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    s.cle === selected ? 'bg-cyan-400/15 text-cyan-200' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {s.label}
                  <span className="block text-[11px] font-normal text-white/35">{s.description}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function tournamentScenario(cle: string): TournamentLabScenario {
  return TOURNAMENT_SCENARIOS.find((s) => s.cle === cle) ?? TOURNAMENT_SCENARIOS[0];
}

/** plateau factice du « match en direct » (aucune partie réelle derrière) */
function labRenderLive(candidate: LiveCandidate, state: TournamentPublicState, now: number) {
  const white = candidate.match.colorA === 'b' ? pseudoOf(state, candidate.match.b) : pseudoOf(state, candidate.match.a);
  const black = candidate.match.colorA === 'b' ? pseudoOf(state, candidate.match.a) : pseudoOf(state, candidate.match.b);
  const chess = labChessState(white, black, now, candidate.finished);
  return (
    <div className="relative">
      <SpectatorBoardView state={chess} boardSize={760} panelWidth={330} />
      {chess.result && <ResultBanner chess={chess} />}
    </div>
  );
}

export function TournamentLabScene({
  scenario,
  sautMs,
  phoneHeight,
  gmPhone,
}: {
  scenario: TournamentLabScenario;
  sautMs: number;
  phoneHeight: number;
  gmPhone: boolean;
}) {
  const [anchor] = useState(() => Date.now());
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const now = tick + sautMs;
  const state = useMemo(() => scenario.state(anchor), [scenario, anchor]);

  switch (scenario.surface) {
    case 'projo':
      return (
        <CadreLarge>
          <TournamentProjo state={state} now={now} renderLive={(c, s) => labRenderLive(c, s, anchor)} />
        </CadreLarge>
      );
    case 'bar':
      return (
        <CadreLarge>
          <TournamentBar state={state} now={now} />
        </CadreLarge>
      );
    case 'joueur': {
      const you = scenario.you ? state.players.find((p) => p.id === scenario.you) : null;
      return (
        <CadrePhone hauteur={phoneHeight}>
          <div className="game-bg flex h-full flex-col overflow-hidden text-white">
            <TournamentPlayerScreen
              state={state}
              you={you ? { playerId: you.id, pseudo: you.pseudo, status: you.status } : null}
              busy={false}
              error={null}
              notice={null}
              onJoin={() => undefined}
              onLeave={() => undefined}
              onRejoin={() => undefined}
              initialTab={scenario.tab}
            />
          </div>
        </CadrePhone>
      );
    }
    case 'gm': {
      const body =
        scenario.cle === 't-gm-formulaire' ? (
          <div className="px-3 py-4">
            <TemplateForm
              initial={{ name: "Tournoi d'échecs du jeudi", config: mergeConfig({ title: "Tournoi d'échecs du jeudi" }) }}
              busy={false}
              isEdit={false}
              onSave={() => undefined}
              onLaunch={() => undefined}
              onCancel={() => undefined}
            />
          </div>
        ) : (
          <TournamentGmBody state={labGmState(state)} busy={false} action={async () => undefined} onRefresh={() => undefined} onClosed={() => undefined} />
        );
      if (gmPhone) {
        return (
          <div className="flex justify-center overflow-x-auto">
            <div className="w-[375px] shrink-0 overflow-y-auto rounded-[2rem] border-4 border-white/15 bg-slate-950 text-slate-100 shadow-2xl" style={{ height: 812 }}>
              {body}
            </div>
          </div>
        );
      }
      return <div className="rounded-xl border-2 border-white/15 bg-slate-950 text-slate-100 shadow-2xl">{body}</div>;
    }
    case 'table':
      return (
        <CadreLarge>
          <TablesGallery state={state} />
        </CadreLarge>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Pastilles des tables d'échecs
// ---------------------------------------------------------------------------

function lookup(over: Partial<TournamentLookup> & Pick<TournamentLookup, 'hint'>): TournamentLookup {
  return {
    tournament: { id: 'lab', joinCode: 'ECHC', title: "Tournoi d'échecs du jeudi", phase: 'round', round: 3, gameLabel: 'Échecs' },
    player: { id: 'p9', pseudo: 'Alex', exact: true, status: 'active', rank: 4, points: 4 },
    match: { id: 'r3m3', board: 3, kind: 'normal', opponent: 'Hugo', color: 'w', status: 'pending', score: { me: 0, them: 0 }, games: 0, countsForMe: true },
    opponentCheck: null,
    ...over,
  };
}

function ctx(over: Partial<ChessTournamentContext>): ChessTournamentContext {
  return {
    tournament: { id: 'lab', title: "Tournoi d'échecs du jeudi", round: 3 },
    counted: false,
    pending: true,
    reason: null,
    match: { id: 'r3m3', board: 3, kind: 'normal', status: 'playing', decided: false, score: { w: 0, b: 0 }, points: null, remaining: 1 },
    ...over,
  };
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/12 bg-table-bg-elev/80 p-5">
      <p className="mb-3 font-display text-sm uppercase tracking-[0.25em] text-table-cyan/85">{titre}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function TablesGallery({ state }: { state: TournamentPublicState }) {
  const seats = { w: { pseudo: 'Alex', device: 'TABLE03-1' }, b: { pseudo: 'Hugo', device: 'TABLE03-2' } };
  const [typed, setTyped] = useState('alex');
  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-hidden bg-table-bg px-12 py-10 text-table-ink">
      <h1 className="font-display text-4xl uppercase tracking-wider">Tables d'échecs · pastilles tournoi ({state.title})</h1>
      <div className="grid flex-1 grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          <Bloc titre="Créer une partie : pseudo saisi">
            <div className="flex items-stretch gap-3">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/40 px-5 py-3.5 text-xl text-table-ink outline-none"
              />
              <TournamentPseudoHint
                lookup={lookup({ hint: 'play', player: { id: 'p9', pseudo: 'Alex', exact: typed === 'Alex', status: 'active', rank: 4, points: 4 } })}
                onUsePseudo={setTyped}
                className="w-[30rem] shrink-0"
              />
            </div>
            <TournamentPseudoHint lookup={lookup({ hint: 'play', match: { ...lookup({ hint: 'play' }).match!, color: 'b', opponent: 'Zoé' } })} />
            <TournamentPseudoHint lookup={lookup({ hint: 'wait_bye', match: null })} />
            <TournamentPseudoHint lookup={lookup({ hint: 'bonus', match: { ...lookup({ hint: 'bonus' }).match!, kind: 'floater', opponent: 'Mia', countsForMe: false } })} />
          </Bloc>
          <Bloc titre="Rejoindre une partie">
            <TournamentPseudoHint lookup={lookup({ hint: 'play', opponentCheck: { pseudo: 'Hugo', counts: true, expected: 'Hugo' } })} />
            <TournamentPseudoHint lookup={lookup({ hint: 'play', opponentCheck: { pseudo: 'Nina', counts: false, expected: 'Hugo' } })} />
          </Bloc>
        </div>
        <div className="flex flex-col gap-6">
          <Bloc titre="En partie (panneau de joueur)">
            <div className="w-[330px]">
              <TournamentGameBadge ctx={ctx({})} />
            </div>
            <div className="w-[330px]">
              <TournamentGameBadge ctx={ctx({ match: { ...ctx({}).match!, kind: 'floater' } })} />
            </div>
          </Bloc>
          <Bloc titre="Récap de fin de partie">
            <TournamentResultLine
              ctx={ctx({ counted: true, pending: false, match: { ...ctx({}).match!, status: 'done', decided: true, score: { w: 1, b: 0 }, points: { w: 2, b: 0 }, remaining: 0 } })}
              state={{ seats, result: { winner: 'w', reason: 'checkmate' } }}
            />
            <TournamentResultLine
              ctx={ctx({ counted: true, pending: false, match: { ...ctx({}).match!, status: 'pending', decided: false, score: { w: 1, b: 0 }, points: null, remaining: 2 } })}
              state={{ seats, result: { winner: 'w', reason: 'resign' } }}
            />
            <TournamentResultLine ctx={ctx({})} state={{ seats, result: { winner: null, reason: 'draw_agreed' } }} />
            <TournamentResultLine ctx={ctx({ pending: false, reason: 'not_paired' })} state={{ seats, result: { winner: 'b', reason: 'timeout' } }} />
          </Bloc>
          <Bloc titre="Lobby : carte d'une partie en attente">
            <div className="flex items-center gap-3 text-sm text-table-ink-soft">
              <span className="rounded-full bg-white/8 px-2.5 py-0.5 font-display uppercase tracking-wider">5+0</span>
              <LobbyTournamentChip opponent="Hugo" />
            </div>
          </Bloc>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cadres (mêmes règles que ceux du labo quiz)
// ---------------------------------------------------------------------------

function CadrePhone({ children, hauteur }: { children: React.ReactNode; hauteur: number }) {
  return (
    <div className="flex justify-center overflow-x-auto">
      <div className="w-[375px] shrink-0 overflow-hidden rounded-[2rem] border-4 border-white/15 bg-black shadow-2xl" style={{ height: hauteur }}>
        {children}
      </div>
    </div>
  );
}

function CadreLarge({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const mesurer = () => {
      const w = ref.current?.clientWidth ?? 960;
      setScale(Math.min(1, w / 1920));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);
  return (
    <div ref={ref} className="w-full">
      <div className="overflow-hidden rounded-xl border-2 border-white/15 shadow-2xl" style={{ width: 1920 * scale, height: 1080 * scale }}>
        <div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
}
