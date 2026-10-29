/**
 * Bar Invaders : mémoire éphémère des entrées de la manche en cours + bus
 * d'événements entre la machine à états (invFlow) et le pont WebSocket
 * (barinvaders-bridge).
 *
 * Pourquoi en mémoire et pas en base : chaque joueur envoie un changement
 * d'entrée à chaque appui ou relâchement, plus un filigrane 4 fois par
 * seconde ; à 8 joueurs c'est quelques centaines de messages par seconde pour
 * une donnée qui ne sert qu'aux dalles adverses et à résoudre d'office un
 * joueur muet (socket morte, plafond de manche). Le résultat officiel, lui,
 * est persisté dans game_sessions à la fin de partie du joueur. Railway tourne
 * en instance unique : la perte au redémarrage coûte au pire la manche en
 * cours (résolue d'office).
 *
 * Filigrane (`mark`) : le joueur garantit que toutes ses entrées de frame <= mark
 * ont été envoyées. Une entrée datée d'une frame déjà couverte est refusée :
 * les sims qui le rejouent ont déjà dépassé cette frame.
 *
 * Module NEUTRE : importé par le flow ET par le pont, il n'importe aucun des
 * deux (sinon cycle d'import).
 */

import { EventEmitter } from 'events';
import { INV_MAX_INPUTS } from './types.js';

// ---------------------------------------------------------------------------
// Entrées de la manche en cours
// ---------------------------------------------------------------------------

interface PlayerInputs {
  /** liste plate [frame, masque, ...], frames strictement croissantes */
  list: number[];
  /** frame jusqu'à laquelle les entrées sont complètes, -1 avant le premier filigrane */
  mark: number;
}

interface RoundStore {
  roundIndex: number;
  players: Map<string, PlayerInputs>;
}

/** une seule manche vivante par session : la précédente est oubliée au début de la suivante */
const rounds = new Map<string, RoundStore>();

/** 'same' : masque inchangé, ignoré sans être une faute */
export type PushInputResult = 'ok' | 'same' | 'stale' | 'dup' | 'cap';

/**
 * Ouvre la mémoire d'une manche. Idempotent pour un même index : le pont
 * l'appelle aussi quand il reconstruit une salle à froid (après redémarrage),
 * sans effacer des entrées déjà reçues.
 */
export function beginRound(sessionId: string, roundIndex: number): void {
  const current = rounds.get(sessionId);
  if (current && current.roundIndex === roundIndex) return;
  rounds.set(sessionId, { roundIndex, players: new Map() });
}

function playerStore(sessionId: string, roundIndex: number, playerId: string): PlayerInputs | null {
  const store = rounds.get(sessionId);
  if (!store || store.roundIndex !== roundIndex) return null;
  let p = store.players.get(playerId);
  if (!p) {
    p = { list: [], mark: -1 };
    store.players.set(playerId, p);
  }
  return p;
}

export function pushInput(
  sessionId: string,
  roundIndex: number,
  playerId: string,
  frame: number,
  mask: number,
): PushInputResult {
  const p = playerStore(sessionId, roundIndex, playerId);
  if (!p) return 'stale';
  if (p.list.length >= INV_MAX_INPUTS) return 'cap';
  const n = p.list.length;
  // la sim exige des frames strictement croissantes, et une frame couverte
  // par le filigrane a déjà été jouée par les dalles adverses
  if (frame <= p.mark || (n > 0 && frame <= p.list[n - 2])) return 'dup';
  const prevMask = n > 0 ? p.list[n - 1] : 0;
  if (mask === prevMask) return 'same';
  p.list.push(frame, mask);
  return 'ok';
}

/** filigrane croissant ; il ne recule jamais sous la dernière entrée connue */
export function pushMark(sessionId: string, roundIndex: number, playerId: string, frame: number): PushInputResult {
  const p = playerStore(sessionId, roundIndex, playerId);
  if (!p) return 'stale';
  if (frame <= p.mark) return 'dup';
  const n = p.list.length;
  if (n > 0 && frame < p.list[n - 2]) return 'dup';
  p.mark = frame;
  return 'ok';
}

/** copie défensive : le rejeu (simulate) lit le tableau pendant que le pont continue d'écrire */
export function inputsOf(sessionId: string, roundIndex: number, playerId: string): number[] {
  const store = rounds.get(sessionId);
  if (!store || store.roundIndex !== roundIndex) return [];
  return store.players.get(playerId)?.list.slice() ?? [];
}

export function markOf(sessionId: string, roundIndex: number, playerId: string): number {
  const store = rounds.get(sessionId);
  if (!store || store.roundIndex !== roundIndex) return -1;
  return store.players.get(playerId)?.mark ?? -1;
}

export function allInputs(sessionId: string, roundIndex: number): Record<string, number[]> {
  const store = rounds.get(sessionId);
  const out: Record<string, number[]> = {};
  if (!store || store.roundIndex !== roundIndex) return out;
  for (const [playerId, p] of store.players) out[playerId] = p.list.slice();
  return out;
}

export function allMarks(sessionId: string, roundIndex: number): Record<string, number> {
  const store = rounds.get(sessionId);
  const out: Record<string, number> = {};
  if (!store || store.roundIndex !== roundIndex) return out;
  for (const [playerId, p] of store.players) out[playerId] = p.mark;
  return out;
}

/** dernière activité connue par joueur (ms epoch) : poll REST ou entrée acceptée */
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
export interface InvRoundInfo {
  index: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

export interface InvEventMap {
  round_started: { sessionId: string; round: InvRoundInfo };
  player_dead: { sessionId: string; playerId: string; frame: number; score: number; wave: number };
  round_ended: { sessionId: string; index: number };
  session_ended: { sessionId: string };
}

export type InvEventName = keyof InvEventMap;

export const invEvents = new EventEmitter();
// plusieurs salles + le flow écoutent le même bus : le seuil d'alerte par
// défaut (10) déclencherait un faux avertissement de fuite
invEvents.setMaxListeners(50);

/**
 * Émission protégée : une exception dans un écouteur (pont WS) ne doit jamais
 * remonter dans une mutation de partie et faire échouer son commit.
 */
export function emitInvEvent<K extends InvEventName>(event: K, payload: InvEventMap[K]): void {
  try {
    invEvents.emit(event, payload);
  } catch (err) {
    console.error(`[barinvaders] écouteur ${event} en erreur`, err);
  }
}

export function onInvEvent<K extends InvEventName>(
  event: K,
  listener: (payload: InvEventMap[K]) => void,
): void {
  invEvents.on(event, listener as (payload: unknown) => void);
}
