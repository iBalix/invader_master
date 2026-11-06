/**
 * Console d'un tournoi en salves. Même contrat que TournamentGmBody : état +
 * action, aucun accès réseau, pour que le laboratoire puisse la monter.
 * Les échecs ne passent pas par ici.
 *
 * Mario Kart et Smash ne remontent rien tout seuls : le GM saisit chaque
 * groupe ou match, ou valide la dernière proposition d'un joueur, et peut
 * toujours corriger.
 */

import { useState } from 'react';
import { pseudoOf } from '../../game/tournament/tournamentClient';
import { useServerNow } from '../../game/tournament/useTournamentSession';
import type { TBracketMatch, TClaim, TWaveGroup, TournamentGmState } from '../../game/tournament/tournamentTypes';
import { Crown, GameGlyph, Invader, Trophy, invaderTone, mmss, rankClass, rankText } from '../../game/tournament/arcade/kit';
import { CHECK, HOURGLASS, PixelSprite } from '../../game/tournament/arcade/pixel';
import { GmAlerts, GmHeader, QrOverlay, type GmAction } from './TournamentGmBody';
import { Badge, Btn, Card, NarrowContext, Segmented, Toggle, inputClass, useMeasuredNarrow } from './ui';

function salveLabel(state: TournamentGmState): string {
  if (state.ended) return 'Clos';
  if (state.phase === 'registration') return 'Inscriptions';
  if (state.phase === 'barrage') return 'Barrage';
  if (state.phase === 'bracket') return 'Phase finale';
  if (state.phase === 'wave_done') return 'Salve terminée';
  if (state.phase === 'final') return 'Vainqueur';
  const wave = state.waves[state.waves.length - 1];
  return wave ? `Salve ${wave.number}${state.config.plannedRounds ? `/${state.config.plannedRounds}` : ''}` : 'En cours';
}

