/**
 * Réserve de 8 paires de tuyaux repositionnées à chaque frame depuis la sim
 * focus : corps étiré depuis la tuile de 256 px (détail uniquement
 * horizontal, l'étirement est invisible) + chapeaux. Le sol est dessiné
 * DERRIÈRE les tuyaux : un trou collé au bas de l'écran laisse un tuyau de
 * 50 px qui doit rester visible.
 */

import Phaser from 'phaser';
import type { SimPipe } from '../sim/flapSim';
import { ATLAS_KEY, FRAME, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from '../themes/types';

const POOL = 8;
/** débord au-dessus / au-dessous de l'écran (secousse de caméra) */
const OVER = 60;
const CAP_OVERHANG = (PIPE_CAP_W - PIPE_BODY_W) / 2;

interface Pair {
  topBody: Phaser.GameObjects.Image;
  topCap: Phaser.GameObjects.Image;
  botBody: Phaser.GameObjects.Image;
  botCap: Phaser.GameObjects.Image;
}

export class PipePool {
  private pairs: Pair[] = [];

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < POOL; i += 1) {
      const make = (frame: string, depth: number) =>
        scene.add.image(0, 0, ATLAS_KEY, frame).setOrigin(0, 0).setDepth(depth).setVisible(false);
      this.pairs.push({
        topBody: make(FRAME.pipeBody, 20),
        topCap: make(FRAME.pipeCap, 21).setFlipY(true),
        botBody: make(FRAME.pipeBody, 20),
        botCap: make(FRAME.pipeCap, 21),
      });
    }
  }

  /** `lead` = rattrapage d'interpolation (px), `shift` = décalage caméra (px) */
  render(pipes: readonly SimPipe[], lead: number, shift: number): void {
    for (let i = 0; i < POOL; i += 1) {
      const pair = this.pairs[i];
      const pipe = pipes[i];
      if (!pipe) {
        PipePool.hide(pair);
        continue;
      }
      const x = pipe.x + lead - shift;
      if (x > WORLD_W + 10 || x + PIPE_BODY_W < -10) {
        PipePool.hide(pair);
        continue;
      }
      const gapTop = pipe.gapCenter - pipe.gap / 2;
      const gapBottom = pipe.gapCenter + pipe.gap / 2;
      pair.topBody
        .setPosition(x, -OVER)
        .setDisplaySize(PIPE_BODY_W, Math.max(1, gapTop - PIPE_CAP_H + OVER))
        .setVisible(true);
      pair.topCap.setPosition(x - CAP_OVERHANG, gapTop - PIPE_CAP_H).setVisible(true);
      pair.botCap.setPosition(x - CAP_OVERHANG, gapBottom).setVisible(true);
      pair.botBody
        .setPosition(x, gapBottom + PIPE_CAP_H)
        .setDisplaySize(PIPE_BODY_W, Math.max(1, WORLD_H + OVER - (gapBottom + PIPE_CAP_H)))
        .setVisible(true);
    }
  }

  hideAll(): void {
    for (const pair of this.pairs) PipePool.hide(pair);
  }

  setAlpha(alpha: number): void {
    for (const pair of this.pairs) {
      pair.topBody.setAlpha(alpha);
      pair.topCap.setAlpha(alpha);
      pair.botBody.setAlpha(alpha);
      pair.botCap.setAlpha(alpha);
    }
  }

  private static hide(pair: Pair): void {
    pair.topBody.setVisible(false);
    pair.topCap.setVisible(false);
    pair.botBody.setVisible(false);
    pair.botCap.setVisible(false);
  }
}
