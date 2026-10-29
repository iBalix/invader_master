/**
 * Page de partie Bar Invaders, trois colonnes sur la dalle 1920x1080 :
 *   - gauche : logo, table des points, record du bar, pavé de déplacement ;
 *   - centre : l'écran de la borne (224x256 x4) et ses calques ;
 *   - droite : panneau JOUEURS (records du bar en solo), bouton FEU.
 * Salle d'attente / entre-deux-manches et écran de fin par-dessus. Une dalle
 * qui recharge reprend son siège via son token, et sa partie en cours via le
 * WebSocket.
 *
 * Mode démo local : /table/games/barinvaders/demo[?bots=3]
 * Options : ?debug=1 (pastille de diagnostic), ?mute=1 (sans son).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useStore } from 'zustand';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import RetroLoader from '../../../components/ui/RetroLoader';
import BarRecordsPanel from '../../../components/games/BarRecordsPanel';
import { useInactivity } from '../../../hooks/useInactivity';
import { usePerfMode } from '../../../hooks/usePerfMode';
import { useT } from '../../../i18n/useT';
import { createInvSfx, type InvSfxApi } from '../audio/invSfx';
import { INV_ACCENT, INV_COLORS } from '../art/palette';
import { createInvBridge, type BridgePlayer, type BridgeRound, type InvBridge } from '../engine/bridge';
import { InvControls } from '../engine/controls';
import InvNotice from '../components/InvNotice';
import InvRoom from '../components/InvRoom';
import InvScreen from '../components/InvScreen';
import JoinPseudoModal from '../components/JoinPseudoModal';
import PlayersPanel from '../components/PlayersPanel';
import RecordBanner from '../components/RecordBanner';
import RoundResultsTable from '../components/RoundResultsTable';
import ScoreTable from '../components/ScoreTable';
import ScreenOverlay from '../components/ScreenOverlay';
import { FireButton, MovePad } from '../components/TouchControls';
import { useDemoInv } from '../hooks/useDemoInv';
import { useInvNet } from '../hooks/useInvNet';
import { useInvSession } from '../hooks/useInvSession';
import { invApi, invErrorKey } from '../lib/invApi';
import { formatScore } from '../lib/format';
import { clearInvIdentity, getInvIdentity, getLastPseudo, saveInvIdentity, saveLastPseudo } from '../lib/identity';
import type { InvAction, InvPublicState } from '../lib/invTypes';
import '../inv.css';

const LOBBY_PATH = '/table/games/barinvaders';
const GAMEOVER_RETRY_MS = [500, 1500, 4000, 8000];
const INVITE_COOLDOWN_MS = 45_000;
/** écran « partie fermée » : temps d'affichage avant le retour automatique au lobby */
const END_REDIRECT_MS = 8_000;
const QUIT_CONFIRM_MS = 3_000;

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

/** joueurs du pont : liste de session + participants de la manche (même partis) */
function buildPlayers(state: InvPublicState, myId: string | null, pseudos: Map<string, string>): Record<string, BridgePlayer> {
  const round = state.round;
  const players: Record<string, BridgePlayer> = {};
  const resultOf = (id: string) => {
    const r = round?.results[id];
    return r && !r.alive ? { overFrame: r.overFrame, score: r.score, wave: r.wave } : null;
  };
  for (const player of state.players) {
    pseudos.set(player.playerId, player.pseudo);
    players[player.playerId] = {
      playerId: player.playerId,
      pseudo: player.pseudo,
      isMe: player.playerId === myId,
      waiting: player.status === 'pending',
      inRound: round?.participants.includes(player.playerId) ?? false,
      result: resultOf(player.playerId),
    };
  }
  if (round) {
    for (const id of round.participants) {
      if (players[id]) continue;
      players[id] = { playerId: id, pseudo: pseudos.get(id) ?? '?', isMe: id === myId, waiting: false, inRound: true, result: resultOf(id) };
    }
  }
  return players;
}

/**
 * Manche à donner à la boucle : celle du snapshot, sauf si le WebSocket en a
 * déjà annoncé une plus récente que le snapshot n'a pas encore rattrapée.
 */
