/**
 * Téléphone du joueur pendant un tournoi : /tournoi/:code (le QR des TV).
 *
 * Inscription au pseudo seul, puis tout ce qu'il faut savoir sans lever la
 * tête vers le projecteur : son adversaire, sa couleur, qui crée la partie
 * d'échecs, son score, sa place, ses matchs. On peut quitter le tournoi (plus
 * d'appariement) et y revenir depuis le même téléphone.
 *
 * ZÉRO DÉFILEMENT (règle des surfaces joueur) : chaque onglet tient dans un
 * 375x667. Le corps est pur (TournamentPlayerScreen) pour le laboratoire.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSansZoom } from '../../../hooks/useSansZoom';
import {
  currentRoundOf,
  fmtPoints,
  fmtScore,
  formatSummary,
  forgetPhonePlayer,
  hasResults,
  listPhonePlayers,
  loadTournamentIdentity,
  myColor,
  myCurrentMatch,
  myMatches,
  opponentOf,
  outcomeFor,
  pointsFor,
  pseudoOf,
  rankLabel,
  roundLabel,
  saveTournamentIdentity,
  selectPhonePlayer,
  standingOf,
  tournamentApi,
  tournamentErrorLabel,
  type IdentityEntry,
} from '../tournamentClient';
import type { TClaim, TMatch, TournamentPublicState, TournamentYou } from '../tournamentTypes';
import { useServerNow, useTournamentSession } from '../useTournamentSession';
import '../../game.css';

export default function TournamentPlayerApp() {
  useSansZoom();
  const { code } = useParams<{ code?: string }>();
  const [ref, setRef] = useState<string | null>(code ?? null);
  const [resolving, setResolving] = useState(!code);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // sans code : le tournoi en cours
  useEffect(() => {
    if (code) {
      setRef(code);
      setResolving(false);
      return;
    }
    let cancelled = false;
    void tournamentApi
      .current()
      .then((c) => {
        if (!cancelled && c) setRef(c.sessionId);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const { state, you, youAbsent, error: loadError, apply } = useTournamentSession(ref, token);

  // reprise d'identité (rescan du QR, rechargement)
  useEffect(() => {
    if (!state || token) return;
    const id = loadTournamentIdentity(state.id);
    if (id) setToken(id.playerToken);
  }, [state, token]);

  // jeton refusé : on retire seulement cette personne, les autres du téléphone restent
  useEffect(() => {
    if (!youAbsent || !token || !state) return;
    const next = forgetPhonePlayer(state.id, token);
    setToken(next);
    if (!next) setNotice("Tu n'es plus inscrit à ce tournoi. Réinscris-toi quand tu veux !");
  }, [youAbsent, token, state]);

  const joinAs = useCallback(
    async (pseudo: string, fresh: boolean) => {
      if (!ref || busy) return;
      setBusy(true);
      setError(null);
      try {
        const data = await tournamentApi.join(ref, { pseudo, playerToken: fresh ? undefined : token ?? undefined });
        saveTournamentIdentity(data.sessionId, data.playerToken, data.you?.pseudo ?? pseudo);
        setNotice(null);
        setToken(data.playerToken);
        apply({ state: data.state, you: data.you });
      } catch (err) {
        setError(tournamentErrorLabel(err));
      } finally {
        setBusy(false);
      }
    },
    [ref, busy, token, apply],
  );

  const join = useCallback((pseudo: string) => joinAs(pseudo, false), [joinAs]);
  const addPerson = useCallback((pseudo: string) => joinAs(pseudo, true), [joinAs]);

  const leave = useCallback(async () => {
    if (!ref || !token || busy) return;
    setBusy(true);
    try {
      const data = await tournamentApi.leave(ref, token);
      apply({ state: data.state, you: data.you });
      if (!data.you && state) {
        // désinscription pendant les inscriptions : cette personne seulement
        const next = forgetPhonePlayer(state.id, token);
        setToken(next);
      }
    } catch (err) {
      setError(tournamentErrorLabel(err));
    } finally {
      setBusy(false);
    }
  }, [ref, token, busy, apply, state]);

  const rejoin = useCallback(async () => {
    if (!ref || !token || busy) return;
    setBusy(true);
    try {
      const data = await tournamentApi.rejoin(ref, token);
      apply({ state: data.state, you: data.you });
    } catch (err) {
      setError(tournamentErrorLabel(err));
    } finally {
      setBusy(false);
    }
  }, [ref, token, busy, apply]);

  const claim = useCallback(
    async (payload: { kind: 'group' | 'match'; targetId: string; places: string[]; loserGames: 0 | 1 | 2 | null }) => {
      if (!ref || !token || busy) return;
      setBusy(true);
      setError(null);
      try {
        const data = await tournamentApi.claim(ref, {
          playerToken: token,
          groupId: payload.kind === 'group' ? payload.targetId : undefined,
          matchId: payload.kind === 'match' ? payload.targetId : undefined,
          places: payload.places,
          loserGames: payload.loserGames,
        });
        apply({ state: data.state, you: data.you });
      } catch (err) {
        setError(tournamentErrorLabel(err));
      } finally {
        setBusy(false);
      }
    },
    [ref, token, busy, apply],
  );

  if (resolving || (ref && !state && !loadError)) {
    return (
      <Shell>
        <Center>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
        </Center>
      </Shell>
    );
  }
  if (!ref || !state) {
    return (
      <Shell>
        <Center>
          <div className="anim-fade-up text-center">
            <h1 className="mb-3 text-3xl font-black">INVADER</h1>
            <p className="text-white/60">
              {loadError ? 'Tournoi introuvable. Rescanne le QR des écrans du bar.' : 'Aucun tournoi en cours pour le moment.'}
            </p>
          </div>
        </Center>
      </Shell>
    );
  }
  return (
    <Shell>
      <TournamentPlayerScreen
        state={state}
        you={token ? you : null}
        busy={busy}
        error={error}
        notice={notice}
        onJoin={join}
        onLeave={leave}
        onRejoin={rejoin}
        onAdd={addPerson}
        onClaim={claim}
        phones={listPhonePlayers(state.id)}
        onPickPhone={(next) => {
          selectPhonePlayer(state.id, next);
          apply({ state, you: null });
          setToken(next);
        }}
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Coque
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="game-bg relative flex h-dvh flex-col overflow-hidden text-white">{children}</div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 py-6">{children}</div>;
}

// ---------------------------------------------------------------------------
// Corps (pur)
// ---------------------------------------------------------------------------

export interface TournamentPlayerScreenProps {
  state: TournamentPublicState;
  you: TournamentYou | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onJoin: (pseudo: string) => void | Promise<void>;
  onLeave: () => void | Promise<void>;
  onRejoin: () => void | Promise<void>;
  /** inscrit une autre personne du même téléphone, sans réutiliser le jeton courant */
  onAdd?: (pseudo: string) => void | Promise<void>;
  phones?: IdentityEntry[];
  onPickPhone?: (playerToken: string) => void;
  /** onglet de départ (laboratoire) */
  initialTab?: TournamentPlayerTab;
  /** proposition de résultat. Le laboratoire s'en passe : le formulaire reste local. */
  onClaim?: (payload: { kind: 'group' | 'match'; targetId: string; places: string[]; loserGames: 0 | 1 | 2 | null }) => void | Promise<void>;
}

