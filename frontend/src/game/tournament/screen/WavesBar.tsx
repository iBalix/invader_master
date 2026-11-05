/**
 * TV du comptoir pendant un tournoi en salves. Le QR reste tant qu'on peut
 * encore s'inscrire (jusqu'à la phase finale). Les groupes en cours et la
 * file sont lisibles de loin, plus denses que sur le projecteur.
 */

import { EtapesConnexionVue } from '../../screen/ScreenApp';
import { fmtScore, pseudoOf, tournamentUrl } from '../tournamentClient';
import type { TournamentPublicState } from '../tournamentTypes';
import { EventChip, PodiumStep } from './parts';

function joinable(state: TournamentPublicState): boolean {
  if (state.phase === 'bracket' || state.phase === 'final') return false;
  return state.phase === 'registration' || state.config.lateJoin;
}

export default function WavesBar({ state, now }: { state: TournamentPublicState; now: number }) {
  if (state.phase === 'final' || state.ended) return <Finale state={state} />;
  if (state.phase === 'registration') return <Inscriptions state={state} now={now} />;
  if (state.phase === 'bracket') return <Tableau state={state} />;
  return <Salve state={state} />;
}

function Inscriptions({ state, now }: { state: TournamentPublicState; now: number }) {
  const reste = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : null;
  const mm = reste === null ? 0 : Math.floor(reste / 60_000);
  const ss = reste === null ? 0 : Math.floor((reste % 60_000) / 1000);
  const ligne =
    state.waitingForPlayers || reste === null
      ? `${state.playerCount} inscrit${state.playerCount > 1 ? 's' : ''}`
      : reste <= 0
        ? 'Tirage imminent'
        : `Départ dans ${mm}:${String(ss).padStart(2, '0')}`;
  return (
    <div className="game-bg flex h-full flex-col items-center justify-center gap-6 overflow-hidden px-10 text-center text-white">
      <EventChip state={state} big />
      <h1 className="anim-title-glow text-balance text-7xl font-black">{state.title}</h1>
      <p className="max-w-4xl text-3xl text-white/70">Inscris-toi en deux étapes. Plusieurs personnes peuvent partager le même téléphone.</p>
      <EtapesConnexionVue
        wifiSsid={state.config.wifiSsid}
        wifiPassword={state.config.wifiPassword}
        url={tournamentUrl(state.joinCode)}
        titreQr="Scanne pour t'inscrire"
        texteQr="Un pseudo suffit."
        code={state.joinCode}
        qrSize={250}
      />
      <p className="rounded-full border border-white/15 bg-white/5 px-8 py-3 text-3xl font-bold">{ligne}</p>
    </div>
  );
}

function Salve({ state }: { state: TournamentPublicState }) {
  const wave = state.waves[state.waves.length - 1];
  const groups = wave?.groups ?? [];
  const open = joinable(state);
  return (
    <div className="game-bg flex h-full gap-8 overflow-hidden px-8 py-6 text-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <EventChip state={state} />
        <h1 className="mt-2 text-4xl font-black">{state.phase === 'barrage' ? 'Barrage' : state.phase === 'wave_done' ? 'Salve terminée' : 'En cours'}</h1>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 content-start gap-3">
          {groups.map((g) => {
            const hot = g.status === 'playing';
            const names = (g.places ?? g.playerIds).map((id) => pseudoOf(state, id));
            return (
              <div
                key={g.id}
                className={`rounded-2xl border px-4 py-3 ${hot ? 'border-cyan-300/60 bg-cyan-400/15' : 'border-white/10 bg-white/5'}`}
              >
                <p className={`text-sm font-bold uppercase tracking-[0.18em] ${hot ? 'text-cyan-200' : 'text-white/40'}`}>
                  {g.status === 'queued' ? 'À suivre' : g.status === 'done' ? 'Terminé' : 'En cours'} · {String.fromCharCode(64 + g.board)}
                </p>
                <p className="mt-1 text-3xl font-black leading-tight">{names.join(' · ')}</p>
              </div>
            );
          })}
        </div>
        {wave && wave.sitOuts.length > 0 && (
          <p className="mt-3 text-xl text-white/50">Ne joue pas : {wave.sitOuts.map((id) => pseudoOf(state, id)).join(', ')}</p>
        )}
        {state.phase === 'wave_done' && state.standings[0] && (
          <p className="mt-3 text-2xl text-white/60">
            En tête : <span className="font-black text-amber-200">{state.standings[0].pseudo}</span>{' '}
            <span className="tabular-nums text-cyan-300">{fmtScore(state.standings[0].points)} pts</span>
          </p>
        )}
      </div>
      {open && (
        <div className="flex w-[420px] shrink-0 flex-col items-center justify-center">
          <EtapesConnexionVue
            wifiSsid={state.config.wifiSsid}
            wifiPassword={state.config.wifiPassword}
            url={tournamentUrl(state.joinCode)}
            titreQr="Encore ouvert"
            texteQr="Tu entres à la prochaine salve."
            code={state.joinCode}
            qrSize={200}
          />
        </div>
      )}
    </div>
  );
}

function Tableau({ state }: { state: TournamentPublicState }) {
  const live = (state.bracket?.matches ?? []).filter((m) => m.status !== 'done');
  return (
    <div className="game-bg flex h-full flex-col overflow-hidden px-10 py-8 text-white">
      <EventChip state={state} big />
      <h1 className="mt-3 text-5xl font-black">Phase finale</h1>
      <div className="mt-6 grid flex-1 grid-cols-2 content-start gap-4">
        {live.map((m) => (
          <div key={m.id} className="rounded-3xl border border-amber-300/40 bg-amber-300/10 px-6 py-4">
            <p className="text-lg font-bold uppercase tracking-[0.2em] text-amber-200">{m.label}</p>
            <p className="mt-2 text-4xl font-black">
              {m.playerIds.length >= 2 ? m.playerIds.map((id) => pseudoOf(state, id)).join(' · ') : 'En attente'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Finale({ state }: { state: TournamentPublicState }) {
  const ranked = state.standings.filter((s) => s.status !== 'excluded');
  const winnerId = state.bracketWinnerId;
  const winner = winnerId ? pseudoOf(state, winnerId) : ranked[0]?.pseudo ?? '';
  return (
    <div className="game-bg flex h-full flex-col items-center justify-center gap-8 overflow-hidden px-10 text-center text-white">
      <EventChip state={state} big />
      <h1 className="anim-title-glow text-balance text-7xl font-black">{winner}</h1>
      <p className="text-4xl font-black text-amber-200">{state.config.texts.winner.replace(/#winner#/g, winner)}</p>
      <div className="mt-4 flex items-end gap-10">
        <PodiumStep s={ranked[1]} place={2} visible />
        <PodiumStep s={ranked[0]} place={1} visible />
        <PodiumStep s={ranked[2]} place={3} visible />
      </div>
    </div>
  );
}
