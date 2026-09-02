/**
 * Page de partie : plateau central + panneaux joueurs, temps réel
 * auto-réparant, coup optimiste avec rollback animé, FX de capture,
 * overlays (attente, promotion, fin, revanche). Route fullscreen : le
 * screensaver est coupé pendant la partie, et réarmé 2 min après la fin.
 *
 * Mode démo hotseat : /table/games/chess/demo[?theme=pixel]
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import RetroLoader from '../../../components/ui/RetroLoader';
import { useInactivity } from '../../../hooks/useInactivity';
import { usePerfMode } from '../../../hooks/usePerfMode';
import { useT } from '../../../i18n/useT';
import ChessBoard from '../components/ChessBoard';
import ChessNotice from '../components/ChessNotice';
import CaptureFxLayer, { type CaptureFxItem } from '../components/CaptureFxLayer';
import GameActions from '../components/GameActions';
import GameOverOverlay, { fallenKingColor } from '../components/GameOverOverlay';
import DrawOfferBanner from '../components/DrawOfferBanner';
import JoinPseudoModal from '../components/JoinPseudoModal';
import PlayerPanel from '../components/PlayerPanel';
import SpectatorBadge from '../components/SpectatorBadge';
import SyncDebugBadge from '../components/SyncDebugBadge';
import ReadyOverlay from '../components/ReadyOverlay';
import WaitingOverlay from '../components/WaitingOverlay';
import { useBoardInteraction } from '../hooks/useBoardInteraction';
import { useChessSession } from '../hooks/useChessSession';
import { useDemoChess } from '../hooks/useDemoChess';
import { chessApi, chessErrorKey } from '../lib/chessApi';
import { buildChess, kingSquare } from '../lib/chessRules';
import { getChessIdentity, saveChessIdentity, saveLastPseudo } from '../lib/identity';
import { trackPieces } from '../lib/pieceTracker';
import { opponentOf, type ChessColor, type PromotionPiece } from '../lib/chessTypes';
import type { Orientation } from '../lib/geometry';
import { getTheme } from '../themes';
import '../chess.css';

const EMPTY_MOVES: string[] = [];

/**
 * Le plateau mange tout l'espace disponible : ce sont des dalles tactiles, on
 * joue au doigt. Les colonnes latérales s'adaptent à l'écran (au lieu de
 * réserver une largeur fixe qui écrasait le plateau sur les écrans moyens),
 * et la marge autour du plateau reste minimale.
 */
const PAGE_PAD = 12;
const COL_GAP = 16;

function computeLayout(): { boardSize: number; panelWidth: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelWidth = Math.round(Math.min(340, Math.max(206, vw * 0.16)));
  const widthLeft = vw - 2 * panelWidth - 2 * COL_GAP - 2 * PAGE_PAD;
  const heightLeft = vh - 2 * PAGE_PAD;
  return {
    boardSize: Math.max(360, Math.min(heightLeft, widthLeft)),
    panelWidth,
  };
}