function letter(board: number): string {
  return String.fromCharCode(64 + board);
}

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
  const [ref, narrow] = useMeasuredNarrow();
  const [qr, setQr] = useState(false);

  return (
    <div ref={ref} className="mx-auto max-w-[1200px] space-y-3 px-3 pb-16 pt-0 sm:px-5">
      <NarrowContext.Provider value={narrow}>
        <GmHeader
          state={state}
          phaseLabel={salveLabel(state)}
          phaseTone={state.phase === 'final' ? 'amber' : state.phase === 'registration' ? 'indigo' : state.phase === 'wave_done' ? 'emerald' : 'cyan'}
          sub={null}
          onRefresh={onRefresh}
          onQr={() => setQr(true)}
          stop={
            readOnly
              ? null
              : state.phase === 'registration'
                ? { label: 'Arrêter', run: () => act('abort', {}, "Arrêter l'événement ? Le tournoi est clos. Les écrans restent sur la page du bar.") }
                : { label: 'Clore', run: () => act('close', {}, 'Clore le tournoi ? Les écrans restent sur la page du bar.') }
          }
        >
          {qr && <QrOverlay state={state} onClose={() => setQr(false)} />}
        </GmHeader>
      </NarrowContext.Provider>

      {!readOnly && <GmAlerts alerts={state.gm.alerts} />}

      {state.phase === 'registration' && <Inscriptions state={state} busy={busy} act={act} actifs={actifs} mk={mk} readOnly={readOnly} />}
      {(state.phase === 'wave' || state.phase === 'barrage') && wave && (
        <Salve state={state} busy={busy} act={act} waveGroups={wave.groups} sitOuts={wave.sitOuts} mk={mk} readOnly={readOnly} />
      )}
      {state.phase === 'wave_done' && <Suite state={state} busy={busy} act={act} actifs={actifs} mk={mk} readOnly={readOnly} />}
      {state.phase === 'bracket' && <Tableau state={state} busy={busy} act={act} mk={mk} readOnly={readOnly} />}
      {state.phase === 'final' && (
        <Card tone="gold">
          <div className="flex items-center gap-4">
            <Trophy scale={3} />
            <div className="min-w-0">
              <p className="ia-pixel text-[11px] text-ia-gold">Vainqueur</p>
              <p className="truncate text-3xl font-black text-ia-gold">{pseudoOf(state, state.bracketWinnerId)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ia-soft">Les écrans restent sur cette page. Un redémarrage de la borne relit kioskURL.txt.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!readOnly && (
              <Btn disabled={busy || state.config.testMode} onClick={() => void act('rescreen')}>
                Renvoyer les écrans sur le tournoi
              </Btn>
            )}
            <Btn variant="secondary" onClick={onClosed}>
              Retour aux événements
            </Btn>
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
      <Card tone="cyan">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ia-pixel text-[11px] text-ia-cyan">{reste === null ? 'En attente de joueurs' : 'Départ dans'}</p>
            <p className="ia-pixel mt-1 text-4xl tabular-nums text-white">{reste === null ? '--:--' : mmss(reste ?? 0)}</p>
          </div>
          <p className="text-sm text-ia-soft">
            <b className="text-ia-ink">{actifs}</b> joueur{actifs > 1 ? 's' : ''} · {state.config.grouping === 'random' ? 'tirage au sort' : 'selon le classement'} ·{' '}
            {state.config.parallelSlots} en même temps
          </p>
        </div>
        {!readOnly && (
          <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <Btn variant="primary" big disabled={busy || actifs < 2} onClick={() => void act('start-wave', {}, `Lancer la première salve avec ${actifs} joueurs ?`)}>
              ▶ Lancer la salve
            </Btn>
            <Btn big disabled={busy} onClick={() => void act('add-time', { minutes: 2 })}>
              + 2 min
            </Btn>
            <Btn big disabled={busy} onClick={() => void act('add-time', { minutes: 5 })}>
              + 5 min
            </Btn>
          </div>
        )}
      </Card>
      {!readOnly && (
        <Card title="Réglages de la prochaine salve">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="ia-pixel mb-1.5 block text-[11px] text-ia-muted">En même temps</span>
              <div className="ia-px ia-px--deep flex items-center gap-2 p-1.5">
                <button
                  type="button"
                  disabled={busy || state.config.parallelSlots <= 1}
                  onClick={() => setCfg({ parallelSlots: state.config.parallelSlots - 1 })}
                  className="ia-btn ia-btn--ghost min-h-[44px] w-14 text-xl"
                >
                  −
                </button>
                <span className="ia-pixel flex-1 text-center text-2xl text-white">{state.config.parallelSlots}</span>
                <button
                  type="button"
                  disabled={busy || state.config.parallelSlots >= 12}
                  onClick={() => setCfg({ parallelSlots: state.config.parallelSlots + 1 })}
                  className="ia-btn ia-btn--ghost min-h-[44px] w-14 text-xl"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <span className="ia-pixel mb-1.5 block text-[11px] text-ia-muted">Composition</span>
              <Segmented
                value={state.config.grouping}
                disabled={busy}
                options={[
                  { value: 'swiss', label: 'Selon le classement' },
                  { value: 'random', label: 'Au hasard' },
                ]}
                onChange={(v) => setCfg({ grouping: v })}
              />
            </div>
          </div>
          <div className="mt-3">
            <Toggle
              checked={state.config.lateJoin}
              onChange={() => !busy && setCfg({ lateJoin: !state.config.lateJoin })}
              label={state.config.lateJoin ? 'Inscriptions tardives ouvertes' : 'Inscriptions tardives fermées'}
              hint="Un retardataire entre à la salve suivante"
            />
          </div>
          {mk && (
            <div className="mt-3">
              <span className="ia-pixel mb-1.5 block text-[11px] text-ia-muted">Barème des places</span>
              <div className="grid grid-cols-4 gap-2">
                {state.config.placementPoints.map((pts, i) => (
                  <label key={i} className="block">
                    <span className={`ia-pixel mb-1 block text-[11px] ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
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
                      className={`${inputClass} text-center font-black tabular-nums`}
                    />
                  </label>
                ))}
              </div>
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
  const toScore = waveGroups.filter((g) => !g.places && g.status !== 'queued').length;
  const done = waveGroups.filter((g) => g.places).length;
  return (
    <>
      <p className="ia-pixel flex flex-wrap items-center gap-3 px-1 text-[11px] text-ia-soft">
        <span>
          <span className="text-ia-cyan">{toScore}</span> à saisir
        </span>
        <span>
          <span className="text-ia-mint">{done}</span>/{waveGroups.length} terminés
        </span>
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {waveGroups.map((g) => (
          <GroupScore key={g.id} state={state} group={g} busy={busy} act={act} mk={mk} readOnly={readOnly} />
        ))}
      </div>
      {sitOuts.length > 0 && (
        <p className="flex items-center gap-2 px-1 text-sm text-ia-soft">
          <PixelSprite sprite={HOURGLASS} scale={2} className="text-ia-muted" />
          Sans match cette salve : <b className="text-ia-ink">{sitOuts.map((id) => pseudoOf(state, id)).join(', ')}</b>
        </p>
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
  const kind = mk ? 'Course' : 'Match';
  const tone = done ? 'plain' : queued ? 'amber' : group.claims.length > 0 ? 'indigo' : 'cyan';
  return (
    <Card
      tone={tone}
      title={
        <span className="flex items-center gap-2">
          <GameGlyph game={state.game} scale={2} />
          {kind} {letter(group.board)}
        </span>
      }
      right={queued ? <Badge tone="amber">en file</Badge> : group.status === 'playing' ? <Badge tone="cyan">en piste</Badge> : <Badge tone="emerald">saisi</Badge>}
    >
      {!done && !queued && (
        <PlayerClaims
          state={state}
          claims={group.claims}
          busy={busy}
          readOnly={readOnly}
          onValidate={(claim) => void act('score-group', { groupId: group.id, places: claim.places })}
        />
      )}
      {done ? (
        <ol className="space-y-1">
          {done.map((id, i) => (
            <li key={id} className="flex items-center gap-3">
              <span className={`ia-pixel w-9 text-xs ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-ia-ink">{pseudoOf(state, id)}</span>
              {group.counts && <span className="ia-display text-2xl tabular-nums text-ia-gold">+{group.points[id] ?? 0}</span>}
            </li>
          ))}
        </ol>
      ) : queued || readOnly ? (
        <PlayerList state={state} ids={group.playerIds} />
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
            <Btn
              key={id}
              variant="primary"
              disabled={busy || queued}
              onClick={() => {
                const other = group.playerIds.find((x) => x !== id) ?? id;
                void act('score-group', { groupId: group.id, places: [id, other] }, `${pseudoOf(state, id)} gagne ?`);
              }}
            >
              {pseudoOf(state, id)} gagne
            </Btn>
          ))}
        </div>
      )}
    </Card>
  );
}

