/**
 * Effets budgétés par le mode perf : émetteur d'ambiance (étincelles, étoiles,
 * bulles, neige), éclat de mort, teinte du ciel aux paliers, pops de score en
 * BitmapText, flash. Normal : ambiance 40 max, éclat 40. Réduit : pas
 * d'ambiance, éclat 12, pas de flash ni de secousse.
 */

import Phaser from 'phaser';
import { hexToInt, hexToRgb } from '../themes/draw';
import type { FlapTheme } from '../themes/types';
import { ATLAS_KEY, FRAME, WORLD_H, WORLD_W } from '../themes/types';
import { FLAP_FONT } from './retroFont';

const AMBIENT_CAP = 40;
const POPS = 4;

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

export class Fx {
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private burstEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash: Phaser.GameObjects.Rectangle | null = null;
  private pops: Phaser.GameObjects.BitmapText[] = [];
  private popIndex = 0;
  private skyTint = { r: 255, g: 255, b: 255 };
  private tintTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: FlapTheme,
    private readonly reduced: boolean,
    private readonly sky: Phaser.GameObjects.Image,
  ) {
    this.burstEmitter = scene.add
      .particles(0, 0, ATLAS_KEY, {
        frame: [FRAME.puff, FRAME.spark],
        lifespan: { min: 380, max: 800 },
        speed: { min: 120, max: 420 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 500,
        tint: hexToInt(theme.palette.accent2),
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(70);
    if (!reduced) {
      this.ambient = this.makeAmbient();
      this.flash = scene.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0xffffff, 0).setDepth(90);
    }
    const accent = hexToInt(theme.palette.accent);
    for (let i = 0; i < POPS; i += 1) {
      this.pops.push(scene.add.bitmapText(0, 0, FLAP_FONT, '', 44).setOrigin(0.5).setDepth(80).setTint(accent).setVisible(false));
    }
  }

  private makeAmbient(): Phaser.GameObjects.Particles.ParticleEmitter | null {
    const { kind, count, tint } = this.theme.ambient;
    if (kind === 'none' || count <= 0) return null;
    const n = Math.min(AMBIENT_CAP, count);
    // Rectangle expose bien getRandomPoint, mais sa signature générique ne satisfait pas le type du callback
    const zone = (x: number, y: number, w: number, h: number) => ({
      type: 'random' as const,
      source: new Phaser.Geom.Rectangle(x, y, w, h) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource,
    });
    let config: EmitterConfig;
    switch (kind) {
      case 'sparks':
        config = {
          frame: FRAME.spark,
          emitZone: zone(0, 0, WORLD_W, WORLD_H),
          lifespan: 2600,
          speedX: { min: -120, max: -40 },
          speedY: { min: -30, max: 30 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 0.9, end: 0 },
          frequency: 2600 / n,
          blendMode: 'ADD',
        };
        break;
      case 'stars':
        config = {
          frame: FRAME.spark,
          emitZone: zone(WORLD_W, 0, 40, WORLD_H),
          lifespan: 1400,
          speedX: { min: -1500, max: -900 },
          scale: { start: 0.7, end: 0.3 },
          alpha: { start: 0.9, end: 0.2 },
          frequency: 1400 / n,
        };
        break;
      case 'bubbles':
        config = {
          frame: FRAME.particle,
          emitZone: zone(0, WORLD_H, WORLD_W, 20),
          lifespan: 6000,
          speedY: { min: -140, max: -60 },
          speedX: { min: -20, max: 20 },
          scale: { start: 0.2, end: 0.6 },
          alpha: { start: 0.55, end: 0 },
          frequency: 6000 / n,
        };
        break;
      default:
        config = {
          frame: FRAME.particle,
          emitZone: zone(0, -20, WORLD_W + 200, 20),
          lifespan: 9000,
          speedY: { min: 40, max: 110 },
          speedX: { min: -70, max: -20 },
          scale: { min: 0.15, max: 0.4 },
          alpha: 0.85,
          frequency: 9000 / n,
        };
        break;
    }
    return this.scene.add
      .particles(0, 0, ATLAS_KEY, { ...config, tint: hexToInt(tint), maxAliveParticles: n, quantity: 1 })
      .setDepth(8);
  }

  /** éclat de mort (big) ou petite bouffée (fantôme) */
  burst(x: number, y: number, big: boolean): void {
    const count = big ? (this.reduced ? 12 : 40) : this.reduced ? 4 : 10;
    this.burstEmitter.explode(count, x, y);
  }

  shake(): void {
    if (!this.reduced) this.scene.cameras.main.shake(250, 0.006);
  }

  /** palier de 100 m n° `index` (1 = premier) : le ciel glisse vers la teinte suivante */
  milestone(index: number): void {
    const tints = this.theme.milestoneTints;
    if (tints.length > 0) {
      const target = hexToRgb(tints[Math.min(index - 1, tints.length - 1)]);
      const from = { ...this.skyTint };
      const holder = { t: 0 };
      this.tintTween?.stop();
      this.tintTween = this.scene.tweens.add({
        targets: holder,
        t: 1,
        duration: 1500,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const r = Math.round(from.r + (target.r - from.r) * holder.t);
          const g = Math.round(from.g + (target.g - from.g) * holder.t);
          const b = Math.round(from.b + (target.b - from.b) * holder.t);
          this.skyTint = { r, g, b };
          this.sky.setTint((r << 16) | (g << 8) | b);
        },
      });
    }
    if (this.flash) {
      this.flash.setAlpha(0);
      this.scene.tweens.add({ targets: this.flash, alpha: 0.22, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  resetSky(): void {
    this.tintTween?.stop();
    this.tintTween = null;
    this.skyTint = { r: 255, g: 255, b: 255 };
    this.sky.clearTint();
  }

  scorePop(x: number, y: number, text: string): void {
    const pop = this.pops[this.popIndex];
    this.popIndex = (this.popIndex + 1) % POPS;
    pop.setText(text).setPosition(x, y).setAlpha(1).setScale(1).setVisible(true);
    this.scene.tweens.add({
      targets: pop,
      y: y - 70,
      alpha: 0,
      scale: 1.25,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => {
        pop.setVisible(false);
      },
    });
  }

  /** l'émetteur d'ambiance existe-t-il (debug) */
  hasAmbient(): boolean {
    return this.ambient !== null;
  }
}
