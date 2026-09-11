/**
 * Pont entre React et la scène Phaser de Flappy Bar.
 *
 * Deux voies :
 *   - un store zustand "vanilla" pour la configuration basse fréquence (thème,
 *     mode perf, manche, joueurs, phase) : React écrit, la scène lit à chaque
 *     frame ; la scène publie `phase` et `fps`, React les affiche ;
 *   - deux émetteurs typés pour le trafic haute fréquence (flaps, morts,
 *     distance) : React => scène (`toScene`) et scène => React (`fromScene`).
 *
 * Ce fichier n'importe PAS Phaser : le HUD, les hooks réseau et le mode démo
 * s'en servent sans charger le moteur de rendu.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

export type FlapPhase = 'idle' | 'countdown' | 'playing' | 'dead' | 'spectating' | 'ended';

export interface BridgeRound {
  index: number;
  seed: number;
  /** ms epoch serveur (se compare à serverNow() de clockSync) */
  startsAt: number;
  capAt: number;
}

export interface BridgePlayer {
  playerId: string;
  pseudo: string;
  isMe: boolean;
  /** entre à la prochaine manche : pas d'oiseau cette manche */
  waiting: boolean;
  /** participe à la manche courante */
  inRound: boolean;
  /** frame de mort confirmée par le serveur, null tant qu'il vole */
  deathFrame: number | null;
}

export interface RankingRow {
  playerId: string;
  pseudo: string;
  isMe: boolean;
  alive: boolean;
  /** mètres, 1 décimale */
  distanceM: number;
}

export interface DeathInfo {
  frame: number;
  flaps: number[];
  distanceM: number;
  pipes: number;
  timeMs: number;
}

export interface BridgeState {
  /* écrit par React */
  themeId: string;
  reduced: boolean;
  round: BridgeRound | null;
  /** null = spectateur (aucun oiseau à piloter) */
  myPlayerId: string | null;
  players: Record<string, BridgePlayer>;
  /** record absolu du bar en mètres, pour la célébration en vol */
  barRecordM: number | null;
  /* écrit par la scène */
  phase: FlapPhase;
  fps: number;
  /** joueur dont les tuyaux sont affichés (moi, puis le leader vivant) */
  focusPlayerId: string | null;
}

export type ToSceneEvents = {
  /** le joueur local a tapé (écran, manette, clavier) */
  localFlap: [];
  /** état complet reçu du WebSocket (connexion ou reconnexion) */
  remoteHello: [players: Record<string, number[]>, dead: Record<string, number>];
  remoteFlap: [playerId: string, frame: number];
  /** mort confirmée par le serveur */
  remoteDead: [playerId: string, frame: number];
  remoteLeft: [playerId: string];
};

export type FromSceneEvents = {
  /** flap local horodaté en frame de simulation, à envoyer au WebSocket */
  flap: [frame: number];
  /** mort locale : à déclarer au serveur (POST /round/death) */
  death: [info: DeathInfo];
  /** tuyau passé par le joueur local */
  pass: [pipes: number];
  /** palier de 100 m franchi par le joueur local */
  milestone: [meters: number];
  /** distance du joueur focus, émise quand l'entier change */
  distance: [meters: number];
  /** mini-classement live, ~4 fois par seconde */
  ranking: [rows: RankingRow[]];
  /** écart entre la frame simulée et la frame cible (debug) */
  drift: [frames: number];
  /** le joueur local vient de dépasser le record du bar */
  barRecordBeaten: [meters: number];
  phase: [phase: FlapPhase];
  /** la scène est prête (textures générées) */
  ready: [];
};

type EventMap = Record<string, unknown[]>;
type Listener<A extends unknown[]> = (...args: A) => void;

export interface Emitter<E extends EventMap> {
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void;
  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void;
  emit<K extends keyof E>(event: K, ...args: E[K]): void;
  clear(): void;
}

export function createEmitter<E extends EventMap>(): Emitter<E> {
  const listeners = new Map<keyof E, Set<Listener<unknown[]>>>();
  return {
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener as Listener<unknown[]>);
      return () => {
        set?.delete(listener as Listener<unknown[]>);
      };
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as Listener<unknown[]>);
    },
    emit(event, ...args) {
      const set = listeners.get(event);
      if (!set) return;
      // copie : un écouteur peut se désabonner pendant l'émission
      for (const listener of Array.from(set)) {
        try {
          listener(...args);
        } catch (err) {
          console.error('[flappybar] écouteur du pont en erreur', event, err);
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}

export interface FlapBridge {
  store: StoreApi<BridgeState>;
  toScene: Emitter<ToSceneEvents>;
  fromScene: Emitter<FromSceneEvents>;
  /** libère tous les écouteurs (démontage de la page) */
  dispose(): void;
}

export function createFlapBridge(init: Partial<BridgeState> = {}): FlapBridge {
  const store = createStore<BridgeState>(() => ({
    themeId: 'neon',
    reduced: false,
    round: null,
    myPlayerId: null,
    players: {},
    barRecordM: null,
    phase: 'idle',
    fps: 0,
    focusPlayerId: null,
    ...init,
  }));
  const toScene = createEmitter<ToSceneEvents>();
  const fromScene = createEmitter<FromSceneEvents>();
  return {
    store,
    toScene,
    fromScene,
    dispose() {
      toScene.clear();
      fromScene.clear();
    },
  };
}
