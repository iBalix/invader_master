/**
 * Pont entre React et la boucle de jeu de Bar Invaders (modèle du pont de
 * Flappy Bar).
 *
 * Deux voies :
 *   - un store zustand "vanilla" pour l'état basse fréquence : React écrit la
 *     manche, les joueurs, le record ; la boucle publie la phase, le joueur
 *     affiché, mes compteurs et le panneau des joueurs (quelques fois par
 *     seconde au plus) ;
 *   - deux émetteurs typés pour le trafic du WebSocket et les fins de partie.
 *
 * Ce fichier n'importe ni la sim ni le canvas : le HUD et les hooks réseau
 * s'en servent sans charger le moteur.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * idle : pas de manche ; countdown : compte à rebours ; playing : je joue ;
 * over : je viens de perdre (GAME OVER) ; spectating : je regarde un
 * survivant ; ended : plus personne en vie, on attend la clôture serveur.
 */
export type InvPhase = 'idle' | 'countdown' | 'playing' | 'over' | 'spectating' | 'ended';

export interface BridgeRound {
  index: number;
  /** ms epoch serveur (se compare à serverNow() de clockSync) */
  startsAt: number;
  capAt: number;
  participants: string[];
}

export interface BridgePlayer {
  playerId: string;
  pseudo: string;
  isMe: boolean;
  /** entre à la prochaine manche */
  waiting: boolean;
  inRound: boolean;
  /** résultat officiel, null tant qu'il joue */
  result: { overFrame: number | null; score: number; wave: number } | null;
}

export interface PanelRow {
  playerId: string;
  pseudo: string;
  isMe: boolean;
  score: number;
  lives: number;
  wave: number;
  alive: boolean;
  waiting: boolean;
  /** c'est la partie affichée à l'écran */
  watched: boolean;
}

export interface MyStats {
  score: number;
  lives: number;
  wave: number;
  kills: number;
  ufoHits: number;
}

export interface GameOverInfo {
  roundIndex: number;
  frame: number;
  /** liste plate [frame, masque, ...] de toute la partie */
  inputs: number[];
  score: number;
  wave: number;
  kills: number;
  ufoHits: number;
}

export interface BridgeState {
  /* écrit par React */
  reduced: boolean;
  round: BridgeRound | null;
  /** null = spectateur */
  myPlayerId: string | null;
  players: Record<string, BridgePlayer>;
  /** record du bar, en HI-SCORE */
  hiScore: number;
  /** joueur choisi en touchant le panneau (après ma mort) */
  watchId: string | null;
  /* écrit par la boucle */
  phase: InvPhase;
  /** joueur dont la partie est à l'écran */
  focusId: string | null;
  me: MyStats;
  panel: PanelRow[];
  fps: number;
}

export type ToRunnerEvents = {
  /** état complet reçu à la connexion (ou reconnexion) du WebSocket */
  remoteHello: [
    roundIndex: number | null,
    inputs: Record<string, number[]>,
    marks: Record<string, number>,
    dead: Record<string, { frame: number; score: number }>,
  ];
  /** nouvelle manche annoncée par le WebSocket : les entrées reçues avant sont périmées */
  remoteRound: [roundIndex: number | null];
  remoteInput: [playerId: string, frame: number, mask: number];
  /** filigrane : toutes les entrées de ce joueur jusqu'à `frame` incluse sont arrivées */
  remoteMark: [playerId: string, frame: number];
  remoteDead: [playerId: string, frame: number, score: number];
};

export type FromRunnerEvents = {
  /** changement de masque du joueur local, à envoyer au WebSocket */
  input: [frame: number, mask: number];
  /** filigrane local, à envoyer au WebSocket */
  mark: [frame: number];
  /** fin de ma partie : à déclarer au serveur */
  gameOver: [info: GameOverInfo];
  /** j'ai dépassé le record du bar en jouant */
  barRecordBeaten: [score: number];
  phase: [phase: InvPhase];
  ready: [];
};

type EventMap = Record<string, unknown[]>;
type Listener<A extends unknown[]> = (...args: A) => void;

export interface Emitter<E extends EventMap> {
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void;
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
    emit(event, ...args) {
      const set = listeners.get(event);
      if (!set) return;
      // copie : un écouteur peut se désabonner pendant l'émission
      for (const listener of Array.from(set)) {
        try {
          listener(...args);
        } catch (err) {
          console.error('[barinvaders] écouteur du pont en erreur', event, err);
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}

export interface InvBridge {
  store: StoreApi<BridgeState>;
  toRunner: Emitter<ToRunnerEvents>;
  fromRunner: Emitter<FromRunnerEvents>;
  dispose(): void;
}

export const EMPTY_STATS: MyStats = { score: 0, lives: 3, wave: 1, kills: 0, ufoHits: 0 };

export function createInvBridge(init: Partial<BridgeState> = {}): InvBridge {
  const store = createStore<BridgeState>(() => ({
    reduced: false,
    round: null,
    myPlayerId: null,
    players: {},
    hiScore: 0,
    watchId: null,
    phase: 'idle',
    focusId: null,
    me: EMPTY_STATS,
    panel: [],
    fps: 0,
    ...init,
  }));
  const toRunner = createEmitter<ToRunnerEvents>();
  const fromRunner = createEmitter<FromRunnerEvents>();
  return {
    store,
    toRunner,
    fromRunner,
    dispose() {
      toRunner.clear();
      fromRunner.clear();
    },
  };
}