function PlayerList({ state, ids }: { state: TournamentGmState; ids: string[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {ids.map((id) => (
        <li key={id} className="flex min-w-0 items-center gap-2">
          <Invader seed={id} scale={2} className={invaderTone(id)} />
          <span className="truncate font-bold text-ia-ink">{pseudoOf(state, id)}</span>
        </li>
      ))}
    </ul>
  );
}

function claimsDisagree(claims: TClaim[]): boolean {
  if (claims.length < 2) return false;
  const sig = (c: TClaim) => `${c.loserGames ?? ''}:${c.places.join(',')}`;
  return claims.some((c) => sig(c) !== sig(claims[0]));
}

function claimLine(state: TournamentGmState, claim: TClaim): string {
  const order = claim.places.map((id, i) => `${i + 1}. ${pseudoOf(state, id)}`).join(', ');
  return claim.loserGames === null ? order : `${order} (3-${claim.loserGames})`;
}

/** propositions des joueurs : la dernière est en bas, le GM la valide ou saisit lui-même */
function PlayerClaims({
  state, claims, busy, readOnly, onValidate,
}: {
  state: TournamentGmState;
  claims: TClaim[] | undefined;
  busy: boolean;
  readOnly: boolean;
  onValidate: (claim: TClaim) => void;
}) {
  const list = claims ?? [];
  if (list.length === 0) return null;
  const last = list[list.length - 1];
  const conflict = claimsDisagree(list);
  return (
    <div className={`ia-px mb-3 px-3 py-2.5 text-sm ${conflict ? 'ia-px--amber' : 'ia-px--violet'}`}>
      <p className={`ia-pixel mb-2 text-[11px] ${conflict ? 'text-ia-gold' : 'text-[#c7a8ff]'}`}>
        {conflict ? 'Saisies contradictoires. La dernière est en bas.' : 'Saisie des joueurs, à valider'}
      </p>
      <ul className="space-y-1">
        {list.map((c, i) => (
          <li key={`${c.playerId}-${c.at ?? i}`} className={i === list.length - 1 ? 'text-ia-ink' : 'text-ia-muted'}>
            <span className="font-bold">{pseudoOf(state, c.playerId)}</span>
            {' : '}
            {claimLine(state, c)}
            {i === list.length - 1 && <span className="ia-pixel ml-2 text-[10px] text-ia-cyan">dernière</span>}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-2.5">
          <Btn variant="success" disabled={busy} onClick={() => onValidate(last)}>
            ✓ Valider la dernière saisie
          </Btn>
        </div>
      )}
    </div>
  );
}

/** emplacements de podium : on touche les pseudos dans l'ordre d'arrivée */
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
      <ol className="mb-2 grid gap-1">
        {ids.map((_, i) => {
          const id = order[i];
          return (
            <li key={i} className={`ia-px flex min-h-[36px] items-center gap-3 px-3 ${id ? 'ia-px--plain' : 'ia-px--deep'}`}>
              <span className={`ia-pixel w-9 text-xs ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
              {id ? <span className="truncate font-bold text-ia-ink">{name(id)}</span> : <span className="text-xs text-ia-muted">{i === order.length ? 'touche un pseudo' : '...'}</span>}
            </li>
          );
        })}
      </ol>
      {left.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {left.map((id) => (
            <Btn key={id} disabled={busy} onClick={() => onChange([...order, id])}>
              {name(id)}
            </Btn>
          ))}
        </div>
      )}
      {order.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Btn disabled={busy} onClick={() => onChange([])}>
            Recommencer
          </Btn>
          <Btn variant="primary" disabled={busy || order.length !== ids.length} onClick={onSubmit}>
            Valider l'ordre
          </Btn>
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
      <Card title="Classement" tone="plain">
        <ol className="space-y-1">
          {state.standings
            .filter((s) => s.status !== 'excluded')
            .slice(0, 12)
            .map((s) => (
              <li key={s.playerId} className="flex items-center gap-3 text-sm">
                <span className={`ia-pixel w-10 text-right text-xs ${rankClass(s.rank)}`}>{rankText(s.rank)}</span>
                <span className="flex w-6 justify-center">{s.rank === 1 ? <Crown scale={2} /> : <Invader seed={s.playerId} scale={2} className={invaderTone(s.playerId)} />}</span>
                <span className="min-w-0 flex-1 truncate font-bold text-ia-ink">{s.pseudo}</span>
                <span className="ia-display text-2xl tabular-nums text-ia-cyan">{s.points}</span>
                <span className="ia-pixel text-[10px] text-ia-muted">pts</span>
              </li>
            ))}
        </ol>
      </Card>
      {!readOnly && (
        <>
          <Btn variant="primary" big full disabled={busy || actifs < 2} onClick={() => void act('start-wave', {}, 'Lancer la salve suivante ?')}>
            ▶ Salve suivante
          </Btn>
          <Barrage state={state} busy={busy} act={act} mk={mk} />
          <Card title="Phase finale" tone="gold">
            <p className="mb-3 text-sm text-ia-soft">
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
          <Btn variant="warn" disabled={busy} onClick={() => void act('finish', {}, 'Terminer sur ce classement, sans phase finale ?')}>
            🏁 Terminer sur ce classement
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
    <Card title="Barrage" tone="indigo">
      <p className="mb-2 text-sm text-ia-soft">Un ou deux matchs, sans point de poule. Le résultat ne réordonne que ces joueurs entre eux.</p>
      {built.map((ids, i) => (
        <p key={i} className="ia-px ia-px--deep mb-1.5 px-3 py-2 text-sm font-bold text-ia-ink">
          <span className="ia-pixel mr-2 text-[11px] text-[#c7a8ff]">Match {i + 1}</span>
          {ids.map((id) => pseudoOf(state, id)).join(', ')}
        </p>
      ))}
      {built.length < 2 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pool.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Btn
                key={p.id}
                variant={on ? 'primary' : 'secondary'}
                disabled={busy || (!on && picked.length >= max)}
                onClick={() => setPicked(on ? picked.filter((id) => id !== p.id) : [...picked, p.id])}
              >
                {p.pseudo}
              </Btn>
            );
          })}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Btn
          disabled={busy || !ok || built.length >= 2}
          onClick={() => {
            setBuilt([...built, picked]);
            setPicked([]);
          }}
        >
          Ajouter ce match
        </Btn>
        <Btn
          variant="primary"
          disabled={busy || built.length === 0}
          onClick={() =>
            void act('start-barrage', { groups: built }, 'Lancer le barrage ?').then(() => {
              setBuilt([]);
              setPicked([]);
            })
          }
        >
          Lancer le barrage
        </Btn>
      </div>
    </Card>
  );
}

const ROUND_ORDER: Array<TBracketMatch['round']> = ['qf', 'sf', 'semi', 'final'];
const ROUND_TITLE: Record<TBracketMatch['round'], string> = { qf: 'Quarts', sf: 'Demies', semi: 'Demies', final: 'Finale' };

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
  const rounds = ROUND_ORDER.map((r) => matches.filter((m) => m.round === r)).filter((l) => l.length > 0);
  return (
    <>
      {rounds.map((list) => (
        <div key={list[0].round} className="space-y-2">
          <p className={`ia-pixel px-1 text-[11px] ${list[0].round === 'final' ? 'text-ia-gold' : 'text-ia-soft'}`}>{ROUND_TITLE[list[0].round]}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((m) => (
              <Card
                key={m.id}
                tone={m.places ? (m.round === 'final' ? 'gold' : 'plain') : m.status === 'pending' && m.playerIds.length >= 2 ? (m.claims.length > 0 ? 'indigo' : 'cyan') : 'plain'}
                title={m.label}
                right={<Badge tone={m.status === 'pending' ? 'cyan' : m.status === 'done' ? 'emerald' : 'slate'}>{m.status === 'waiting' ? 'en attente' : m.status === 'done' ? 'terminé' : 'à jouer'}</Badge>}
              >
                {m.places ? (
                  <div className="space-y-1">
                    {m.places.map((id, i) => (
                      <p key={id} className="flex items-center gap-3">
                        <span className={`ia-pixel w-9 text-xs ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
                        <span className="min-w-0 flex-1 truncate font-bold text-ia-ink">{pseudoOf(state, id)}</span>
                        {i === 0 && m.loserGames !== null && <span className="ia-pixel text-sm text-ia-gold">3-{m.loserGames}</span>}
                        {i === 0 && <PixelSprite sprite={CHECK} scale={2} className="text-ia-mint" />}
                      </p>
                    ))}
                  </div>
                ) : m.playerIds.length < 2 ? (
                  <p className="text-sm text-ia-muted">En attente des qualifiés</p>
                ) : (
                  <>
                    <PlayerClaims
                      state={state}
                      claims={m.claims}
                      busy={busy}
                      readOnly={readOnly}
                      onValidate={(claim) => void act('score-bracket', { matchId: m.id, places: claim.places, loserGames: claim.loserGames })}
                    />
                    {readOnly ? (
                      <PlayerList state={state} ids={m.playerIds} />
                    ) : mk ? (
                      <BracketPlaces state={state} matchId={m.id} ids={m.playerIds} busy={busy} act={act} />
                    ) : (
                      <SmashScore state={state} matchId={m.id} ids={m.playerIds} busy={busy} act={act} />
                    )}
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
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

/** Smash en phase finale : le vainqueur, puis 3-0, 3-1 ou 3-2 */
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
            {winner === id && '★ '}
            {pseudoOf(state, id)}
          </Btn>
        ))}
      </div>
      {winner && loser && (
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((n) => (
            <Btn key={n} variant="success" disabled={busy} onClick={() => void act('score-bracket', { matchId, places: [winner, loser], loserGames: n }, `${pseudoOf(state, winner)} gagne 3-${n} ?`)}>
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
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Ajouter un pseudo" className={`${inputClass} flex-1`} />
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
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {state.players.map((p) => (
          <li key={p.id} className={`ia-px ia-px--deep flex min-h-[48px] items-center justify-between gap-2 px-3 text-sm ${p.status === 'active' ? '' : 'opacity-50'}`}>
            <span className="flex min-w-0 items-center gap-2.5">
              <Invader seed={p.id} scale={2} className={invaderTone(p.id)} />
              <span className="truncate font-bold text-ia-ink">{p.pseudo}</span>
            </span>
            {!readOnly && p.status === 'active' && state.phase !== 'final' && (
              <button
                type="button"
                className="ia-btn ia-btn--ghost-red min-h-[40px] shrink-0 px-3 text-xs"
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
