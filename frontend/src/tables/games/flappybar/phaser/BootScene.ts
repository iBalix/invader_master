/**
 * Scène de boot : attend la police, génère UN atlas canvas (2048x1024, shelf
 * packer), les toiles de fond du thème et la police bitmap, puis lance la
 * scène de jeu et signale `ready` au pont. Aucun fichier chargé.
 */

import Phaser from 'phaser';
import type { FlapBridge } from './bridge';
import { getFlapTheme } from '../themes';
import { drawParticleFrames } from '../themes/draw';
import type { AtlasBuilder, BackdropBuilder, DrawFn, FlapTheme } from '../themes/types';
import {
  ATLAS_H,
  ATLAS_KEY,
  ATLAS_W,
  BG_GROUND_KEY,
  BG_SKY_KEY,
  GROUND_H,
  GROUND_W,
  TILE_W,
  WORLD_H,
  WORLD_W,
  bgLayerKey,
  FRAME,
} from '../themes/types';
import { buildRetroFont } from './retroFont';

const FONT_TIMEOUT_MS = 1500;
const FONT_FAMILY = '"Bebas Neue", "Arial Narrow", sans-serif';
const PAD = 2;

/** rangement en étagères : simple et suffisant pour une dizaine de cases */
class ShelfPacker {
  private x = 0;
  private y = 0;
  private rowH = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  place(w: number, h: number): { x: number; y: number } | null {
    if (this.x + w > this.width) {
      this.x = 0;
      this.y += this.rowH + PAD;
      this.rowH = 0;
    }
    if (this.y + h > this.height) return null;
    const slot = { x: this.x, y: this.y };
    this.x += w + PAD;
    if (h > this.rowH) this.rowH = h;
    return slot;
  }
}

async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const load = document.fonts
    .load('40px "Bebas Neue"')
    .then(() => undefined)
    .catch(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, FONT_TIMEOUT_MS);
  });
  await Promise.race([load, timeout]);
}

export class BootScene extends Phaser.Scene {
  private alive = true;

  constructor() {
    super('boot');
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.alive = false;
    });
    void this.build();
  }

  private async build(): Promise<void> {
    const bridge = this.registry.get('bridge') as FlapBridge;
    const theme = getFlapTheme(bridge.store.getState().themeId);
    await fontsReady();
    if (!this.alive) return;
    try {
      this.buildAtlas(theme);
      this.buildBackdrops(theme);
      buildRetroFont(this, FONT_FAMILY, 48, theme.pixel);
    } catch (err) {
      console.error('[flappybar] génération des textures', err);
    }
    if (!this.alive) return;
    this.scene.start('play');
    bridge.fromScene.emit('ready');
  }

  private buildAtlas(theme: FlapTheme): void {
    const tex = this.textures.createCanvas(ATLAS_KEY, ATLAS_W, ATLAS_H);
    if (!tex) return;
    const ctx = tex.getContext();
    const packer = new ShelfPacker(ATLAS_W, ATLAS_H);
    const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
    const builder: AtlasBuilder = {
      frame: (name, w, h, draw) => {
        const slot = packer.place(w, h);
        if (!slot) {
          console.warn('[flappybar] atlas plein, case ignorée', name);
          return;
        }
        rects.set(name, { x: slot.x, y: slot.y, w, h });
        ctx.save();
        ctx.translate(slot.x, slot.y);
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        draw(ctx, w, h);
        ctx.restore();
        tex.add(name, 0, slot.x, slot.y, w, h);
      },
    };
    drawParticleFrames(builder);
    theme.drawAtlas(builder);
    // Adversaires en nuances de gris : recopie des frames de l'oiseau avec un
    // filtre canvas, une fois au boot. Zéro coût au rendu (pas de post-FX),
    // et le joueur reconnaît son propre oiseau, le seul en couleur.
    FRAME.bird.forEach((birdName, i) => {
      const src = rects.get(birdName);
      if (!src) return;
      builder.frame(FRAME.ghost[i], src.w, src.h, (c, w, h) => {
        c.filter = 'grayscale(1) brightness(1.08)';
        c.drawImage(tex.canvas, src.x, src.y, src.w, src.h, 0, 0, w, h);
        c.filter = 'none';
      });
    });
    tex.refresh();
    if (theme.pixel) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private buildBackdrops(theme: FlapTheme): void {
    const paint = (key: string, w: number, h: number, draw: DrawFn) => {
      if (this.textures.exists(key)) return;
      const tex = this.textures.createCanvas(key, w, h);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      draw(ctx, w, h);
      ctx.restore();
      tex.refresh();
      if (theme.pixel) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    };
    const builder: BackdropBuilder = {
      sky: (draw) => paint(BG_SKY_KEY, WORLD_W, WORLD_H, draw),
      layer: (key, height, draw) => paint(bgLayerKey(key), TILE_W, height, draw),
      ground: (draw) => paint(BG_GROUND_KEY, GROUND_W, GROUND_H, draw),
    };
    theme.drawBackdrops(builder);
    // filets de sécurité : une tuile jamais dessinée devient transparente
    paint(BG_SKY_KEY, WORLD_W, WORLD_H, () => undefined);
    paint(BG_GROUND_KEY, GROUND_W, GROUND_H, () => undefined);
    for (const layer of theme.layers) paint(bgLayerKey(layer.key), TILE_W, layer.height, () => undefined);
  }
}