export default function ChessGamePage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const perf = usePerfMode();
  const isDemo = sessionId === 'demo';
  // ?debug=1 : affiche la latence réelle des coups reçus (mesure sur place)
  const debug = searchParams.get('debug') === '1';

  // ----- identité + sources d'état (online / démo)
  const [identity, setIdentity] = useState(() => (isDemo ? null : getChessIdentity(sessionId)));
  useEffect(() => {
    setIdentity(isDemo ? null : getChessIdentity(sessionId));
  }, [sessionId, isDemo]);

  const online = useChessSession(isDemo ? null : sessionId, identity?.playerToken ?? null);
  const demo = useDemoChess(searchParams.get('theme') ?? 'neon');

  const state = isDemo ? demo.state : online.state;
  const you = isDemo ? demo.you : online.you;
  const theme = useMemo(() => getTheme(state?.config.theme), [state?.config.theme]);

  // ----- géométrie
  const boardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(computeLayout);
  useEffect(() => {
    const onResize = () => setLayout(computeLayout());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { boardSize, panelWidth } = layout;

  // ----- coups affichés = serveur + coup optimiste éventuel
  const serverMoves = state?.moves ?? EMPTY_MOVES;
  const [optimistic, setOptimistic] = useState<{ ply: number; uci: string } | null>(null);
  useEffect(() => {
    setOptimistic(null);
  }, [sessionId]);
  useEffect(() => {
    if (optimistic && serverMoves.length > optimistic.ply) setOptimistic(null);
  }, [serverMoves.length, optimistic]);
  const displayMoves = useMemo(
    () =>
      optimistic && optimistic.ply === serverMoves.length
        ? [...serverMoves, optimistic.uci]
        : serverMoves,
    [serverMoves, optimistic],
  );

  const chess = useMemo(() => buildChess(displayMoves), [displayMoves]);
  const tracked = useMemo(() => trackPieces(displayMoves), [displayMoves]);
  const lastUci = displayMoves.length > 0 ? displayMoves[displayMoves.length - 1] : null;
  const lastMove = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null;
  const checkSquare = chess.inCheck() ? kingSquare(chess, chess.turn() as ChessColor) : null;

  // ----- suppression des transitions sur resync massif (spectateur qui
  // arrive, retour de veille, rollback) : positions finales directes
  const animLenRef = useRef(-1);
  const [suppress, setSuppress] = useState(true);
  useEffect(() => {
    animLenRef.current = -1;
    setSuppress(true);
  }, [sessionId]);
  useEffect(() => {
    const prev = animLenRef.current;
    animLenRef.current = displayMoves.length;
    if (prev === -1 || Math.abs(displayMoves.length - prev) > 1) {
      setSuppress(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSuppress(false)));
      return () => cancelAnimationFrame(raf);
    }
    if (suppress) setSuppress(false);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMoves.length]);

  // ----- FX de capture (un seul coup nouveau qui capture)
  const [fxItems, setFxItems] = useState<CaptureFxItem[]>([]);
  const fxSeq = useRef(0);
  const fxLenRef = useRef(-1);
  useEffect(() => {
    fxLenRef.current = -1;
    setFxItems([]);
  }, [sessionId]);
  useEffect(() => {
    const prev = fxLenRef.current;
    fxLenRef.current = displayMoves.length;
    if (prev === -1 || displayMoves.length !== prev + 1) return;
    const capture = tracked.lastCapture;
    if (!capture) return;
    fxSeq.current += 1;
    setFxItems((items) => [
      ...items,
      {
        key: fxSeq.current,
        pieceId: capture.piece.id,
        type: capture.piece.type,
        color: capture.piece.color,
        square: capture.square,
      },
    ]);
  }, [displayMoves.length, tracked]);
  const hiddenIds = useMemo(() => new Set(fxItems.map((i) => i.pieceId)), [fxItems]);

  // ----- fin de partie : on laisse le plateau conclure (roi qui se couche)
  // avant d'ouvrir le récap, sauf si on arrive sur une partie déjà terminée
  const [showRecap, setShowRecap] = useState(false);
  const hadResultRef = useRef<boolean | null>(null);
  useEffect(() => {
    const has = Boolean(state?.result);
    const previously = hadResultRef.current;
    hadResultRef.current = has;
    if (!has) {
      setShowRecap(false);
      return undefined;
    }
    if (previously === false) {
      const timer = window.setTimeout(() => setShowRecap(true), 1100);
      return () => window.clearTimeout(timer);
    }
    setShowRecap(true);
    return undefined;
  }, [state?.result]);
  useEffect(() => {
    hadResultRef.current = null;
  }, [sessionId]);

  // ----- avis d'erreur éphémère
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showError = useCallback(
    (err: unknown) => {
      const key = chessErrorKey(err).replace(/^error_/, '');
      setNotice(t(`table.chess.error.${key}`, t('table.chess.error.generic')));
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
    },
    [t],
  );
  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // ----- envoi d'un coup (optimiste : affiché avant la réponse serveur)
  const [busy, setBusy] = useState(false);
  const [promotion, setPromotion] = useState<{ from: string; to: string; color: ChessColor } | null>(
    null,
  );

  const submitMove = useCallback(
    (from: string, to: string, promo?: PromotionPiece) => {
      if (isDemo) {
        demo.submitMove(from, to, promo);
        return;
      }
      if (!identity) return;
      const ply = serverMoves.length;
      const uci = `${from}${to}${promo ?? ''}`;
      setOptimistic({ ply, uci });
      chessApi
        .move(sessionId, { playerToken: identity.playerToken, ply, from, to, promotion: promo })
        .then(online.applyResponse)
        .catch((err) => {
          setOptimistic(null);
          showError(err);
          void online.refresh();
        });
    },
    [isDemo, demo, identity, serverMoves.length, sessionId, online, showError],
  );

  const status = state?.status ?? 'lobby';
  const playing = status === 'playing';
  const myColor: ChessColor | null = isDemo ? (chess.turn() as ChessColor) : (you?.color ?? null);
  const canPlay =
    (isDemo && !state?.result) ||
    (!isDemo && playing && you !== null && myColor === chess.turn() && optimistic === null);

  const interaction = useBoardInteraction({
    chess,
    myColor,
    canPlay,
    locked: promotion !== null || busy,
    onSubmit: submitMove,
    onNeedPromotion: (from, to) =>
      setPromotion({ from, to, color: chess.turn() as ChessColor }),
  });

  // ----- actions joueur (abandon, nulle, annulation, revanche)
  const sendAction = useCallback(
    (action: string) => {
      if (isDemo || !identity) return;
      setBusy(true);
      chessApi
        .action(sessionId, { playerToken: identity.playerToken, action })
        .then(online.applyResponse)
        .catch(showError)
        .finally(() => setBusy(false));
    },
    [isDemo, identity, sessionId, online, showError],
  );

  // ----- rejoindre depuis la page (spectateur d'une partie en attente)
  const [joinOpen, setJoinOpen] = useState(false);
  const handleJoin = useCallback(
    (pseudo: string) => {
      setBusy(true);
      chessApi
        .join(sessionId, { pseudo })
        .then((res) => {
          saveLastPseudo(pseudo);
          if (res.you) {
            saveChessIdentity(sessionId, {
              playerToken: res.playerToken,
              pseudo,
              color: res.you.color,
            });
            setIdentity(getChessIdentity(sessionId));
          }
          online.applyResponse(res);
          setJoinOpen(false);
        })
        .catch(showError)
        .finally(() => setBusy(false));
    },
    [sessionId, online, showError],
  );

  // ----- quitter (joueur en cours de partie : quitter = abandonner)
  const [quitConfirm, setQuitConfirm] = useState(false);
  const backToLobby = useCallback(() => navigate('/table/games/chess'), [navigate]);
  const handleQuit = useCallback(() => {
    if (!isDemo && you && playing) {
      setQuitConfirm(true);
      return;
    }
    backToLobby();
  }, [isDemo, you, playing, backToLobby]);

  // partie finie laissée à l'écran : retour lobby après 2 min sans toucher
  // (la route est fullscreen, le screensaver global est coupé ici)
  useInactivity({
    timeoutMs: 120_000,
    enabled: status === 'end',
    onIdle: backToLobby,
  });

  // ----- revanche
  const handleJoinRematch = useCallback(() => {
    const info = you?.rematch;
    if (!info || !you) return;
    saveChessIdentity(info.sessionId, {
      playerToken: info.playerToken,
      pseudo: you.pseudo,
      color: info.color,
    });
    navigate(`/table/games/chess/${info.sessionId}`);
  }, [you, navigate]);

  // ----- rendu
  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: theme.pageBg }}>
        <RetroLoader label={t('table.common.loading', 'LOADING')} accent="cyan" />
      </div>
    );
  }

  // démo hotseat : panneaux fixes (blancs à droite), seul le trait alterne
  const mySide: ChessColor = isDemo ? 'w' : (myColor ?? 'w');
  const oppSide = opponentOf(mySide);
  const orientation: Orientation = isDemo ? 'white' : mySide === 'b' ? 'black' : 'white';
  // en attente d'adversaire les pendules ne sont pas encore armées : on
  // affiche la cadence choisie, figée (running=false), plutôt qu'un compteur
  // de coups qui n'a aucun sens avant le premier coup
  const clockBaseline = state.clocks
    ? { wMs: state.clocks.wMs, bMs: state.clocks.bMs, at: state.serverNow }
    : state.config.clock
      ? {
          wMs: state.config.clock.initialMs,
          bMs: state.config.clock.initialMs,
          at: state.serverNow,
        }
      : null;
  const clockRunning = Boolean(state.clocks?.running);
  const capturedBy = (side: ChessColor) =>
    side === 'w' ? tracked.capturedByWhite : tracked.capturedByBlack;
  const advantageOf = (side: ChessColor) =>
    side === 'w' ? Math.max(0, tracked.materialDiff) : Math.max(0, -tracked.materialDiff);
  const isSeatedViewer = you !== null;
  const seatFree = state.seats[oppSide] === null || state.seats[mySide] === null;
  const onFlag = isDemo ? undefined : () => void online.refresh();
  const loser = fallenKingColor(state);
  const fallenKing = loser ? kingSquare(chess, loser) : null;

  const panel = (side: ChessColor) => (
    <PlayerPanel
      width={panelWidth}
      seat={state.seats[side]}
      color={side}
      isYou={isSeatedViewer && side === mySide && !isDemo}
      isTurn={state.turn === side}
      playing={playing}
      theme={theme}
      reduced={perf.reduced}
      clockBaseline={clockBaseline}
      turn={state.turn}
      clockRunning={clockRunning}
      onFlag={side === state.turn ? onFlag : undefined}
      captured={capturedBy(side)}
      capturedHiddenIds={hiddenIds}
      advantage={advantageOf(side)}
      moveCount={displayMoves.length}
    >
      {side === mySide && isSeatedViewer && !isDemo && playing && (
        <>
          {you?.drawOfferFromOpponent && (
            <DrawOfferBanner
              theme={theme}
              disabled={busy}
              onAccept={() => sendAction('draw-accept')}
              onDecline={() => sendAction('draw-decline')}
            />
          )}
          <GameActions
            onResign={() => sendAction('resign')}
            onDrawOffer={() => sendAction('draw-offer')}
            drawOfferSent={state.drawOffer !== null && state.drawOffer === you?.color}
            disabled={busy}
          />
        </>
      )}
    </PlayerPanel>
  );

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.pageBg }}>
      <ChessNotice message={notice} />

      {/* coin haut droit : le panneau de ce côté est aligné en bas, la place
          est donc libre. Empilé et non côte à côte pour que la largeur reste
          celle d'un seul élément et n'empiète jamais sur le plateau. */}
      <div className="absolute right-5 top-5 z-30 flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={handleQuit}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-5 py-2.5 font-display uppercase tracking-wider text-table-ink-soft transition-transform active:scale-95"
        >
          <X className="h-5 w-5" />
          {t('table.chess.quit')}
        </button>
        {!isSeatedViewer && !isDemo && <SpectatorBadge />}
        {debug && !isDemo && <SyncDebugBadge info={online.syncInfo} />}
      </div>

      <div
        // pas d'items-center ici : les colonnes doivent occuper toute la
        // hauteur pour que chaque panneau puisse se coller en haut ou en bas
        className="grid h-full grid-cols-[1fr_auto_1fr]"
        style={{ gap: COL_GAP, padding: PAGE_PAD }}
      >
        {/* Chaque panneau est collé du côté où son joueur se trouve
            réellement autour du plateau : l'adversaire est en haut de
            l'échiquier, donc son panneau est en haut de l'écran. */}
        <div className="flex items-start justify-end">{panel(oppSide)}</div>
        <div className="flex items-center">
          <ChessBoard
            boardRef={boardRef}
            boardSize={boardSize}
            orientation={orientation}
            theme={theme}
            reduced={perf.reduced}
            pieces={tracked.pieces}
            selection={interaction.selection}
            lastMove={lastMove}
            checkSquare={checkSquare}
            shakeSquare={interaction.shakeSquare}
            fallenKingSquare={fallenKing}
            turnColor={chess.turn() as ChessColor}
            suppressAnim={suppress}
            promotion={promotion ? { color: promotion.color } : null}
            onPromotionPick={(piece) => {
              const pending = promotion;
              setPromotion(null);
              if (piece && pending) submitMove(pending.from, pending.to, piece);
            }}
            onSquareTap={interaction.onSquareTap}
          />
        </div>
        <div className="flex items-end justify-start">{panel(mySide)}</div>
      </div>

      <CaptureFxLayer
        items={fxItems}
        boardRef={boardRef}
        orientation={orientation}
        theme={theme}
        reduced={perf.reduced}
        onDone={(key) => setFxItems((items) => items.filter((i) => i.key !== key))}
      />

      {status === 'lobby' && (
        <WaitingOverlay
          isCreator={isSeatedViewer}
          canJoin={!isSeatedViewer && seatFree}
          busy={busy}
          onCancel={() => {
            sendAction('cancel');
            backToLobby();
          }}
          onJoin={() => setJoinOpen(true)}
          onInvite={() => sendAction('invite')}
          soloVsAi={state.config.ai !== null}
        />
      )}

      {status === 'ready' && (
        <ReadyOverlay
          ready={state.ready}
          voted={you?.readyVoted ?? false}
          seated={isSeatedViewer}
          busy={busy}
          phaseEndsAt={state.phaseEndsAt}
          soloVsAi={state.config.ai !== null}
          onReady={() => sendAction('ready')}
        />
      )}

      {state.result && showRecap && (
        <GameOverOverlay
          state={state}
          you={isDemo ? demo.you : you}
          theme={theme}
          busy={busy}
          capturedByWhite={tracked.capturedByWhite}
          capturedByBlack={tracked.capturedByBlack}
          onRematch={isDemo ? demo.reset : () => sendAction('rematch')}
          onJoinRematch={handleJoinRematch}
          onSpectateRematch={() =>
            state.rematch.sessionId && navigate(`/table/games/chess/${state.rematch.sessionId}`)
          }
          onBackToLobby={backToLobby}
        />
      )}

      <JoinPseudoModal
        open={joinOpen}
        busy={busy}
        onClose={() => setJoinOpen(false)}
        onJoin={handleJoin}
      />

      <ArcadeModal open={quitConfirm} onClose={() => setQuitConfirm(false)} title={t('table.chess.quit')} size="md">
        <div className="flex flex-col gap-5">
          <p className="text-lg text-table-ink-soft">{t('table.chess.quit.confirm')}</p>
          <div className="flex gap-3">
            <ArcadeButton
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => {
                setQuitConfirm(false);
                sendAction('resign');
                backToLobby();
              }}
            >
              {t('table.chess.action.resign')}
            </ArcadeButton>
            <ArcadeButton variant="ghost" size="lg" className="flex-1" onClick={() => setQuitConfirm(false)}>
              {t('table.common.cancel', 'Annuler')}
            </ArcadeButton>
          </div>
        </div>
      </ArcadeModal>
    </div>
  );
}
