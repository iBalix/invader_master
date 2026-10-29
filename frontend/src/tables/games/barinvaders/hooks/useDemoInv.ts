/**
 * Mode démo local (/table/games/barinvaders/demo[?bots=3]) : fabrique un état
 * de session crédible sans backend, avec des adversaires pilotés par
 * l'autopilote. Leurs entrées passent par le pont exactement comme celles du
 * WebSocket : le panneau des joueurs et le mode spectateur se testent donc
 * sans serveur. Une manche démarre 3,2 s après le montage ; quand tout le
 * monde a perdu, classement, déverrouillage 3 s après, relance seule 4 s plus
 * tard (ou au bouton).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../../../lib/clockSync';
import { SIM, createSim, frameToMs, stepSim, type InvSimState } from '../sim/invSim';
import { AutoPilot, PILOT_SKILLS } from '../engine/autopilot';
import type { InvBridge } from '../engine/bridge';
import type { InvPublicState, InvRankingEntry, InvRoundResult, InvYou } from '../lib/invTypes';

const COUNTDOWN_MS = 3200;
const CAP_MS = Math.round((SIM.MAX_FRAMES * 1000) / SIM.FPS);
const END_DELAY_MS = 1500;
const UNLOCK_MS = 3000;
const AUTO_START_MS = 4000;
const BOT_TICK_MS = 50;
const MARK_EVERY_MS = 200;
const FRAME_MS = 1000 / SIM.FPS;
const PLAYER_ID = 'demo';
const PSEUDO = 'Démo';

const BOTS = [
  { playerId: 'bot-zorg', pseudo: 'Zorg', skill: 2 },
  { playerId: 'bot-kana', pseudo: 'Kana', skill: 1 },
  { playerId: 'bot-riko', pseudo: 'Riko', skill: 0 },
  { playerId: 'bot-vega', pseudo: 'Vega', skill: 1 },
  { playerId: 'bot-nova', pseudo: 'Nova', skill: 2 },
  { playerId: 'bot-luma', pseudo: 'Luma', skill: 0 },
  { playerId: 'bot-oxo', pseudo: 'Oxo', skill: 1 },
];

interface BotRun {
  playerId: string;
  sim: InvSimState;
  pilot: AutoPilot;
  mask: number;
  done: boolean;
}

export interface DemoInv {
  state: InvPublicState | null;
  you: InvYou | null;
  start(): void;
}

function resultOf(s: InvSimState): InvRoundResult {
  const frame = s.over ? s.overFrame : s.frame;
  return {
    alive: false,
    overFrame: frame,
    score: s.score,
    wave: s.wave,
    kills: s.kills,
    ufoHits: s.ufoHits,
    timeMs: frameToMs(frame),
    resolvedBy: 'client',
    mismatch: false,
  };
}

export function useDemoInv(enabled: boolean, bridge: InvBridge, botCount: number): DemoInv {
  const [state, setState] = useState<InvPublicState | null>(null);
  const [you, setYou] = useState<InvYou | null>(null);
  const stateRef = useRef<InvPublicState | null>(null);
  stateRef.current = state;
  const timers = useRef<number[]>([]);
  const versionRef = useRef(1);
  const roundsRef = useRef(0);
  const bots = useRef<BotRun[]>([]);
  const results = useRef<Record<string, InvRoundResult>>({});
  const bots0 = BOTS.slice(0, Math.max(0, Math.min(7, botCount)));

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const base = useCallback((): InvPublicState => {
    versionRef.current += 1;
    return {
      id: 'demo',
      joinCode: 'DEMO',
      mode: 'barinvaders',
      status: 'lobby',
      v: versionRef.current,
      serverNow: serverNow(),
      phaseEndsAt: null,
      config: { maxPlayers: 8, hostOnlyStart: true, countdownMs: COUNTDOWN_MS, roundCapMs: CAP_MS },
      hostPlayerId: PLAYER_ID,
      players: [
        { playerId: PLAYER_ID, pseudo: PSEUDO, device: 'DEMO', joinedSeq: 1, status: 'active', isHost: true, bestScore: 0, roundsWon: 0 },
        ...bots0.map((b, i) => ({
          playerId: b.playerId,
          pseudo: b.pseudo,
          device: `BOT${i + 1}`,
          joinedSeq: i + 2,
          status: 'active' as const,
          isHost: false,
          bestScore: 0,
          roundsWon: 0,
        })),
      ],
      round: null,
      lastRound: null,
      roundsPlayed: roundsRef.current,
      recordsVersion: 0,
      restartUnlockAt: null,
      ended: false,
      endReason: null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botCount]);

  const finishRound = useCallback(() => {
    const prev = stateRef.current;
    if (!prev || !prev.round) return;
    const round = prev.round;
    const now = serverNow();
    const pseudos = new Map(prev.players.map((p) => [p.playerId, p.pseudo]));
    const entries = round.participants.map((id) => ({ id, r: results.current[id] }));
    entries.sort((a, b) => (b.r?.score ?? 0) - (a.r?.score ?? 0) || (b.r?.wave ?? 0) - (a.r?.wave ?? 0) || (b.r?.timeMs ?? 0) - (a.r?.timeMs ?? 0));
    let rank = 0;
    const ranking: InvRankingEntry[] = entries.map((e, i) => {
      const prevEntry = i > 0 ? entries[i - 1] : null;
      if (!prevEntry || prevEntry.r?.score !== e.r?.score) rank = i + 1;
      return {
        rank,
        playerId: e.id,
        pseudo: pseudos.get(e.id) ?? '?',
        device: e.id === PLAYER_ID ? 'DEMO' : 'BOT',
        score: e.r?.score ?? 0,
        wave: e.r?.wave ?? 1,
        kills: e.r?.kills ?? 0,
        ufoHits: e.r?.ufoHits ?? 0,
        timeMs: e.r?.timeMs ?? 0,
        resolvedBy: 'client',
        personalBest: false,
        firstRecord: false,
        barRecord: false,
        previousBest: null,
      };
    });
    roundsRef.current = round.index;
    setYou((current) => (current ? { ...current, inRound: false, canStart: true } : current));
    setState({
      ...base(),
      status: 'lobby',
      restartUnlockAt: now + UNLOCK_MS,
      lastRound: {
        index: round.index,
        startsAt: round.startsAt,
        endedAt: now,
        endedBy: 'all_dead',
        ranking,
        records: { applied: true, barBefore: null, barAfter: null },
      },
    });
    later(UNLOCK_MS + AUTO_START_MS, () => startRef.current());
  }, [base, later]);

  const maybeFinish = useCallback(() => {
    const prev = stateRef.current;
    if (!prev?.round) return;
    if (prev.round.participants.every((id) => results.current[id])) later(END_DELAY_MS, finishRound);
  }, [finishRound, later]);

  const startRound = useCallback(() => {
    clearTimers();
    const index = roundsRef.current + 1;
    const startsAt = serverNow() + COUNTDOWN_MS;
    const participants = [PLAYER_ID, ...bots0.map((b) => b.playerId)];
    results.current = {};
    bots.current = bots0.map((b, i) => ({
      playerId: b.playerId,
      sim: createSim(),
      pilot: new AutoPilot(index * 97 + i * 13 + 1, PILOT_SKILLS[b.skill]),
      mask: 0,
      done: false,
    }));
    bridge.toRunner.emit('remoteRound', index);
    setState({
      ...base(),
      lastRound: stateRef.current?.lastRound ?? null,
      status: 'playing',
      round: { index, startsAt, capAt: startsAt + CAP_MS, startedBy: PLAYER_ID, participants, results: {}, aliveCount: participants.length },
    });
    setYou({ playerId: PLAYER_ID, pseudo: PSEUDO, isHost: true, status: 'active', canStart: false, inRound: true, result: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, bridge, clearTimers, botCount]);
  const startRef = useRef(startRound);
  startRef.current = startRound;

  // démarrage / arrêt du mode démo
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

  // ma fin de partie
  useEffect(() => {
    if (!enabled) return undefined;
    return bridge.fromRunner.on('gameOver', (info) => {
      const s: InvRoundResult = {
        alive: false,
        overFrame: info.frame,
        score: info.score,
        wave: info.wave,
        kills: info.kills,
        ufoHits: info.ufoHits,
        timeMs: frameToMs(info.frame),
        resolvedBy: 'client',
        mismatch: false,
      };
      results.current[PLAYER_ID] = s;
      setYou((current) => (current ? { ...current, result: s } : current));
      maybeFinish();
    });
  }, [enabled, bridge, maybeFinish]);

  // adversaires : leurs entrées passent par le pont, comme celles du WebSocket
  useEffect(() => {
    if (!enabled) return undefined;
    let lastMark = 0;
    const timer = window.setInterval(() => {
      const round = stateRef.current?.round;
      if (!round || stateRef.current?.status !== 'playing') return;
      const target = Math.floor((serverNow() - round.startsAt) / FRAME_MS);
      if (target <= 0) return;
      const now = Date.now();
      const sendMark = now - lastMark >= MARK_EVERY_MS;
      if (sendMark) lastMark = now;
      for (const bot of bots.current) {
        if (bot.done) continue;
        const s = bot.sim;
        while (s.frame < target && !s.over) {
          const mask = bot.pilot.maskFor(s);
          if (mask !== bot.mask) {
            bot.mask = mask;
            bridge.toRunner.emit('remoteInput', bot.playerId, s.frame, mask);
          }
          stepSim(s, mask);
        }
        if (s.over) {
          bot.done = true;
          bridge.toRunner.emit('remoteDead', bot.playerId, s.overFrame, s.score);
          results.current[bot.playerId] = resultOf(s);
          maybeFinish();
        } else if (sendMark) {
          bridge.toRunner.emit('remoteMark', bot.playerId, s.frame - 1);
        }
      }
    }, BOT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, bridge, maybeFinish]);

  const start = useCallback(() => {
    if (stateRef.current?.status === 'lobby') startRound();
  }, [startRound]);

  return { state, you, start };
}