function bridgeRound(state: InvPublicState, current: BridgeRound | null): BridgeRound | null {
  const r = state.round;
  const fromState = r ? { index: r.index, startsAt: r.startsAt, capAt: r.capAt, participants: r.participants } : null;
  if (current && (!fromState || current.index > fromState.index)) {
    const finished = (state.lastRound?.index ?? -1) >= current.index || state.status === 'end';
    if (!finished) return current;
  }
  return fromState;
}

function QuitButton({ playing, onQuit, t }: { playing: boolean; onQuit: () => void; t: ReturnType<typeof useT> }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const click = () => {
    if (!playing || armed) {
      onQuit();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), QUIT_CONFIRM_MS);
  };
  return (
    <button
      type="button"
      data-inv-ui
      onClick={click}
      className="flex h-[72px] items-center gap-3 rounded-2xl border-2 px-6 text-[22px] font-bold uppercase active:scale-95"
      style={{
        borderColor: armed ? INV_COLORS.red : 'rgba(255,255,255,0.22)',
        color: armed ? INV_COLORS.red : 'rgba(255,255,255,0.75)',
        background: armed ? `${INV_COLORS.red}1A` : 'rgba(0,0,0,0.35)',
      }}
    >
      <LogOut className="h-6 w-6" />
      {armed ? t('table.inv.quitConfirm', 'Toucher encore pour quitter') : t('table.inv.quit', 'Quitter')}
    </button>
  );
}

