/**
 * Projecteur d'un tournoi en salves (Mario Kart, Smash Bros).
 * Les échecs restent sur TournamentProjo : on n'arrive ici que si format = waves.
 *
 * Une salve montre les groupes en cours en grand (grille de départ pour Mario
 * Kart, carte « VS » pour Smash) et la file en bandeau. Le barrage et le
 * tableau n'affichent pas de points. La finale est un vainqueur, avec le
 * trophée en pixels.
 */

import type { ReactNode } from 'react';
import { pseudoOf } from '../tournamentClient';
import type { TWaveGroup, TournamentPublicState } from '../tournamentTypes';
import {
  BracketTree,
  EventChip,
  FeedToasts,
  JoinCorner,
  PageDots,
  SectionHead,
  StandingsGrid,
  StandingsLegend,
  LobbyScreen,
  joinOpen,
} from './parts';
import { ArcadeStage, Chrome, Crown, GameGlyph, Invader, PixelConfetti, TrophyShowcase, invaderTone, nameSize, rankClass, rankText } from '../arcade/kit';
import { CUP, HOURGLASS, PixelSprite } from '../arcade/pixel';
import { formatSummary } from '../tournamentClient';

export default function WavesProjo({ state, now }: { state: TournamentPublicState; now: number }) {
  let body: ReactNode;
  if (state.phase === 'final' || state.ended) body = <Winner state={state} />;
  else if (state.phase === 'registration') body = <LobbyScreen state={state} now={now} qrText="Un pseudo suffit. Plusieurs personnes peuvent s'inscrire du même téléphone." summary={formatSummary(state)} />;
  else if (state.phase === 'wave_done') body = <AfterWave state={state} />;
  else if (state.phase === 'bracket') body = <BracketBoard state={state} />;
  else body = <WaveBoard state={state} />;

  const open = state.phase === 'registration' || state.phase === 'final' || state.ended;
  return (
    <ArcadeStage className="flex h-full w-full flex-col overflow-hidden" floor={open ? 0.22 : 0.14} floorOpacity={open ? 0.45 : 0.25}>
      {body}
      {state.phase !== 'final' && <FeedToasts state={state} />}
    </ArcadeStage>
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

export function groupLetter(group: Pick<TWaveGroup, 'board'>): string {
  return String.fromCharCode(64 + group.board);
}

/** en-tête des salves : jeu, phase en chrome, QR tant qu'on peut s'inscrire */
function WaveHeader({ state, title }: { state: TournamentPublicState; title: string }) {
  return (
    <header className="relative flex shrink-0 items-center justify-between gap-8 px-12 pb-5 pt-6">
      <div className="min-w-0">
        <EventChip state={state} />
        <h1 className="mt-3 text-7xl leading-tight">
          <Chrome>{title}</Chrome>
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-8">
        <p className="ia-display max-w-[34rem] truncate text-right text-5xl text-ia-soft">{state.title}</p>
        {joinOpen(state) && <JoinCorner state={state} size={110} />}
      </div>
      <div className="absolute bottom-0 left-12 right-12 h-1" style={{ background: 'linear-gradient(90deg, #ff2bd6, #8b3dff 40%, #33e2ff)' }} aria-hidden />
    </header>
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
      <WaveHeader state={state} title={state.phase === 'barrage' ? 'Barrage' : salveLabel(state)} />
      <div
        className={`grid min-h-0 flex-1 content-center gap-8 px-12 py-6 ${cols === 1 ? 'px-64' : ''}`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {playing.map((g) => (
          <GroupCard key={g.id} state={state} group={g} dense={cols === 3} />
        ))}
        {playing.length === 0 && (
          <p className="ia-pixel ia-blink col-span-full self-center text-center text-3xl text-ia-muted">En attente du prochain groupe</p>
        )}
      </div>
      {(queued.length > 0 || (wave?.sitOuts.length ?? 0) > 0) && (
        <footer className="shrink-0 px-12 pb-8">
          {queued.length > 0 && (
            <div className="ia-px ia-px--lg ia-px--amber flex items-center gap-6 px-6 py-4">
              <span className="ia-pixel shrink-0 text-3xl text-ia-gold">À suivre</span>
              <div className="flex min-w-0 flex-wrap gap-x-10 gap-y-2">
                {queued.map((g) => (
                  <span key={g.id} className="flex min-w-0 items-baseline gap-4">
                    <span className="ia-pixel text-3xl text-ia-amber">{groupLetter(g)}</span>
                    <span className="ia-display truncate text-4xl text-white">{g.playerIds.map((id) => pseudoOf(state, id)).join(' · ')}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {wave && wave.sitOuts.length > 0 && (
            <p className="mt-3 flex items-center gap-4 text-2xl text-ia-soft">
              <PixelSprite sprite={HOURGLASS} scale={3} className="text-ia-muted" />
              Ne joue pas cette salve : <span className="font-black text-white">{wave.sitOuts.map((id) => pseudoOf(state, id)).join(', ')}</span>
            </p>
          )}
        </footer>
      )}
    </div>
  );
}

/** groupe en piste : grille de départ (Mario Kart) ou duel (Smash) */
function GroupCard({ state, group, dense }: { state: TournamentPublicState; group: TWaveGroup; dense: boolean }) {
  const ordered = group.places ?? group.playerIds;
  const duel = state.game === 'smash' && group.playerIds.length === 2 && !group.places;
  const status = group.status === 'queued' ? 'À suivre' : group.status === 'done' ? 'Terminé' : 'En piste';
  const kind = state.game === 'mariokart' ? 'Course' : 'Match';
  return (
    <div className="ia-px ia-px--lg ia-px--cyan ia-glow-cyan flex min-h-0 flex-col justify-center px-8 py-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="flex items-center gap-4">
          <GameGlyph game={state.game} scale={4} />
          <span className="ia-pixel text-3xl text-white">
            {kind} {groupLetter(group)}
          </span>
        </span>
        <span className="ia-pixel ia-clip ia-clip--sm inline-flex items-center gap-2 bg-ia-cyan px-3 py-1.5 text-xl text-ia-night">
          {group.status === 'playing' && <span className="ia-blink inline-block h-2 w-2 bg-ia-night" />}
          {status}
        </span>
      </div>
      {duel ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
          <span className="ia-display truncate text-right text-7xl text-white">{pseudoOf(state, group.playerIds[0])}</span>
          <span className="ia-pixel text-5xl italic text-ia-pink" style={{ textShadow: '4px 4px 0 #33e2ff' }}>
            VS
          </span>
          <span className="ia-display truncate text-7xl text-white">{pseudoOf(state, group.playerIds[1])}</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {ordered.map((id, i) => (
            <li key={id} className="flex items-center gap-5">
              {group.places ? (
                <span className={`ia-pixel w-20 shrink-0 text-3xl ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
              ) : (
                <Invader seed={id} scale={dense ? 3 : 4} className={`w-20 ${invaderTone(id)}`} />
              )}
              <span className={`ia-display min-w-0 truncate text-white ${dense ? 'text-5xl' : ordered.length > 3 ? 'text-6xl' : 'text-7xl'}`}>{pseudoOf(state, id)}</span>
              {group.counts && group.places && <span className="ia-dots text-ia-soft" />}
              {group.counts && group.places && <span className="ia-display shrink-0 text-6xl tabular-nums text-ia-gold">+{group.points[id] ?? 0}</span>}
              {!group.counts && state.game === 'smash' && group.places && i === 0 && <span className="ia-pixel ml-auto text-2xl text-ia-gold">Gagne</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AfterWave({ state }: { state: TournamentPublicState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WaveHeader state={state} title="Salve terminée" />
      <div className="flex min-h-0 flex-1 flex-col px-12 pb-8 pt-6">
        <SectionHead
          icon={<PixelSprite sprite={CUP} scale={4} className="text-ia-gold" />}
          title="Classement"
          right={
            <div className="flex items-center gap-10">
              <StandingsLegend record={false} />
              <PageDots page={0} pages={1} />
            </div>
          }
        />
        <StandingsGrid state={state} page={0} perPage={24} />
      </div>
    </div>
  );
}

function BracketBoard({ state }: { state: TournamentPublicState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WaveHeader state={state} title="Phase finale" />
      <div className="flex min-h-0 flex-1 flex-col px-12 pb-10 pt-6">
        <BracketTree state={state} size="lg" />
      </div>
    </div>
  );
}

/** vainqueur et, si la finale est connue, les autres places du podium */
export function finalists(state: TournamentPublicState): { winnerId: string | null; others: string[] } {
  const finale = state.bracket?.matches.find((m) => m.round === 'final');
  if (finale?.places && finale.places.length > 0) {
    return { winnerId: state.bracketWinnerId ?? finale.places[0], others: finale.places.slice(1, 4) };
  }
  const ranked = state.standings.filter((s) => s.status !== 'excluded');
  const winnerId = state.bracketWinnerId ?? ranked[0]?.playerId ?? null;
  return { winnerId, others: ranked.filter((s) => s.playerId !== winnerId).slice(0, 2).map((s) => s.playerId) };
}

/** écran du champion : trophée, nom en or chromé, phrase du podium */
export function ChampionScene({ state, compact = false }: { state: TournamentPublicState; compact?: boolean }) {
  const { winnerId, others } = finalists(state);
  const pseudo = winnerId ? pseudoOf(state, winnerId) : '';
  const line = state.config.texts.winner.replace(/#winner#/g, pseudo);
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center gap-6 px-16">
      <PixelConfetti count={compact ? 26 : 40} size={compact ? 12 : 16} />
      <TrophyShowcase scale={compact ? 9 : 11} />
      <div className="relative min-w-0 max-w-[60rem]">
        <EventChip state={state} big />
        <p className="ia-pixel mt-10 flex items-center gap-5 text-5xl text-ia-gold">
          <Crown scale={5} /> Champion
        </p>
        <h1 className={`mt-5 leading-[1.1] ${nameSize(pseudo, compact ? ['text-[8rem]', 'text-[6rem]', 'text-[4.75rem]', 'text-[4rem]'] : ['text-[9.5rem]', 'text-[7rem]', 'text-[5.5rem]', 'text-[4.5rem]'])}`}>
          <Chrome gold>{pseudo || state.title}</Chrome>
        </h1>
        <p className="mt-6 text-balance text-4xl leading-snug text-white">{line}</p>
        {others.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-4">
            {others.map((id, i) => (
              <span key={id} className={`ia-px ia-px--lg inline-flex items-baseline gap-4 px-6 py-3 ${i === 0 ? 'ia-px--plain' : i === 1 ? 'ia-px--amber' : 'ia-px--deep'}`}>
                <span className={`ia-pixel text-2xl ${rankClass(i + 2)}`}>{rankText(i + 2)}</span>
                <span className="ia-display text-5xl text-white">{pseudoOf(state, id)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Winner({ state }: { state: TournamentPublicState }) {
  return <ChampionScene state={state} />;
}