export type TournamentPlayerTab = 'moi' | 'classement' | 'matchs';
type Tab = TournamentPlayerTab;

export function TournamentPlayerScreen(props: TournamentPlayerScreenProps) {
  const { state, you } = props;
  const [tab, setTab] = useState<Tab>(props.initialTab ?? 'moi');
  const me = you ? state.players.find((p) => p.id === you.playerId) ?? null : null;
  if (state.ended) {
    return <EndedScreen state={state} playerId={me?.id ?? null} />;
  }
  if (!you || !me) {
    return <JoinScreen {...props} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StatusBar state={state} playerId={me.id} pseudo={me.pseudo} phones={props.phones} onPickPhone={props.onPickPhone} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        {tab === 'moi' && <MeTab {...props} playerId={me.id} status={me.status} />}
        {tab === 'classement' && <StandingsTab state={state} playerId={me.id} />}
        {tab === 'matchs' && <MatchesTab state={state} playerId={me.id} />}
      </div>
      <TabBar tab={tab} onTab={setTab} />
    </div>
  );
}

function phaseChip(state: TournamentPublicState): string {
  if (state.format === 'waves') {
    if (state.phase === 'registration') return 'Inscriptions';
    if (state.phase === 'final') return 'Terminé';
    if (state.phase === 'bracket') return 'Phase finale';
    if (state.phase === 'barrage') return 'Barrage';
    if (state.phase === 'wave_done') return 'Salve terminée';
    const wave = state.waves[state.waves.length - 1];
    return wave ? `Salve ${wave.number}` : 'En cours';
  }
  if (state.phase === 'registration') return 'Inscriptions';
  if (state.phase === 'final') return 'Terminé';
  const round = currentRoundOf(state);
  return round ? roundLabel(state, round.number) : '';
}

