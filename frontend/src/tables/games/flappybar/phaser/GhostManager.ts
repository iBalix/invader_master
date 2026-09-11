/**
 * Fantômes : une sim par adversaire de la manche, rejouée à partir de ses
 * seuls flaps et maintenue 8 frames derrière la sim locale (le temps que les
 * flaps arrivent). Un flap reçu dans le passé du fantôme = rejeu complet
 * depuis la graine (quelques milliers de pas au pire, négligeable).
 *
 * Rendu en coordonnées monde : un fantôme est dessiné à
 * BIRD_X - (défilement du focus - son défilement). Tous les vivants ayant les
 * mêmes tuyaux à la même frame, un fantôme vivant traîne donc juste derrière
 * l'oiseau focus, exactement à sa place face aux tuyaux ; un mort reste où il
 * est tombé et sort par la gauche.
 *
 * Mort prédite (sa sim meurt chez nous) : alpha 0,3, figé, tant que le
 * serveur ne l'a pas confirmée (WebSocket `dead` ou deathFrame du store).
 * Mort confirmée : bouffée, teinte grise, bascule et chute. Aucun son.
 */

import Phaser from 'phaser';
import { SIM, metersOf, simulate, stepSim, type SimState } from '../sim/flapSim';
import type { BridgePlayer } from './bridge';
import { ATLAS_KEY, FRAME } from '../themes/types';
import { BIRD_ANIM, BIRD_SCALE } from './BirdActor';
import type { Fx } from './Fx';
import { FLAP_FONT } from './retroFont';

const POOL = 20;
const MAX_STEPS = 30;
const RESYNC_GAP = 180;
const ALPHA_GHOST = 0.45;
const ALPHA_FOCUS = 0.95;
const ALPHA_PREDICTED = 0.3;
const ALPHA_DEAD = 0.3;

interface Ghost {
  id: string;
  pseudo: string;
  slot: number;
  flaps: number[];
  cursor: number;
  sim: SimState;
  prevY: number;
  lastDx: number;
  confirmedDeath: number | null;
  predictedDead: boolean;
  left: boolean;
  puffed: boolean;
  screenX: number;
  fall: { y: number; angle: number };
  fallTween: Phaser.Tweens.Tween | null;
  labelText: string;
}

export interface GhostView {
  id: string;
  sim: SimState;
  lastDx: number;
}

export interface GhostRow {
  alive: boolean;
  scroll: number;
}

/** insère `value` dans une liste triée strictement croissante ; false si déjà présent */
function insertSorted(list: number[], value: number): boolean {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  if (lo < list.length && list[lo] === value) return false;
  list.splice(lo, 0, value);
  return true;
}

function countBelow(list: readonly number[], frame: number): number {
  let n = 0;
  while (n < list.length && list[n] < frame) n += 1;
  return n;
}

function sanitize(list: readonly number[]): number[] {
  const out: number[] = [];
  for (const f of list) {
    if (typeof f === 'number' && Number.isInteger(f) && f >= 0 && f <= SIM.MAX_FRAMES) insertSorted(out, f);
  }
  return out;
}

