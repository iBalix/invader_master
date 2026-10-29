/**
 * Commandes du joueur local, toutes sources confondues : zones tactiles
 * (multi-doigts, suivies par pointerId), clavier (QA) et manettes USB des
 * dalles master. Produit le masque d'entrées de la sim, frame par frame.
 *
 * Le tir de la borne part à l'APPUI et exige un relâchement entre deux tirs.
 * Un toucher très bref pourrait tomber entre deux pas de sim : chaque appui
 * devient donc une impulsion de 4 frames, suivie d'au moins 3 frames
 * relâchées avant l'impulsion suivante (deux appuis rapides restent deux
 * tirs). Le nombre de changements d'entrée reste ainsi très en dessous du
 * plafond accepté par le serveur.
 */

import { SIM } from '../sim/invSim';

const PULSE_ON = 4;
const PULSE_OFF = 3;
const MAX_QUEUED = 2;
const AXIS_DEAD = 0.5;

type Side = 'left' | 'right';

export class InvControls {
  private readonly touchSide = new Map<number, Side>();
  private keyLeft = false;
  private keyRight = false;
  private padLeft = false;
  private padRight = false;
  /** boutons déjà enfoncés à l'apparition d'une manette : ignorés jusqu'au relâchement */
  private padArmed = new Map<number, boolean>();
  private padFireDown = new Map<number, boolean>();
  private presses = 0;
  private queued = 0;
  private fireOnUntil = -1;
  private fireOffUntil = -1;
  /** appelé à chaque appui de tir (déblocage audio, retour visuel) */
  onPress: (() => void) | null = null;

  // ----- tactile

  setTouch(pointerId: number, side: Side | null): void {
    if (side) this.touchSide.set(pointerId, side);
    else this.touchSide.delete(pointerId);
  }

  fire(): void {
    this.presses += 1;
    this.onPress?.();
  }

  // ----- clavier

  key(code: string, down: boolean): boolean {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
      case 'KeyQ':
        this.keyLeft = down;
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = down;
        return true;
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyZ':
        if (down) this.fire();
        return true;
      default:
        return false;
    }
  }

  // ----- manettes (sondées à chaque image par la boucle)

  pollGamepads(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let left = false;
    let right = false;
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      if (ax < -AXIS_DEAD || pad.buttons[14]?.pressed) left = true;
      if (ax > AXIS_DEAD || pad.buttons[15]?.pressed) right = true;
      // tir : boutons de face et gâchettes
      let down = false;
      for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) if (pad.buttons[i]?.pressed) down = true;
      if (!this.padArmed.has(pad.index)) this.padArmed.set(pad.index, !down);
      if (!down) this.padArmed.set(pad.index, true);
      const was = this.padFireDown.get(pad.index) ?? false;
      if (down && !was && this.padArmed.get(pad.index)) this.fire();
      this.padFireDown.set(pad.index, down);
    }
    this.padLeft = left;
    this.padRight = right;
  }

  /** masque d'entrées pour la frame de sim `frame` (appelé une fois par pas) */
  maskAt(frame: number): number {
    if (this.presses > 0) {
      this.queued = Math.min(MAX_QUEUED, this.queued + this.presses);
      this.presses = 0;
    }
    let mask = 0;
    let touchLeft = false;
    let touchRight = false;
    for (const side of this.touchSide.values()) {
      if (side === 'left') touchLeft = true;
      else touchRight = true;
    }
    if (this.keyLeft || this.padLeft || touchLeft) mask |= SIM.IN_LEFT;
    if (this.keyRight || this.padRight || touchRight) mask |= SIM.IN_RIGHT;
    if (frame < this.fireOnUntil) {
      mask |= SIM.IN_FIRE;
    } else if (frame >= this.fireOffUntil && this.queued > 0) {
      this.queued -= 1;
      this.fireOnUntil = frame + PULSE_ON;
      this.fireOffUntil = frame + PULSE_ON + PULSE_OFF;
      mask |= SIM.IN_FIRE;
    }
    return mask;
  }

  /** nouvelle partie : rien ne reste enfoncé d'une manche à l'autre */
  resetPulses(): void {
    this.presses = 0;
    this.queued = 0;
    this.fireOnUntil = -1;
    this.fireOffUntil = -1;
  }

  releaseAll(): void {
    this.touchSide.clear();
    this.keyLeft = false;
    this.keyRight = false;
    this.resetPulses();
  }
}
