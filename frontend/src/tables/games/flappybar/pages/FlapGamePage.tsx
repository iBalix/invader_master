/**
 * Page de partie Flappy Bar : canvas Phaser plein écran + HUD DOM, salle
 * d'attente / entre-deux-manches, écran de fin, célébrations. Une dalle qui
 * recharge reprend son siège via son token. Toute la page est une zone de
 * tap (flap), sauf les éléments marqués data-flap-ui.
 *
 * Mode démo local : /table/games/flappybar/demo[?theme=pixel]
 * Options : ?debug=1 (pastille de diagnostic), ?mute=1 (sans son).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import RetroLoader from '../../../components/ui/RetroLoader';
import { useInactivity } from '../../../hooks/useInactivity';
import { usePerfMode } from '../../../hooks/usePerfMode';
import { useT } from '../../../i18n/useT';
import { createFlapSfx, type FlapSfx } from '../audio/flapSfx';
import FlapCanvas from '../components/FlapCanvas';
import FlapDebugBadge from '../components/FlapDebugBadge';
import FlapHud from '../components/FlapHud';
import FlapNotice from '../components/FlapNotice';
import FlapRoom from '../components/FlapRoom';
import JoinPseudoModal from '../components/JoinPseudoModal';
import RecordCelebration from '../components/RecordCelebration';
import RoundResultsTable from '../components/RoundResultsTable';
import { useDemoFlap } from '../hooks/useDemoFlap';
import { useFlapInput } from '../hooks/useFlapInput';
import { useFlapNet } from '../hooks/useFlapNet';
import { useFlapSession } from '../hooks/useFlapSession';
import { flapApi, flapErrorKey } from '../lib/flapApi';
import type { FlapAction, FlapPublicState } from '../lib/flapTypes';
import { clearFlapIdentity, getFlapIdentity, saveFlapIdentity, saveLastPseudo } from '../lib/identity';
import { createFlapBridge, type BridgePlayer, type FlapBridge } from '../phaser/bridge';
import { getFlapTheme } from '../themes';
import '../flap.css';

const LOBBY_PATH = '/table/games/flappybar';
const DEATH_RETRY_MS = [500, 1500, 4000];
const INVITE_COOLDOWN_MS = 45_000;
/** écran « partie fermée » : temps d'affichage avant le retour automatique au lobby */
const END_REDIRECT_MS = 8_000;

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

/** joueurs du pont : liste de session + participants de la manche (même partis) */
function buildPlayers(state: FlapPublicState, myId: string | null, pseudos: Map<string, string>): Record<string, BridgePlayer> {
  const round = state.round;
  const players: Record<string, BridgePlayer> = {};
  for (const player of state.players) {
    pseudos.set(player.playerId, player.pseudo);
    const result = round?.results[player.playerId];
    players[player.playerId] = {
      playerId: player.playerId,
      pseudo: player.pseudo,
      isMe: player.playerId === myId,
      waiting: player.status === 'pending',
      inRound: round?.participants.includes(player.playerId) ?? false,
      deathFrame: result && !result.alive ? result.deathFrame : null,
    };
  }
  if (round) {
    for (const id of round.participants) {
      if (players[id]) continue;
      const result = round.results[id];
      players[id] = {
        playerId: id,
        pseudo: pseudos.get(id) ?? '?',
        isMe: id === myId,
        waiting: false,
        inRound: true,
        deathFrame: result && !result.alive ? result.deathFrame : null,
      };
    }
  }
  return players;
}