export class GhostManager {
  private ghosts = new Map<string, Ghost>();
  /** flaps reçus pour des joueurs pas encore connus du store */
  private pendingFlaps = new Map<string, number[]>();
  private pendingDead = new Map<string, number>();
  private seed = 0;
  private targetFrame = 0;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private free: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Fx,
  ) {
    for (let i = 0; i < POOL; i += 1) {
      this.sprites.push(
        scene.add.sprite(0, 0, ATLAS_KEY, FRAME.bird[0]).setScale(BIRD_SCALE).setDepth(30).setAlpha(ALPHA_GHOST).setVisible(false),
      );
      this.labels.push(scene.add.bitmapText(0, 0, FLAP_FONT, '', 26).setOrigin(0.5, 1).setDepth(31).setVisible(false));
      this.free.push(i);
    }
  }

  reset(seed: number): void {
    for (const ghost of this.ghosts.values()) this.release(ghost);
    this.ghosts.clear();
    this.pendingFlaps.clear();
    this.pendingDead.clear();
    this.seed = seed;
    this.targetFrame = 0;
  }

  /** aligne les fantômes sur les participants du store (créations, départs, morts confirmées) */
  sync(players: Record<string, BridgePlayer>, myId: string | null): void {
    for (const player of Object.values(players)) {
      if (!player.inRound || player.playerId === myId) continue;
      const ghost = this.ghosts.get(player.playerId) ?? this.spawn(player);
      if (!ghost) continue;
      if (ghost.pseudo !== player.pseudo) {
        ghost.pseudo = player.pseudo;
        ghost.labelText = '';
      }
      if (player.deathFrame !== null && ghost.confirmedDeath === null) this.confirm(ghost, player.deathFrame);
    }
    for (const [id, ghost] of this.ghosts) {
      const player = players[id];
      if (!player || !player.inRound || id === myId) {
        this.release(ghost);
        this.ghosts.delete(id);
      }
    }
  }

  hello(players: Record<string, number[]>, dead: Record<string, number>): void {
    for (const [id, list] of Object.entries(players)) {
      const flaps = sanitize(list);
      const ghost = this.ghosts.get(id);
      if (ghost) {
        if (ghost.confirmedDeath === null) this.resim(ghost, flaps, Math.max(ghost.sim.frame, this.targetFrame));
        else ghost.flaps = flaps;
      } else {
        this.pendingFlaps.set(id, flaps);
      }
    }
    for (const [id, frame] of Object.entries(dead)) {
      const ghost = this.ghosts.get(id);
      if (ghost) this.confirm(ghost, frame);
      else this.pendingDead.set(id, frame);
    }
  }

  flap(id: string, frame: number): void {
    const ghost = this.ghosts.get(id);
    if (!ghost) {
      const list = this.pendingFlaps.get(id) ?? [];
      insertSorted(list, frame);
      this.pendingFlaps.set(id, list);
      return;
    }
    if (ghost.confirmedDeath !== null) return;
    if (!insertSorted(ghost.flaps, frame)) return;
    // flap futur : le curseur reste valide, il sera appliqué au pas voulu
    if (frame >= ghost.sim.frame && ghost.sim.alive) return;
    this.resim(ghost, ghost.flaps, Math.max(ghost.sim.frame, this.targetFrame));
  }

  dead(id: string, frame: number): void {
    const ghost = this.ghosts.get(id);
    if (ghost) this.confirm(ghost, frame);
    else this.pendingDead.set(id, frame);
  }

  left(id: string): void {
    const ghost = this.ghosts.get(id);
    if (!ghost) return;
    ghost.left = true;
    this.sprites[ghost.slot].setVisible(false);
    this.labels[ghost.slot].setVisible(false);
  }

  /** avance toutes les sims vivantes jusqu'à `targetFrame` (30 pas max par appel) */
  step(targetFrame: number): void {
    this.targetFrame = targetFrame;
    for (const ghost of this.ghosts.values()) {
      if (!ghost.sim.alive) continue;
      const gap = targetFrame - ghost.sim.frame;
      if (gap <= 0) continue;
      if (gap > RESYNC_GAP) {
        this.resim(ghost, ghost.flaps, targetFrame);
        continue;
      }
      let steps = Math.min(gap, MAX_STEPS);
      const sim = ghost.sim;
      while (steps > 0 && sim.alive) {
        steps -= 1;
        ghost.prevY = sim.y;
        ghost.lastDx = sim.speed * SIM.DT;
        const flap = ghost.cursor < ghost.flaps.length && ghost.flaps[ghost.cursor] === sim.frame;
        if (flap) ghost.cursor += 1;
        stepSim(sim, flap);
      }
      if (!sim.alive) {
        if (ghost.confirmedDeath === null) {
          ghost.predictedDead = true;
        } else if (sim.deathFrame !== ghost.confirmedDeath) {
          this.freezeAt(ghost, ghost.confirmedDeath);
        } else {
          this.onConfirmedDeath(ghost);
        }
      } else if (ghost.confirmedDeath !== null && sim.frame > ghost.confirmedDeath) {
        // le serveur l'a vu mourir mais notre rejeu survit (flap manqué) : on impose
        this.freezeAt(ghost, ghost.confirmedDeath);
      }
    }
  }

  render(alpha: number, world: number, focusId: string | null, hidden: boolean): void {
    const worldM = metersOf(world);
    for (const ghost of this.ghosts.values()) {
      const sprite = this.sprites[ghost.slot];
      const label = this.labels[ghost.slot];
      if (ghost.left || hidden) {
        sprite.setVisible(false);
        label.setVisible(false);
        continue;
      }
      const alive = ghost.sim.alive;
      const scroll = alive ? ghost.sim.scroll - (1 - alpha) * ghost.lastDx : ghost.sim.scroll;
      const x = SIM.BIRD_X - (world - scroll);
      ghost.screenX = x;
      if (x < -140 || x > 2060) {
        sprite.setVisible(false);
        label.setVisible(false);
        continue;
      }
      const y = (alive ? Phaser.Math.Linear(ghost.prevY, ghost.sim.y, alpha) : ghost.sim.y) + ghost.fall.y;
      const a =
        ghost.confirmedDeath !== null
          ? ALPHA_DEAD
          : ghost.predictedDead
            ? ALPHA_PREDICTED
            : ghost.id === focusId
              ? ALPHA_FOCUS
              : ALPHA_GHOST;
      sprite.setPosition(x, y).setAlpha(a).setVisible(true);
      sprite.setAngle(alive ? Phaser.Math.Clamp(ghost.sim.vy * 0.065, -22, 22) : ghost.fall.angle);
      let text = ghost.pseudo;
      if (!alive && !ghost.predictedDead) {
        const delta = Math.round(metersOf(ghost.sim.scroll) - worldM);
        text = `${ghost.pseudo} ${delta > 0 ? '+' : ''}${delta} m`;
      }
      if (text !== ghost.labelText) {
        ghost.labelText = text;
        label.setText(text);
      }
      label.setPosition(x, y - 34).setAlpha(Math.min(1, a + 0.25)).setVisible(true);
    }
  }

  /** fantôme vivant le plus avancé (tous les vivants sont à égalité : le premier) */
  leader(): GhostView | null {
    let best: Ghost | null = null;
    for (const ghost of this.ghosts.values()) {
      if (ghost.left || !ghost.sim.alive) continue;
      if (!best || ghost.sim.scroll > best.sim.scroll) best = ghost;
    }
    return best ? { id: best.id, sim: best.sim, lastDx: best.lastDx } : null;
  }

  /** fantôme le plus loin, mort ou vif (spectateur quand tout le monde est tombé) */
  farthest(): GhostView | null {
    let best: Ghost | null = null;
    for (const ghost of this.ghosts.values()) {
      if (ghost.left) continue;
      if (!best || ghost.sim.scroll > best.sim.scroll) best = ghost;
    }
    return best ? { id: best.id, sim: best.sim, lastDx: best.lastDx } : null;
  }

  view(id: string): GhostView | null {
    const ghost = this.ghosts.get(id);
    return ghost && !ghost.left ? { id, sim: ghost.sim, lastDx: ghost.lastDx } : null;
  }

  rowOf(id: string): GhostRow | null {
    const ghost = this.ghosts.get(id);
    return ghost ? { alive: ghost.sim.alive, scroll: ghost.sim.scroll } : null;
  }

  aliveCount(): number {
    let n = 0;
    for (const ghost of this.ghosts.values()) if (!ghost.left && ghost.sim.alive) n += 1;
    return n;
  }

  count(): number {
    return this.ghosts.size;
  }

  private spawn(player: BridgePlayer): Ghost | null {
    const slot = this.free.pop();
    if (slot === undefined) return null;
    const flaps = this.pendingFlaps.get(player.playerId) ?? [];
    this.pendingFlaps.delete(player.playerId);
    const sim = simulate(this.seed, flaps, this.targetFrame);
    this.sprites[slot].setVisible(false).setAlpha(ALPHA_GHOST).clearTint().setAngle(0).play(BIRD_ANIM);
    this.labels[slot].setVisible(false).setText('');
    const ghost: Ghost = {
      id: player.playerId,
      pseudo: player.pseudo,
      slot,
      flaps,
      cursor: countBelow(flaps, sim.frame),
      sim,
      prevY: sim.y,
      lastDx: 0,
      confirmedDeath: null,
      predictedDead: !sim.alive,
      left: false,
      puffed: false,
      screenX: SIM.BIRD_X,
      fall: { y: 0, angle: 0 },
      fallTween: null,
      labelText: '',
    };
    this.ghosts.set(player.playerId, ghost);
    const dead = this.pendingDead.get(player.playerId);
    if (dead !== undefined) {
      this.pendingDead.delete(player.playerId);
      this.confirm(ghost, dead);
    }
    return ghost;
  }

  private release(ghost: Ghost): void {
    ghost.fallTween?.stop();
    ghost.fallTween = null;
    this.sprites[ghost.slot].setVisible(false).clearTint();
    this.labels[ghost.slot].setVisible(false);
    this.free.push(ghost.slot);
  }

  private resim(ghost: Ghost, flaps: number[], until: number): void {
    ghost.flaps = flaps;
    ghost.sim = simulate(this.seed, flaps, until);
    ghost.cursor = countBelow(flaps, ghost.sim.frame);
    ghost.prevY = ghost.sim.y;
    ghost.lastDx = 0;
    ghost.predictedDead = !ghost.sim.alive && ghost.confirmedDeath === null;
  }

  private confirm(ghost: Ghost, frame: number): void {
    if (ghost.confirmedDeath === frame) return;
    ghost.confirmedDeath = frame;
    ghost.predictedDead = false;
    const sim = ghost.sim;
    if (sim.alive && sim.frame <= frame) {
      // la sim locale n'y est pas encore : elle mourra d'elle-même (ou sera imposée) au pas voulu
      return;
    }
    if (!sim.alive && sim.deathFrame === frame) {
      this.onConfirmedDeath(ghost);
      return;
    }
    this.freezeAt(ghost, frame);
  }

  /** impose la mort à `frame` (rejeu jusqu'à frame+1, puis figé) */
  private freezeAt(ghost: Ghost, frame: number): void {
    ghost.sim = simulate(this.seed, ghost.flaps, frame + 1);
    if (ghost.sim.alive) {
      ghost.sim.alive = false;
      ghost.sim.deathFrame = frame;
    }
    ghost.cursor = ghost.flaps.length;
    ghost.prevY = ghost.sim.y;
    ghost.lastDx = 0;
    ghost.predictedDead = false;
    this.onConfirmedDeath(ghost);
  }

  private onConfirmedDeath(ghost: Ghost): void {
    if (ghost.puffed) return;
    ghost.puffed = true;
    this.fx.burst(ghost.screenX, ghost.sim.y, false);
    this.sprites[ghost.slot].setTint(0x8c94a8);
    ghost.fall = { y: 0, angle: Phaser.Math.Clamp(ghost.sim.vy * 0.065, -22, 22) };
    ghost.fallTween = this.scene.tweens.add({ targets: ghost.fall, y: 380, angle: 90, duration: 900, ease: 'Quad.easeIn' });
  }
}
