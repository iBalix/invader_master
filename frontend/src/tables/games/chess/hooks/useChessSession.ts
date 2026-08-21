/**
 * Session d'échecs temps réel : même protocole auto-réparant que le quiz
 * (garde anti-régression sur v, refetch coalescé, poll de secours 10 s,
 * visibilitychange/online, signal realtime 'sync' sans donnée métier).
 * Les réponses des POST (move/action) portent l'état frais : applyResponse
 * les applique sans refetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeTopic } from '../../../lib/realtime';
import { chessApi } from '../lib/chessApi';
import type {
  ChessColor,
  ChessPublicState,
  ChessStateResponse,
  ChessYou,
} from '../lib/chessTypes';

/**
 * Filet de secours si un signal temps réel se perd. Resserré pendant une
 * partie : avant, un signal manqué laissait l'adversaire attendre jusqu'à
 * 10 s devant un plateau figé.
 */
const POLL_PLAYING_MS = 2_500;
const POLL_IDLE_MS = 10_000;

/** Bloc d'accélération agrafé au signal 'sync' par le backend (chessFlow). */
interface ChessSyncPayload {
  v?: number;
  status?: ChessPublicState['status'];
  ply?: number;
  uci?: string | null;
  fen?: string;
  turn?: ChessColor;
  wMs?: number | null;
  bMs?: number | null;
  at?: number;
  result?: ChessPublicState['result'];
  phaseEndsAt?: number | null;
}

/** ?debug=1 dans l'URL : trace le chemin emprunté par chaque mise à jour */
function debugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

/** Comment le dernier état est arrivé : sert au badge de diagnostic ?debug=1 */
export interface SyncInfo {
  /** 'fast' = peint depuis le signal, 'fetch' = aller-retour HTTP */
  via: 'fast' | 'fetch';
  /** âge du signal à son application (ms) */
  ageMs: number;
  at: number;
}

export interface UseChessSessionResult {
  state: ChessPublicState | null;
  you: ChessYou | null;
  error: string | null;
  refresh: () => Promise<void>;
  applyResponse: (data: ChessStateResponse) => void;
  syncInfo: SyncInfo | null;
}

