/**
 * TV du comptoir pendant un tournoi en salves. Le QR reste tant qu'on peut
 * encore s'inscrire (jusqu'à la phase finale). Les groupes en cours et la
 * file sont lisibles de loin, plus denses que sur le projecteur.
 */

import { fmtScore, pseudoOf, tournamentUrl } from '../tournamentClient';
import type { TournamentPublicState } from '../tournamentTypes';
import { BarHeading, BigCountdown, BracketTree, EventChip, PlayerTags } from './parts';
import { ChampionScene, groupLetter } from './WavesProjo';
import { ArcadeStage, Chrome, Crown, GameGlyph, JoinSteps, invaderTone, Invader } from '../arcade/kit';
import { HOURGLASS, PixelSprite } from '../arcade/pixel';

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
  const actifs = state.players.filter((p) => p.status === 'active');
  return (
    <ArcadeStage className="flex h-full gap-12 overflow-hidden px-12 py-10" floor={0.18} floorOpacity={0.35}>
      <div className="flex min-w-0 flex-1 flex-col">
        <BarHeading state={state} message="Inscris-toi en deux étapes. Plusieurs personnes peuvent partager le même téléphone." />
        <div className="mt-8">
          <BigCountdown endsAt={state.phaseEndsAt} now={now} waiting={state.waitingForPlayers} digits="text-[6.5rem]" />
        </div>
        {actifs.length > 0 && (
          <div className="mt-8 flex min-h-0 flex-1 flex-col">
            <p className="ia-pixel mb-4 text-3xl text-ia-soft">
              <span className="text-ia-cyan">{actifs.length}</span> {actifs.length > 1 ? 'inscrits' : 'inscrit'}
            </p>
            <PlayerTags names={actifs} dense />
          </div>
        )}
      </div>
      <div className="flex w-[46rem] shrink-0 flex-col justify-center">
        <JoinSteps
          wifiSsid={state.config.wifiSsid}
          wifiPassword={state.config.wifiPassword}
          url={tournamentUrl(state.joinCode)}
          title="Scanne pour t'inscrire"
          text="Un pseudo suffit."
          code={state.joinCode}
          qrSize={250}
        />
      </div>
    </ArcadeStage>
  );
}

function Salve({ state }: { state: TournamentPublicState }) {
  const wave = state.waves[state.waves.length - 1];
  const groups = wave?.groups ?? [];
  const open = joinable(state);
  const leader = state.standings[0];
  return (
    <ArcadeStage className="flex h-full gap-10 overflow-hidden px-10 py-8" floor={0.14} floorOpacity={0.3}>
      <div className="flex min-w-0 flex-1 flex-col">
        <EventChip state={state} />
        <h1 className="mt-4 text-6xl leading-tight">
          <Chrome>{state.phase === 'barrage' ? 'Barrage' : state.phase === 'wave_done' ? 'Salve terminée' : 'En cours'}</Chrome>
        </h1>
        <div className="mt-6 grid min-h-0 flex-1 grid-cols-2 content-start gap-4">
          {groups.map((g) => {
            const hot = g.status === 'playing';
            const ids = g.places ?? g.playerIds;
            return (
              <div key={g.id} className={`ia-px ia-px--lg px-5 py-4 ${hot ? 'ia-px--cyan' : g.status === 'queued' ? 'ia-px--amber' : 'ia-px--deep'}`}>
                <p className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <GameGlyph game={state.game} scale={4} />
                    <span className={`ia-pixel text-3xl ${hot ? 'text-white' : 'text-ia-soft'}`}>{state.game === 'mariokart' ? 'Course' : 'Match'} {groupLetter(g)}</span>
                  </span>
                  <span className={`ia-pixel text-2xl ${hot ? 'text-ia-cyan' : g.status === 'queued' ? 'text-ia-gold' : 'text-ia-muted'}`}>
                    {g.status === 'queued' ? 'À suivre' : g.status === 'done' ? 'Terminé' : 'En piste'}
                  </span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {ids.map((id, i) => (
                    <li key={id} className="flex min-w-0 items-center gap-4">
                      {g.places ? (
                        <span className="ia-pixel w-9 shrink-0 text-2xl text-ia-muted">{i + 1}</span>
                      ) : (
                        <Invader seed={id} scale={3} className={`w-9 ${invaderTone(id)}`} />
                      )}
                      <span className="ia-display truncate text-5xl text-white">{pseudoOf(state, id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {wave && wave.sitOuts.length > 0 && (
          <p className="mt-4 flex items-center gap-4 text-2xl text-ia-soft">
            <PixelSprite sprite={HOURGLASS} scale={3} className="text-ia-muted" />
            Ne joue pas : <span className="font-black text-white">{wave.sitOuts.map((id) => pseudoOf(state, id)).join(', ')}</span>
          </p>
        )}
        {state.phase === 'wave_done' && leader && (
          <p className="ia-px ia-px--gold mt-4 flex items-center gap-5 self-start px-6 py-3">
            <Crown scale={3} />
            <span className="ia-pixel text-2xl text-ia-gold">En tête</span>
            <span className="ia-display text-5xl text-white">{leader.pseudo}</span>
            <span className="ia-display text-5xl text-ia-cyan">{fmtScore(leader.points)} pts</span>
          </p>
        )}
      </div>
      {open && (
        <div className="flex w-[40rem] shrink-0 flex-col justify-center">
          <JoinSteps
            wifiSsid={state.config.wifiSsid}
            wifiPassword={state.config.wifiPassword}
            url={tournamentUrl(state.joinCode)}
            title="Encore ouvert"
            text="Tu entres à la prochaine salve."
            code={state.joinCode}
            qrSize={200}
            compact
          />
        </div>
      )}
    </ArcadeStage>
  );
}

function Tableau({ state }: { state: TournamentPublicState }) {
  return (
    <ArcadeStage className="flex h-full flex-col overflow-hidden px-10 py-8" floor={0.12} floorOpacity={0.3}>
      <div className="mb-6 flex items-end justify-between gap-8">
        <div>
          <EventChip state={state} />
          <h1 className="mt-4 text-6xl leading-tight">
            <Chrome>Phase finale</Chrome>
          </h1>
        </div>
        <p className="ia-display max-w-[40rem] text-right text-5xl text-ia-soft">{state.title}</p>
      </div>
      <BracketTree state={state} size="lg" />
    </ArcadeStage>
  );
}

function Finale({ state }: { state: TournamentPublicState }) {
  return (
    <ArcadeStage className="flex h-full flex-col overflow-hidden" floor={0.2} floorOpacity={0.45}>
      <ChampionScene state={state} compact />
    </ArcadeStage>
  );
}

