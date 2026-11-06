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
import { MonitorPlay, PenLine, QrCode, RefreshCw, Smartphone, Square, Tv } from 'lucide-react';
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
import { Crown, GameGlyph, Invader, Meter, Pawn, Trophy, invaderTone, mmss, rankClass, rankText } from '../../game/tournament/arcade/kit';
import { CHECK, HOURGLASS, PixelSprite } from '../../game/tournament/arcade/pixel';
import { WavesGmBody } from './WavesGmBody';

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
  if (state.format === 'waves') {
    return (
      <WavesGmBody
        state={state}
        busy={busy}
        action={action}
        onRefresh={onRefresh}
        onClosed={onClosed}
        readOnly={readOnly}
      />
    );
  }

  const selectedMatch = matchOpen ? allMatches.find((m) => m.id === matchOpen) ?? null : null;

  return (
    <NarrowContext.Provider value={narrow}>
      <div ref={ref} className="mx-auto max-w-[1200px] px-3 pb-16 pt-3 sm:px-5">
        <Header state={state} onRefresh={onRefresh} action={act} onClosed={onClosed} readOnly={readOnly} />
        {!readOnly && <GmAlerts alerts={state.gm.alerts} />}
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
        <p className="mt-6 text-center text-xs text-ia-muted">{formatSummary(state)}</p>
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
  const [qr, setQr] = useState(false);
  const round = currentRoundOf(state);
  return (
    <GmHeader
      state={state}
      phaseLabel={state.ended ? 'Clos' : PHASE_LABELS[state.phase] ?? state.phase}
      phaseTone={state.ended ? 'slate' : state.phase === 'round' ? 'cyan' : state.phase === 'final' ? 'amber' : 'indigo'}
      sub={round ? roundLabel(state, round.number) : null}
      onRefresh={onRefresh}
      onQr={() => setQr(true)}
      stop={
        readOnly
          ? null
          : {
              label: 'Arrêter',
              run: async () => {
                await action('abort', {}, "Arrêter l'événement ? Le tournoi est clos tout de suite. Les écrans restent sur la page du bar.");
                onClosed();
              },
            }
      }
    >
      {qr && <QrOverlay state={state} onClose={() => setQr(false)} />}
    </GmHeader>
  );
}

/**
 * En-tête collant commun aux consoles (échecs et salves) : jeu, titre, phase,
 * code, puis les raccourcis (rafraîchir, QR, téléphone, projecteur, TV).
 */
