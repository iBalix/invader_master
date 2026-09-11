/**
 * Mode démo local (/table/games/flappybar/demo[?theme=pixel]) : fabrique un
 * état de session crédible sans backend. Une manche démarre 3,2 s après le
 * montage ; à la mort (événement `death` du pont), 2 s plus tard la manche se
 * clôt avec un classement d'un joueur, le bouton "Nouvelle manche" se
 * déverrouille 3 s après, et une manche repart seule 2 s après le déblocage.
 * Les horodatages sont en horloge serveur estimée (serverNow), comme la scène.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../../../lib/clockSync';
import type { FlapPublicState, FlapRoundResult, FlapYou } from '../lib/flapTypes';
import type { FlapBridge } from '../phaser/bridge';

const COUNTDOWN_MS = 3200;
const CAP_MS = 300_000;
const END_DELAY_MS = 2000;
const UNLOCK_MS = 3000;
const AUTO_START_MS = 2000;
const PLAYER_ID = 'demo';
const PSEUDO = 'Démo';

export interface DemoFlap {
  state: FlapPublicState | null;
  you: FlapYou | null;
  /** "Nouvelle manche" pressé pendant l'entre-deux */
  start(): void;
}

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}

export function useDemoFlap(themeId: string, enabled: boolean, bridge: FlapBridge): DemoFlap {
  const [state, setState] = useState<FlapPublicState | null>(null);
  const [you, setYou] = useState<FlapYou | null>(null);
  const stateRef = useRef<FlapPublicState | null>(null);
  stateRef.current = state;
  const timers = useRef<number[]>([]);
  const bestRef = useRef(0);
  const roundsRef = useRef(0);
  const versionRef = useRef(1);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const base = useCallback((): FlapPublicState => {
    versionRef.current += 1;
    return {
      id: 'demo',
      joinCode: 'DEMO',
      mode: 'flappybar',
      status: 'lobby',
      v: versionRef.current,
      serverNow: serverNow(),
      phaseEndsAt: null,
      config: { theme: themeId, maxPlayers: 1, hostOnlyStart: false, countdownMs: COUNTDOWN_MS, roundCapMs: CAP_MS },
      hostPlayerId: PLAYER_ID,
      players: [
        {
          playerId: PLAYER_ID,
          pseudo: PSEUDO,
          device: 'DEMO',
          joinedSeq: 1,
          status: 'active',
          isHost: true,
          bestDistance: bestRef.current,
          roundsWon: roundsRef.current,
        },
      ],
      round: null,
      lastRound: null,
      roundsPlayed: roundsRef.current,
      recordsVersion: 0,
      restartUnlockAt: null,
      ended: false,
    };
  }, [themeId]);

  const startRound = useCallback(() => {
    clearTimers();
    const index = roundsRef.current + 1;
    const startsAt = serverNow() + COUNTDOWN_MS;
    const lastRound = stateRef.current?.lastRound ?? null;
    setState({
      ...base(),
      lastRound,
      status: 'playing',
      round: {
        index,
        seed: randomSeed(),
        startsAt,
        capAt: startsAt + CAP_MS,
        startedBy: PLAYER_ID,
        participants: [PLAYER_ID],
        results: {},
        aliveCount: 1,
      },
    });
    setYou({ playerId: PLAYER_ID, pseudo: PSEUDO, isHost: true, status: 'active', canStart: false, inRound: true, result: null });
  }, [base, clearTimers]);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      setYou(null);
      clearTimers();
      return undefined;
    }
    startRound();
    return clearTimers;
  }, [enabled, startRound, clearTimers]);

  useEffect(() => {
    if (!enabled) return undefined;
    return bridge.fromScene.on('death', (info) => {
      later(END_DELAY_MS, () => {
        const prev = stateRef.current;
        if (!prev || !prev.round) return;
        const round = prev.round;
        const now = serverNow();
        const previousBest = bestRef.current;
        const personalBest = info.distanceM > previousBest;
        if (personalBest) bestRef.current = info.distanceM;
        roundsRef.current = round.index;
        const result: FlapRoundResult = {
          alive: false,
          deathFrame: info.frame,
          distance: info.distanceM,
          pipes: info.pipes,
          timeMs: info.timeMs,
          flapsCount: info.flaps.length,
          resolvedBy: 'client',
          mismatch: false,
        };
        setYou((current) => (current ? { ...current, inRound: false, canStart: true, result } : current));
        setState({
          ...base(),
          status: 'lobby',
          restartUnlockAt: now + UNLOCK_MS,
          lastRound: {
            index: round.index,
            seed: round.seed,
            startsAt: round.startsAt,
            endedAt: now,
            endedBy: 'all_dead',
            ranking: [
              {
                rank: 1,
                playerId: PLAYER_ID,
                pseudo: PSEUDO,
                device: 'DEMO',
                distance: info.distanceM,
                pipes: info.pipes,
                timeMs: info.timeMs,
                flapsCount: info.flaps.length,
                resolvedBy: 'client',
                personalBest,
                firstRecord: false,
                barRecord: false,
                previousBest: previousBest > 0 ? previousBest : null,
              },
            ],
            records: { applied: false, barBefore: null, barAfter: null },
          },
        });
        later(UNLOCK_MS + AUTO_START_MS, startRound);
      });
    });
  }, [enabled, bridge, base, later, startRound]);

  const start = useCallback(() => {
    if (stateRef.current?.status === 'lobby') startRound();
  }, [startRound]);

  return { state, you, start };
}
