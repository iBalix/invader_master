/**
 * TV du bar (BAR01 / BAR02) pendant un tournoi : le QR d'inscription reste
 * affiché du début à la fin (on peut rejoindre en cours de tournoi, entrée à
 * la ronde suivante). Une ligne d'état dit où en est l'événement, et le haut
 * du classement s'affiche dès les premiers résultats. Au final, le podium
 * remplace le QR : s'inscrire n'a plus de sens.
 */

import { currentRoundOf, hasResults, roundLabel, tournamentUrl } from '../tournamentClient';
import type { TournamentPublicState } from '../tournamentTypes';
import { BarHeading, BigCountdown, EventChip, PlayerTags, PodiumStep, StandingLine } from './parts';
import WavesBar from './WavesBar';
import { ArcadeStage, Chrome, JoinSteps, PixelConfetti, chromeSize } from '../arcade/kit';
import { CUP, PixelSprite } from '../arcade/pixel';

function statusLine(state: TournamentPublicState, now: number): string {
  const round = currentRoundOf(state);
  const n = state.playerCount;
  const inscrits = `${n} inscrit${n > 1 ? 's' : ''}`;
  if (state.phase === 'registration') {
    if (state.waitingForPlayers || !state.phaseEndsAt) return `En attente de joueurs · ${inscrits}`;
    const reste = Math.max(0, state.phaseEndsAt - now);
    const mm = Math.floor(reste / 60_000);
    const ss = Math.floor((reste % 60_000) / 1000);
    return reste > 0 ? `Départ dans ${mm}:${String(ss).padStart(2, '0')} · ${inscrits}` : `Tirage imminent · ${inscrits}`;
  }
  if (!round) return inscrits;
  const suite = state.config.lateJoin ? ` · inscris-toi pour la ronde ${round.number + 1}` : '';
  if (state.phase === 'round') return `${roundLabel(state, round.number)} en cours${suite}`;
  return `${roundLabel(state, round.number)} terminée · la suite arrive${suite}`;
}

/** podium final des TV (échecs) */
function BarFinal({ state }: { state: TournamentPublicState }) {
  const ranked = state.standings.filter((s) => s.status !== 'excluded');
  return (
    <ArcadeStage className="flex h-full flex-col items-center justify-end overflow-hidden px-10 pt-10 text-center" floor={0.2} floorOpacity={0.45}>
      <PixelConfetti count={30} size={14} />
      <EventChip state={state} big />
      <h1 className={`mt-5 text-balance leading-[1.08] ${chromeSize(state.title, ['text-7xl', 'text-6xl', 'text-5xl', 'text-4xl'])}`}>
        <Chrome>{state.title}</Chrome>
      </h1>
      <p className="mt-4 text-balance text-5xl">
        <Chrome gold>{state.config.texts.winner.replace(/#winner#/g, ranked[0]?.pseudo ?? '')}</Chrome>
      </p>
      <div className="mt-6 flex items-end gap-12">
        <PodiumStep s={ranked[1]} place={2} visible />
        <PodiumStep s={ranked[0]} place={1} visible />
        <PodiumStep s={ranked[2]} place={3} visible />
      </div>
      <p className="ia-pixel absolute right-10 top-8 text-2xl text-ia-soft">Merci à tous d'avoir joué !</p>
    </ArcadeStage>
  );
}

export default function TournamentBar({ state, now }: { state: TournamentPublicState; now: number }) {
  if (state.format === 'waves') return <WavesBar state={state} now={now} />;
  if (state.phase === 'final') return <BarFinal state={state} />;

  const canJoin = state.phase === 'registration' || state.config.lateJoin;
  const ranked = state.phase !== 'registration' && hasResults(state);
  const top = state.standings.filter((s) => s.status === 'active').slice(0, canJoin ? 5 : 9);
  const actifs = state.players.filter((p) => p.status === 'active');
  const message =
    state.phase === 'registration'
      ? 'Inscris-toi en deux étapes, un pseudo suffit.'
      : canJoin
        ? "Le tournoi a commencé, il n'est pas trop tard : tu joues dès la prochaine ronde !"
        : 'Le tournoi est en cours, les inscriptions sont fermées.';
  return (
    <ArcadeStage className="flex h-full gap-12 overflow-hidden px-12 py-10" floor={0.18} floorOpacity={0.35}>
      <div className="flex min-w-0 flex-1 flex-col">
        <BarHeading state={state} message={message} />
        <div className="mt-8">
          {state.phase === 'registration' ? (
            <BigCountdown endsAt={state.phaseEndsAt} now={now} waiting={state.waitingForPlayers} digits="text-[6.5rem]" />
          ) : (
            <p className="ia-px ia-px--lg ia-px--cyan inline-block px-8 py-5 text-left">
              <span className="ia-pixel text-3xl leading-snug text-white">{statusLine(state, now)}</span>
            </p>
          )}
        </div>
        <div className="mt-8 flex min-h-0 flex-1 flex-col">
          {ranked && top.length > 0 ? (
            <>
              <p className="ia-pixel mb-4 flex items-center gap-4 text-3xl text-ia-gold">
                <PixelSprite sprite={CUP} scale={3} className="text-ia-gold" /> En tête
              </p>
              <div className="flex flex-col gap-2.5">
                {top.map((s) => (
                  <StandingLine key={s.playerId} s={s} state={state} big={false} />
                ))}
              </div>
            </>
          ) : (
            actifs.length > 0 && (
              <>
                <p className="ia-pixel mb-4 text-3xl text-ia-soft">
                  <span className="text-ia-cyan">{actifs.length}</span> {actifs.length > 1 ? 'inscrits' : 'inscrit'}
                </p>
                <PlayerTags names={actifs} dense />
              </>
            )
          )}
        </div>
      </div>
      {canJoin && (
        <div className="flex w-[46rem] shrink-0 flex-col justify-center">
          <JoinSteps
            wifiSsid={state.config.wifiSsid}
            wifiPassword={state.config.wifiPassword}
            url={tournamentUrl(state.joinCode)}
            title="Scanne pour t'inscrire"
            text="Retiens ton pseudo : c'est lui que tu taperas sur la table."
            code={state.joinCode}
            qrSize={250}
          />
        </div>
      )}
    </ArcadeStage>
  );
}