export function GmHeader({
  state,
  phaseLabel,
  phaseTone,
  sub,
  onRefresh,
  onQr,
  stop,
  children,
}: {
  state: TournamentGmState;
  phaseLabel: string;
  phaseTone: 'slate' | 'cyan' | 'amber' | 'indigo' | 'emerald';
  sub: string | null;
  onRefresh: () => void;
  onQr: () => void;
  stop: { label: string; run: () => void | Promise<void> } | null;
  children?: React.ReactNode;
}) {
  const narrow = useContext(NarrowContext);
  const screenQuery = state.config.testMode ? `?tournament=${state.id}` : '';
  const tool = 'ia-btn ia-btn--ghost min-h-[44px] px-3 text-xs';
  return (
    <div className="sticky top-0 z-30 -mx-3 bg-ia-night/95 px-3 pb-3 pt-3 backdrop-blur sm:-mx-5 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GameGlyph game={state.game} scale={2} />
            <span className="ia-pixel truncate text-[11px] text-ia-cyan">
              {state.gameLabel} · {state.formatLabel}
            </span>
          </div>
          <h1 className={`mt-1 truncate font-black text-white ${narrow ? 'text-lg' : 'text-2xl'}`}>{state.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={phaseTone}>{phaseLabel}</Badge>
            {state.config.testMode && <Badge tone="amber">Test</Badge>}
            {sub && <span className="text-xs font-bold text-ia-soft">{sub}</span>}
            <span className="text-xs text-ia-soft">
              <b className="text-ia-ink">{state.playerCount}</b> joueur{state.playerCount > 1 ? 's' : ''}
            </span>
            <span className="text-xs text-ia-muted">
              code <span className="ia-pixel text-ia-pink">{state.joinCode}</span>
            </span>
          </div>
        </div>
        {stop && (
          <button type="button" onClick={() => void stop.run()} className="ia-btn ia-btn--ghost-red min-h-[44px] shrink-0 px-3 text-xs">
            <Square size={14} /> {stop.label}
          </button>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onRefresh} className={tool} aria-label="Rafraîchir">
          <RefreshCw size={15} />
        </button>
        <button type="button" onClick={onQr} className={tool}>
          <QrCode size={15} /> {!narrow && 'QR inscription'}
        </button>
        <a href={tournamentUrl(state.joinCode)} target="_blank" rel="noreferrer" className={tool}>
          <Smartphone size={15} /> {!narrow && 'Joueur ↗'}
        </a>
        <a href={`${window.location.origin}/screen/PROJO${screenQuery}`} target="_blank" rel="noreferrer" className={tool}>
          <MonitorPlay size={15} /> {!narrow && 'Projo ↗'}
        </a>
        <a href={`${window.location.origin}/screen/BAR${screenQuery}`} target="_blank" rel="noreferrer" className={tool}>
          <Tv size={15} /> {!narrow && 'Bar ↗'}
        </a>
      </div>
      <div className="absolute bottom-0 left-3 right-3 h-0.5 sm:left-5 sm:right-5" style={{ background: 'linear-gradient(90deg, #ff2bd6, #8b3dff 40%, #33e2ff)' }} />
      {children}
    </div>
  );
}

/** QR d'inscription en grand, à montrer à un joueur */
export function QrOverlay({ state, onClose }: { state: TournamentGmState; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 px-6" onClick={onClose}>
      <div className="ia-px ia-px--pink px-6 py-6 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="ia-pixel mb-4 text-sm text-ia-pink">Inscription au tournoi</h3>
        <div className="ia-clip inline-block bg-white p-2">
          <QrCanvas value={tournamentUrl(state.joinCode)} size={240} />
        </div>
        <p className="ia-pixel mt-4 text-4xl tracking-[0.12em] text-white">{state.joinCode}</p>
        <p className="mt-1 break-all text-xs text-ia-muted">{tournamentUrl(state.joinCode)}</p>
      </div>
    </div>,
    document.body,
  );
}

/** alertes du moteur (partie figée, saisie à valider...) */
export function GmAlerts({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {alerts.map((a) => (
        <p key={a} className="ia-px ia-px--amber flex items-start gap-3 px-3 py-2.5 text-sm font-semibold text-ia-gold">
          <span className="ia-pixel ia-clip ia-clip--sm mt-0.5 shrink-0 bg-ia-gold px-1.5 text-[11px] leading-5 text-ia-night">!</span>
          <span>{a}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le bouton du moment
// ---------------------------------------------------------------------------

function MainAction({ state, busy, action, onClosed }: { state: TournamentGmState; busy: boolean; action: GmAction; onClosed: () => void }) {
  const now = useServerNow(1000);
  const round = currentRoundOf(state);
  const actifs = state.players.filter((p) => p.status === 'active').length;

  if (state.ended) {
    return (
      <Card tone="indigo">
        <p className="text-sm text-ia-soft">Cet événement est clos. Les écrans sont revenus à leur affichage par défaut.</p>
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
      <Card tone="cyan">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ia-pixel text-[11px] text-ia-cyan">Inscriptions ouvertes</p>
            <p className="ia-pixel mt-1 text-4xl tabular-nums text-white">
              {state.waitingForPlayers || reste === null ? 'En attente' : reste > 0 ? mmss(reste) : 'Tirage...'}
            </p>
          </div>
          <p className="text-sm text-ia-soft">
            <b className="text-ia-ink">{actifs}</b> inscrit{actifs > 1 ? 's' : ''} · tirage automatique à zéro
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Btn variant="primary" big disabled={busy || actifs < 2} onClick={() => void action('start-now', {}, `Lancer la ronde 1 maintenant avec ${actifs} joueurs ?`)}>
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
      <Card tone="cyan">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="ia-pixel text-[11px] text-ia-cyan">{roundLabel(state, round.number)} en cours</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="ia-pixel text-4xl tabular-nums text-white">
                {done}/{total}
              </span>
              <span className="text-sm font-bold text-ia-soft">{total > 1 ? 'matchs terminés' : 'match terminé'}</span>
            </p>
          </div>
        </div>
        <Meter ratio={total ? done / total : 0} className="mt-3" />
        {round.waiting && (
          <p className="mt-3 flex items-center gap-2 text-sm text-[#c7a8ff]">
            <PixelSprite sprite={HOURGLASS} scale={2} className="text-ia-violet" />
            {pseudoOf(state, round.waiting)} est exempt et attend un adversaire.
          </p>
        )}
        <p className="mt-2 text-xs text-ia-muted">La ronde se termine seule quand tous les matchs sont joués.</p>
        <div className="mt-3">
          <Btn variant="danger" disabled={busy} onClick={() => void action('close-round', {}, 'Clôturer la ronde maintenant ? Les matchs non joués sont annulés (aucun point).')}>
            Clôturer la ronde
          </Btn>
        </div>
      </Card>
    );
  }

  if (state.phase === 'round_done' && round) {
    return (
      <Card tone="mint">
        <p className="ia-pixel flex items-center gap-2 text-[11px] text-ia-mint">
          <PixelSprite sprite={CHECK} scale={2} className="text-ia-mint" /> {roundLabel(state, round.number)} terminée
        </p>
        <p className="mt-2 text-sm text-ia-soft">
          {actifs} joueur{actifs > 1 ? 's' : ''} actif{actifs > 1 ? 's' : ''} pour la suite. Le projecteur affiche les résultats et le classement.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Btn variant="primary" big disabled={busy || actifs < 2} onClick={() => void action('next-round')}>
            ▶ Lancer la ronde {round.number + 1}
          </Btn>
          <Btn variant="warn" big disabled={busy} onClick={() => void action('finish', {}, 'Terminer le tournoi ? Le classement final et le podium s’affichent.')}>
            🏁 Terminer le tournoi
          </Btn>
        </div>
      </Card>
    );
  }

  // final
  const reste = state.phaseEndsAt ? state.phaseEndsAt - now : null;
  return (
    <Card tone="gold">
      <div className="flex items-center gap-4">
        <Trophy scale={3} />
        <div className="min-w-0">
          <p className="ia-pixel text-[11px] text-ia-gold">Podium affiché</p>
          <p className="mt-1 truncate text-2xl font-black text-ia-gold">{state.standings.find((s) => s.status !== 'excluded')?.pseudo ?? '?'}</p>
          {reste !== null && reste > 0 && <p className="text-sm text-ia-soft">Écrans libérés automatiquement dans {mmss(reste)}</p>}
        </div>
      </div>
      <div className="mt-3">
        <Btn
          variant="primary"
          big
          disabled={busy}
          onClick={async () => {
            await action('close', {}, 'Clore le tournoi ? Les écrans restent sur la page du bar.');
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
  const items: Array<{ key: Tab; label: string }> = [
    { key: 'ronde', label: 'Ronde' },
    { key: 'classement', label: 'Classement' },
    { key: 'joueurs', label: 'Joueurs' },
    { key: 'historique', label: 'Historique' },
    { key: 'ecrans', label: 'Écrans' },
  ];
  return <GmTabs items={items} tab={tab} onTab={onTab} />;
}

/** onglets de la console : étiquettes pixel, l'actif en cyan */
export function GmTabs<T extends string>({ items, tab, onTab }: { items: Array<{ key: T; label: string; count?: number }>; tab: T; onTab: (t: T) => void }) {
  const narrow = useContext(NarrowContext);
  return (
    <div className={`ia-px ia-px--deep mt-4 gap-1 p-1.5 ${narrow ? 'grid grid-cols-3' : 'flex'}`}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onTab(it.key)}
          className={`ia-clip ia-clip--sm ia-pixel min-h-[48px] flex-1 px-2 text-[11px] ${tab === it.key ? 'bg-ia-cyan text-ia-night' : 'text-ia-soft hover:bg-white/5'}`}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1 opacity-70">{it.count}</span>}
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
  const name = (id: string | null, color: 'w' | 'b' | null, right = false) => (
    <span className={`flex min-w-0 items-center gap-1.5 ${right ? 'justify-end text-right' : ''}`}>
      {!right && <Pawn color={color} scale={2} />}
      <span className={`min-w-0 truncate font-bold ${w === id ? 'text-ia-mint' : w && id ? 'text-ia-muted' : 'text-ia-ink'}`}>{pseudoOf(state, id)}</span>
      {right && <Pawn color={color} scale={2} />}
    </span>
  );
  const colorB = m.colorA ? (m.colorA === 'w' ? 'b' : 'w') : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`ia-px w-full px-3 py-2.5 text-left transition hover:brightness-125 ${m.status === 'playing' ? 'ia-px--cyan' : 'ia-px--deep'}`}
    >
      <div className={`flex gap-2 text-sm ${narrow ? 'flex-wrap items-center' : 'items-center'}`}>
        <span className="ia-pixel w-8 shrink-0 text-xs text-ia-muted">#{m.board}</span>
        {narrow && <span className="ml-auto shrink-0">{statusBadge(m)}</span>}
        {m.kind === 'bye' ? (
          <span className={`truncate font-bold text-ia-gold ${narrow ? 'w-full' : 'flex-1'}`}>
            {pseudoOf(state, m.a)} exempt (+{fmtScore(m.points.a)})
          </span>
        ) : (
          <span className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 ${narrow ? 'w-full text-base' : 'flex-1'}`}>
            {name(m.a, m.colorA, true)}
            <span className="ia-pixel shrink-0 text-[11px] text-ia-pink">{m.games.length > 0 ? `${fmtScore(m.score.a)}-${fmtScore(m.score.b)}` : 'vs'}</span>
            {name(m.b, colorB)}
          </span>
        )}
        {!narrow && <span className="shrink-0">{statusBadge(m)}</span>}
      </div>
      {(m.kind === 'floater' || m.rematch || m.gmLocked || idleMin !== null) && (
        <div className={`mt-1.5 flex flex-wrap gap-1.5 ${narrow ? '' : 'pl-10'}`}>
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
        <p className="text-sm text-ia-soft">
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
          <p className="text-sm text-ia-soft">
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
          <p className="mb-3 text-sm text-ia-soft">Joueurs libres (sans match en cours) :</p>
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
    <Card title="Classement" right={<span className="text-xs text-ia-muted">pts · V/N/D · Buchholz</span>}>
      {state.standings.length === 0 ? (
        <p className="text-sm text-ia-soft">Personne pour l'instant.</p>
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
      className={`ia-px flex min-h-[48px] w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:brightness-125 ${
        s.rank === 1 ? 'ia-px--gold' : s.rank === 2 ? 'ia-px--silver' : s.rank === 3 ? 'ia-px--amber' : 'ia-px--deep'
      } ${s.status !== 'active' ? 'opacity-50' : ''}`}
    >
      <span className={`ia-pixel w-10 shrink-0 text-right text-xs ${rankClass(s.rank)}`}>
        {rankText(s.rank)}
        {s.tied ? '=' : ''}
      </span>
      <span className="flex w-6 shrink-0 justify-center">{s.rank === 1 ? <Crown scale={2} /> : <Invader seed={s.playerId} scale={2} className={invaderTone(s.playerId)} />}</span>
      <span className="min-w-0 flex-1 truncate font-bold text-ia-ink">
        {s.pseudo}
        {s.status === 'left' && <span className="ml-1.5 text-xs text-ia-muted">parti</span>}
        {s.status === 'excluded' && <span className="ml-1.5 text-xs text-[#ff8ea3]">exclu</span>}
      </span>
      {s.adjustment !== 0 && (
        <Badge tone="indigo">
          {s.adjustment > 0 ? '+' : ''}
          {fmtScore(s.adjustment)} GM
        </Badge>
      )}
      <span className="shrink-0 text-xs tabular-nums text-ia-muted">
        {s.wins}/{s.draws}/{s.losses} · {fmtScore(s.buchholz)}
      </span>
      <span className="ia-display w-10 shrink-0 text-right text-2xl tabular-nums text-ia-cyan">{fmtScore(s.points)}</span>
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
        <Card title="Inscrire un joueur à la main" right={<span className="text-xs text-ia-muted">sans téléphone</span>}>
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
          <p className="mt-2 text-xs text-ia-muted">
            S'il scanne le QR plus tard avec ce même pseudo, son téléphone reprend cette inscription.
          </p>
        </Card>
      )}
      <Card title={`Joueurs (${roster.length})`}>
        {roster.length === 0 ? (
          <p className="text-sm text-ia-soft">Personne pour l'instant : le QR est affiché sur les TV du bar.</p>
        ) : (
          <div className="space-y-1">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPlayer(p.id)}
                className={`ia-px ia-px--deep flex min-h-[48px] w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition hover:brightness-125 ${p.status !== 'active' ? 'opacity-50' : ''}`}
              >
                <Invader seed={p.id} scale={2} className={invaderTone(p.id)} />
                <span className="min-w-0 flex-1 truncate font-bold text-ia-ink">{p.pseudo}</span>
                <span className="shrink-0 text-ia-muted">{p.gmAdded ? <PenLine size={14} /> : <Smartphone size={14} />}</span>
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
          <p className="text-sm text-ia-soft">Aucune ronde jouée.</p>
        </Card>
      )}
      {rounds.map((r: TRound) => (
        <Card
          key={r.number}
          title={roundLabel(state, r.number)}
          right={<span className="text-xs text-ia-muted">{r.finishedAt ? 'terminée' : 'en cours'}</span>}
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
          <p className="mb-2 text-xs text-ia-muted">Remontées automatiques non comptées (match déjà décidé, résultat saisi par le GM...).</p>
          <div className="space-y-1 text-xs text-ia-soft">
            {state.gm.ignored.map((g) => (
              <p key={g.ref}>
                <span className="font-mono">{g.ref.slice(0, 8)}</span> · {g.reason === 'gm_locked' ? 'résultat déjà saisi par le GM' : 'match déjà décidé'}
              </p>
            ))}
          </div>
        </Card>
      )}
      <p className="text-center text-xs text-ia-muted">{state.gm.countedGames} partie{state.gm.countedGames > 1 ? 's' : ''} d'échecs remontée{state.gm.countedGames > 1 ? 's' : ''} automatiquement</p>
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
        <p className="text-sm text-ia-soft">
          Rotation automatique : classement {d.standingsMs / 1000} s, matchs {d.roundMs / 1000} s
          {d.liveMs > 0 ? `, puis chaque partie en cours ${Math.round(d.liveMs / 1000)} s, l'une après l'autre` : ''}.
        </p>
        {pinned && (
          <p className="mt-2 text-sm font-semibold text-ia-cyan">
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
        <p className="mt-2 text-xs text-ia-muted">Pour montrer un match précis, ouvre-le dans l'onglet Ronde.</p>
      </Card>
      {!readOnly && (
        <Card title="Écrans du bar (PROJO, BAR01, BAR02)">
          {state.config.testMode ? (
            <p className="text-sm text-ia-gold">Tournoi de test : les écrans du bar ne sont pas basculés.</p>
          ) : (
            <p className="text-sm text-ia-soft">Si un écran n'a pas basculé au lancement (agent du bar absent), renvoie-les sur le tournoi.</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Btn disabled={busy || state.config.testMode} onClick={() => void action('rescreen')}>
              🔁 Rebasculer les écrans
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={() => void action('close', {}, 'Clore le tournoi maintenant ? Les écrans restent sur la page du bar.')}
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
          <div className="ia-px ia-px--deep p-3 text-sm">
            <p className="ia-pixel mb-1 text-[11px] text-ia-muted">Parties</p>
            {m.games.map((g, i) => (
              <p key={i} className="text-ia-soft">
                Partie {i + 1} : {g.winner === null ? 'nulle' : `${g.winner === 'a' ? a : b} gagne`}
                <span className="text-ia-muted"> · {g.source === 'gm' ? 'saisie GM' : g.reason ?? 'auto'}</span>
              </p>
            ))}
            {multi && <p className="mt-1 font-bold text-ia-ink">Score du match : {fmtScore(m.score.a)} - {fmtScore(m.score.b)}</p>}
          </div>
        )}
        {m.status === 'done' && m.kind !== 'bye' && (
          <p className="text-sm text-ia-soft">
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
                <p className="ia-pixel mb-2 text-[11px] text-ia-soft">
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
              <p className="ia-pixel mb-2 text-[11px] text-ia-soft">Imposer le résultat du match</p>
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
                <p className="mt-2 text-xs text-ia-gold">
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
            <p className="ia-pixel mb-2 text-[11px] text-ia-soft">Modifier le score</p>
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
              <div className="mt-2 ia-px ia-px--deep p-2 text-xs text-ia-soft">
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
                  className="mt-1 font-bold text-[#ff8ea3]"
                >
                  Effacer les ajustements
                </button>
              </div>
            )}
          </div>
        )}
        {!readOnly && (
          <div>
            <p className="ia-pixel mb-2 text-[11px] text-ia-soft">Corriger le pseudo</p>
            <p className="mb-2 text-xs text-ia-muted">Doit correspondre à celui tapé sur la table d'échecs pour que les parties comptent.</p>
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
