/**
 * L'oiseau local : sprite 3 frames d'aile, inclinaison pilotée par la vitesse
 * verticale de la sim (-20° au flap, +20° en chute, comme le legacy),
 * squash/stretch au flap, traînée de particules (hors mode réduit) et
 * séquence de mort (teinte, bascule, chute, fondu).
 */

import Phaser from 'phaser';
import { SIM } from '../sim/flapSim';
import { hexToInt } from '../themes/draw';
import type { FlapTheme } from '../themes/types';
import { ATLAS_KEY, BIRD_TEX_W, FRAME } from '../themes/types';

export const BIRD_ANIM = 'flap-bird';
/** même battement d'ailes, frames en nuances de gris (adversaires) */
export const GHOST_ANIM = 'flap-ghost';
/**
 * Rendu à 1,5x la taille de la hitbox legacy : sur une dalle vue de biais à
 * distance de bar, 68 px étaient illisibles. La hitbox (SIM.HITBOX_*) reste
 * celle de la simulation : le sprite déborde donc un peu sans tuer, ce qui
 * rend le jeu plus tolérant, pas plus dur.
 */
export const BIRD_RENDER_SCALE = 1.5;
export const BIRD_SCALE = (SIM.BIRD_W * BIRD_RENDER_SCALE) / BIRD_TEX_W;

export class BirdActor {
  readonly sprite: Phaser.GameObjects.Sprite;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private tilt = 0;
  private dead = false;
  private fallState = { fall: 0, angle: 0, alpha: 1 };
  private deathTweens: Phaser.Tweens.Tween[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    theme: FlapTheme,
    reduced: boolean,
  ) {
    this.sprite = scene.add.sprite(SIM.BIRD_X, SIM.BIRD_START_Y, ATLAS_KEY, FRAME.bird[0]).setScale(BIRD_SCALE).setDepth(50);
    this.sprite.play(BIRD_ANIM);
    if (!reduced && theme.trail) {
      this.trail = scene.add
        .particles(0, 0, ATLAS_KEY, {
          frame: FRAME.particle,
          follow: this.sprite,
          followOffset: { x: -26, y: 6 },
          lifespan: 520,
          speedX: { min: -220, max: -140 },
          speedY: { min: -25, max: 25 },
          scale: { start: 0.55, end: 0 },
          alpha: { start: 0.75, end: 0 },
          frequency: 34,
          quantity: 1,
          maxAliveParticles: theme.trail.count,
          tint: hexToInt(theme.trail.tint),
          blendMode: 'ADD',
          emitting: false,
        })
        .setDepth(45);
    }
  }

  /** ordonnée du flottement d'attente (partagée avec le fondu de départ) */
  static bobY(time: number): number {
    return SIM.BIRD_START_Y + Math.sin(time / 320) * 16;
  }

  /** attente / compte à rebours : flotte doucement à sa place */
  idle(time: number): void {
    this.sprite.setPosition(SIM.BIRD_X, BirdActor.bobY(time));
    this.sprite.setAngle(Math.sin(time / 320 + 1) * 6);
  }

  render(x: number, y: number, vy: number, deltaMs: number): void {
    if (this.dead) {
      this.sprite.setPosition(x, y + this.fallState.fall);
      this.sprite.setAngle(this.fallState.angle);
      this.sprite.setAlpha(this.fallState.alpha);
      return;
    }
    const target = Phaser.Math.Clamp(vy * 0.065, -22, 22);
    this.tilt += (target - this.tilt) * Math.min(1, deltaMs / 70);
    this.sprite.setPosition(x, y);
    this.sprite.setAngle(this.tilt);
  }

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
    if (!visible) this.trail?.stop();
  }

  setTrail(on: boolean): void {
    if (!this.trail) return;
    if (on) {
      if (!this.trail.emitting) this.trail.start();
    } else {
      this.trail.stop();
    }
  }

  flap(): void {
    if (this.dead) return;
    this.sprite.setScale(BIRD_SCALE * 0.86, BIRD_SCALE * 1.16);
    this.scene.tweens.add({ targets: this.sprite, scaleX: BIRD_SCALE, scaleY: BIRD_SCALE, duration: 150, ease: 'Quad.easeOut' });
    this.sprite.anims.timeScale = 2.2;
    this.scene.time.delayedCall(220, () => {
      this.sprite.anims.timeScale = 1;
    });
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.trail?.stop();
    this.sprite.anims.stop();
    this.sprite.setTint(0xff7a7a);
    this.fallState = { fall: 0, angle: this.tilt, alpha: 1 };
    this.deathTweens = [
      this.scene.tweens.add({ targets: this.fallState, fall: 460, angle: 95, duration: 900, ease: 'Quad.easeIn' }),
      this.scene.tweens.add({ targets: this.fallState, alpha: 0.25, delay: 450, duration: 450 }),
    ];
  }

  reset(): void {
    for (const tween of this.deathTweens) tween.stop();
    this.deathTweens = [];
    this.dead = false;
    this.tilt = 0;
    this.fallState = { fall: 0, angle: 0, alpha: 1 };
    this.sprite.clearTint();
    this.sprite.setAlpha(1);
    this.sprite.setScale(BIRD_SCALE);
    this.sprite.setAngle(0);
    this.sprite.anims.timeScale = 1;
    this.sprite.play(BIRD_ANIM);
    this.trail?.stop();
  }
}
