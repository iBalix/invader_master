/**
 * Corps de la console du gestionnaire d'événements, SANS accès réseau : il ne
 * reçoit que l'état et une fonction d'action. Le laboratoire le monte avec
 * des données factices (même patron que BattleGmBody).
 *
 * L'animateur pilote depuis son téléphone : un bouton du moment en haut, les
 * onglets dessous, et chaque décision délicate passe par une confirmation.
 */

import { useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorPlay, QrCode, RefreshCw, Smartphone, Square, Tv } from 'lucide-react';
import { QrCanvas } from '../../game/ui/bits';
import { useServerNow } from '../../game/tournament/useTournamentSession';
import {
  currentRoundOf,
  fmtScore,
  formatSummary,
  pseudoOf,
  rankLabel,
  roundLabel,
  tournamentUrl,
} from '../../game/tournament/tournamentClient';
import type { TMatch, TournamentGmState, TRound, TStanding } from '../../game/tournament/tournamentTypes';
import { Badge, Btn, Card, NarrowContext, Sheet, inputClass, useMeasuredNarrow } from './ui';

export type GmAction = (name: string, params?: Record<string, unknown>, confirm?: string) => Promise<void>;

type Tab = 'ronde' | 'classement' | 'joueurs' | 'historique' | 'ecrans';

const PHASE_LABELS: Record<string, string> = {
  registration: 'Inscriptions',
  round: 'Ronde en cours',
  round_done: 'Fin de ronde',
  final: 'Podium',
};

