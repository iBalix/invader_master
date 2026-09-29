/**
 * TV du bar (BAR01 / BAR02) pendant un tournoi : le QR d'inscription reste
 * affiché du début à la fin (on peut rejoindre en cours de tournoi, entrée à
 * la ronde suivante). Une ligne d'état dit où en est l'événement. Au final, le
 * podium remplace le QR : s'inscrire n'a plus de sens.
 */

import { EtapesConnexionVue } from '../../screen/ScreenApp';
import { currentRoundOf, fmtScore, roundLabel, tournamentUrl } from '../tournamentClient';
import type { TournamentPublicState } from '../tournamentTypes';
import { EventChip, PodiumStep } from './parts';

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

export default function TournamentBar({ state, now }: { state: TournamentPublicState; now: number }) {
  if (state.phase === 'final') {
    const ranked = state.standings.filter((s) => s.status !== 'excluded');
    return (
      <div className="game-bg flex h-full flex-col items-center justify-center gap-8 overflow-hidden px-10 text-center text-white">
        <EventChip state={state} big />
        <h1 className="anim-title-glow text-balance text-7xl font-black">{state.title}</h1>
        <p className="text-4xl font-black text-amber-200">
          {state.config.texts.winner.replace(/#winner#/g, ranked[0]?.pseudo ?? '')}
        </p>
        <div className="mt-4 flex items-end gap-10">
          <PodiumStep s={ranked[1]} place={2} visible />
          <PodiumStep s={ranked[0]} place={1} visible />
          <PodiumStep s={ranked[2]} place={3} visible />
        </div>
        <p className="text-2xl text-white/50">Merci à tous d'avoir joué !</p>
      </div>
    );
  }

  const canJoin = state.phase === 'registration' || state.config.lateJoin;
  const leader = state.phase !== 'registration' ? state.standings.find((s) => s.status === 'active') : undefined;
  return (
    <div className="game-bg flex h-full flex-col items-center justify-center gap-7 overflow-hidden px-10 text-center text-white">
      <EventChip state={state} big />
      <h1 className="anim-title-glow text-balance text-7xl font-black">{state.title}</h1>
      <p className="max-w-4xl text-3xl text-white/70">
        {state.phase === 'registration'
          ? 'Inscris-toi en deux étapes, un pseudo suffit.'
          : canJoin
            ? "Le tournoi a commencé, il n'est pas trop tard : tu joues dès la prochaine ronde !"
            : 'Le tournoi est en cours, les inscriptions sont fermées.'}
      </p>
      {canJoin && (
        <EtapesConnexionVue
          wifiSsid={state.config.wifiSsid}
          wifiPassword={state.config.wifiPassword}
          url={tournamentUrl(state.joinCode)}
          titreQr="Scanne pour t'inscrire"
          texteQr="Retiens ton pseudo : c'est lui que tu taperas sur la table."
          code={state.joinCode}
          qrSize={250}
        />
      )}
      <p className="rounded-full border border-white/15 bg-white/5 px-8 py-3 text-3xl font-bold">
        {statusLine(state, now)}
      </p>
      {leader && (
        <p className="text-2xl text-white/50">
          En tête : <span className="font-black text-amber-200">{leader.pseudo}</span>{' '}
          <span className="tabular-nums text-cyan-300">{fmtScore(leader.points)} pts</span>
        </p>
      )}
    </div>
  );
}
