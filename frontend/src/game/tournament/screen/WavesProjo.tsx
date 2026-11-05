/**
 * Projecteur d'un tournoi en salves (Mario Kart, Smash Bros).
 * Les échecs restent sur TournamentProjo : on n'arrive ici que si format = waves.
 *
 * Une salve montre les groupes en cours en grand, et la file en bandeau.
 * Le barrage et le tableau n'affichent pas de points. La finale est un
 * vainqueur, avec un trophée léger.
 */

import type { ReactNode } from 'react';
import { pseudoOf, tournamentUrl } from '../tournamentClient';
import type { TBracketMatch, TWaveGroup, TournamentPublicState } from '../tournamentTypes';
import { EventChip, FeedToasts, JoinCorner, StandingsGrid } from './parts';
import { QrCanvas } from '../../ui/bits';

export default function WavesProjo({ state, now }: { state: TournamentPublicState; now: number }) {
  let body: ReactNode;
  if (state.phase === 'final' || state.ended) body = <Winner state={state} />;
  else if (state.phase === 'registration') body = <Lobby state={state} now={now} />;
  else if (state.phase === 'wave_done') body = <AfterWave state={state} />;
  else if (state.phase === 'bracket') body = <BracketBoard state={state} />;
  else body = <WaveBoard state={state} />;

  return (
    <div className="game-bg relative flex h-full w-full flex-col overflow-hidden text-white">
      {body}
      {state.phase !== 'final' && <FeedToasts state={state} />}
    </div>
  );
}

function salveLabel(state: TournamentPublicState): string {
  if (state.phase === 'registration') return 'Inscriptions';
  if (state.phase === 'barrage') return 'Barrage';
  if (state.phase === 'bracket') return 'Phase finale';
  if (state.phase === 'wave_done') return 'Salve terminée';
  const wave = state.waves[state.waves.length - 1];
  if (!wave) return 'En cours';
  const planned = state.config.plannedRounds;
  return planned ? `Salve ${wave.number}/${planned}` : `Salve ${wave.number}`;
}

function joinable(state: TournamentPublicState): boolean {
  if (state.phase === 'final' || state.phase === 'bracket') return false;
  return state.phase === 'registration' || state.config.lateJoin;
}

function Lobby({ state, now }: { state: TournamentPublicState; now: number }) {
  const reste = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : null;
  const mm = reste === null ? 0 : Math.floor(reste / 60_000);
  const ss = reste === null ? 0 : Math.floor((reste % 60_000) / 1000);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center px-16 py-10">
      <EventChip state={state} big />
      <h1 className="anim-title-glow mt-6 text-center text-7xl font-black">{state.title}</h1>
      <p className="mt-4 text-4xl font-black tabular-nums text-cyan-200">
        {state.waitingForPlayers || reste === null
          ? 'En attente de joueurs'
          : reste <= 0
            ? 'Tirage imminent'
            : `Départ dans ${mm}:${String(ss).padStart(2, '0')}`}
      </p>
      <p className="mt-2 text-2xl text-white/60">
        {state.playerCount} inscrit{state.playerCount > 1 ? 's' : ''}
      </p>
      <div className="mt-8 flex min-h-0 w-full flex-1 items-start justify-center gap-12">
        <div className="flex max-w-3xl flex-wrap content-start justify-center gap-3">
          {state.players.map((p) => (
            <span key={p.id} className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-3xl font-black">
              {p.pseudo}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-3 rounded-3xl border border-violet-400/40 bg-violet-500/10 px-8 py-6">
          <QrCanvas value={tournamentUrl(state.joinCode)} size={280} />
          <p className="font-mono text-5xl font-black tracking-[0.2em]">{state.joinCode}</p>
          <p className="text-xl text-violet-100">Un pseudo suffit</p>
        </div>
      </div>
    </div>
  );
}

function WaveBoard({ state }: { state: TournamentPublicState }) {
  const wave = state.waves[state.waves.length - 1];
  const groups = wave?.groups ?? [];
  const playing = groups.filter((g) => g.status === 'playing');
  const queued = groups.filter((g) => g.status === 'queued');
  const cols = playing.length <= 1 ? 1 : playing.length <= 4 ? 2 : 3;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-8 px-12 py-6">
        <div>
          <EventChip state={state} />
          <h1 className="mt-2 text-5xl font-black">{state.phase === 'barrage' ? 'Barrage' : salveLabel(state)}</h1>
        </div>
        {joinable(state) && <JoinCorner state={state} size={120} />}
      </header>
      <div className="grid min-h-0 flex-1 gap-6 px-12 pb-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {playing.map((g) => (
          <GroupCard key={g.id} state={state} group={g} />
        ))}
        {playing.length === 0 && (
          <p className="col-span-full self-center text-center text-4xl text-white/50">En attente du prochain groupe</p>
        )}
      </div>
      {(queued.length > 0 || (wave?.sitOuts.length ?? 0) > 0) && (
        <footer className="shrink-0 border-t border-white/10 px-12 py-4">
          {queued.length > 0 && (
            <p className="text-2xl text-white/70">
              <span className="mr-3 font-black uppercase tracking-[0.2em] text-amber-200">À suivre</span>
              {queued.map((g) => g.playerIds.map((id) => pseudoOf(state, id)).join(' · ')).join('   ·   ')}
            </p>
          )}
          {wave && wave.sitOuts.length > 0 && (
            <p className="mt-1 text-xl text-white/50">
              Ne joue pas cette salve : {wave.sitOuts.map((id) => pseudoOf(state, id)).join(', ')}
            </p>
          )}
        </footer>
      )}
    </div>
  );
}

