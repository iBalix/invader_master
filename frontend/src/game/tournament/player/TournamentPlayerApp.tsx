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
  clearTournamentIdentity,
  currentRoundOf,
  fmtPoints,
  fmtScore,
  formatSummary,
  hasResults,
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
  standingOf,
  tournamentApi,
  tournamentErrorLabel,
} from '../tournamentClient';
import type { TMatch, TournamentPublicState, TournamentYou } from '../tournamentTypes';
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

  // jeton refusé (retiré pendant les inscriptions, base nettoyée) : on repart de zéro
  useEffect(() => {
    if (!youAbsent || !token || !state) return;
    clearTournamentIdentity(state.id);
    setToken(null);
    setNotice("Tu n'es plus inscrit à ce tournoi. Réinscris-toi quand tu veux !");
  }, [youAbsent, token, state]);

  const join = useCallback(
    async (pseudo: string) => {
      if (!ref || busy) return;
      setBusy(true);
      setError(null);
      try {
        const data = await tournamentApi.join(ref, { pseudo, playerToken: token ?? undefined });
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

  const leave = useCallback(async () => {
    if (!ref || !token || busy) return;
    setBusy(true);
    try {
      const data = await tournamentApi.leave(ref, token);
      apply({ state: data.state, you: data.you });
      if (!data.you && state) {
        // désinscription pendant les inscriptions : plus aucune trace
        clearTournamentIdentity(state.id);
        setToken(null);
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
  /** onglet de départ (laboratoire) */
  initialTab?: TournamentPlayerTab;
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
      <StatusBar state={state} playerId={me.id} pseudo={me.pseudo} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        {tab === 'moi' && <MeTab {...props} playerId={me.id} status={me.status} />}
        {tab === 'classement' && <StandingsTab state={state} playerId={me.id} />}
        {tab === 'matchs' && <MatchesTab state={state} playerId={me.id} />}
      </div>
      <TabBar tab={tab} onTab={setTab} />
    </div>
  );
}

function StatusBar({ state, playerId, pseudo }: { state: TournamentPublicState; playerId: string; pseudo: string }) {
  const s = standingOf(state, playerId);
  const round = currentRoundOf(state);
  const ranked = hasResults(state);
  return (
    <div className="shrink-0 border-b border-white/10 bg-black/30 px-4 pb-2.5 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          ♞ {state.title}
        </p>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/70">
          {state.phase === 'registration'
            ? 'Inscriptions'
            : state.phase === 'final'
              ? 'Terminé'
              : round
                ? roundLabel(state, round.number)
                : ''}
        </span>
      </div>
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
  const closed = state.phase === 'final' || (state.phase !== 'registration' && !state.config.lateJoin);
  const started = state.phase !== 'registration';
  const submit = () => {
    if (!pseudo.trim() || busy || closed) return;
    void onJoin(pseudo.trim());
  };
  return (
    <Center>
      <div className="anim-fade-up w-full max-w-sm text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          ♞ Tournoi · {state.formatLabel}
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
              Retiens-le bien : c'est ce pseudo que tu taperas sur la table d'échecs pour que tes parties comptent.
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
}: TournamentPlayerScreenProps & { playerId: string; status: string }) {
  const [confirming, setConfirming] = useState(false);
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
        <Message emoji="✅" title="Tu es inscrit !" sub="Les matchs de la ronde 1 seront tirés au sort à la fin du compte à rebours." />
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

function MatchesTab({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
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
