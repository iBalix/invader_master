/**
 * Console d'un tournoi en salves. Même contrat que TournamentGmBody : état +
 * action, aucun accès réseau, pour que le laboratoire puisse la monter.
 * Les échecs ne passent pas par ici.
 */

import { useState } from 'react';
import { pseudoOf } from '../../game/tournament/tournamentClient';
import { useServerNow } from '../../game/tournament/useTournamentSession';
import type { TWaveGroup, TournamentGmState } from '../../game/tournament/tournamentTypes';
import type { GmAction } from './TournamentGmBody';
import { Badge, Btn, Card } from './ui';

export function WavesGmBody({
  state,
  busy,
  action,
  onRefresh,
  onClosed,
  readOnly = false,
}: {
  state: TournamentGmState;
  busy: boolean;
  action: GmAction;
  onRefresh: () => void;
  onClosed: () => void;
  readOnly?: boolean;
}) {
  const act: GmAction = readOnly ? async () => undefined : action;
  const actifs = state.players.filter((p) => p.status === 'active').length;
  const wave = state.waves[state.waves.length - 1] ?? null;
  const mk = state.game === 'mariokart';

  return (
    <div className="mx-auto max-w-[1200px] space-y-3 px-3 pb-16 pt-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">{state.gameLabel}</p>
          <h1 className="truncate text-xl font-black">{state.title}</h1>
        </div>
        <div className="flex gap-2">
          <Btn disabled={busy} onClick={onRefresh}>Rafraîchir</Btn>
          {!readOnly && state.phase === 'registration' && (
            <Btn variant="danger" disabled={busy} onClick={() => void act('abort', {}, "Arrêter l'événement ? Le tournoi est clos. Les écrans restent sur la page du bar.")}>
              Arrêter
            </Btn>
          )}
          {!readOnly && state.phase !== 'registration' && (
            <Btn variant="danger" disabled={busy} onClick={() => void act('close', {}, 'Clore le tournoi ? Les écrans restent sur la page du bar.')}>
              Clore
            </Btn>
          )}
        </div>
      </div>

      {state.gm.alerts.length > 0 && !readOnly && (
        <Card tone="amber">
          {state.gm.alerts.map((a) => (
            <p key={a} className="text-sm text-amber-100">{a}</p>
          ))}
        </Card>
      )}

      {state.phase === 'registration' && <Inscriptions state={state} busy={busy} act={act} actifs={actifs} mk={mk} readOnly={readOnly} />}
      {(state.phase === 'wave' || state.phase === 'barrage') && wave && (
        <Salve state={state} busy={busy} act={act} waveGroups={wave.groups} sitOuts={wave.sitOuts} mk={mk} readOnly={readOnly} />
      )}
      {state.phase === 'wave_done' && <Suite state={state} busy={busy} act={act} actifs={actifs} mk={mk} readOnly={readOnly} />}
      {state.phase === 'bracket' && <Tableau state={state} busy={busy} act={act} mk={mk} readOnly={readOnly} />}
      {state.phase === 'final' && (
        <Card title="Vainqueur">
          <p className="text-2xl font-black">{pseudoOf(state, state.bracketWinnerId)}</p>
          <p className="mt-2 text-sm text-slate-400">Les écrans restent sur cette page. Un redémarrage de la borne relit kioskURL.txt.</p>
          {!readOnly && (
            <div className="mt-3">
              <Btn disabled={busy || state.config.testMode} onClick={() => void act('rescreen')}>Renvoyer les écrans sur le tournoi</Btn>
            </div>
          )}
          <div className="mt-3">
            <Btn variant="secondary" onClick={onClosed}>Retour aux événements</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function Inscriptions({
  state, busy, act, actifs, mk, readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  act: GmAction;
  actifs: number;
  mk: boolean;
  readOnly: boolean;
}) {
  const now = useServerNow(500);
  const reste = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : null;
  const [pseudo, setPseudo] = useState('');
  const setCfg = (config: Record<string, unknown>) => void act('set-config', { config });
  return (
    <>
      <Card title={reste === null ? 'En attente de joueurs' : `Départ dans ${Math.floor((reste ?? 0) / 60_000)}:${String(Math.floor(((reste ?? 0) % 60_000) / 1000)).padStart(2, '0')}`}>
        <p className="mb-3 text-sm text-slate-400">{actifs} joueur{actifs > 1 ? 's' : ''} · {state.config.grouping === 'random' ? 'tirage au sort' : 'selon le classement'} · {state.config.parallelSlots} en même temps</p>
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Btn variant="primary" big disabled={busy || actifs < 2} onClick={() => void act('start-wave', {}, `Lancer la première salve avec ${actifs} joueurs ?`)}>
              Lancer la salve
            </Btn>
            <div className="grid grid-cols-2 gap-2">
              <Btn disabled={busy} onClick={() => void act('add-time', { minutes: 2 })}>+ 2 min</Btn>
              <Btn disabled={busy} onClick={() => void act('add-time', { minutes: 5 })}>+ 5 min</Btn>
            </div>
          </div>
        )}
      </Card>
      {!readOnly && (
        <Card title="Réglages de la prochaine salve">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">En même temps</span>
            <Btn disabled={busy || state.config.parallelSlots <= 1} onClick={() => setCfg({ parallelSlots: state.config.parallelSlots - 1 })}>-</Btn>
            <span className="w-8 text-center font-black">{state.config.parallelSlots}</span>
            <Btn disabled={busy || state.config.parallelSlots >= 12} onClick={() => setCfg({ parallelSlots: state.config.parallelSlots + 1 })}>+</Btn>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Btn variant={state.config.grouping === 'swiss' ? 'primary' : 'secondary'} disabled={busy} onClick={() => setCfg({ grouping: 'swiss' })}>Selon le classement</Btn>
            <Btn variant={state.config.grouping === 'random' ? 'primary' : 'secondary'} disabled={busy} onClick={() => setCfg({ grouping: 'random' })}>Au hasard</Btn>
          </div>
          <Btn variant={state.config.lateJoin ? 'primary' : 'secondary'} disabled={busy} onClick={() => setCfg({ lateJoin: !state.config.lateJoin })}>
            {state.config.lateJoin ? 'Inscriptions tardives ouvertes' : 'Inscriptions tardives fermées'}
          </Btn>
          {mk && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {state.config.placementPoints.map((pts, i) => (
                <label key={i} className="text-xs text-slate-400">
                  {i + 1}{i === 0 ? 'er' : 'e'}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pts}
                    disabled={busy}
                    onChange={(e) => {
                      const next = [...state.config.placementPoints];
                      next[i] = Number(e.target.value);
                      setCfg({ placementPoints: next });
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-base font-black text-white"
                  />
                </label>
              ))}
            </div>
          )}
        </Card>
      )}
      <Roster state={state} busy={busy} act={act} readOnly={readOnly} pseudo={pseudo} setPseudo={setPseudo} />
    </>
  );
}

function Salve({
  state, busy, act, waveGroups, sitOuts, mk, readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  act: GmAction;
  waveGroups: TWaveGroup[];
  sitOuts: string[];
  mk: boolean;
  readOnly: boolean;
}) {
  return (
    <>
      {waveGroups.map((g) => (
        <GroupScore key={g.id} state={state} group={g} busy={busy} act={act} mk={mk} readOnly={readOnly} />
      ))}
      {sitOuts.length > 0 && (
        <p className="text-sm text-slate-400">Sans match cette salve : {sitOuts.map((id) => pseudoOf(state, id)).join(', ')}</p>
      )}
      {!readOnly && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Btn disabled={busy} onClick={() => void act('recompose-wave', { grouping: 'swiss' }, 'Recomposer les groupes pas encore saisis, selon le classement ?')}>
            Recomposer (classement)
          </Btn>
          <Btn disabled={busy} onClick={() => void act('recompose-wave', { grouping: 'random' }, 'Recomposer les groupes pas encore saisis, au hasard ?')}>
            Recomposer (hasard)
          </Btn>
        </div>
      )}
    </>
  );
}

function GroupScore({
  state, group, busy, act, mk, readOnly,
}: {
  state: TournamentGmState;
  group: TWaveGroup;
  busy: boolean;
  act: GmAction;
  mk: boolean;
  readOnly: boolean;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const done = group.places;
  const queued = group.status === 'queued';
  const title = `${queued ? 'File' : group.status === 'playing' ? 'En cours' : 'Terminé'} · ${String.fromCharCode(64 + group.board)}`;
  return (
    <Card title={title} right={queued ? <Badge tone="amber">à suivre</Badge> : group.status === 'playing' ? <Badge tone="cyan">joue</Badge> : <Badge>ok</Badge>}>
      {done ? (
        <ol className="space-y-1">
          {done.map((id, i) => (
            <li key={id} className="flex justify-between font-bold">
              <span>{i + 1}. {pseudoOf(state, id)}</span>
              {group.counts && <span className="tabular-nums text-amber-200">{group.points[id] ?? 0}</span>}
            </li>
          ))}
        </ol>
      ) : queued || readOnly ? (
        <p>{group.playerIds.map((id) => pseudoOf(state, id)).join(', ')}</p>
      ) : mk || group.playerIds.length !== 2 ? (
        <PlacePicker
          ids={group.playerIds}
          order={order}
          busy={busy}
          name={(id) => pseudoOf(state, id)}
          onChange={setOrder}
          onSubmit={() => void act('score-group', { groupId: group.id, places: order }).then(() => setOrder([]))}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {group.playerIds.map((id) => (
            <Btn key={id} variant="primary" disabled={busy || queued} onClick={() => {
              const other = group.playerIds.find((x) => x !== id) ?? id;
              void act('score-group', { groupId: group.id, places: [id, other] }, `${pseudoOf(state, id)} gagne ?`);
            }}>
              {pseudoOf(state, id)} gagne
            </Btn>
          ))}
        </div>
      )}
    </Card>
  );
}

function PlacePicker({
  ids, order, busy, name, onChange, onSubmit,
}: {
  ids: string[];
  order: string[];
  busy: boolean;
  name: (id: string) => string;
  onChange: (next: string[]) => void;
  onSubmit: () => void;
}) {
  const left = ids.filter((id) => !order.includes(id));
  return (
    <div>
      {order.length > 0 && (
        <ol className="mb-2 space-y-1">
          {order.map((id, i) => (
            <li key={id} className="font-bold">{i + 1}. {name(id)}</li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {left.map((id) => (
          <Btn key={id} disabled={busy} onClick={() => onChange([...order, id])}>{name(id)}</Btn>
        ))}
      </div>
      {order.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Btn disabled={busy} onClick={() => onChange([])}>Recommencer</Btn>
          <Btn variant="primary" disabled={busy || order.length !== ids.length} onClick={onSubmit}>Valider l'ordre</Btn>
        </div>
      )}
    </div>
  );
}

function Suite({
  state, busy, act, actifs, mk, readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  act: GmAction;
  actifs: number;
  mk: boolean;
  readOnly: boolean;
}) {
  return (
    <>
      <Card title="Classement">
        <ol className="space-y-1">
          {state.standings.filter((s) => s.status !== 'excluded').slice(0, 12).map((s) => (
            <li key={s.playerId} className="flex justify-between text-sm">
              <span>{s.rank}. {s.pseudo}</span>
              <span className="tabular-nums text-slate-400">{s.points} pts</span>
            </li>
          ))}
        </ol>
      </Card>
      {!readOnly && (
        <>
          <Btn variant="primary" big full disabled={busy || actifs < 2} onClick={() => void act('start-wave', {}, 'Lancer la salve suivante ?')}>
            Salve suivante
          </Btn>
          <Barrage state={state} busy={busy} act={act} mk={mk} />
          <Card title="Phase finale">
            <p className="mb-3 text-sm text-slate-400">
              {mk
                ? 'À 8 ou plus : deux demies (1, 3, 6 et 8 contre 2, 4, 5 et 7), puis une finale à 4, les deux premiers de chaque demie. En dessous de 8, finale directe des 4 premiers.'
                : 'À 8 ou plus : quarts 1 contre 8, 2 contre 7, 3 contre 6, 4 contre 5. Les demies croisent les vainqueurs.'}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Btn variant="primary" disabled={busy} onClick={() => void act('start-bracket', { seeding: 'seeded' }, 'Lancer la phase finale en têtes de série ?')}>
                Têtes de série
              </Btn>
              <Btn disabled={busy} onClick={() => void act('start-bracket', { seeding: 'random' }, 'Lancer la phase finale au hasard ?')}>
                Au hasard
              </Btn>
            </div>
          </Card>
          <Btn disabled={busy} onClick={() => void act('finish', {}, 'Terminer sur ce classement, sans phase finale ?')}>
            Terminer sur ce classement
          </Btn>
        </>
      )}
    </>
  );
}

function Barrage({ state, busy, act, mk }: { state: TournamentGmState; busy: boolean; act: GmAction; mk: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [built, setBuilt] = useState<string[][]>([]);
  const used = new Set(built.flat());
  const pool = state.players.filter((p) => p.status === 'active' && !used.has(p.id));
  const max = mk ? 4 : 2;
  const ok = picked.length >= 2 && picked.length <= max;
  return (
    <Card title="Barrage">
      <p className="mb-2 text-sm text-slate-400">Un ou deux matchs, sans point de poule. Le résultat ne réordonne que ces joueurs entre eux.</p>
      {built.map((ids, i) => (
        <p key={i} className="mb-1 font-bold">Match {i + 1} : {ids.map((id) => pseudoOf(state, id)).join(', ')}</p>
      ))}
      {built.length < 2 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pool.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Btn key={p.id} variant={on ? 'primary' : 'secondary'} disabled={busy || (!on && picked.length >= max)} onClick={() => setPicked(on ? picked.filter((id) => id !== p.id) : [...picked, p.id])}>
                {p.pseudo}
              </Btn>
            );
          })}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Btn disabled={busy || !ok || built.length >= 2} onClick={() => { setBuilt([...built, picked]); setPicked([]); }}>
          Ajouter ce match
        </Btn>
        <Btn variant="primary" disabled={busy || built.length === 0} onClick={() => void act('start-barrage', { groups: built }, 'Lancer le barrage ?').then(() => { setBuilt([]); setPicked([]); })}>
          Lancer le barrage
        </Btn>
      </div>
    </Card>
  );
}

function Tableau({
  state, busy, act, mk, readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  act: GmAction;
  mk: boolean;
  readOnly: boolean;
}) {
  const matches = state.bracket?.matches ?? [];
  return (
    <>
      {matches.map((m) => (
        <Card key={m.id} title={m.label} right={<Badge tone={m.status === 'pending' ? 'cyan' : 'slate'}>{m.status === 'waiting' ? 'en attente' : m.status === 'done' ? 'terminé' : 'à jouer'}</Badge>}>
          {m.places ? (
            <div>
              <p className="font-bold">{m.places.map((id, i) => `${i + 1}. ${pseudoOf(state, id)}`).join(' · ')}</p>
              {m.loserGames !== null && <p className="text-sm text-amber-200">3-{m.loserGames}</p>}
            </div>
          ) : m.playerIds.length < 2 || readOnly ? (
            <p className="text-slate-400">{m.playerIds.length >= 2 ? m.playerIds.map((id) => pseudoOf(state, id)).join(', ') : 'En attente des qualifiés'}</p>
          ) : mk ? (
            <BracketPlaces state={state} matchId={m.id} ids={m.playerIds} busy={busy} act={act} />
          ) : (
            <SmashScore state={state} matchId={m.id} ids={m.playerIds} busy={busy} act={act} />
          )}
        </Card>
      ))}
    </>
  );
}

function BracketPlaces({
  state, matchId, ids, busy, act,
}: {
  state: TournamentGmState;
  matchId: string;
  ids: string[];
  busy: boolean;
  act: GmAction;
}) {
  const [order, setOrder] = useState<string[]>([]);
  return (
    <PlacePicker
      ids={ids}
      order={order}
      busy={busy}
      name={(id) => pseudoOf(state, id)}
      onChange={setOrder}
      onSubmit={() => void act('score-bracket', { matchId, places: order }).then(() => setOrder([]))}
    />
  );
}

function SmashScore({
  state, matchId, ids, busy, act,
}: {
  state: TournamentGmState;
  matchId: string;
  ids: string[];
  busy: boolean;
  act: GmAction;
}) {
  const [winner, setWinner] = useState<string | null>(null);
  const loser = ids.find((id) => id !== winner) ?? null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {ids.map((id) => (
          <Btn key={id} variant={winner === id ? 'primary' : 'secondary'} disabled={busy} onClick={() => setWinner(id)}>
            {pseudoOf(state, id)}
          </Btn>
        ))}
      </div>
      {winner && loser && (
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((n) => (
            <Btn key={n} variant="primary" disabled={busy} onClick={() => void act('score-bracket', { matchId, places: [winner, loser], loserGames: n }, `${pseudoOf(state, winner)} gagne 3-${n} ?`)}>
              3-{n}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

function Roster({
  state, busy, act, readOnly, pseudo, setPseudo,
}: {
  state: TournamentGmState;
  busy: boolean;
  act: GmAction;
  readOnly: boolean;
  pseudo: string;
  setPseudo: (v: string) => void;
}) {
  return (
    <Card title={`Inscrits (${state.playerCount})`}>
      {!readOnly && state.phase !== 'bracket' && state.phase !== 'final' && (
        <div className="mb-3 flex gap-2">
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="Ajouter un pseudo"
            className="min-h-[48px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-white"
          />
          <Btn
            variant="primary"
            disabled={busy || !pseudo.trim()}
            onClick={() => {
              if (!pseudo.trim()) return;
              void act('add-player', { pseudo: pseudo.trim() }).then(() => setPseudo(''));
            }}
          >
            OK
          </Btn>
        </div>
      )}
      <ul className="space-y-1">
        {state.players.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className={p.status === 'active' ? 'font-semibold' : 'text-slate-500'}>{p.pseudo}</span>
            {!readOnly && p.status === 'active' && state.phase !== 'final' && (
              <button
                type="button"
                className="text-xs text-rose-300"
                disabled={busy}
                onClick={() => void act('exclude-player', { playerId: p.id }, `Retirer ${p.pseudo} ?`)}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
