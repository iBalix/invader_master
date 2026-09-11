/**
 * Décor en parallaxe : ciel fixe + bandes de tuiles (far/mid/near) + sol,
 * chacune à sa vitesse. Images juxtaposées et repositionnées à la main plutôt
 * que TileSprite : en WebGL1 le TileSprite ne boucle proprement qu'avec des
 * textures en puissance de deux, contrainte qu'on ne veut pas imposer aux
 * thèmes. Mode réduit : seules la bande mid et le sol restent.
 */

import Phaser from 'phaser';
import type { FlapTheme } from '../themes/types';
import { BG_GROUND_KEY, BG_SKY_KEY, GROUND_W, GROUND_Y, TILE_W, WORLD_W, bgLayerKey } from '../themes/types';

interface Band {
  speed: number;
  width: number;
  images: Phaser.GameObjects.Image[];
}

export class Parallax {
  readonly sky: Phaser.GameObjects.Image;
  private bands: Band[] = [];

  constructor(scene: Phaser.Scene, theme: FlapTheme, reduced: boolean) {
    this.sky = scene.add.image(0, 0, BG_SKY_KEY).setOrigin(0, 0).setDepth(0);
    const layers = reduced ? theme.layers.filter((layer) => layer.key === 'mid') : theme.layers;
    let depth = 1;
    for (const layer of layers) {
      this.bands.push(Parallax.band(scene, bgLayerKey(layer.key), TILE_W, layer.y, layer.speed, depth));
      depth += 1;
    }
    this.bands.push(Parallax.band(scene, BG_GROUND_KEY, GROUND_W, GROUND_Y, 1, 5));
  }

  private static band(scene: Phaser.Scene, key: string, width: number, y: number, speed: number, depth: number): Band {
    const count = Math.ceil(WORLD_W / width) + 1;
    const images: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < count; i += 1) {
      images.push(scene.add.image(i * width, y, key).setOrigin(0, 0).setDepth(depth));
    }
    return { speed, width, images };
  }

  /** `scroll` = défilement monde en px (celui de l'oiseau focus) */
  update(scroll: number): void {
    for (const band of this.bands) {
      let offset = -((scroll * band.speed) % band.width);
      if (offset > 0) offset -= band.width;
      for (let i = 0; i < band.images.length; i += 1) {
        band.images[i].x = offset + i * band.width;
      }
    }
  }
}