function StatusBar({
  state,
  playerId,
  pseudo,
  phones,
  onPickPhone,
}: {
  state: TournamentPublicState;
  playerId: string;
  pseudo: string;
  phones?: IdentityEntry[];
  onPickPhone?: (playerToken: string) => void;
}) {
  const s = standingOf(state, playerId);
  const ranked = hasResults(state);
  const others = (phones ?? []).filter((p) => p.pseudo !== pseudo);
  return (
    <div className="shrink-0 border-b border-white/10 bg-black/30 px-4 pb-2.5 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          {state.game === 'chess' ? '♞' : '🏆'} {state.title}
        </p>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/70">
          {phaseChip(state)}
        </span>
      </div>
      {others.length > 0 && onPickPhone && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {phones?.map((p) => (
            <button
              key={p.playerToken}
              type="button"
              onClick={() => onPickPhone(p.playerToken)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                p.pseudo === pseudo ? 'bg-cyan-400/20 text-cyan-200' : 'bg-white/10 text-white/60'
              }`}
            >
              {p.pseudo}
            </button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xl font-black">{pseudo}</p>
        {s && state.phase !== 'registration' && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-sm font-black tabular-nums text-cyan-200">
              {fmtPoints(s.points)}
            </span>
            {ranked && (
              <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-sm font-black text-amber-200">
                {rankLabel(s.rank)}
                <span className="font-bold text-amber-100/60">/{state.standings.length}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'moi', label: 'Mon tournoi', icon: '♞' },
    { key: 'classement', label: 'Classement', icon: '🏆' },
    { key: 'matchs', label: 'Mes matchs', icon: '📋' },
  ];
  return (
    <div className="grid shrink-0 grid-cols-3 border-t border-white/10 bg-black/40">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onTab(it.key)}
          className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-xs font-bold ${
            tab === it.key ? 'text-cyan-300' : 'text-white/45'
          }`}
        >
          <span className="text-lg leading-none">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------

function MiniCountdown({ state }: { state: TournamentPublicState }) {
  const now = useServerNow(500);
  if (state.phase !== 'registration') return null;
  if (state.waitingForPlayers || !state.phaseEndsAt) {
    return <p className="mt-3 text-sm font-bold text-amber-200">En attente d'autres joueurs...</p>;
  }
  const reste = Math.max(0, state.phaseEndsAt - now);
  if (reste <= 0) return <p className="anim-suspense mt-3 font-black uppercase tracking-widest text-amber-300">⏳ Tirage imminent !</p>;
  const mm = Math.floor(reste / 60_000);
  const ss = Math.floor((reste % 60_000) / 1000);
  return (
    <p className="mt-3 text-white/60">
      Début dans{' '}
      <span className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 font-black tabular-nums text-cyan-200">
        {mm}:{String(ss).padStart(2, '0')}
      </span>
    </p>
  );
}

function JoinScreen({ state, busy, error, notice, onJoin }: TournamentPlayerScreenProps) {
  const [pseudo, setPseudo] = useState('');
  const closed = state.phase === 'final' || state.phase === 'bracket' || (state.phase !== 'registration' && !state.config.lateJoin);
  const started = state.phase !== 'registration';
  const submit = () => {
    if (!pseudo.trim() || busy || closed) return;
    void onJoin(pseudo.trim());
  };
  return (
    <Center>
      <div className="anim-fade-up w-full max-w-sm text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          {state.game === 'chess' ? '♞' : '🏆'} Tournoi · {state.formatLabel}
        </p>
        <h1 className="anim-title-glow mb-1 mt-1 text-balance text-3xl font-black">{state.title}</h1>
        <p className="text-sm text-white/50">
          {state.playerCount} inscrit{state.playerCount > 1 ? 's' : ''} · {state.gameLabel}
        </p>
        <MiniCountdown state={state} />
        {notice && (
          <p className="anim-pop mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200">
            {notice}
          </p>
        )}
        {closed ? (
          <p className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-white/70">
            {state.phase === 'final' ? 'Le tournoi est terminé.' : 'Les inscriptions sont fermées.'}
          </p>
        ) : (
          <>
            <label htmlFor="pseudo-tournoi" className="mb-2 mt-6 block text-left text-sm font-semibold text-white/70">
              Ton pseudo
            </label>
            <input
              id="pseudo-tournoi"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="words"
              className="mb-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-center text-lg font-bold text-white placeholder-white/30 outline-none focus:border-cyan-400"
              placeholder="PSEUDO"
            />
            <p className="mb-3 text-left text-xs text-white/45">
              {state.format === 'waves'
                ? 'Plusieurs personnes peuvent s’inscrire depuis ce téléphone.'
                : 'Retiens-le bien : c’est ce pseudo que tu taperas sur la table d’échecs. Tu pourras aussi inscrire quelqu’un d’autre ensuite.'}
            </p>
            {error && <p className="anim-shake mb-3 text-sm font-semibold text-rose-400">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !pseudo.trim()}
              className="anim-glow w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-4 text-lg font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40"
            >
              {busy ? '...' : started ? 'Rejoindre le tournoi' : 'Participer'}
            </button>
            {started && (
              <p className="mt-3 text-xs text-white/45">Le tournoi a commencé : tu joues dès la prochaine ronde.</p>
            )}
          </>
        )}
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// Mon tournoi
// ---------------------------------------------------------------------------

function ColorBadge({ color }: { color: 'w' | 'b' | null }) {
  if (!color) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs font-bold">
      <span className="h-3 w-3 rounded-full border border-white/50" style={{ background: color === 'w' ? '#F5F2FF' : '#14101B' }} />
      {color === 'w' ? 'Blancs' : 'Noirs'}
    </span>
  );
}

function StatsRow({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
  const s = standingOf(state, playerId);
  if (!s || state.phase === 'registration') return null;
  const cell = 'flex flex-1 flex-col items-center rounded-xl border border-white/10 bg-white/5 py-2';
  return (
    <div className="mt-3 flex shrink-0 gap-2">
      <div className={cell}>
        <span className="text-xl font-black tabular-nums text-cyan-300">{fmtScore(s.points)}</span>
        <span className="text-[11px] uppercase tracking-wider text-white/45">points</span>
      </div>
      <div className={cell}>
        <span className="text-xl font-black text-amber-200">
          {hasResults(state) ? rankLabel(s.rank) : '-'}
          {hasResults(state) && s.tied ? '=' : ''}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-white/45">sur {state.standings.length}</span>
      </div>
      <div className={cell}>
        <span className="text-xl font-black tabular-nums">
          {s.wins}
          <span className="text-white/35">/</span>
          {s.draws}
          <span className="text-white/35">/</span>
          {s.losses}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-white/45">V / N / D</span>
      </div>
    </div>
  );
}

function MatchInstructions({ state, m, playerId }: { state: TournamentPublicState; m: TMatch; playerId: string }) {
  const opp = opponentOf(m, playerId);
  const oppPseudo = pseudoOf(state, opp);
  const me = pseudoOf(state, playerId);
  const color = myColor(m, playerId);
  const iCountForNothing = m.kind === 'floater' && m.b === playerId;
  const multi = state.config.match.games > 1;
  const myScore = m.a === playerId ? m.score.a : m.score.b;
  const oppScore = m.a === playerId ? m.score.b : m.score.a;
  return (
    <div className="anim-pop rounded-2xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          {roundLabel(state, m.round)} · Match {m.board}
        </p>
        <ColorBadge color={color} />
      </div>
      <p className="mt-2 text-sm text-white/60">{iCountForNothing ? 'Partie bonus contre' : 'Ton adversaire'}</p>
      <p className="truncate text-3xl font-black">{oppPseudo}</p>
      {multi && m.games.length > 0 && (
        <p className="mt-1 text-sm font-bold text-cyan-200">
          Score du match : {fmtScore(myScore)} - {fmtScore(oppScore)}
        </p>
      )}
      {m.status === 'playing' ? (
        <p className="mt-3 text-sm font-bold text-emerald-300">♟ Partie en cours, bonne chance !</p>
      ) : color === 'w' ? (
        <p className="mt-3 text-sm text-white/80">
          Tu as les blancs : <b>crée la partie</b> sur une table d'échecs avec ton pseudo exact{' '}
          <b className="text-cyan-200">{me}</b>. {oppPseudo} la rejoindra.
        </p>
      ) : (
        <p className="mt-3 text-sm text-white/80">
          {oppPseudo} a les blancs et crée la partie : <b>rejoins-la</b> depuis le lobby des échecs avec ton pseudo exact{' '}
          <b className="text-cyan-200">{me}</b>.
        </p>
      )}
      {iCountForNothing && (
        <p className="mt-2 text-xs text-violet-200">
          {oppPseudo} était exempt : cette partie ne compte que pour lui, merci de jouer le jeu !
        </p>
      )}
      {m.kind === 'floater' && m.a === playerId && (
        <p className="mt-2 text-xs text-violet-200">Partie bonus : elle compte pour toi, pas pour {oppPseudo}.</p>
      )}
    </div>
  );
}

function ResultCard({ state, m, playerId }: { state: TournamentPublicState; m: TMatch; playerId: string }) {
  const out = outcomeFor(m, playerId);
  const pts = pointsFor(m, playerId);
  const round = currentRoundOf(state);
  const done = round ? round.matches.filter((x) => x.status === 'done' || x.status === 'cancelled').length : 0;
  const total = round?.matches.length ?? 0;
  const look =
    out === 'win'
      ? { emoji: '🏆', title: 'Victoire !', tone: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200' }
      : out === 'draw'
        ? { emoji: '🤝', title: 'Match nul', tone: 'border-amber-300/40 bg-amber-300/10 text-amber-200' }
        : out === 'loss'
          ? { emoji: '💪', title: 'Défaite', tone: 'border-white/15 bg-white/5 text-white' }
          : out === 'bye'
            ? { emoji: '🎟️', title: 'Exempt', tone: 'border-amber-300/40 bg-amber-300/10 text-amber-200' }
            : { emoji: '➖', title: 'Match annulé', tone: 'border-white/15 bg-white/5 text-white/70' };
  const countsForMe = m.kind !== 'floater' || m.a === playerId;
  return (
    <div className={`anim-pop rounded-2xl border px-4 py-4 text-center ${look.tone}`}>
      <div className="text-4xl">{look.emoji}</div>
      <p className="mt-1 text-2xl font-black">{look.title}</p>
      {m.b && (
        <p className="text-sm text-white/60">
          {m.kind === 'bye' ? '' : `contre ${pseudoOf(state, opponentOf(m, playerId))}`}
        </p>
      )}
      <p className="mt-1 text-lg font-black tabular-nums">
        {countsForMe ? `+${fmtPoints(pts)}` : 'partie bonus, hors classement'}
      </p>
      {state.phase === 'round' && (
        <p className="mt-2 text-xs text-white/50">
          En attente de la fin de la ronde · {done}/{total} matchs terminés
        </p>
      )}
    </div>
  );
}

function ConfirmSheet({
  text,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  text: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 px-4 pb-6">
      <div className="anim-fade-up w-full max-w-sm rounded-2xl border border-white/15 bg-[#141033] p-5 text-center">
        <div className="mb-2 text-4xl">⚠️</div>
        <p className="text-balance text-base text-white/85">{text}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="min-h-[52px] flex-1 rounded-xl bg-white/10 px-4 font-bold active:bg-white/20">
            Rester
          </button>
          <button type="button" onClick={onConfirm} className="min-h-[52px] flex-1 rounded-xl bg-rose-500/80 px-4 font-bold active:bg-rose-500">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeTab({
  state,
  playerId,
  status,
  busy,
  error,
  onLeave,
  onRejoin,
  onAdd,
  onClaim,
}: TournamentPlayerScreenProps & { playerId: string; status: string }) {
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState('');
  const round = currentRoundOf(state);
  const m = state.phase === 'registration' ? null : myCurrentMatch(state, playerId);
  const open = m && (m.status === 'pending' || m.status === 'playing') ? m : null;
  const waiting = state.phase === 'round' && round?.waiting === playerId;
  const s = standingOf(state, playerId);

  let body: React.ReactNode;
  if (status === 'excluded') {
    body = <Message emoji="🚫" title="Tu as été retiré du tournoi" sub="L'animateur t'a retiré. Va le voir si c'est une erreur." />;
  } else if (status === 'left') {
    body = (
      <div className="text-center">
        <Message emoji="🚪" title="Tu as quitté le tournoi" sub="Tu n'es plus apparié. Tes points restent au classement." />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRejoin()}
          className="mt-5 min-h-[52px] w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 font-black uppercase tracking-wider text-[#0a0a14] disabled:opacity-40"
        >
          Revenir dans le tournoi
        </button>
      </div>
    );
  } else if (state.phase === 'registration') {
    body = (
      <div className="text-center">
        <Message
          emoji="✅"
          title="Tu es inscrit !"
          sub={
            state.format === 'waves'
              ? 'Les groupes de la première salve seront tirés à la fin du compte à rebours.'
              : 'Les matchs de la ronde 1 seront tirés au sort à la fin du compte à rebours.'
          }
        />
        <MiniCountdown state={state} />
        <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">{formatSummary(state)}</p>
      </div>
    );
  } else if (state.phase === 'final') {
    body = (
      <div className="text-center">
        <Message
          emoji="🏁"
          title={s ? `Tu termines ${rankLabel(s.rank)} sur ${state.standings.length}` : 'Tournoi terminé'}
          sub={s ? `${fmtPoints(s.points)} · merci d'avoir joué !` : "Merci d'avoir joué !"}
        />
        <Podium state={state} />
      </div>
    );
  } else if (state.format === 'waves') {
    body = <WaveMe state={state} playerId={playerId} busy={busy} onClaim={onClaim} />;
  } else if (waiting) {
    body = (
      <Message
        emoji="⏳"
        title="Tu es exempt pour l'instant"
        sub="Dès qu'un match de la ronde se termine, un de ses joueurs t'est attribué. Reste dans le coin !"
      />
    );
  } else if (open) {
    body = <MatchInstructions state={state} m={open} playerId={playerId} />;
  } else if (m) {
    body = <ResultCard state={state} m={m} playerId={playerId} />;
  } else {
    body = (
      <Message
        emoji="🕐"
        title={`Tu joues dès la ${round ? `ronde ${round.number + 1}` : 'prochaine ronde'}`}
        sub="Tu es arrivé en cours de ronde : tu seras apparié au prochain tirage."
      />
    );
  }

  const leaveWarning =
    open && open.status === 'pending'
      ? `Tu as un match à jouer contre ${pseudoOf(state, opponentOf(open, playerId))} : si tu quittes maintenant, tu perds ce match par forfait.`
      : open && open.status === 'playing'
        ? 'Ta partie en cours comptera, puis tu ne seras plus apparié.'
        : 'Tu ne seras plus apparié aux prochaines rondes. Tes points restent au classement.';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center">{body}</div>
      <StatsRow state={state} playerId={playerId} />
      {error && <p className="mt-2 text-center text-sm font-semibold text-rose-400">{error}</p>}
      {adding && onAdd && (
        <div className="mt-2 flex gap-2">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            maxLength={16}
            placeholder="Autre pseudo"
            className="min-h-[48px] flex-1 rounded-xl border border-white/15 bg-white/5 px-3 font-bold text-white outline-none"
          />
          <button
            type="button"
            disabled={busy || !extra.trim()}
            onClick={() => {
              const name = extra.trim();
              if (!name) return;
              setExtra('');
              setAdding(false);
              void onAdd(name);
            }}
            className="min-h-[48px] rounded-xl bg-cyan-400 px-3 font-black text-[#0a0a14] disabled:opacity-40"
          >
            OK
          </button>
        </div>
      )}
      {status === 'active' && state.phase !== 'final' && state.phase !== 'bracket' && onAdd && (state.phase === 'registration' || state.config.lateJoin) && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="mx-auto mt-3 shrink-0 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-bold text-cyan-200">
          Ajouter une personne
        </button>
      )}
      {status === 'active' && state.phase !== 'final' && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mx-auto mt-3 shrink-0 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/50"
        >
          {state.phase === 'registration' ? 'Me désinscrire' : 'Quitter le tournoi'}
        </button>
      )}
      {confirming && (
        <ConfirmSheet
          text={state.phase === 'registration' ? 'Te désinscrire du tournoi ?' : leaveWarning}
          confirmLabel={state.phase === 'registration' ? 'Me désinscrire' : 'Quitter'}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void onLeave();
          }}
        />
      )}
    </div>
  );
}

function Message({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="anim-fade-up text-center">
      <div className="mb-3 text-5xl">{emoji}</div>
      <h2 className="text-balance text-2xl font-extrabold">{title}</h2>
      {sub && <p className="mt-2 text-balance text-sm text-white/60">{sub}</p>}
    </div>
  );
}

function Podium({ state }: { state: TournamentPublicState }) {
  const top = state.standings.filter((s) => s.status !== 'excluded').slice(0, 3);
  return (
    <div className="mt-5 space-y-1.5">
      {top.map((s, i) => (
        <div key={s.playerId} className="flex items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-300/5 px-3 py-2">
          <span className="text-xl">{['🥇', '🥈', '🥉'][i]}</span>
          <span className="min-w-0 flex-1 truncate text-left font-black">{s.pseudo}</span>
          <span className="font-black tabular-nums text-cyan-300">{fmtScore(s.points)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement / mes matchs
// ---------------------------------------------------------------------------

function StandingsTab({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
  const top = state.standings.slice(0, 8);
  const mine = state.standings.find((s) => s.playerId === playerId);
  const showMine = mine && !top.some((s) => s.playerId === playerId);
  const row = (s: (typeof state.standings)[number], highlight: boolean) => (
    <div
      key={s.playerId}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
        highlight ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-white/10 bg-white/5'
      } ${s.status !== 'active' ? 'opacity-50' : ''}`}
    >
      <span className={`w-8 text-center font-black ${s.rank <= 3 ? 'text-amber-300' : 'text-white/45'}`}>
        {s.rank}
        {s.tied ? '=' : ''}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{s.pseudo}</span>
      <span className="text-xs tabular-nums text-white/45">
        {s.wins}V {s.draws}N {s.losses}D
      </span>
      <span className="w-10 text-right font-black tabular-nums text-cyan-300">{fmtScore(s.points)}</span>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-2 shrink-0 text-lg font-black uppercase tracking-widest">Classement</h2>
      {state.standings.length === 0 || state.phase === 'registration' ? (
        <p className="text-sm text-white/50">Le classement s'affiche après la première ronde.</p>
      ) : (
        <div className="space-y-1.5">
          {top.map((s) => row(s, s.playerId === playerId))}
          {showMine && mine && (
            <>
              <p className="text-center text-xs text-white/30">...</p>
              {row(mine, true)}
            </>
          )}
        </div>
      )}
      <p className="mt-auto shrink-0 pt-2 text-center text-[11px] text-white/35">
        Départage : Buchholz (points des adversaires), puis victoires
      </p>
    </div>
  );
}

function WaveMe({
  state,
  playerId,
  busy,
  onClaim,
}: {
  state: TournamentPublicState;
  playerId: string;
  busy: boolean;
  onClaim?: TournamentPlayerScreenProps['onClaim'];
}) {
  const wave = state.waves[state.waves.length - 1];
  if (state.phase === 'bracket' && state.bracket) {
    const mine = [...state.bracket.matches].reverse().find((m) => m.playerIds.includes(playerId));
    if (mine && mine.playerIds.length >= 2 && !mine.places) {
      return (
        <ClaimForm
          state={state}
          playerId={playerId}
          title={mine.label}
          ids={mine.playerIds}
          claims={mine.claims}
          mode={state.game === 'smash' ? 'score' : 'places'}
          busy={busy}
          onSubmit={(places, loserGames) => onClaim?.({ kind: 'match', targetId: mine.id, places, loserGames })}
        />
      );
    }
    if (mine?.places) {
      const place = mine.places.indexOf(playerId) + 1;
      const score = mine.loserGames !== null ? ` · 3-${mine.loserGames}` : '';
      return <Message emoji={place === 1 ? '✅' : '🏁'} title={place === 1 ? 'Tu passes' : 'Éliminé'} sub={`${mine.label}${score}`} />;
    }
    return <Message emoji="⏳" title="Phase finale" sub="Ton match s’affiche dès qu’il est connu." />;
  }
  if (!wave) return <Message emoji="🕐" title="En attente de la prochaine salve" />;
  if (wave.sitOuts.includes(playerId)) {
    return <Message emoji="🪑" title="Tu ne joues pas cette salve" sub="Tu reviens à la suivante. Aucun point ce tour-ci." />;
  }
  const group = wave.groups.find((g) => g.playerIds.includes(playerId));
  if (!group) return <Message emoji="🕐" title="Tu joues à la prochaine salve" sub="Tu es arrivé après le tirage." />;
  const names = group.playerIds.map((id) => pseudoOf(state, id)).join(', ');
  if (group.places) {
    const place = group.places.indexOf(playerId) + 1;
    const pts = group.counts ? `${group.points[playerId] ?? 0} pts` : 'Hors classement de poule';
    return <Message emoji="✅" title={`Tu finis ${place}${place === 1 ? 'er' : 'e'}`} sub={pts} />;
  }
  if (group.status === 'queued') return <Message emoji="⏳" title="Ton groupe est en file" sub={names} />;
  const smashPool = state.game === 'smash' && group.playerIds.length === 2;
  return (
    <ClaimForm
      state={state}
      playerId={playerId}
      title={smashPool ? 'Qui a gagné ?' : 'Ordre d’arrivée'}
      ids={group.playerIds}
      claims={group.claims}
      mode={smashPool ? 'winner' : 'places'}
      busy={busy}
      onSubmit={(places, loserGames) => onClaim?.({ kind: 'group', targetId: group.id, places, loserGames })}
    />
  );
}

function claimSignature(claim: Pick<TClaim, 'places' | 'loserGames'>): string {
  return `${claim.loserGames ?? ''}:${claim.places.join(',')}`;
}

function claimText(state: TournamentPublicState, claim: TClaim): string {
  if (claim.loserGames !== null) return `${pseudoOf(state, claim.places[0])} gagne 3-${claim.loserGames}`;
  if (claim.places.length === 2) return `${pseudoOf(state, claim.places[0])} gagne`;
  return claim.places.map((id, i) => `${i + 1}. ${pseudoOf(state, id)}`).join(' · ');
}

function ClaimForm({
  state,
  playerId,
  title,
  ids,
  claims,
  mode,
  busy,
  onSubmit,
}: {
  state: TournamentPublicState;
  playerId: string;
  title: string;
  ids: string[];
  claims: TClaim[];
  mode: 'places' | 'winner' | 'score';
  busy: boolean;
  onSubmit: (places: string[], loserGames: 0 | 1 | 2 | null) => void | Promise<void>;
}) {
  const mine = [...(claims ?? [])].reverse().find((c) => c.playerId === playerId) ?? null;
  const conflict = (claims ?? []).length >= 2 && (claims ?? []).some((c) => claimSignature(c) !== claimSignature(claims[0]));
  const [editing, setEditing] = useState(!mine);
  const [order, setOrder] = useState<string[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [sent, setSent] = useState<TClaim | null>(null);
  const shown = mine ?? sent;

  const send = (places: string[], loserGames: 0 | 1 | 2 | null) => {
    setSent({ playerId, places, loserGames, at: Date.now() });
    setEditing(false);
    setOrder([]);
    setWinner(null);
    void onSubmit(places, loserGames);
  };

  if (shown && !editing) {
    return (
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{title}</p>
        <p className="mt-2 text-lg font-black">{claimText(state, shown)}</p>
        <p className="mt-1 text-sm text-white/60">En attente de l’animateur. Lui seul valide.</p>
        {conflict && <p className="mt-1 text-sm font-semibold text-amber-200">Les saisies ne concordent pas. L’animateur tranche.</p>}
        <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm font-bold text-cyan-200">
          Modifier
        </button>
      </div>
    );
  }

  const left = ids.filter((id) => !order.includes(id));
  return (
    <div>
      <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{title}</p>
      <p className="mb-2 text-center text-[11px] text-white/45">Tu ne saisis que pour toi. L’animateur valide.</p>
      {mode === 'places' ? (
        <>
          {order.length > 0 && (
            <ol className="mb-2 space-y-0.5 text-sm font-bold">
              {order.map((id, i) => (
                <li key={id}>{i + 1}. {pseudoOf(state, id)}</li>
              ))}
            </ol>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {left.map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => setOrder([...order, id])}
                className="min-h-[44px] truncate rounded-xl border border-white/15 bg-white/5 px-2 text-sm font-bold active:bg-white/15 disabled:opacity-40"
              >
                {pseudoOf(state, id)}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" disabled={busy || order.length === 0} onClick={() => setOrder([])} className="min-h-[44px] rounded-xl bg-white/10 text-sm font-bold disabled:opacity-40">
              Recommencer
            </button>
            <button
              type="button"
              disabled={busy || order.length !== ids.length}
              onClick={() => send(order, null)}
              className="min-h-[44px] rounded-xl bg-cyan-400 text-sm font-black text-[#0a0a14] disabled:opacity-40"
            >
              Envoyer
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => setWinner(id)}
                className={`min-h-[44px] truncate rounded-xl px-2 text-sm font-bold disabled:opacity-40 ${
                  winner === id ? 'bg-cyan-400 text-[#0a0a14]' : 'border border-white/15 bg-white/5'
                }`}
              >
                {pseudoOf(state, id)}
              </button>
            ))}
          </div>
          {mode === 'winner' && (
            <button
              type="button"
              disabled={busy || !winner}
              onClick={() => {
                if (!winner) return;
                const other = ids.find((id) => id !== winner) ?? winner;
                send([winner, other], null);
              }}
              className="mt-2 min-h-[44px] w-full rounded-xl bg-cyan-400 text-sm font-black text-[#0a0a14] disabled:opacity-40"
            >
              Envoyer
            </button>
          )}
          {mode === 'score' && winner && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {([0, 1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const other = ids.find((id) => id !== winner) ?? winner;
                    send([winner, other], n);
                  }}
                  className="min-h-[44px] rounded-xl bg-cyan-400 text-sm font-black text-[#0a0a14] disabled:opacity-40"
                >
                  3-{n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MatchesTab({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
  if (state.format === 'waves') {
    const rows = state.waves.flatMap((w) =>
      w.groups
        .filter((g) => g.playerIds.includes(playerId))
        .map((g) => ({ wave: w, group: g })),
    );
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-2 shrink-0 text-lg font-black uppercase tracking-widest">Mes matchs</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-white/50">Aucun match pour l’instant.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.slice(-8).map(({ wave, group }) => (
              <p key={group.id} className="truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                {wave.kind === 'barrage' ? 'Barrage' : `Salve ${wave.number}`}
                {' · '}
                {group.status === 'queued' ? 'en file' : group.places ? `${group.places.indexOf(playerId) + 1}e` : 'à jouer'}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }
  const matches = myMatches(state, playerId).slice(-8);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-2 shrink-0 text-lg font-black uppercase tracking-widest">Mes matchs</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-white/50">Aucun match joué pour l'instant.</p>
      ) : (
        <div className="space-y-1.5">
          {matches.map((m) => {
            const out = outcomeFor(m, playerId);
            const counts = m.kind !== 'floater' || m.a === playerId;
            const label =
              m.status === 'pending'
                ? 'à jouer'
                : m.status === 'playing'
                  ? 'en cours'
                  : out === 'win'
                    ? 'victoire'
                    : out === 'draw'
                      ? 'nul'
                      : out === 'loss'
                        ? 'défaite'
                        : out === 'bye'
                          ? 'exempt'
                          : 'annulé';
            const tone =
              out === 'win'
                ? 'text-emerald-300'
                : out === 'draw' || out === 'bye'
                  ? 'text-amber-200'
                  : out === 'loss'
                    ? 'text-white/60'
                    : 'text-cyan-200';
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="w-7 shrink-0 text-center text-xs font-black text-white/40">R{m.round}</span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {m.kind === 'bye' ? 'Exempt' : pseudoOf(state, opponentOf(m, playerId))}
                  {m.kind === 'floater' && <span className="ml-1 text-xs text-violet-300">bonus</span>}
                </span>
                <span className={`text-sm font-bold ${tone}`}>{label}</span>
                <span className="w-10 text-right text-sm font-black tabular-nums text-cyan-300">
                  {m.status === 'done' && counts ? `+${fmtScore(pointsFor(m, playerId))}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EndedScreen({ state, playerId }: { state: TournamentPublicState; playerId: string | null }) {
  const s = playerId ? standingOf(state, playerId) : null;
  return (
    <Center>
      <div className="anim-pop w-full max-w-sm text-center">
        <div className="mb-3 text-6xl">🏁</div>
        <h2 className="text-balance text-2xl font-black">{state.title} est terminé</h2>
        {s && (
          <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-6 py-4">
            <p className="text-sm uppercase tracking-widest text-white/40">Ton résultat</p>
            <p className="mt-1 text-3xl font-black text-cyan-300">{rankLabel(s.rank)}</p>
            <p className="text-lg font-bold">{fmtPoints(s.points)}</p>
          </div>
        )}
        <Podium state={state} />
        <p className="mt-6 text-white/50">Merci d'avoir joué, à très vite au Invader !</p>
      </div>
    </Center>
  );
}