export default function InvGamePage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const perf = usePerfMode();
  const isDemo = sessionId === 'demo';
  const debug = searchParams.get('debug') === '1';
  const muted = searchParams.get('mute') === '1';
  const botCount = Math.max(0, Math.min(7, Number(searchParams.get('bots') ?? 3) || 0));

  // ----- pont, commandes et sons, créés une fois
  const bridgeRef = useRef<InvBridge | null>(null);
  if (!bridgeRef.current) bridgeRef.current = createInvBridge();
  const bridge = bridgeRef.current;
  useEffect(() => () => bridge.dispose(), [bridge]);

  const controlsRef = useRef<InvControls | null>(null);
  if (!controlsRef.current) controlsRef.current = new InvControls();
  const controls = controlsRef.current;

  const sfxRef = useRef<InvSfxApi | null>(null);
  useEffect(() => {
    const sfx = createInvSfx();
    sfx.setMuted(muted);
    sfxRef.current = sfx;
    controls.onPress = () => sfx.unlock();
    return () => {
      sfx.dispose();
      if (sfxRef.current === sfx) sfxRef.current = null;
    };
  }, [muted, controls]);

  // clavier (QA, dalles avec clavier) : jamais pendant la saisie d'un pseudo
  useEffect(() => {
    const handler = (down: boolean) => (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.repeat && down) return;
      if (controls.key(e.code, down)) e.preventDefault();
    };
    const onDown = handler(true);
    const onUp = handler(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    const onBlur = () => controls.releaseAll();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [controls]);

  // ----- identité et sources d'état (online / démo)
  const [identity, setIdentity] = useState(() => (isDemo ? null : getInvIdentity(sessionId)));
  useEffect(() => {
    setIdentity(isDemo ? null : getInvIdentity(sessionId));
  }, [sessionId, isDemo]);
  const token = identity?.playerToken ?? null;

  const online = useInvSession(isDemo ? null : sessionId, token);
  const demo = useDemoInv(isDemo, bridge, botCount);
  const state = isDemo ? demo.state : online.state;
  const you = isDemo ? demo.you : online.you;
  const status = state?.status ?? 'lobby';
  const { applyResponse, refresh } = online;

  const net = useInvNet({ sessionId: isDemo ? null : sessionId, playerToken: token, enabled: status === 'playing', bridge });

  // reprise de siège : le join avec token seul restitue la place après reboot
  useEffect(() => {
    if (isDemo) return undefined;
    const saved = getInvIdentity(sessionId);
    if (!saved) return undefined;
    let alive = true;
    invApi
      .join(sessionId, { playerToken: saved.playerToken })
      .then((res) => {
        if (!alive) return;
        applyResponse(res);
        saveInvIdentity(sessionId, { playerToken: res.playerToken, pseudo: res.you?.pseudo ?? saved.pseudo });
        setIdentity(getInvIdentity(sessionId));
      })
      .catch((err) => {
        if (!alive) return;
        const code = httpStatus(err);
        if (code === 401 || code === 403 || code === 404) {
          clearInvIdentity(sessionId);
          setIdentity(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [sessionId, isDemo, applyResponse]);

  // ----- record du bar (au montage et à chaque changement de records)
  const [barRecord, setBarRecord] = useState<{ pseudo: string; score: number } | null>(null);
  const recordsVersion = state?.recordsVersion ?? 0;
  useEffect(() => {
    if (isDemo) return undefined;
    let alive = true;
    invApi
      .records(1)
      .then((items) => {
        if (alive) setBarRecord(items[0] ? { pseudo: items[0].pseudo, score: items[0].score } : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isDemo, recordsVersion]);

  // ----- alimentation du store du pont
  const pseudos = useRef(new Map<string, string>());
  useEffect(() => {
    bridge.store.setState({ reduced: perf.reduced });
  }, [bridge, perf.reduced]);
  useEffect(() => {
    bridge.store.setState({ hiScore: barRecord?.score ?? 0 });
  }, [bridge, barRecord]);
  useEffect(() => {
    if (!state) return;
    const myId = you && you.status !== 'left' ? you.playerId : null;
    const current = bridge.store.getState();
    const round = bridgeRound(state, current.round);
    bridge.store.setState({
      round,
      myPlayerId: myId,
      players: buildPlayers(state, myId, pseudos.current),
      watchId: round && current.round && round.index === current.round.index ? current.watchId : null,
    });
  }, [bridge, state, you]);

  // ----- fin de ma partie => déclaration REST avec reprises
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const overTimers = useRef<number[]>([]);
  useEffect(() => {
    if (isDemo) return undefined;
    const off = bridge.fromRunner.on('gameOver', (info) => {
      const playerToken = tokenRef.current;
      if (!playerToken) return;
      let attempt = 0;
      const send = () => {
        invApi
          .gameOver(sessionId, { playerToken, roundIndex: info.roundIndex, frame: info.frame, inputs: info.inputs })
          .then(applyResponse)
          .catch((err) => {
            const code = httpStatus(err);
            // refus serveur (manche close, déjà résolu...) : on relit l'état, sans insister
            if (code !== undefined && code >= 400 && code < 500) {
              void refresh();
              return;
            }
            if (attempt < GAMEOVER_RETRY_MS.length) {
              const delay = GAMEOVER_RETRY_MS[attempt];
              attempt += 1;
              overTimers.current.push(window.setTimeout(send, delay));
            } else {
              void refresh();
            }
          });
      };
      send();
    });
    return () => {
      off();
      for (const id of overTimers.current) window.clearTimeout(id);
      overTimers.current = [];
    };
  }, [bridge, isDemo, sessionId, applyResponse, refresh]);

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'playing' && status === 'lobby') sfxRef.current?.play('roundEnd');
    prevStatus.current = status;
  }, [status]);

  // ----- avis d'erreur éphémère
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showError = useCallback(
    (err: unknown) => {
      const key = invErrorKey(err).replace(/^error_/, '');
      setNotice(t(`table.inv.error.${key}`, t('table.inv.error.generic', 'Une erreur est survenue')));
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
    },
    [t],
  );
  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // ----- actions de session (lancer, inviter, quitter)
  const [busy, setBusy] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const inviteTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (inviteTimer.current) window.clearTimeout(inviteTimer.current);
    },
    [],
  );
  const act = useCallback(
    async (action: InvAction) => {
      if (isDemo) {
        if (action === 'start') demo.start();
        return;
      }
      if (!token) return;
      setBusy(true);
      try {
        const res = await invApi.action(sessionId, { playerToken: token, action });
        applyResponse(res);
        if (action === 'invite') {
          setInviteSent(true);
          inviteTimer.current = window.setTimeout(() => setInviteSent(false), INVITE_COOLDOWN_MS);
        }
      } catch (err) {
        showError(err);
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [isDemo, demo, token, sessionId, applyResponse, refresh, showError],
  );

  const backToLobby = useCallback(() => navigate(LOBBY_PATH), [navigate]);
  const handleLeave = useCallback(() => {
    if (!isDemo && token) {
      invApi.action(sessionId, { playerToken: token, action: 'leave' }).catch(() => undefined);
      clearInvIdentity(sessionId);
    }
    backToLobby();
  }, [isDemo, token, sessionId, backToLobby]);

  // ----- rejoindre depuis la page (dalle sans identité)
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinPrompted = useRef(false);
  useEffect(() => {
    if (isDemo || !state || identity || joinPrompted.current || state.status === 'end') return;
    joinPrompted.current = true;
    setJoinOpen(true);
  }, [isDemo, state, identity]);
  const handleJoin = useCallback(
    async (pseudo: string) => {
      setBusy(true);
      setJoinError(null);
      try {
        const res = await invApi.join(sessionId, { pseudo });
        saveLastPseudo(pseudo);
        saveInvIdentity(sessionId, { playerToken: res.playerToken, pseudo });
        applyResponse(res);
        setIdentity(getInvIdentity(sessionId));
        setJoinOpen(false);
      } catch (err) {
        const key = invErrorKey(err).replace(/^error_/, '');
        setJoinError(t(`table.inv.error.${key}`, t('table.inv.error.generic', 'Une erreur est survenue')));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, applyResponse, t],
  );

  // partie fermée : les dalles repartent d'elles-mêmes au lobby après un court affichage
  const [endSeconds, setEndSeconds] = useState(END_REDIRECT_MS / 1000);
  useEffect(() => {
    if (status !== 'end') return undefined;
    if (!isDemo) clearInvIdentity(sessionId);
    setEndSeconds(END_REDIRECT_MS / 1000);
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setEndSeconds(Math.max(0, Math.ceil((END_REDIRECT_MS - (Date.now() - startedAt)) / 1000)));
    }, 250);
    const leave = window.setTimeout(backToLobby, END_REDIRECT_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(leave);
    };
  }, [status, isDemo, sessionId, backToLobby]);
  // filet de sécurité si la redirection automatique n'a pas eu lieu
  useInactivity({ timeoutMs: 120_000, enabled: status === 'end', onIdle: backToLobby });

  const phase = useStore(bridge.store, (s) => s.phase);
  const fps = useStore(bridge.store, (s) => s.fps);
  const me = useStore(bridge.store, (s) => s.me);
  const multi = useMemo(() => {
    if (!state) return false;
    return (state.round?.participants.length ?? 0) > 1 || state.players.length > 1;
  }, [state]);

  // ----- rendu
  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#04020a]">
        <RetroLoader label={t('table.common.loading', 'LOADING')} accent="cyan" />
      </div>
    );
  }

  const controlsLive = phase === 'playing' || phase === 'countdown';

  return (
    <div
      className={`relative h-full w-full select-none overflow-hidden bg-[#04020a] ${perf.reduced ? 'inv-reduced' : ''}`}
      style={{ touchAction: 'none' }}
      onPointerDownCapture={() => sfxRef.current?.unlock()}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* ----- gauche : règles, record, déplacement */}
        <aside className="inv-side relative flex min-h-0 flex-col px-7 pb-4 pt-6">
          <div className="inv-moon" />
          <div className="relative inv-logo font-retro text-[34px] leading-[1.25]" style={{ color: INV_ACCENT }}>
            BAR
            <br />
            INVADERS
          </div>
          <div className="relative mt-5">
            <QuitButton playing={phase === 'playing'} onQuit={handleLeave} t={t} />
          </div>
          <div className="relative mt-8">
            <ScoreTable t={t} scale={3} compact />
          </div>
          {barRecord && (
            <div className="relative mt-8 rounded-2xl border border-white/10 bg-black/40 px-5 py-4">
              <div className="text-[18px] font-bold uppercase tracking-widest text-white/50">{t('table.inv.barRecord', 'Record du bar')}</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="truncate font-display text-[30px] uppercase text-white">{barRecord.pseudo}</span>
                <span className="font-retro text-[22px]" style={{ color: '#E8C267' }}>
                  {formatScore(barRecord.score)}
                </span>
              </div>
            </div>
          )}
          {you?.inRound && (phase === 'spectating' || phase === 'ended') && (
            <div className="relative mt-5 rounded-2xl border px-5 py-4" style={{ borderColor: `${INV_ACCENT}55`, background: `${INV_ACCENT}0F` }}>
              <div className="text-[18px] font-bold uppercase tracking-widest text-white/50">{t('table.inv.myGame', 'Ta partie')}</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="font-retro text-[26px]" style={{ color: INV_ACCENT }}>
                  {formatScore(you.result?.score ?? me.score)}
                </span>
                <span className="text-[19px] uppercase text-white/65">
                  {t('table.inv.panel.wave', 'vague {wave}').replace('{wave}', String(you.result?.wave ?? me.wave))}
                </span>
              </div>
            </div>
          )}
          <div className="relative mt-auto">
            <MovePad controls={controls} color={INV_COLORS.cyan} disabled={!controlsLive} />
          </div>
        </aside>

        {/* ----- centre : la borne */}
        <main className="flex items-center justify-center px-1">
          <InvScreen bridge={bridge} controls={controls} sfxRef={sfxRef}>
            <ScreenOverlay bridge={bridge} state={state} you={you} sfxRef={sfxRef} t={t} />
          </InvScreen>
        </main>

        {/* ----- droite : joueurs, tir */}
        <aside className="inv-side relative flex min-h-0 flex-col px-7 pb-4 pt-6">
          <div className="inv-moon" />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {multi ? (
              <PlayersPanel bridge={bridge} t={t} />
            ) : (
              <BarRecordsPanel
                mode="barinvaders"
                title={t('table.inv.records.title', 'Records du bar')}
                limit={6}
                highlightPseudo={getLastPseudo()}
                accent={INV_ACCENT}
                emptyTitle={t('table.inv.records.empty', 'Aucun record pour le moment')}
                emptySub={t('table.inv.records.emptySub', 'Le premier score entre au tableau')}
                className="min-h-0"
              />
            )}
          </div>
          <div className="relative">
            <FireButton controls={controls} color={INV_COLORS.red} label={t('table.inv.fire', 'FEU')} disabled={!controlsLive} />
          </div>
        </aside>
      </div>

      {status === 'lobby' && (
        <InvRoom
          state={state}
          you={you}
          accent={INV_ACCENT}
          busy={busy}
          inviteSent={inviteSent}
          onStart={() => void act('start')}
          onInvite={() => void act('invite')}
          onLeave={handleLeave}
          onJoin={() => setJoinOpen(true)}
          t={t}
        />
      )}

      {status === 'end' && (
        <div data-inv-ui className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 p-10" style={{ background: 'rgba(3,2,10,0.94)' }}>
          <span className="inv-logo font-retro text-[56px] leading-none" style={{ color: INV_ACCENT }}>
            {t('table.inv.end.title', 'GAME OVER')}
          </span>
          <span className="text-[28px] text-white/70">
            {state.endReason === 'idle'
              ? t('table.inv.end.idle', 'Aucune partie relancée depuis 2 minutes : la salle est fermée')
              : state.endReason === 'empty'
                ? t('table.inv.end.empty', 'Tous les joueurs sont partis')
                : state.endReason === 'terminated'
                  ? t('table.inv.end.terminated', 'Partie arrêtée par le bar')
                  : t('table.inv.end.sub', "Merci d'avoir joué")}
          </span>
          {state.lastRound && (
            <div className="w-[1280px] max-w-[94vw]">
              <RoundResultsTable ranking={state.lastRound.ranking} myPlayerId={you?.playerId ?? null} endedBy={state.lastRound.endedBy} accent={INV_ACCENT} t={t} />
            </div>
          )}
          <ArcadeButton variant="accent" size="xl" className="min-h-[80px] px-14 text-[28px]" icon={<LogOut className="h-7 w-7" />} onClick={backToLobby}>
            {t('table.inv.end.exit', 'Retour au lobby')}
          </ArcadeButton>
          <span className="text-[22px] text-white/50">
            {t('table.inv.end.redirect', 'Retour au lobby dans {seconds} s').replace('{seconds}', String(endSeconds))}
          </span>
        </div>
      )}

      <RecordBanner bridge={bridge} state={state} you={you} sfxRef={sfxRef} t={t} />
      <InvNotice message={notice} />
      {debug && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 font-mono text-[16px] text-white/80">
          {isDemo ? 'DEMO' : `net ${net.status} (${net.reconnects})`} · {phase} · {fps} fps · v{state.v}
          {!isDemo && online.syncInfo ? ` · ${online.syncInfo.via} ${online.syncInfo.ageMs} ms` : ''}
        </div>
      )}

      {!isDemo && (
        <div data-inv-ui>
          <JoinPseudoModal open={joinOpen} onSubmit={(pseudo) => void handleJoin(pseudo)} onClose={() => setJoinOpen(false)} busy={busy} error={joinError} />
        </div>
      )}
    </div>
  );
}
