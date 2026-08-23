/**
 * Écran de partie plein écran : la table vue depuis ma dalle, la salle
 * d'attente, la présentation animée, le déroulé des manches et la fin de
 * partie. Une dalle qui recharge reprend son siège via son token.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LogOut, Flag } from 'lucide-react';
import { useT } from '../../../i18n/useT';
import { usePerfMode } from '../../../hooks/usePerfMode';
import { getHostname } from '../../../lib/hostname';
import BjNotice from '../components/BjNotice';
import BjTable from '../components/BjTable';
import GameOverOverlay from '../components/GameOverOverlay';
import JoinPseudoModal from '../components/JoinPseudoModal';
import TutorialOverlay from '../components/TutorialOverlay';
import WaitingRoom from '../components/WaitingRoom';
import { useBjSession } from '../hooks/useBjSession';
import { bjApi, bjErrorKey } from '../lib/bjApi';
import { clearBjIdentity, getBjIdentity, saveBjIdentity, saveLastPseudo } from '../lib/identity';
import { estimateMinutes, type BjAct, type JokerType } from '../lib/bjTypes';
import { getBjTheme } from '../themes';
import '../bj.css';

export default function BlackjackGamePage() {
  const t = useT();
  const navigate = useNavigate();
  const { sessionId = '' } = useParams();
  const perf = usePerfMode();
  const hostname = getHostname();

  const [playerToken, setPlayerToken] = useState<string | null>(() => getBjIdentity(sessionId)?.playerToken ?? null);
  const { state, you, refresh, applyResponse, syncInfo } = useBjSession(sessionId, playerToken);
  // ?debug=1 : pastille montrant comment chaque mise à jour arrive (realtime
  // ou sondage) et son âge, pour diagnostiquer la latence en conditions réelles
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';
  const [busy, setBusy] = useState(false);
  const [sitOpen, setSitOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showError = useCallback(
    (err: unknown) => {
      const key = bjErrorKey(err).replace(/^error_/, '');
      setNotice(t(`table.bj.error.${key}`, t('table.bj.error.generic')));
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
    },
    [t],
  );

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  // reprise de siège : le join avec token seul restitue la place après reboot
  useEffect(() => {
    const identity = getBjIdentity(sessionId);
    if (!identity) return;
    let alive = true;
    void bjApi
      .join(sessionId, { playerToken: identity.playerToken })
      .then((res) => {
        if (!alive) return;
        applyResponse(res);
        setPlayerToken(res.playerToken);
      })
      .catch(() => {
        if (alive) clearBjIdentity(sessionId);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, applyResponse]);

  // revanche : dès que mon token de la nouvelle table arrive, on y va
  useEffect(() => {
    if (!you?.rematch) return;
    saveBjIdentity(you.rematch.sessionId, { playerToken: you.rematch.playerToken, pseudo: you.pseudo });
    navigate(`/table/games/blackjack/${you.rematch.sessionId}`, { replace: true });
  }, [you?.rematch, you?.pseudo, navigate]);

  const guard = useCallback(
    async (fn: () => Promise<{ state: NonNullable<typeof state>; you: typeof you }>) => {
      setBusy(true);
      try {
        const res = await fn();
        applyResponse(res);
      } catch (err) {
        showError(err);
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [applyResponse, refresh, showError],
  );

  const onBet = useCallback(
    (amount: number) => {
      if (!playerToken) return;
      void guard(() => bjApi.bet(sessionId, { playerToken, amount }));
    },
    [guard, playerToken, sessionId],
  );

  const onAct = useCallback(
    (action: BjAct) => {
      if (!playerToken || !state) return;
      void guard(() => bjApi.act(sessionId, { playerToken, action, windowSeq: state.windowSeq }));
    },
    [guard, playerToken, sessionId, state],
  );

  const onJoker = useCallback(
    (type: JokerType, target: string | null) => {
      if (!playerToken) return;
      void guard(() => bjApi.joker(sessionId, { playerToken, joker: type, target }));
    },
    [guard, playerToken, sessionId],
  );

  const meta = useCallback(
    (action: 'launch' | 'skip-intro' | 'leave' | 'end-after-round' | 'rematch' | 'invite') => {
      if (!playerToken) return;
      void guard(() => bjApi.action(sessionId, { playerToken, action }));
    },
    [guard, playerToken, sessionId],
  );

  async function handleSit(pseudo: string) {
    setBusy(true);
    try {
      const res = await bjApi.join(sessionId, { pseudo });
      saveLastPseudo(pseudo);
      saveBjIdentity(sessionId, { playerToken: res.playerToken, pseudo });
      applyResponse(res);
      setPlayerToken(res.playerToken);
      setSitOpen(false);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    if (playerToken) meta('leave');
    clearBjIdentity(sessionId);
    navigate('/table/games/blackjack');
  }

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0B0E1F]">
        <div className="font-display text-xl uppercase tracking-widest text-white/50">…</div>
      </div>
    );
  }

  const theme = getBjTheme(state.config.theme);
  const mySeat = you ? state.seats.find((s) => s.playerId === you.playerId) ?? null : null;
  const seated = mySeat !== null;
  const isCreator = you?.isCreator ?? false;
  const inRound = state.status !== 'lobby' && state.status !== 'end';
  const playersLeft = state.seats.filter((s) => !s.joinPending).length;
  const remainingMin =
    state.roundIndex >= 0
      ? Math.max(1, estimateMinutes(state.config.rounds - state.roundIndex - 1, Math.max(2, playersLeft)))
      : estimateMinutes(state.config.rounds, Math.max(2, playersLeft));
  // late join possible : partie en cours, place libre, réglage activé
  const canSitLate =
    !seated &&
    inRound &&
    state.config.lateJoin &&
    state.seats.length < state.config.maxSeats &&
    !state.ended;

  return (
    <div className={`relative flex h-full w-full flex-col ${perf.reduced ? 'bj-reduced' : ''} ${theme.fontClass ?? ''}`} style={{ background: theme.pageBg }}>
      <BjNotice message={notice} />

      {/* barre du haut, fine */}
      <div className="relative z-30 flex h-16 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl font-black uppercase tracking-wider" style={{ color: theme.hudAccent }}>
            {t('table.bj.title')}
          </span>
          {inRound && state.roundIndex >= 0 && (
            <span className="rounded-full bg-black/45 px-4 py-1.5 font-display text-xl font-bold uppercase text-white/80">
              {t('table.bj.header.round')
                .replace('{round}', String(state.roundIndex + 1))
                .replace('{rounds}', String(state.config.rounds))}
              {!state.isLastRound && ` · ~${remainingMin} min`}
            </span>
          )}
          {state.isLastRound && inRound && (
            <span className="bj-pop rounded-full px-4 py-1.5 font-display text-xl font-black uppercase" style={{ background: `${theme.gold}26`, color: theme.gold }}>
              {t('table.bj.header.lastRound')}
            </span>
          )}
          {state.endAfterRound && inRound && !state.isLastRound && (
            <span className="rounded-full bg-black/45 px-4 py-1.5 text-base font-bold uppercase text-white/65">
              {t('table.bj.header.endAfter')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canSitLate && (
            <button
              className="rounded-2xl px-6 py-3 font-display text-xl font-bold uppercase active:scale-95"
              style={{ background: `${theme.hudAccent}22`, color: theme.hudAccent, border: `1px solid ${theme.hudAccent}` }}
              onClick={() => setSitOpen(true)}
            >
              {t('table.bj.header.sit')}
            </button>
          )}
          {!seated && <span className="rounded-full bg-white/10 px-4 py-1.5 text-base font-bold uppercase text-white/60">{t('table.bj.header.spectator')}</span>}
          {isCreator && inRound && !state.isLastRound && !state.endAfterRound && (
            <button
              className="flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-base font-bold uppercase text-white/75 active:scale-95"
              disabled={busy}
              onClick={() => meta('end-after-round')}
            >
              <Flag className="h-5 w-5" />
              {t('table.bj.header.endAfterBtn')}
            </button>
          )}
          <button
            className="flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-base font-bold uppercase text-white/75 active:scale-95"
            onClick={handleLeave}
          >
            <LogOut className="h-5 w-5" />
            {t('table.bj.header.quit')}
          </button>
        </div>
      </div>

      {/* la table */}
      <div className="relative min-h-0 flex-1">
        <BjTable
          state={state}
          you={you}
          theme={theme}
          viewerDevice={hostname}
          busy={busy}
          reduced={perf.reduced}
          onBet={onBet}
          onAct={onAct}
          onJoker={onJoker}
          t={t}
        />

        {state.status === 'lobby' && (
          <WaitingRoom
            state={state}
            you={you}
            theme={theme}
            busy={busy}
            onLaunch={() => meta('launch')}
            onLeave={handleLeave}
            onSit={() => setSitOpen(true)}
            onInvite={() => meta('invite')}
            t={t}
          />
        )}
        {state.status === 'intro' && (
          <TutorialOverlay state={state} you={you} theme={theme} busy={busy} onSkipVote={() => meta('skip-intro')} t={t} />
        )}
        {state.status === 'end' && (
          <GameOverOverlay
            state={state}
            you={you}
            theme={theme}
            busy={busy}
            onRematch={() => meta('rematch')}
            onExit={() => navigate('/table/games/blackjack')}
            t={t}
          />
        )}
      </div>

      <JoinPseudoModal open={sitOpen} busy={busy} onClose={() => setSitOpen(false)} onJoin={(pseudo) => void handleSit(pseudo)} />

      {debug && syncInfo && (
        <div
          className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-lg px-3 py-1.5 font-mono text-sm font-bold"
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: syncInfo.via === 'realtime' ? '#4ADE80' : '#FBBF24',
          }}
        >
          {syncInfo.via} · {syncInfo.ageMs}ms · v{state.v}
        </div>
      )}
    </div>
  );
}