export default function FlapGamePage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const perf = usePerfMode();
  const isDemo = sessionId === 'demo';
  const debug = searchParams.get('debug') === '1';
  const muted = searchParams.get('mute') === '1';

  // ----- pont React/Phaser et sons, créés une fois
  const bridgeRef = useRef<FlapBridge | null>(null);
  if (!bridgeRef.current) bridgeRef.current = createFlapBridge();
  const bridge = bridgeRef.current;
  useEffect(() => () => bridge.dispose(), [bridge]);

  const sfxRef = useRef<FlapSfx | null>(null);
  useEffect(() => {
    const sfx = createFlapSfx();
    sfx.setMuted(muted);
    sfxRef.current = sfx;
    return () => {
      sfx.dispose();
      if (sfxRef.current === sfx) sfxRef.current = null;
    };
  }, [muted]);

  // ----- identité et sources d'état (online / démo)
  const [identity, setIdentity] = useState(() => (isDemo ? null : getFlapIdentity(sessionId)));
  useEffect(() => {
    setIdentity(isDemo ? null : getFlapIdentity(sessionId));
  }, [sessionId, isDemo]);
  const token = identity?.playerToken ?? null;

  const online = useFlapSession(isDemo ? null : sessionId, token);
  const demo = useDemoFlap(searchParams.get('theme') ?? 'neon', isDemo, bridge);
  const state = isDemo ? demo.state : online.state;
  const you = isDemo ? demo.you : online.you;
  const status = state?.status ?? 'lobby';
  const { applyResponse, refresh } = online;

  const net = useFlapNet({ sessionId: isDemo ? null : sessionId, playerToken: token, enabled: status === 'playing', bridge });
  const { onPointerDownCapture } = useFlapInput(bridge, sfxRef);
  const theme = useMemo(() => getFlapTheme(state?.config.theme), [state?.config.theme]);

  // reprise de siège : le join avec token seul restitue la place après reboot
  useEffect(() => {
    if (isDemo) return undefined;
    const saved = getFlapIdentity(sessionId);
    if (!saved) return undefined;
    let alive = true;
    flapApi
      .join(sessionId, { playerToken: saved.playerToken })
      .then((res) => {
        if (!alive) return;
        applyResponse(res);
        saveFlapIdentity(sessionId, { playerToken: res.playerToken, pseudo: res.you.pseudo });
        setIdentity(getFlapIdentity(sessionId));
      })
      .catch((err) => {
        if (!alive) return;
        const code = httpStatus(err);
        if (code === 401 || code === 403 || code === 404) {
          clearFlapIdentity(sessionId);
          setIdentity(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [sessionId, isDemo, applyResponse]);

  // ----- record du bar (au montage et à chaque changement de records)
  const [barRecordM, setBarRecordM] = useState<number | null>(null);
  const recordsVersion = state?.recordsVersion ?? 0;
  useEffect(() => {
    if (isDemo) return undefined;
    let alive = true;
    flapApi
      .records(1)
      .then((items) => {
        if (alive) setBarRecordM(items[0]?.score ?? null);
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
    bridge.store.setState({ barRecordM });
  }, [bridge, barRecordM]);
  useEffect(() => {
    if (!state) return;
    const myId = you && you.status !== 'left' ? you.playerId : null;
    const round = state.round;
    bridge.store.setState({
      themeId: state.config.theme,
      round: round ? { index: round.index, seed: round.seed, startsAt: round.startsAt, capAt: round.capAt } : null,
      myPlayerId: myId,
      players: buildPlayers(state, myId, pseudos.current),
    });
  }, [bridge, state, you]);

  // ----- mort locale => déclaration REST avec reprises 0,5 / 1,5 / 4 s
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const roundIndexRef = useRef<number | null>(null);
  if (state?.round) roundIndexRef.current = state.round.index;
  const deathTimers = useRef<number[]>([]);
  useEffect(() => {
    if (isDemo) return undefined;
    const off = bridge.fromScene.on('death', (info) => {
      const playerToken = tokenRef.current;
      const roundIndex = roundIndexRef.current;
      if (!playerToken || roundIndex === null) return;
      let attempt = 0;
      const send = () => {
        flapApi
          .death(sessionId, { playerToken, roundIndex, frame: info.frame, flaps: info.flaps })
          .then(applyResponse)
          .catch((err) => {
            const code = httpStatus(err);
            // refus serveur (manche close, déjà mort...) : on relit l'état, sans insister
            if (code !== undefined && code >= 400 && code < 500) {
              void refresh();
              return;
            }
            if (attempt < DEATH_RETRY_MS.length) {
              const delay = DEATH_RETRY_MS[attempt];
              attempt += 1;
              deathTimers.current.push(window.setTimeout(send, delay));
            } else {
              void refresh();
            }
          });
      };
      send();
    });
    return () => {
      off();
      for (const id of deathTimers.current) window.clearTimeout(id);
      deathTimers.current = [];
    };
  }, [bridge, isDemo, sessionId, applyResponse, refresh]);

  // ----- sons pilotés par la scène (jamais pour les fantômes)
  useEffect(() => {
    const offs = [
      bridge.fromScene.on('flap', () => sfxRef.current?.play('flap')),
      bridge.fromScene.on('pass', () => sfxRef.current?.play('pass')),
      bridge.fromScene.on('death', () => sfxRef.current?.play('death')),
      bridge.fromScene.on('milestone', () => sfxRef.current?.play('go')),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [bridge]);
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
      const key = flapErrorKey(err).replace(/^error_/, '');
      setNotice(t(`table.flap.error.${key}`, t('table.flap.error.generic', 'Une erreur est survenue')));
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
    async (action: FlapAction) => {
      if (isDemo) {
        if (action === 'start') demo.start();
        return;
      }
      if (!token) return;
      setBusy(true);
      try {
        const res = await flapApi.action(sessionId, { playerToken: token, action });
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
      flapApi.action(sessionId, { playerToken: token, action: 'leave' }).catch(() => undefined);
      clearFlapIdentity(sessionId);
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
        const res = await flapApi.join(sessionId, { pseudo });
        saveLastPseudo(pseudo);
        saveFlapIdentity(sessionId, { playerToken: res.playerToken, pseudo });
        applyResponse(res);
        setIdentity(getFlapIdentity(sessionId));
        setJoinOpen(false);
      } catch (err) {
        const key = flapErrorKey(err).replace(/^error_/, '');
        setJoinError(t(`table.flap.error.${key}`, t('table.flap.error.generic', 'Une erreur est survenue')));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, applyResponse, t],
  );

  // partie fermée (délai sans relance, plus personne, arrêt staff) : les dalles
  // repartent d'elles-mêmes au lobby après un court affichage du classement
  const [endSeconds, setEndSeconds] = useState(END_REDIRECT_MS / 1000);
  useEffect(() => {
    if (status !== 'end') return undefined;
    if (!isDemo) clearFlapIdentity(sessionId);
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

  // ----- rendu
  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#070512]">
        <RetroLoader label={t('table.common.loading', 'LOADING')} accent="cyan" />
      </div>
    );
  }

  return (
    <div
      className={`relative h-full w-full select-none overflow-hidden ${perf.reduced ? 'flap-reduced' : ''}`}
      style={{ touchAction: 'none', background: theme.palette.skyBottom }}
      onPointerDownCapture={onPointerDownCapture}
    >
      <FlapCanvas key={state.config.theme} bridge={bridge} themeId={state.config.theme} loadingLabel={t('table.common.loading', 'LOADING')} />

      <FlapHud bridge={bridge} state={state} theme={theme} sfxRef={sfxRef} onQuit={handleLeave} t={t} />

      {status === 'lobby' && (
        <FlapRoom
          state={state}
          you={you}
          theme={theme}
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
        <div data-flap-ui className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 p-10" style={{ background: 'rgba(3,5,12,0.92)' }}>
          <span className="font-display text-[64px] uppercase leading-none tracking-wider" style={{ color: theme.palette.accent }}>
            {t('table.flap.end.title', 'Partie terminée')}
          </span>
          <span className="text-[28px] text-white/70">
            {state.endReason === 'idle'
              ? t('table.flap.end.idle', 'Aucune manche relancée depuis 2 minutes : la partie est fermée')
              : state.endReason === 'empty'
                ? t('table.flap.end.empty', 'Tous les joueurs sont partis')
                : state.endReason === 'terminated'
                  ? t('table.flap.end.terminated', 'Partie arrêtée par le bar')
                  : t('table.flap.end.sub', "Merci d'avoir joué")}
          </span>
          {state.lastRound && (
            <div className="w-[1120px] max-w-[94vw]">
              <RoundResultsTable ranking={state.lastRound.ranking} myPlayerId={you?.playerId ?? null} endedBy={state.lastRound.endedBy} accent={theme.palette.accent} t={t} />
            </div>
          )}
          <ArcadeButton variant="accent" size="xl" className="min-h-[80px] px-14 text-[28px]" icon={<LogOut className="h-7 w-7" />} onClick={backToLobby}>
            {t('table.flap.end.exit', 'Retour au lobby')}
          </ArcadeButton>
          <span className="text-[22px] text-white/50">
            {t('table.flap.end.redirect', 'Retour au lobby dans {seconds} s').replace('{seconds}', String(endSeconds))}
          </span>
        </div>
      )}

      <RecordCelebration bridge={bridge} state={state} you={you} reduced={perf.reduced} sfxRef={sfxRef} t={t} />
      <FlapNotice message={notice} />
      {debug && <FlapDebugBadge bridge={bridge} syncInfo={online.syncInfo} v={state.v} net={net} isDemo={isDemo} />}

      {!isDemo && (
        <div data-flap-ui>
          <JoinPseudoModal open={joinOpen} onSubmit={(pseudo) => void handleJoin(pseudo)} onClose={() => setJoinOpen(false)} busy={busy} error={joinError} />
        </div>
      )}
    </div>
  );
}