export function TournamentGmBody({
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
  /** événement passé : consultation seule */
  readOnly?: boolean;
}) {
  const [ref, narrow] = useMeasuredNarrow();
  const [tab, setTab] = useState<Tab>(state.phase === 'registration' ? 'joueurs' : 'ronde');
  const [matchOpen, setMatchOpen] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState<string | null>(null);
  const act: GmAction = readOnly ? async () => undefined : action;

  const allMatches = useMemo(() => state.rounds.flatMap((r) => r.matches), [state.rounds]);
  const selectedMatch = matchOpen ? allMatches.find((m) => m.id === matchOpen) ?? null : null;

  return (
    <NarrowContext.Provider value={narrow}>
      <div ref={ref} className="mx-auto max-w-[1200px] px-3 pb-16 pt-3 sm:px-5">
        <Header state={state} onRefresh={onRefresh} action={act} onClosed={onClosed} readOnly={readOnly} />
        {state.gm.alerts.length > 0 && !readOnly && (
          <div className="mt-3 space-y-2">
            {state.gm.alerts.map((a) => (
              <p key={a} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200">
                ⚠️ {a}
              </p>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="mt-3">
            <MainAction state={state} busy={busy} action={act} onClosed={onClosed} />
          </div>
        )}
        <Tabs tab={tab} onTab={setTab} />
        <div className="mt-3">
          {tab === 'ronde' && <RoundTab state={state} busy={busy} action={act} onMatch={setMatchOpen} readOnly={readOnly} />}
          {tab === 'classement' && <StandingsTab state={state} onPlayer={setPlayerOpen} />}
          {tab === 'joueurs' && <PlayersTab state={state} busy={busy} action={act} onPlayer={setPlayerOpen} readOnly={readOnly} />}
          {tab === 'historique' && <HistoryTab state={state} onMatch={setMatchOpen} />}
          {tab === 'ecrans' && <ScreensTab state={state} busy={busy} action={act} readOnly={readOnly} />}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">{formatSummary(state)}</p>
      </div>
      {selectedMatch && (
        <MatchSheet state={state} m={selectedMatch} busy={busy} action={act} readOnly={readOnly} onClose={() => setMatchOpen(null)} />
      )}
      {playerOpen && (
        <PlayerSheet state={state} playerId={playerOpen} busy={busy} action={act} readOnly={readOnly} onClose={() => setPlayerOpen(null)} />
      )}
    </NarrowContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// En-tête
// ---------------------------------------------------------------------------

function Header({
  state,
  onRefresh,
  action,
  onClosed,
  readOnly,
}: {
  state: TournamentGmState;
  onRefresh: () => void;
  action: GmAction;
  onClosed: () => void;
  readOnly: boolean;
}) {
  const narrow = useContext(NarrowContext);
  const [qr, setQr] = useState(false);
  const round = currentRoundOf(state);
  const screenQuery = state.config.testMode ? `?tournament=${state.id}` : '';
  const bouton = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5';
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex min-w-0 gap-2 ${narrow ? 'flex-col items-start gap-1' : 'items-center'}`}>
            <h1 className="max-w-full truncate text-sm font-black lg:text-lg">♞ {state.title}</h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone={state.ended ? 'slate' : state.phase === 'round' ? 'indigo' : state.phase === 'final' ? 'amber' : 'cyan'}>
                {state.ended ? 'Clos' : PHASE_LABELS[state.phase] ?? state.phase}
              </Badge>
              {state.config.testMode && <Badge tone="amber">🧪 TEST</Badge>}
            </div>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400 lg:text-xs">
            {round ? `${roundLabel(state, round.number)} · ` : ''}
            <span className="font-bold text-slate-200">{state.playerCount}</span> joueur{state.playerCount > 1 ? 's' : ''} ·{' '}
            <span className="font-mono font-bold text-slate-200">{state.joinCode}</span>
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={async () => {
              await action('abort', {}, "Arrêter l'événement ? Le tournoi est clos tout de suite et les écrans reviennent à l'accueil.");
              onClosed();
            }}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-400/10 px-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-400/20"
          >
            <Square size={14} /> Arrêter
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onRefresh} className={bouton} aria-label="Rafraîchir">
          <RefreshCw size={14} />
        </button>
        <button type="button" onClick={() => setQr(true)} className={bouton}>
          <QrCode size={14} /> {!narrow && 'QR inscription'}
        </button>
        <a href={tournamentUrl(state.joinCode)} target="_blank" rel="noreferrer" className={bouton}>
          <Smartphone size={14} /> {!narrow && 'Joueur ↗'}
        </a>
        <a href={`${window.location.origin}/screen/PROJO${screenQuery}`} target="_blank" rel="noreferrer" className={bouton}>
          <MonitorPlay size={14} /> {!narrow && 'Projo ↗'}
        </a>
        <a href={`${window.location.origin}/screen/BAR${screenQuery}`} target="_blank" rel="noreferrer" className={bouton}>
          <Tv size={14} /> {!narrow && 'Bar ↗'}
        </a>
      </div>
      {qr &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 px-6" onClick={() => setQr(false)}>
            <div className="rounded-2xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 font-bold text-gray-900">Inscription au tournoi</h3>
              <QrCanvas value={tournamentUrl(state.joinCode)} size={240} />
              <p className="mt-3 font-mono text-2xl font-black tracking-[0.3em] text-gray-900">{state.joinCode}</p>
              <p className="mt-1 break-all text-xs text-gray-400">{tournamentUrl(state.joinCode)}</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le bouton du moment
// ---------------------------------------------------------------------------

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MainAction({ state, busy, action, onClosed }: { state: TournamentGmState; busy: boolean; action: GmAction; onClosed: () => void }) {
  const now = useServerNow(1000);
  const round = currentRoundOf(state);
  const actifs = state.players.filter((p) => p.status === 'active').length;

  if (state.ended) {
    return (
      <Card tone="indigo">
        <p className="text-sm text-slate-300">Cet événement est clos. Les écrans sont revenus à leur affichage par défaut.</p>
        <div className="mt-3">
          <Btn variant="secondary" onClick={onClosed}>
            Retour aux événements
          </Btn>
        </div>
      </Card>
    );
  }

  if (state.phase === 'registration') {
    const reste = state.phaseEndsAt ? state.phaseEndsAt - now : null;
    return (
      <Card tone="indigo">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Inscriptions ouvertes</p>
            <p className="text-3xl font-black tabular-nums text-white">
              {state.waitingForPlayers || reste === null ? 'En attente' : reste > 0 ? mmss(reste) : 'Tirage...'}
            </p>
            <p className="text-sm text-slate-400">
              {actifs} inscrit{actifs > 1 ? 's' : ''} · tirage automatique à zéro
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Btn
            variant="primary"
            big
            disabled={busy || actifs < 2}
            onClick={() => void action('start-now', {}, `Lancer la ronde 1 maintenant avec ${actifs} joueurs ?`)}
          >
            ▶ Démarrer maintenant
          </Btn>
          <Btn variant="secondary" big disabled={busy} onClick={() => void action('add-time', { minutes: 2 })}>
            +2 min
          </Btn>
          <Btn variant="secondary" big disabled={busy} onClick={() => void action('add-time', { minutes: 5 })}>
            +5 min
          </Btn>
        </div>
      </Card>
    );
  }

  if (state.phase === 'round' && round) {
    const done = round.matches.filter((m) => m.status === 'done' || m.status === 'cancelled').length;
    const total = round.matches.length;
    return (
      <Card tone="indigo">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">{roundLabel(state, round.number)} en cours</p>
        <p className="text-3xl font-black text-white">
          {done}/{total} <span className="text-lg font-bold text-slate-400">{total > 1 ? 'matchs terminés' : 'match terminé'}</span>
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${total ? (done / total) * 100 : 0}%`, transition: 'width 500ms ease' }} />
        </div>
        {round.waiting && (
          <p className="mt-2 text-sm text-violet-200">⏳ {pseudoOf(state, round.waiting)} est exempt et attend un adversaire.</p>
        )}
        <p className="mt-2 text-xs text-slate-500">La ronde se termine seule quand tous les matchs sont joués.</p>
        <div className="mt-3">
          <Btn
            variant="danger"
            disabled={busy}
            onClick={() =>
              void action('close-round', {}, 'Clôturer la ronde maintenant ? Les matchs non joués sont annulés (aucun point).')
            }
          >
            Clôturer la ronde
          </Btn>
        </div>
      </Card>
    );
  }

  if (state.phase === 'round_done' && round) {
    return (
      <Card tone="indigo">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">✅ {roundLabel(state, round.number)} terminée</p>
        <p className="mt-1 text-sm text-slate-300">
          {actifs} joueur{actifs > 1 ? 's' : ''} actif{actifs > 1 ? 's' : ''} pour la suite. Le projecteur affiche les résultats et le classement.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Btn variant="primary" big disabled={busy || actifs < 2} onClick={() => void action('next-round')}>
            ▶ Lancer la ronde {round.number + 1}
          </Btn>
          <Btn
            variant="warn"
            big
            disabled={busy}
            onClick={() => void action('finish', {}, 'Terminer le tournoi ? Le classement final et le podium s’affichent.')}
          >
            🏁 Terminer le tournoi
          </Btn>
        </div>
      </Card>
    );
  }

  // final
  const reste = state.phaseEndsAt ? state.phaseEndsAt - now : null;
  return (
    <Card tone="amber">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-300">🏆 Podium affiché</p>
      <p className="mt-1 text-sm text-slate-300">
        Vainqueur : <b className="text-amber-200">{state.standings.find((s) => s.status !== 'excluded')?.pseudo ?? '?'}</b>
        {reste !== null && reste > 0 && <> · écrans libérés automatiquement dans {mmss(reste)}</>}
      </p>
      <div className="mt-3">
        <Btn
          variant="primary"
          big
          disabled={busy}
          onClick={async () => {
            await action('close', {}, "Libérer les écrans ? Le tournoi est clos et les écrans reviennent à l'accueil.");
            onClosed();
          }}
        >
          Libérer les écrans
        </Btn>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const narrow = useContext(NarrowContext);
  const items: Array<{ key: Tab; label: string }> = [
    { key: 'ronde', label: 'Ronde' },
    { key: 'classement', label: 'Classement' },
    { key: 'joueurs', label: 'Joueurs' },
    { key: 'historique', label: 'Historique' },
    { key: 'ecrans', label: 'Écrans' },
  ];
  return (
    <div className={`mt-4 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 ${narrow ? 'grid grid-cols-3' : 'flex'}`}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onTab(it.key)}
          className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-bold ${
            tab === it.key ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function statusBadge(m: TMatch): React.ReactNode {
  if (m.status === 'playing') return <Badge tone="cyan">♟ en cours</Badge>;
  if (m.status === 'pending') return <Badge tone="slate">{m.games.length > 0 ? 'partie suivante' : 'à jouer'}</Badge>;
  if (m.status === 'cancelled') return <Badge tone="slate">annulé</Badge>;
  if (m.result === 'draw') return <Badge tone="amber">nul</Badge>;
  if (m.result === 'bye') return <Badge tone="amber">exempt</Badge>;
  return <Badge tone="emerald">{m.result === 'forfeit_a' || m.result === 'forfeit_b' ? 'forfait' : 'terminé'}</Badge>;
}

function winnerId(m: TMatch): string | null {
  if (m.result === 'a' || m.result === 'forfeit_a') return m.a;
  if (m.result === 'b' || m.result === 'forfeit_b') return m.b;
  return null;
}

function MatchRow({ state, m, onOpen }: { state: TournamentGmState; m: TMatch; onOpen: () => void }) {
  const narrow = useContext(NarrowContext);
  const w = winnerId(m);
  const live = m.live ? state.gm.liveInfo[m.live.ref] : undefined;
  const idleMin = live?.lastMoveAt ? Math.floor((Date.now() - live.lastMoveAt) / 60_000) : null;
  const name = (id: string | null, color: 'w' | 'b' | null) => (
    <span className={`min-w-0 truncate font-semibold ${w === id ? 'text-emerald-300' : w && id ? 'text-slate-500' : 'text-slate-100'}`}>
      {color && <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-white/50 align-middle" style={{ background: color === 'w' ? '#F5F2FF' : '#14101B' }} />}
      {pseudoOf(state, id)}
    </span>
  );
  const colorB = m.colorA ? (m.colorA === 'w' ? 'b' : 'w') : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-lg border px-3 py-2.5 text-left hover:bg-white/10 ${
        m.status === 'playing' ? 'border-cyan-400/30 bg-cyan-500/[0.06]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className={`flex gap-2 text-sm ${narrow ? 'flex-wrap items-center' : 'items-center'}`}>
        <span className="w-8 shrink-0 text-xs font-black text-slate-500">#{m.board}</span>
        {narrow && <span className="ml-auto shrink-0">{statusBadge(m)}</span>}
        {m.kind === 'bye' ? (
          <span className={`truncate font-semibold text-amber-200 ${narrow ? 'w-full' : 'flex-1'}`}>
            {pseudoOf(state, m.a)} exempt (+{fmtScore(m.points.a)})
          </span>
        ) : (
          <span className={`flex min-w-0 items-center gap-1.5 ${narrow ? 'w-full text-base' : 'flex-1'}`}>
            {name(m.a, m.colorA)}
            <span className="shrink-0 text-xs text-slate-500">{m.games.length > 0 ? `${fmtScore(m.score.a)}-${fmtScore(m.score.b)}` : 'vs'}</span>
            {name(m.b, colorB)}
          </span>
        )}
        {!narrow && <span className="shrink-0">{statusBadge(m)}</span>}
      </div>
      {(m.kind === 'floater' || m.rematch || m.gmLocked || idleMin !== null) && (
        <div className={`mt-1 flex flex-wrap gap-1.5 ${narrow ? '' : 'pl-10'}`}>
          {m.kind === 'floater' && <Badge tone="violet">bonus, compte pour {pseudoOf(state, m.a)}</Badge>}
          {m.rematch && <Badge tone="amber">revanche</Badge>}
          {m.gmLocked && <Badge tone="indigo">saisi par le GM</Badge>}
          {idleMin !== null && (
            <Badge tone={idleMin >= 10 ? 'rose' : 'slate'}>
              {live?.moves ?? 0} coup{(live?.moves ?? 0) > 1 ? 's' : ''} · dernier il y a {idleMin} min
            </Badge>
          )}
        </div>
      )}
    </button>
  );
}

function RoundTab({
  state,
  busy,
  action,
  onMatch,
  readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  action: GmAction;
  onMatch: (id: string) => void;
  readOnly: boolean;
}) {
  const round = currentRoundOf(state);
  const [picker, setPicker] = useState(false);
  if (!round) {
    return (
      <Card>
        <p className="text-sm text-slate-400">
          Pas encore de ronde : le tirage de la ronde 1 a lieu à la fin du compte à rebours (ou avec « Démarrer maintenant »).
        </p>
      </Card>
    );
  }
  const busyIds = new Set(
    round.matches.filter((m) => m.status === 'pending' || m.status === 'playing').flatMap((m) => [m.a, m.b]).filter(Boolean) as string[],
  );
  const candidates = state.players.filter((p) => p.status === 'active' && p.id !== round.waiting && !busyIds.has(p.id));
  const pendingFloater = round.matches.find((m) => m.kind === 'floater' && m.status === 'pending' && m.games.length === 0 && !m.live);
  const waitingId = round.waiting ?? pendingFloater?.a ?? null;
  return (
    <div className="space-y-3">
      <Card title={`${roundLabel(state, round.number)} · ${round.matches.length} match${round.matches.length > 1 ? 's' : ''}`}>
        <div className="space-y-1.5">
          {round.matches.map((m) => (
            <MatchRow key={m.id} state={state} m={m} onOpen={() => onMatch(m.id)} />
          ))}
        </div>
      </Card>
      {waitingId && state.phase === 'round' && !readOnly && (
        <Card tone="indigo" title="Exempt">
          <p className="text-sm text-slate-300">
            {round.waiting
              ? `${pseudoOf(state, waitingId)} attend : le premier match terminé lui donnera un adversaire (tiré au hasard).`
              : `${pseudoOf(state, waitingId)} a reçu un adversaire, la partie n'a pas commencé : tu peux le changer.`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Btn variant="secondary" disabled={busy || candidates.length === 0} onClick={() => setPicker(true)}>
              Choisir son adversaire
            </Btn>
            <Btn
              variant="warn"
              disabled={busy}
              onClick={() =>
                void action('grant-bye', {}, `Accorder l'exempt à ${pseudoOf(state, waitingId)} ? Il marque ${fmtScore(state.config.points.bye)} points sans jouer.`)
              }
            >
              Accorder l'exempt (+{fmtScore(state.config.points.bye)})
            </Btn>
          </div>
        </Card>
      )}
      {picker && (
        <Sheet title={`Adversaire de ${pseudoOf(state, waitingId)}`} onClose={() => setPicker(false)}>
          <p className="mb-3 text-sm text-slate-400">Joueurs libres (sans match en cours) :</p>
          <div className="grid gap-1.5">
            {candidates.map((p) => (
              <Btn
                key={p.id}
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setPicker(false);
                  await action('assign-floater', { playerId: p.id });
                }}
              >
                {p.pseudo}
              </Btn>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function StandingsTab({ state, onPlayer }: { state: TournamentGmState; onPlayer: (id: string) => void }) {
  return (
    <Card title="Classement" right={<span className="text-xs text-slate-500">pts · V/N/D · Buchholz</span>}>
      {state.standings.length === 0 ? (
        <p className="text-sm text-slate-400">Personne pour l'instant.</p>
      ) : (
        <div className="space-y-1">
          {state.standings.map((s) => (
            <StandingButton key={s.playerId} s={s} onOpen={() => onPlayer(s.playerId)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function StandingButton({ s, onOpen }: { s: TStanding; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/10 ${s.status !== 'active' ? 'opacity-50' : ''}`}
    >
      <span className={`w-9 shrink-0 font-black ${s.rank <= 3 ? 'text-amber-300' : 'text-slate-500'}`}>
        {s.rank}
        {s.tied ? '=' : ''}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {s.pseudo}
        {s.status === 'left' && <span className="ml-1.5 text-xs text-slate-500">parti</span>}
        {s.status === 'excluded' && <span className="ml-1.5 text-xs text-rose-300">exclu</span>}
      </span>
      {s.adjustment !== 0 && <Badge tone="indigo">{s.adjustment > 0 ? '+' : ''}{fmtScore(s.adjustment)} GM</Badge>}
      <span className="shrink-0 text-xs tabular-nums text-slate-400">
        {s.wins}/{s.draws}/{s.losses} · {fmtScore(s.buchholz)}
      </span>
      <span className="w-10 shrink-0 text-right font-mono font-black text-indigo-300">{fmtScore(s.points)}</span>
    </button>
  );
}

function PlayersTab({
  state,
  busy,
  action,
  onPlayer,
  readOnly,
}: {
  state: TournamentGmState;
  busy: boolean;
  action: GmAction;
  onPlayer: (id: string) => void;
  readOnly: boolean;
}) {
  const [pseudo, setPseudo] = useState('');
  const roster = [...state.gm.roster].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  return (
    <div className="space-y-3">
      {!readOnly && state.phase !== 'final' && (
        <Card title="Inscrire un joueur à la main" right={<span className="text-xs text-slate-500">sans téléphone</span>}>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={pseudo}
              maxLength={16}
              placeholder="Pseudo"
              onChange={(e) => setPseudo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pseudo.trim()) {
                  void action('add-player', { pseudo: pseudo.trim() }).then(() => setPseudo(''));
                }
              }}
            />
            <Btn
              variant="primary"
              disabled={busy || !pseudo.trim()}
              onClick={() => void action('add-player', { pseudo: pseudo.trim() }).then(() => setPseudo(''))}
            >
              Ajouter
            </Btn>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            S'il scanne le QR plus tard avec ce même pseudo, son téléphone reprend cette inscription.
          </p>
        </Card>
      )}
      <Card title={`Joueurs (${roster.length})`}>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-400">Personne pour l'instant : le QR est affiché sur les TV du bar.</p>
        ) : (
          <div className="space-y-1">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPlayer(p.id)}
                className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/10 ${p.status !== 'active' ? 'opacity-50' : ''}`}
              >
                <span className="shrink-0">{p.gmAdded ? '✍️' : '📱'}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.pseudo}</span>
                {p.gmAdded && <Badge tone="slate">sans téléphone</Badge>}
                {p.status === 'left' && <Badge tone="slate">parti</Badge>}
                {p.status === 'excluded' && <Badge tone="rose">exclu</Badge>}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HistoryTab({ state, onMatch }: { state: TournamentGmState; onMatch: (id: string) => void }) {
  const rounds = [...state.rounds].reverse();
  return (
    <div className="space-y-3">
      {rounds.length === 0 && (
        <Card>
          <p className="text-sm text-slate-400">Aucune ronde jouée.</p>
        </Card>
      )}
      {rounds.map((r: TRound) => (
        <Card
          key={r.number}
          title={roundLabel(state, r.number)}
          right={<span className="text-xs text-slate-500">{r.finishedAt ? 'terminée' : 'en cours'}</span>}
        >
          <div className="space-y-1.5">
            {r.matches.map((m) => (
              <MatchRow key={m.id} state={state} m={m} onOpen={() => onMatch(m.id)} />
            ))}
          </div>
        </Card>
      ))}
      {state.gm.ignored.length > 0 && (
        <Card title="Parties écartées">
          <p className="mb-2 text-xs text-slate-500">Remontées automatiques non comptées (match déjà décidé, résultat saisi par le GM...).</p>
          <div className="space-y-1 text-xs text-slate-400">
            {state.gm.ignored.map((g) => (
              <p key={g.ref}>
                <span className="font-mono">{g.ref.slice(0, 8)}</span> · {g.reason === 'gm_locked' ? 'résultat déjà saisi par le GM' : 'match déjà décidé'}
              </p>
            ))}
          </div>
        </Card>
      )}
      <p className="text-center text-xs text-slate-500">{state.gm.countedGames} partie{state.gm.countedGames > 1 ? 's' : ''} d'échecs remontée{state.gm.countedGames > 1 ? 's' : ''} automatiquement</p>
    </div>
  );
}

function ScreensTab({ state, busy, action, readOnly }: { state: TournamentGmState; busy: boolean; action: GmAction; readOnly: boolean }) {
  const now = useServerNow(1000);
  const pinned = state.pin && state.pin.until && state.pin.until > now ? state.pin : null;
  const d = state.config.display;
  return (
    <div className="space-y-3">
      <Card title="Projecteur">
        <p className="text-sm text-slate-400">
          Rotation automatique : classement {d.standingsMs / 1000} s, matchs {d.roundMs / 1000} s
          {d.liveMs > 0 ? `, puis chaque partie en cours ${Math.round(d.liveMs / 1000)} s, l'une après l'autre` : ''}.
        </p>
        {pinned && (
          <p className="mt-2 text-sm font-semibold text-indigo-200">
            📌 Vue imposée ({pinned.view === 'standings' ? 'classement' : pinned.view === 'round' ? 'matchs' : 'match'}) encore {Math.round(((pinned.until ?? now) - now) / 1000)} s
          </p>
        )}
        {!readOnly && state.phase === 'round' && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Btn disabled={busy} onClick={() => void action('pin-screen', { view: 'standings', seconds: 60 })}>
              📌 Classement 60 s
            </Btn>
            <Btn disabled={busy} onClick={() => void action('pin-screen', { view: 'round', seconds: 60 })}>
              📌 Matchs 60 s
            </Btn>
            <Btn disabled={busy || !pinned} onClick={() => void action('pin-screen', { view: null })}>
              Reprendre la rotation
            </Btn>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Pour montrer un match précis, ouvre-le dans l'onglet Ronde.</p>
      </Card>
      {!readOnly && (
        <Card title="Écrans du bar (PROJO, BAR01, BAR02)">
          {state.config.testMode ? (
            <p className="text-sm text-amber-200">Tournoi de test : les écrans du bar ne sont pas basculés.</p>
          ) : (
            <p className="text-sm text-slate-400">Si un écran n'a pas basculé au lancement (agent du bar absent), renvoie-les sur le tournoi.</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Btn disabled={busy || state.config.testMode} onClick={() => void action('rescreen')}>
              🔁 Rebasculer les écrans
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={() => void action('close', {}, "Libérer les écrans maintenant ? Le tournoi est clos.")}
            >
              Libérer les écrans (clore)
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feuilles : match, joueur
// ---------------------------------------------------------------------------

function MatchSheet({
  state,
  m,
  busy,
  action,
  readOnly,
  onClose,
}: {
  state: TournamentGmState;
  m: TMatch;
  busy: boolean;
  action: GmAction;
  readOnly: boolean;
  onClose: () => void;
}) {
  const round = currentRoundOf(state);
  const isCurrent = round?.number === m.round && state.phase !== 'final';
  const open = m.status === 'pending' || m.status === 'playing';
  const a = pseudoOf(state, m.a);
  const b = pseudoOf(state, m.b);
  const past = !isCurrent;
  const confirmPast = past ? ' Les appariements des rondes suivantes ne changent pas, seul le classement est recalculé.' : '';
  const set = (result: string, label: string) =>
    void action('set-match-result', { matchId: m.id, result }, `${label} ?${confirmPast}`).then(onClose);
  const multi = state.config.match.games > 1;

  return (
    <Sheet title={m.kind === 'bye' ? `Exempt · ${a}` : `Match ${m.board} · ${a} contre ${b}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {statusBadge(m)}
          {m.kind === 'floater' && <Badge tone="violet">partie bonus, compte pour {a}</Badge>}
          {m.gmLocked && <Badge tone="indigo">résultat saisi par le GM</Badge>}
          <Badge tone="slate">{roundLabel(state, m.round)}</Badge>
        </div>
        {m.games.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Parties</p>
            {m.games.map((g, i) => (
              <p key={i} className="text-slate-300">
                Partie {i + 1} : {g.winner === null ? 'nulle' : `${g.winner === 'a' ? a : b} gagne`}
                <span className="text-slate-500"> · {g.source === 'gm' ? 'saisie GM' : g.reason ?? 'auto'}</span>
              </p>
            ))}
            {multi && <p className="mt-1 font-bold text-slate-200">Score du match : {fmtScore(m.score.a)} - {fmtScore(m.score.b)}</p>}
          </div>
        )}
        {m.status === 'done' && m.kind !== 'bye' && (
          <p className="text-sm text-slate-300">
            Points : {a} +{fmtScore(m.points.a)}
            {m.kind === 'normal' && <> · {b} +{fmtScore(m.points.b)}</>}
          </p>
        )}

        {!readOnly && m.kind === 'bye' && (
          <div className="grid gap-2">
            {m.status !== 'cancelled' ? (
              <Btn variant="danger" disabled={busy} onClick={() => set('cancelled', `Annuler l'exempt de ${a} (plus de points)`)}>
                Annuler l'exempt
              </Btn>
            ) : (
              <Btn disabled={busy} onClick={() => set('bye', `Rétablir l'exempt de ${a}`)}>
                Rétablir l'exempt
              </Btn>
            )}
          </div>
        )}

        {!readOnly && m.kind !== 'bye' && (
          <>
            {isCurrent && open && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {multi ? 'Saisir une partie' : 'Saisir le résultat'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Btn variant="success" disabled={busy} onClick={() => void action('record-game', { matchId: m.id, winner: 'a' }).then(onClose)}>
                    {a}
                  </Btn>
                  <Btn variant="warn" disabled={busy} onClick={() => void action('record-game', { matchId: m.id, winner: 'draw' }).then(onClose)}>
                    Nulle
                  </Btn>
                  <Btn variant="success" disabled={busy} onClick={() => void action('record-game', { matchId: m.id, winner: 'b' }).then(onClose)}>
                    {b}
                  </Btn>
                </div>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Imposer le résultat du match</p>
              <div className="grid grid-cols-2 gap-2">
                <Btn disabled={busy} onClick={() => set('a', `${a} gagne le match`)}>
                  {a} gagne
                </Btn>
                <Btn disabled={busy} onClick={() => set('b', `${b} gagne le match`)}>
                  {b} gagne
                </Btn>
                <Btn disabled={busy} onClick={() => set('draw', 'Match nul')}>
                  Match nul
                </Btn>
                <Btn disabled={busy} onClick={() => set('cancelled', 'Annuler le match (aucun point)')}>
                  Annuler le match
                </Btn>
                <Btn disabled={busy} onClick={() => set('forfeit_b', `Forfait de ${a} (${b} gagne)`)}>
                  Forfait de {a}
                </Btn>
                <Btn disabled={busy} onClick={() => set('forfeit_a', `Forfait de ${b} (${a} gagne)`)}>
                  Forfait de {b}
                </Btn>
              </div>
              {m.live && (
                <p className="mt-2 text-xs text-amber-200">
                  Une partie est en cours sur une table : un résultat imposé la fera ignorer.
                </p>
              )}
            </div>
            {isCurrent && !open && (
              <Btn variant="secondary" disabled={busy} onClick={() => set('reset', 'Rouvrir ce match (les parties déjà comptées sont annulées)')}>
                ↩ Rouvrir le match
              </Btn>
            )}
            {isCurrent && m.live && state.phase === 'round' && (
              <Btn
                variant="secondary"
                disabled={busy}
                onClick={() => void action('pin-screen', { view: 'match', matchId: m.id, seconds: 180 }).then(onClose)}
              >
                📺 Montrer ce match au projecteur (3 min)
              </Btn>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function PlayerSheet({
  state,
  playerId,
  busy,
  action,
  readOnly,
  onClose,
}: {
  state: TournamentGmState;
  playerId: string;
  busy: boolean;
  action: GmAction;
  readOnly: boolean;
  onClose: () => void;
}) {
  const player = state.gm.roster.find((p) => p.id === playerId);
  const s = state.standings.find((x) => x.playerId === playerId);
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const [rename, setRename] = useState(player?.pseudo ?? '');
  const adjustments = state.gm.adjustments[playerId] ?? [];
  if (!player) return null;
  const adjust = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return;
    void action('adjust-score', { playerId, delta: n, reason: reason.trim() || 'correction GM' });
  };
  return (
    <Sheet title={player.pseudo} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {s && <Badge tone="indigo">{rankLabel(s.rank)} · {fmtScore(s.points)} pts</Badge>}
          {s && <Badge tone="slate">{s.wins}V {s.draws}N {s.losses}D</Badge>}
          {player.status === 'left' && <Badge tone="slate">a quitté</Badge>}
          {player.status === 'excluded' && <Badge tone="rose">exclu</Badge>}
          {player.gmAdded && <Badge tone="slate">sans téléphone</Badge>}
        </div>
        {!readOnly && state.phase !== 'registration' && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Modifier le score</p>
            <div className="grid grid-cols-4 gap-2">
              {[-2, -1, 1, 2].map((n) => (
                <Btn key={n} variant={n > 0 ? 'success' : 'danger'} disabled={busy} onClick={() => adjust(n)}>
                  {n > 0 ? `+${n}` : n}
                </Btn>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className={`${inputClass} w-24 shrink-0`} value={delta} inputMode="decimal" onChange={(e) => setDelta(e.target.value)} />
              <input className={inputClass} value={reason} maxLength={80} placeholder="Motif (facultatif)" onChange={(e) => setReason(e.target.value)} />
              <Btn variant="primary" disabled={busy} onClick={() => adjust(Number(delta.replace(',', '.')))}>
                OK
              </Btn>
            </div>
            {adjustments.length > 0 && (
              <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-400">
                {adjustments.map((a, i) => (
                  <p key={i}>
                    {a.delta > 0 ? '+' : ''}
                    {fmtScore(a.delta)} · {a.reason}
                  </p>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void action('clear-adjustments', { playerId }, `Effacer les ajustements de ${player.pseudo} ?`)}
                  className="mt-1 font-bold text-rose-300"
                >
                  Effacer les ajustements
                </button>
              </div>
            )}
          </div>
        )}
        {!readOnly && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Corriger le pseudo</p>
            <p className="mb-2 text-xs text-slate-500">Doit correspondre à celui tapé sur la table d'échecs pour que les parties comptent.</p>
            <div className="flex gap-2">
              <input className={inputClass} value={rename} maxLength={16} onChange={(e) => setRename(e.target.value)} />
              <Btn
                variant="primary"
                disabled={busy || !rename.trim() || rename.trim() === player.pseudo}
                onClick={() => void action('rename-player', { playerId, pseudo: rename.trim() })}
              >
                Renommer
              </Btn>
            </div>
          </div>
        )}
        {!readOnly && state.phase !== 'final' && (
          <div>
            {player.status === 'active' ? (
              <Btn
                variant="danger"
                full
                disabled={busy}
                onClick={() =>
                  void action(
                    'exclude-player',
                    { playerId },
                    state.phase === 'registration'
                      ? `Retirer ${player.pseudo} des inscrits ?`
                      : `Exclure ${player.pseudo} ? Il n'est plus apparié ; un match non commencé est perdu par forfait.`,
                  ).then(onClose)
                }
              >
                {state.phase === 'registration' ? 'Retirer des inscrits' : 'Exclure du tournoi'}
              </Btn>
            ) : (
              <Btn variant="secondary" full disabled={busy} onClick={() => void action('reinstate-player', { playerId }).then(onClose)}>
                Réintégrer (apparié dès la ronde suivante)
              </Btn>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
