/**
 * Flappy Bar : mémoire éphémère des flaps de la manche en cours + bus
 * d'événements entre la machine à états (flapFlow) et le pont WebSocket
 * (flappybar-bridge).
 *
 * Pourquoi en mémoire et pas en base : un joueur tape jusqu'à 15 fois par
 * seconde, à 20 joueurs c'est 300 écritures/s pour une donnée qui ne sert
 * qu'à rejouer les fantômes et à résoudre d'office un joueur muet (socket
 * morte, plafond de manche). Le résultat officiel, lui, est persisté dans
 * game_sessions à la mort du joueur. Railway tourne en instance unique : la
 * perte au redémarrage coûte au pire la manche en cours (résolue d'office).
 *
 * Module NEUTRE : importé par le flow ET par le pont, il n'importe aucun des
 * deux (sinon cycle d'import).
 */

import { EventEmitter } from 'events';
import { FLAP_MAX_FLAPS } from './types.js';

// ---------------------------------------------------------------------------
// Flaps de la manche en cours
// ---------------------------------------------------------------------------

interface RoundStore {
  roundIndex: number;
  /** playerId -> frames de flap, strictement croissantes */
  flaps: Map<string, number[]>;
}

/** une seule manche vivante par session : la précédente est oubliée au début de la suivante */
const rounds = new Map<string, RoundStore>();

export type PushFlapResult = 'ok' | 'stale' | 'dup' | 'cap';

/**
 * Ouvre la mémoire d'une manche. Idempotent pour un même index : le pont
 * l'appelle aussi quand il reconstruit une salle à froid (après redémarrage),
 * sans effacer des flaps déjà reçus.
 */
export function beginRound(sessionId: string, roundIndex: number): void {
  const current = rounds.get(sessionId);
  if (current && current.roundIndex === roundIndex) return;
  rounds.set(sessionId, { roundIndex, flaps: new Map() });
}

export function pushFlap(
  sessionId: string,
  roundIndex: number,
  playerId: string,
  frame: number,
): PushFlapResult {
  const store = rounds.get(sessionId);
  if (!store || store.roundIndex !== roundIndex) return 'stale';
  let list = store.flaps.get(playerId);
  if (!list) {
    list = [];
    store.flaps.set(playerId, list);
  }
  if (list.length >= FLAP_MAX_FLAPS) return 'cap';
  // la simulation exige des frames strictement croissantes : un flap en
  // retard ou répété ne serait pas rejoué à l'identique par les dalles
  if (list.length > 0 && frame <= list[list.length - 1]) return 'dup';
  list.push(frame);
  return 'ok';
}

/** copie défensive : le rejeu (simulate) lit le tableau pendant que le pont continue d'écrire */
export function flapsOf(sessionId: string, roundIndex: number, playerId: string): number[] {
  const store = rounds.get(sessionId);
  if (!store || store.roundIndex !== roundIndex) return [];
  return store.flaps.get(playerId)?.slice() ?? [];
}

export function allFlaps(sessionId: string, roundIndex: number): Record<string, number[]> {
  const store = rounds.get(sessionId);
  const out: Record<string, number[]> = {};
  if (!store || store.roundIndex !== roundIndex) return out;
  for (const [playerId, list] of store.flaps) out[playerId] = list.slice();
  return out;
}

/** dernière activité connue par joueur (ms epoch) : poll REST ou flap accepté */
const seen = new Map<string, number>();
const SEEN_PRUNE_MS = 60 * 60_000;

export function touchSeen(playerId: string): void {
  seen.set(playerId, Date.now());
}

export function lastSeen(playerId: string): number | null {
  return seen.get(playerId) ?? null;
}

function pruneSeen(): void {
  const limit = Date.now() - SEEN_PRUNE_MS;
  for (const [id, at] of seen) if (at < limit) seen.delete(id);
}

export function dropSession(sessionId: string): void {
  pruneSeen();
  rounds.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Événements flow -> pont WebSocket
// ---------------------------------------------------------------------------

/** ce que les dalles doivent connaître d'une manche pour la jouer */
export interface FlapRoundInfo {
  index: number;
  seed: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

export interface FlapEventMap {
  round_started: { sessionId: string; round: FlapRoundInfo };
  player_dead: { sessionId: string; playerId: string; frame: number; distance: number };
  round_ended: { sessionId: string; index: number };
  session_ended: { sessionId: string };
}

export type FlapEventName = keyof FlapEventMap;

export const flapEvents = new EventEmitter();
// plusieurs salles + le flow écoutent le même bus : le seuil d'alerte par
// défaut (10) déclencherait un faux avertissement de fuite
flapEvents.setMaxListeners(50);

/**
 * Émission protégée : une exception dans un écouteur (pont WS) ne doit jamais
 * remonter dans une mutation de partie et faire échouer son commit.
 */
export function emitFlapEvent<K extends FlapEventName>(event: K, payload: FlapEventMap[K]): void {
  try {
    flapEvents.emit(event, payload);
  } catch (err) {
    console.error(`[flappybar] écouteur ${event} en erreur`, err);
  }
}

export function onFlapEvent<K extends FlapEventName>(
  event: K,
  listener: (payload: FlapEventMap[K]) => void,
): void {
  flapEvents.on(event, listener as (payload: unknown) => void);
}
