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

import { Fragment, useCallback, useEffect, useState } from 'react';
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
import { ArcadeStage, Chrome, Crown, GameGlyph, Invader, Pawn, Trophy, chromeSize, invaderTone, mmss, rankClass, rankText } from '../arcade/kit';
import { CHECK, CROSS, CUP, CURSOR, DOOR, HOURGLASS, LIST, PixelSprite, STAR, type Sprite } from '../arcade/pixel';
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
          <Invader seed={0} scale={6} animate className="text-ia-cyan" />
          <p className="ia-pixel ia-blink mt-5 text-sm text-ia-soft">Chargement</p>
        </Center>
      </Shell>
    );
  }
  if (!ref || !state) {
    return (
      <Shell>
        <Center>
          <div className="anim-fade-up text-center">
            <Invader seed={1} scale={6} animate className="mx-auto text-ia-pink" />
            <h1 className="mb-4 mt-6 text-5xl">
              <Chrome>Invader</Chrome>
            </h1>
            <p className="text-balance text-base text-ia-soft">
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

/** fond du téléphone (exporté pour le cadre téléphone du labo) */
export function PlayerStage({ children, className = 'h-dvh' }: { children: React.ReactNode; className?: string }) {
  return (
    <ArcadeStage className={`flex flex-col overflow-hidden ${className}`} floor={0.16} floorOpacity={0.3} cell={34} scan={0.06}>
      {children}
    </ArcadeStage>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <PlayerStage>{children}</PlayerStage>;
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
      <TabBar tab={tab} onTab={setTab} game={state.game} />
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

/** HUD de jeu : tournoi et phase, joueur, points, rang */
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
    <div className="shrink-0 border-b-2 border-ia-line bg-ia-night/80 px-4 pb-2.5 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2">
          <GameGlyph game={state.game} scale={2} />
          <span className="ia-pixel truncate text-xs text-ia-soft">{state.title}</span>
        </p>
        <span className="ia-pixel ia-clip ia-clip--sm shrink-0 bg-ia-line px-2 py-1 text-[11px] text-white">{phaseChip(state)}</span>
      </div>
      {others.length > 0 && onPickPhone && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {phones?.map((p) => (
            <button
              key={p.playerToken}
              type="button"
              onClick={() => onPickPhone(p.playerToken)}
              className={`ia-clip ia-clip--sm min-h-[36px] shrink-0 px-3 text-sm font-bold ${
                p.pseudo === pseudo ? 'bg-ia-cyan text-ia-night' : 'bg-ia-panel text-ia-soft'
              }`}
            >
              {p.pseudo}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5">
          <Invader seed={playerId} scale={3} className={invaderTone(playerId)} />
          {/* police à casse conservée : c'est le pseudo exact tapé sur les tables */}
          <span className="truncate text-2xl font-black text-white">{pseudo}</span>
        </p>
        {s && state.phase !== 'registration' && (
          <div className="flex shrink-0 items-end gap-3">
            <HudCounter label="Pts" value={fmtScore(s.points)} tone="text-ia-cyan" />
            {ranked && (
              <HudCounter
                label="Rang"
                value={
                  <>
                    {rankText(s.rank)}
                    <span className="text-lg text-ia-muted">/{state.standings.length}</span>
                  </>
                }
                tone={rankClass(s.rank)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HudCounter({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <span className="flex flex-col items-end leading-none">
      <span className="ia-pixel text-[10px] text-ia-muted">{label}</span>
      <span className={`ia-display mt-0.5 text-3xl tabular-nums ${tone}`}>{value}</span>
    </span>
  );
}

function TabBar({ tab, onTab, game }: { tab: Tab; onTab: (t: Tab) => void; game: string }) {
  const items: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'moi', label: 'Mon tournoi', icon: <GameGlyph game={game} scale={2} /> },
    { key: 'classement', label: 'Classement', icon: <PixelSprite sprite={CUP} scale={2} /> },
    { key: 'matchs', label: 'Mes matchs', icon: <PixelSprite sprite={LIST} scale={2} /> },
  ];
  return (
    <div className="grid shrink-0 grid-cols-3 border-t-2 border-ia-line bg-ia-night/90 pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const on = tab === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onTab(it.key)}
            className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1.5 ${on ? 'text-white' : 'text-ia-muted'}`}
          >
            {on && <span className="absolute left-1/2 top-0 h-1 w-14 -translate-x-1/2 bg-ia-pink" />}
            <span className={on ? 'text-ia-pink' : ''}>{it.icon}</span>
            <span className="ia-pixel text-[10px]">{it.label}</span>
          </button>
        );
      })}
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
    return <p className="ia-pixel ia-blink mt-4 text-xs text-ia-gold">En attente d'autres joueurs...</p>;
  }
  const reste = Math.max(0, state.phaseEndsAt - now);
  if (reste <= 0) return <p className="ia-pixel ia-blink mt-4 text-sm text-ia-gold">Tirage imminent !</p>;
  return (
    <div className="ia-px ia-px--cyan mt-4 inline-flex items-center gap-3 px-4 py-2">
      <span className="ia-pixel text-[11px] text-ia-cyan">Début dans</span>
      <span className="ia-pixel text-2xl tabular-nums text-white">{mmss(reste)}</span>
    </div>
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
      <div className="anim-fade-up flex w-full max-w-sm flex-col items-center text-center">
        <p className="flex items-center gap-2">
          <GameGlyph game={state.game} scale={2} />
          <span className="ia-pixel text-[11px] text-ia-cyan">
            Tournoi · {state.formatLabel}
          </span>
        </p>
        <h1 className={`mt-3 text-balance leading-[1.12] ${chromeSize(state.title, ['text-4xl', 'text-3xl', 'text-2xl', 'text-xl'])}`}>
          <Chrome>{state.title}</Chrome>
        </h1>
        <p className="ia-pixel mt-3 text-[11px] text-ia-soft">
          {state.playerCount} inscrit{state.playerCount > 1 ? 's' : ''} · {state.gameLabel}
        </p>
        <MiniCountdown state={state} />
        {notice && <p className="anim-pop ia-px ia-px--amber mt-4 w-full px-4 py-3 text-sm font-semibold text-ia-gold">{notice}</p>}
        {closed ? (
          <p className="ia-px ia-px--plain mt-6 w-full px-4 py-4 text-ia-soft">
            {state.phase === 'final' ? 'Le tournoi est terminé.' : 'Les inscriptions sont fermées.'}
          </p>
        ) : (
          <div className="mt-6 w-full text-left">
            <label htmlFor="pseudo-tournoi" className="ia-pixel mb-2 block text-xs text-ia-pink">
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
              className="ia-input ia-clip mb-2 min-h-[60px] text-center text-2xl font-black"
              placeholder="PSEUDO"
            />
            <p className="mb-4 text-xs leading-snug text-ia-soft">
              {state.format === 'waves'
                ? 'Plusieurs personnes peuvent s’inscrire depuis ce téléphone.'
                : 'Retiens-le bien : c’est ce pseudo que tu taperas sur la table d’échecs. Tu pourras aussi inscrire quelqu’un d’autre ensuite.'}
            </p>
            {error && <p className="anim-shake mb-3 text-center text-sm font-bold text-ia-red">{error}</p>}
            <button type="button" onClick={submit} disabled={busy || !pseudo.trim()} className="ia-btn ia-btn--pink ia-btn--xl ia-pixel w-full text-lg">
              {busy ? '...' : started ? 'Rejoindre le tournoi' : 'Participer'}
            </button>
            {started && <p className="mt-3 text-center text-xs text-ia-soft">Le tournoi a commencé : tu joues dès la prochaine ronde.</p>}
          </div>
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
    <span className={`ia-clip ia-clip--sm inline-flex items-center gap-2 px-2.5 py-1 ${color === 'w' ? 'bg-white text-ia-night' : 'bg-ia-night text-white ring-2 ring-inset ring-ia-soft'}`}>
      <Pawn color={color} scale={2} />
      <span className="ia-pixel text-[11px]">{color === 'w' ? 'Blancs' : 'Noirs'}</span>
    </span>
  );
}

function StatsRow({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
  const s = standingOf(state, playerId);
  // en salves, le HUD du haut suffit (points, rang) : la place va à la saisie
  if (!s || state.phase === 'registration' || state.format === 'waves') return null;
  const ranked = hasResults(state);
  const cell = 'ia-px ia-px--deep flex flex-1 flex-col items-center justify-center py-2';
  return (
    <div className="mt-3 flex shrink-0 gap-2">
      <div className={cell}>
        <span className="ia-display text-3xl tabular-nums text-ia-cyan">{fmtScore(s.points)}</span>
        <span className="ia-pixel text-[10px] text-ia-muted">points</span>
      </div>
      <div className={cell}>
        <span className={`ia-display text-3xl ${rankClass(s.rank, ranked)}`}>
          {ranked ? rankText(s.rank) : '-'}
          {ranked && s.tied ? '=' : ''}
        </span>
        <span className="ia-pixel text-[10px] text-ia-muted">sur {state.standings.length}</span>
      </div>
      <div className={cell}>
        <span className="ia-display text-3xl tabular-nums text-white">
          {s.wins}
          <span className="text-ia-muted">-</span>
          {s.draws}
          <span className="text-ia-muted">-</span>
          {s.losses}
        </span>
        <span className="ia-pixel text-[10px] text-ia-muted">V-N-D</span>
      </div>
    </div>
  );
}

/** pseudo exact à taper sur la table, casse conservée */
function ExactPseudo({ children }: { children: React.ReactNode }) {
  return <b className="ia-clip ia-clip--sm mx-0.5 inline-block bg-ia-cyan px-1.5 font-mono text-ia-night">{children}</b>;
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
    <div className="anim-pop ia-px ia-px--cyan ia-glow-cyan px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="ia-pixel text-[11px] text-ia-cyan">
          {roundLabel(state, m.round)} · Match {m.board}
        </p>
        <ColorBadge color={color} />
      </div>
      <p className="ia-pixel mt-3 text-[11px] text-ia-soft">{iCountForNothing ? 'Partie bonus contre' : 'Ton adversaire'}</p>
      <p className="flex min-w-0 items-center gap-3">
        <span className="ia-pixel text-lg italic text-ia-pink" style={{ textShadow: '2px 2px 0 #33e2ff' }}>
          VS
        </span>
        <span className="ia-display truncate text-5xl text-white">{oppPseudo}</span>
      </p>
      {multi && m.games.length > 0 && (
        <p className="ia-pixel mt-1 text-xs text-ia-cyan">
          Score du match : {fmtScore(myScore)} - {fmtScore(oppScore)}
        </p>
      )}
      {m.status === 'playing' ? (
        <p className="ia-pixel mt-3 flex items-center gap-2 text-xs text-ia-mint">
          <span className="ia-blink inline-block h-2 w-2 bg-ia-mint" /> Partie en cours, bonne chance !
        </p>
      ) : color === 'w' ? (
        <p className="mt-3 text-sm leading-relaxed text-white">
          Tu as les blancs : <b>crée la partie</b> sur une table d'échecs avec ton pseudo exact <ExactPseudo>{me}</ExactPseudo>. {oppPseudo} la rejoindra.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-white">
          {oppPseudo} a les blancs et crée la partie : <b>rejoins-la</b> depuis le lobby des échecs avec ton pseudo exact <ExactPseudo>{me}</ExactPseudo>.
        </p>
      )}
      {iCountForNothing && (
        <p className="mt-2 text-xs text-ia-violet">{oppPseudo} était exempt : cette partie ne compte que pour lui, merci de jouer le jeu !</p>
      )}
      {m.kind === 'floater' && m.a === playerId && <p className="mt-2 text-xs text-ia-violet">Partie bonus : elle compte pour toi, pas pour {oppPseudo}.</p>}
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
      ? { icon: <Crown scale={4} />, title: 'Victoire !', tone: 'ia-px--gold ia-glow-gold', text: 'text-ia-gold' }
      : out === 'draw'
        ? { icon: <PixelSprite sprite={STAR} scale={4} className="text-ia-amber" />, title: 'Match nul', tone: 'ia-px--amber', text: 'text-ia-amber' }
        : out === 'loss'
          ? { icon: <Invader seed={playerId} scale={4} className="text-ia-soft" />, title: 'Défaite', tone: 'ia-px--plain', text: 'text-white' }
          : out === 'bye'
            ? { icon: <PixelSprite sprite={HOURGLASS} scale={4} className="text-ia-amber" />, title: 'Exempt', tone: 'ia-px--amber', text: 'text-ia-amber' }
            : { icon: <PixelSprite sprite={CROSS} scale={4} className="text-ia-muted" />, title: 'Match annulé', tone: 'ia-px--plain', text: 'text-ia-soft' };
  const countsForMe = m.kind !== 'floater' || m.a === playerId;
  return (
    <div className={`anim-pop ia-px ${look.tone} flex flex-col items-center px-4 py-5 text-center`}>
      {look.icon}
      <p className={`ia-display mt-3 text-5xl ${look.text}`}>{look.title}</p>
      {m.b && m.kind !== 'bye' && <p className="mt-1 text-sm text-ia-soft">contre {pseudoOf(state, opponentOf(m, playerId))}</p>}
      <p className="ia-pixel mt-3 text-sm text-ia-cyan">{countsForMe ? `+${fmtPoints(pts)}` : 'partie bonus, hors classement'}</p>
      {state.phase === 'round' && (
        <p className="ia-pixel mt-3 text-[10px] leading-relaxed text-ia-muted">
          Fin de ronde en attente · {done}/{total} matchs terminés
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
      <div className="anim-fade-up ia-px ia-px--red w-full max-w-sm px-5 py-5 text-center">
        <p className="ia-pixel text-sm text-ia-red">Attention</p>
        <p className="mt-3 text-balance text-base text-white">{text}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="ia-btn ia-btn--ghost ia-btn--lg">
            Rester
          </button>
          <button type="button" onClick={onConfirm} className="ia-btn ia-btn--red ia-btn--lg">
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
    body = <Message icon={<PixelSprite sprite={CROSS} scale={5} className="text-ia-red" />} title="Tu as été retiré du tournoi" sub="L'animateur t'a retiré. Va le voir si c'est une erreur." />;
  } else if (status === 'left') {
    body = (
      <div className="text-center">
        <Message icon={<PixelSprite sprite={DOOR} scale={5} className="text-ia-soft" />} title="Tu as quitté le tournoi" sub="Tu n'es plus apparié. Tes points restent au classement." />
        <button type="button" disabled={busy} onClick={() => void onRejoin()} className="ia-btn ia-btn--pink ia-btn--xl ia-pixel mt-5 w-full text-base">
          Revenir dans le tournoi
        </button>
      </div>
    );
  } else if (state.phase === 'registration') {
    body = (
      <div className="text-center">
        <Message
          icon={<PixelSprite sprite={CHECK} scale={5} className="text-ia-mint" />}
          title="Tu es inscrit !"
          sub={
            state.format === 'waves'
              ? 'Les groupes de la première salve seront tirés à la fin du compte à rebours.'
              : 'Les matchs de la ronde 1 seront tirés au sort à la fin du compte à rebours.'
          }
        />
        <MiniCountdown state={state} />
        <p className="ia-px ia-px--deep mt-4 px-3 py-2 text-xs text-ia-soft">{formatSummary(state)}</p>
      </div>
    );
  } else if (state.phase === 'final') {
    body = (
      <div className="text-center">
        <Message
          icon={<Trophy scale={3} />}
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
        icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-violet" />}
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
        icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-cyan" />}
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

  const canAdd = status === 'active' && state.phase !== 'final' && state.phase !== 'bracket' && onAdd && (state.phase === 'registration' || state.config.lateJoin) && !adding;
  const canLeave = status === 'active' && state.phase !== 'final';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center">{body}</div>
      <StatsRow state={state} playerId={playerId} />
      {error && <p className="mt-2 text-center text-sm font-bold text-ia-red">{error}</p>}
      {adding && onAdd && (
        <div className="mt-2 flex gap-2">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            maxLength={16}
            placeholder="Autre pseudo"
            className="ia-input ia-clip min-h-[52px] flex-1 font-bold"
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
            className="ia-btn ia-btn--cyan min-h-[52px] px-5"
          >
            OK
          </button>
        </div>
      )}
      {(canAdd || canLeave) && (
        <div className="mt-3 flex shrink-0 gap-2">
          {canAdd && (
            <button type="button" onClick={() => setAdding(true)} className="ia-btn ia-btn--ghost min-h-[48px] flex-1 whitespace-nowrap px-2 text-[13px]">
              + Ajouter une personne
            </button>
          )}
          {canLeave && (
            <button type="button" onClick={() => setConfirming(true)} className="ia-btn ia-btn--ghost-red min-h-[48px] flex-1 whitespace-nowrap px-2 text-[13px]">
              {state.phase === 'registration' ? 'Me désinscrire' : 'Quitter le tournoi'}
            </button>
          )}
        </div>
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

function Message({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="anim-fade-up flex flex-col items-center text-center">
      <div className="mb-4">{icon}</div>
      <h2 className="ia-display text-balance text-4xl text-white">{title}</h2>
      {sub && <p className="mt-2 text-balance text-sm leading-snug text-ia-soft">{sub}</p>}
    </div>
  );
}

function Podium({ state }: { state: TournamentPublicState }) {
  const top = state.standings.filter((s) => s.status !== 'excluded').slice(0, 3);
  const metals = ['gold', 'silver', 'bronze'] as const;
  return (
    <div className="mt-5 space-y-1.5">
      {top.map((s, i) => (
        <div key={s.playerId} className={`ia-px flex items-center gap-3 px-3 py-2 ${i === 0 ? 'ia-px--gold' : i === 1 ? 'ia-px--silver' : 'ia-px--amber'}`}>
          <Trophy scale={1} metal={metals[i]} />
          <span className={`ia-pixel w-9 text-left text-sm ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
          <span className="ia-display min-w-0 flex-1 truncate text-left text-3xl text-white">{s.pseudo}</span>
          <span className="ia-display text-3xl tabular-nums text-ia-cyan">{fmtScore(s.points)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classement / mes matchs
// ---------------------------------------------------------------------------

function TabTitle({ icon, children }: { icon: Sprite; children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 flex shrink-0 items-center gap-2.5">
      <PixelSprite sprite={icon} scale={2} className="text-ia-gold" />
      <span className="ia-pixel text-base text-white">{children}</span>
    </h2>
  );
}

function StandingsTab({ state, playerId }: { state: TournamentPublicState; playerId: string }) {
  const top = state.standings.slice(0, 8);
  const mine = state.standings.find((s) => s.playerId === playerId);
  const showMine = mine && !top.some((s) => s.playerId === playerId);
  const ranked = hasResults(state);
  const row = (s: (typeof state.standings)[number], highlight: boolean) => (
    <div
      key={s.playerId}
      className={`ia-px flex items-center gap-2 px-2.5 py-1 ${highlight ? 'ia-px--pink' : s.rank <= 3 && ranked ? (s.rank === 1 ? 'ia-px--gold' : s.rank === 2 ? 'ia-px--silver' : 'ia-px--amber') : 'ia-px--deep'} ${
        s.status !== 'active' ? 'opacity-50' : ''
      }`}
    >
      <span className="w-3 shrink-0">{highlight && <PixelSprite sprite={CURSOR} scale={2} className="text-ia-pink" />}</span>
      <span className={`ia-pixel w-10 shrink-0 text-right text-sm ${rankClass(s.rank, ranked)}`}>
        {ranked ? rankText(s.rank) : '-'}
        {ranked && s.tied ? '=' : ''}
      </span>
      <span className="flex w-7 shrink-0 justify-center">
        {ranked && s.rank === 1 ? <Crown scale={2} /> : <Invader seed={s.playerId} scale={2} className={invaderTone(s.playerId)} />}
      </span>
      <span className="ia-display min-w-0 flex-1 truncate text-[1.4rem] leading-tight text-white">{s.pseudo}</span>
      {state.format !== 'waves' && (
        <span className="ia-pixel text-[10px] tabular-nums text-ia-muted">
          {s.wins}-{s.draws}-{s.losses}
        </span>
      )}
      <span className="ia-display w-9 text-right text-[1.4rem] leading-tight tabular-nums text-ia-cyan">{fmtScore(s.points)}</span>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabTitle icon={CUP}>Classement</TabTitle>
      {state.standings.length === 0 || state.phase === 'registration' ? (
        <p className="text-sm text-ia-soft">Le classement s'affiche après la première ronde.</p>
      ) : (
        <div className="space-y-1">
          {top.map((s) => row(s, s.playerId === playerId))}
          {showMine && mine && (
            <>
              <p className="ia-pixel text-center text-[10px] leading-none text-ia-muted">...</p>
              {row(mine, true)}
            </>
          )}
        </div>
      )}
      {/* le Buchholz ne départage que les rondes suisses */}
      {state.format !== 'waves' && (
        <p className="mt-auto shrink-0 pt-2 text-center text-[11px] text-ia-muted">Départage : Buchholz (points des adversaires), puis victoires</p>
      )}
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
      return (
        <Message
          icon={place === 1 ? <PixelSprite sprite={CHECK} scale={5} className="text-ia-mint" /> : <PixelSprite sprite={CROSS} scale={5} className="text-ia-red" />}
          title={place === 1 ? 'Tu passes' : 'Éliminé'}
          sub={`${mine.label}${score}`}
        />
      );
    }
    return <Message icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-cyan" />} title="Phase finale" sub="Ton match s’affiche dès qu’il est connu." />;
  }
  if (!wave) return <Message icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-cyan" />} title="En attente de la prochaine salve" />;
  if (wave.sitOuts.includes(playerId)) {
    return <Message icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-muted" />} title="Tu ne joues pas cette salve" sub="Tu reviens à la suivante. Aucun point ce tour-ci." />;
  }
  const group = wave.groups.find((g) => g.playerIds.includes(playerId));
  if (!group) return <Message icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-cyan" />} title="Tu joues à la prochaine salve" sub="Tu es arrivé après le tirage." />;
  const names = group.playerIds.map((id) => pseudoOf(state, id)).join(', ');
  if (group.places) {
    const place = group.places.indexOf(playerId) + 1;
    const pts = group.counts ? `${group.points[playerId] ?? 0} pts` : 'Hors classement de poule';
    return <Message icon={place === 1 ? <Crown scale={4} /> : <PixelSprite sprite={CHECK} scale={5} className="text-ia-mint" />} title={`Tu finis ${place}${place === 1 ? 'er' : 'e'}`} sub={pts} />;
  }
  if (group.status === 'queued') return <Message icon={<PixelSprite sprite={HOURGLASS} scale={5} className="text-ia-amber" />} title="Ton groupe est en file" sub={names} />;
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
      <div className={`ia-px ${conflict ? 'ia-px--amber' : 'ia-px--violet'} flex flex-col items-center px-4 py-5 text-center`}>
        <p className="ia-pixel text-[11px] text-ia-soft">{title} · ta proposition</p>
        <p className="ia-display mt-3 text-balance text-3xl text-white">{claimText(state, shown)}</p>
        <p className="ia-pixel ia-blink mt-3 text-[11px] text-ia-cyan">En attente de l’animateur</p>
        <p className="mt-1 text-xs text-ia-soft">Lui seul valide.</p>
        {conflict && <p className="mt-2 text-sm font-bold text-ia-gold">Les saisies ne concordent pas. L’animateur tranche.</p>}
        <button type="button" onClick={() => setEditing(true)} className="ia-btn ia-btn--ghost mt-4 min-h-[48px] px-6 text-sm">
          Modifier
        </button>
      </div>
    );
  }

  const left = ids.filter((id) => !order.includes(id));
  return (
    <div>
      <p className="ia-pixel text-center text-sm text-ia-cyan">{title}</p>
      <p className="mb-2 mt-1 text-center text-[11px] text-ia-soft">Tu ne saisis que pour toi. L’animateur valide.</p>
      {mode === 'places' ? (
        <>
          {/* emplacements du podium : on touche les pseudos dans l'ordre d'arrivée */}
          <ol className="mb-3 space-y-1">
            {ids.map((_, i) => {
              const id = order[i];
              return (
                <li key={i} className={`ia-px flex min-h-[34px] items-center gap-3 px-3 ${id ? (i === 0 ? 'ia-px--gold' : 'ia-px--plain') : 'ia-px--deep'}`}>
                  <span className={`ia-pixel w-9 text-sm ${rankClass(i + 1)}`}>{rankText(i + 1)}</span>
                  {id ? (
                    <span className="ia-display truncate text-2xl text-white">{pseudoOf(state, id)}</span>
                  ) : (
                    <span className={`ia-pixel text-[10px] text-ia-muted ${i === order.length ? 'ia-blink' : ''}`}>{i === order.length ? 'Touche un pseudo' : '...'}</span>
                  )}
                </li>
              );
            })}
          </ol>
          {left.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {left.map((id) => (
                <button key={id} type="button" disabled={busy} onClick={() => setOrder([...order, id])} className="ia-btn ia-btn--ghost min-h-[52px] truncate px-2 text-lg">
                  {pseudoOf(state, id)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || order.length === 0} onClick={() => setOrder([])} className="ia-btn ia-btn--ghost min-h-[52px] text-sm">
              Recommencer
            </button>
            <button type="button" disabled={busy || order.length !== ids.length} onClick={() => send(order, null)} className="ia-btn ia-btn--pink ia-pixel min-h-[52px] text-sm">
              Envoyer
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            {ids.slice(0, 2).map((id, i) => (
              <Fragment key={id}>
                {i === 1 && (
                  <span className="ia-pixel text-lg italic text-ia-pink" style={{ textShadow: '2px 2px 0 #33e2ff' }}>
                    VS
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWinner(id)}
                  className={`ia-btn min-h-[84px] flex-col gap-1 px-2 ${winner === id ? 'ia-btn--gold' : 'ia-btn--ghost'}`}
                >
                  {winner === id && <Crown scale={2} />}
                  <span className="ia-display max-w-full truncate text-3xl">{pseudoOf(state, id)}</span>
                </button>
              </Fragment>
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
              className="ia-btn ia-btn--pink ia-btn--lg ia-pixel mt-3 w-full text-sm"
            >
              {winner ? `${pseudoOf(state, winner)} gagne · envoyer` : 'Touche le gagnant'}
            </button>
          )}
          {mode === 'score' && !winner && <p className="ia-pixel mt-3 text-center text-[11px] text-ia-muted">Touche le gagnant, puis le score</p>}
          {mode === 'score' && winner && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([0, 1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const other = ids.find((id) => id !== winner) ?? winner;
                    send([winner, other], n);
                  }}
                  className="ia-btn ia-btn--pink ia-pixel min-h-[60px] text-xl"
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
        <TabTitle icon={LIST}>Mes matchs</TabTitle>
        {rows.length === 0 ? (
          <p className="text-sm text-ia-soft">Aucun match pour l’instant.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.slice(-8).map(({ wave, group }) => {
              const place = group.places ? group.places.indexOf(playerId) + 1 : 0;
              return (
                <div key={group.id} className="ia-px ia-px--deep flex items-center gap-3 px-3 py-2">
                  <span className="ia-pixel w-16 shrink-0 text-[11px] text-ia-muted">{wave.kind === 'barrage' ? 'Barrage' : `Salve ${wave.number}`}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ia-soft">{group.playerIds.filter((id) => id !== playerId).map((id) => pseudoOf(state, id)).join(', ')}</span>
                  <span className={`ia-pixel text-xs ${group.status === 'queued' ? 'text-ia-amber' : place ? rankClass(place) : 'text-ia-cyan'}`}>
                    {group.status === 'queued' ? 'en file' : place ? rankText(place) : 'à jouer'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  const matches = myMatches(state, playerId).slice(-8);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabTitle icon={LIST}>Mes matchs</TabTitle>
      {matches.length === 0 ? (
        <p className="text-sm text-ia-soft">Aucun match joué pour l'instant.</p>
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
                ? 'text-ia-mint'
                : out === 'draw' || out === 'bye'
                  ? 'text-ia-amber'
                  : out === 'loss'
                    ? 'text-ia-muted'
                    : 'text-ia-cyan';
            return (
              <div key={m.id} className={`ia-px flex items-center gap-3 px-3 py-2 ${out === 'win' ? 'ia-px--mint' : 'ia-px--deep'}`}>
                <span className="ia-pixel w-7 shrink-0 text-center text-xs text-ia-muted">R{m.round}</span>
                <span className="ia-display min-w-0 flex-1 truncate text-2xl text-white">
                  {m.kind === 'bye' ? 'Exempt' : pseudoOf(state, opponentOf(m, playerId))}
                  {m.kind === 'floater' && <span className="ia-pixel ml-2 text-[10px] text-ia-violet">bonus</span>}
                </span>
                <span className={`ia-pixel text-[11px] ${tone}`}>{label}</span>
                <span className="ia-display w-10 text-right text-2xl tabular-nums text-ia-cyan">{m.status === 'done' && counts ? `+${fmtScore(pointsFor(m, playerId))}` : ''}</span>
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
      <div className="anim-pop flex w-full max-w-sm flex-col items-center text-center">
        <div className="ia-float">
          <Trophy scale={4} />
        </div>
        <h2 className={`mt-4 text-balance leading-[1.15] ${chromeSize(state.title, ['text-3xl', 'text-2xl', 'text-xl', 'text-lg'])}`}>
          <Chrome>{state.title}</Chrome>
        </h2>
        <p className="ia-pixel mt-2 text-xs text-ia-soft">Tournoi terminé</p>
        {s && (
          <div className="ia-px ia-px--pink mt-5 flex w-full items-center justify-between px-5 py-3">
            <span className="ia-pixel text-[11px] text-ia-soft">Ton résultat</span>
            <span className={`ia-display text-4xl ${rankClass(s.rank)}`}>{rankLabel(s.rank)}</span>
            <span className="ia-display text-3xl text-ia-cyan">{fmtPoints(s.points)}</span>
          </div>
        )}
        <div className="w-full">
          <Podium state={state} />
        </div>
        <p className="mt-6 text-sm text-ia-soft">Merci d'avoir joué, à très vite au Invader !</p>
      </div>
    </Center>
  );
}