function GroupCard({ state, group }: { state: TournamentPublicState; group: TWaveGroup }) {
  const ordered = group.places ?? group.playerIds;
  const smash = state.game === 'smash';
  return (
    <div className="flex min-h-0 flex-col justify-center rounded-[2rem] border border-cyan-300/40 bg-cyan-400/10 px-8 py-6">
      <p className="text-xl font-bold uppercase tracking-[0.25em] text-cyan-200">
        {group.status === 'queued' ? 'À suivre' : group.status === 'done' ? 'Terminé' : 'En cours'}
        {' · '}
        {String.fromCharCode(64 + group.board)}
      </p>
      <ul className="mt-3 space-y-2">
        {ordered.map((id, i) => (
          <li key={id} className={`flex items-baseline justify-between gap-4 font-black ${ordered.length > 3 ? 'text-4xl' : 'text-5xl'}`}>
            <span className="min-w-0 truncate">
              {group.places ? `${i + 1}. ` : ''}
              {pseudoOf(state, id)}
            </span>
            {group.counts && group.places && (
              <span className="shrink-0 tabular-nums text-amber-200">{group.points[id] ?? 0}</span>
            )}
            {!group.counts && smash && group.places && i === 0 && <span className="shrink-0 text-amber-200">gagne</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AfterWave({ state }: { state: TournamentPublicState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-12 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <EventChip state={state} />
          <h1 className="mt-2 text-5xl font-black">Classement</h1>
        </div>
        {joinable(state) && <JoinCorner state={state} />}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <StandingsGrid state={state} page={0} perPage={24} />
      </div>
    </div>
  );
}

function BracketBoard({ state }: { state: TournamentPublicState }) {
  const matches = state.bracket?.matches ?? [];
  const live = matches.filter((m) => m.status === 'pending' && m.playerIds.length >= 2);
  const later = matches.filter((m) => m.status === 'waiting' || m.playerIds.length < 2);
  const cols = live.length <= 1 ? 1 : live.length === 2 ? 2 : 2;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-12 py-8">
      <EventChip state={state} />
      <h1 className="mt-3 text-5xl font-black">Phase finale</h1>
      <div className="mt-6 grid min-h-0 flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}>
        {live.map((m) => (
          <BracketCard key={m.id} state={state} match={m} />
        ))}
      </div>
      {later.length > 0 && (
        <p className="mt-4 text-2xl text-white/50">
          Ensuite : {later.map((m) => m.label).join(' · ')}
        </p>
      )}
    </div>
  );
}

function BracketCard({ state, match }: { state: TournamentPublicState; match: TBracketMatch }) {
  const ordered = match.places ?? match.playerIds;
  const score = state.game === 'smash' && match.places && match.loserGames !== null ? `3-${match.loserGames}` : null;
  return (
    <div className="flex flex-col justify-center rounded-[2rem] border border-amber-300/40 bg-amber-300/10 px-8 py-6">
      <p className="text-2xl font-bold uppercase tracking-[0.2em] text-amber-200">{match.label}</p>
      {ordered.length === 0 ? (
        <p className="mt-4 text-4xl text-white/40">En attente des qualifiés</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {ordered.map((id, i) => (
            <li key={id} className="flex items-baseline justify-between text-5xl font-black">
              <span className="min-w-0 truncate">
                {match.places ? `${i + 1}. ` : ''}
                {pseudoOf(state, id)}
              </span>
              {score && i === 0 && <span className="text-amber-200">{score}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Winner({ state }: { state: TournamentPublicState }) {
  const id = state.bracketWinnerId ?? state.standings.find((s) => s.status !== 'excluded')?.playerId ?? null;
  const pseudo = id ? pseudoOf(state, id) : '';
  const line = state.config.texts.winner.replace(/#winner#/g, pseudo);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-16 text-center">
      <style>{'@keyframes invader-trophy { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }'}</style>
      <EventChip state={state} big />
      <div className="mt-8 text-[140px] leading-none" style={{ animation: 'invader-trophy 2.8s ease-in-out infinite' }} aria-hidden>
        🏆
      </div>
      <p className="mt-4 text-3xl font-bold uppercase tracking-[0.35em] text-amber-200">Vainqueur</p>
      <h1 className="anim-title-glow mt-2 max-w-full truncate text-8xl font-black">{pseudo || state.title}</h1>
      <p className="mt-8 max-w-5xl text-4xl text-white/80">{line}</p>
    </div>
  );
}