export function useChessSession(
  sessionId: string | null,
  playerToken: string | null,
): UseChessSessionResult {
  const [state, setState] = useState<ChessPublicState | null>(null);
  const [you, setYou] = useState<ChessYou | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  // miroir synchrone de l'état : le chemin rapide doit décider immédiatement
  // s'il peut peindre, sans attendre un re-render
  const stateRef = useRef<ChessPublicState | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  // incrémenté au retour du réseau / de la veille : force un réabonnement au
  // temps réel. Le wifi d'un bar coupe, et un canal peut rester muet après
  // coup — sans ça tout retomberait sur le sondage de secours.
  const [channelEpoch, setChannelEpoch] = useState(0);
  const tokenRef = useRef(playerToken);
  tokenRef.current = playerToken;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);

  const applyResponse = useCallback((data: ChessStateResponse) => {
    if (data.state.v >= versionRef.current) {
      versionRef.current = data.state.v;
      stateRef.current = data.state;
      setState(data.state);
      setYou(data.you);
    }
  }, []);

  /**
   * Chemin rapide : peint le coup directement depuis le signal temps réel,
   * sans l'aller-retour HTTP qui faisait attendre l'adversaire.
   *
   * N'accepte que le cas sûr : un coup, qui suit EXACTEMENT notre version et
   * notre nombre de coups. Tout le reste (abandon, nulle, arrivée d'un joueur,
   * trou de version) retombe sur le refetch, donc l'état reste toujours
   * dérivable de /state seul.
   */
  const applyFastPatch = useCallback((p: ChessSyncPayload): boolean => {
    const prev = stateRef.current;
    if (!prev || typeof p.v !== 'number' || !p.uci || !p.fen || !p.turn) return false;
    if (p.v !== prev.v + 1) return false;
    if (p.ply !== prev.moves.length + 1) return false;

    const status = p.status ?? prev.status;
    const next: ChessPublicState = {
      ...prev,
      v: p.v,
      status,
      // `at` sert de repère d'horloge : le coup vient d'être joué, donc les
      // restants transmis sont ceux de cet instant
      serverNow: p.at ?? prev.serverNow,
      phaseEndsAt: p.phaseEndsAt ?? null,
      fen: p.fen,
      moves: [...prev.moves, p.uci],
      lastMove: { from: p.uci.slice(0, 2), to: p.uci.slice(2, 4) },
      turn: p.turn,
      clocks:
        prev.clocks && typeof p.wMs === 'number' && typeof p.bMs === 'number'
          ? { wMs: p.wMs, bMs: p.bMs, running: status === 'playing' }
          : prev.clocks,
      // tout coup joué efface une offre de nulle en attente
      drawOffer: null,
      result: p.result ?? null,
      ended: (p.result ?? null) !== null,
      check: false, // recalculé par la page depuis la position affichée
    };

    versionRef.current = p.v;
    stateRef.current = next;
    setState(next);
    setYou((prevYou) =>
      prevYou
        ? {
            ...prevYou,
            canMove: status === 'playing' && p.turn === prevYou.color,
            drawOfferFromOpponent: false,
          }
        : prevYou,
    );
    setSyncInfo({ via: 'fast', ageMs: p.at ? Math.max(0, Date.now() - p.at) : 0, at: Date.now() });
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    // un refresh demandé pendant un refresh en vol est mis en file, jamais jeté
    if (refreshing.current) {
      pendingRefresh.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        pendingRefresh.current = false;
        const usedToken = tokenRef.current;
        try {
          const data = await chessApi.state(sessionId, usedToken ?? undefined);
          if (data.state.v >= versionRef.current) {
            // le badge de diagnostic ne doit refléter que de VRAIES nouvelles :
            // sinon chaque sondage de secours (2,5 s) l'écraserait en 'http'
            const isNews = data.state.v > versionRef.current;
            versionRef.current = data.state.v;
            stateRef.current = data.state;
            setState(data.state);
            // "you" seulement si la requête portait le token courant
            if (usedToken === tokenRef.current) setYou(data.you);
            if (isNews) setSyncInfo({ via: 'fetch', ageMs: 0, at: Date.now() });
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'network');
        }
      } while (pendingRefresh.current);
    } finally {
      refreshing.current = false;
    }
  }, [sessionId]);

  // changement de session (revanche) : repartir de zéro
  useEffect(() => {
    versionRef.current = 0;
    stateRef.current = null;
    setState(null);
    setYou(null);
    setError(null);
    setSyncInfo(null);
  }, [sessionId]);

  // un token qui apparaît (join, reprise) => refetch immédiat avec ce token
  useEffect(() => {
    if (playerToken) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerToken]);

  // fetch initial + poll de secours + retours de veille/réseau
  const pollMs = state?.status === 'playing' ? POLL_PLAYING_MS : POLL_IDLE_MS;
  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), pollMs);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
      setChannelEpoch((n) => n + 1);
    };
    const onOnline = () => {
      void refresh();
      setChannelEpoch((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [sessionId, refresh, pollMs]);

  // realtime : 'sync' porte la version ET, pour un coup, de quoi le peindre
  useEffect(() => {
    if (!sessionId) return;
    return subscribeTopic(`game:${sessionId}`, (e) => {
      if (e.event !== 'sync') return;
      const payload = e.payload as unknown as ChessSyncPayload;
      const v = payload.v ?? 0;
      const age = payload.at ? Date.now() - payload.at : null;
      if (v <= versionRef.current) {
        if (debugEnabled()) {
          console.debug(`[chess] signal v${v} deja connu (local v${versionRef.current})`, { age });
        }
        return;
      }
      // un coup qui suit exactement notre état : on peint sans attendre
      if (applyFastPatch(payload)) {
        if (debugEnabled()) console.debug(`[chess] signal v${v} peint DIRECT en ${age} ms`);
        return;
      }
      if (debugEnabled()) {
        console.debug(`[chess] signal v${v} incomplet ou desynchronise -> GET /state`, {
          uci: payload.uci,
          ply: payload.ply,
          localPly: stateRef.current?.moves.length,
          localV: versionRef.current,
        });
      }
      void refresh();
    });
  }, [sessionId, refresh, applyFastPatch, channelEpoch]);

  return { state, you, error, refresh, applyResponse, syncInfo };
}
