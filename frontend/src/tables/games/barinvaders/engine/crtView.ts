/**
 * Compositeur « tube néon » : l'écran 224x256 de la borne est agrandi x4 au
 * plus proche voisin (pixels nets, 896x1024 sur la dalle), sur deux halos
 * additifs obtenus en réduisant puis en ré-agrandissant l'image avec
 * lissage. Tout passe par drawImage sur des canvas 2D, accéléré par le GPU
 * de Chrome : pas de shader, pas de moteur de rendu. Les scanlines et le
 * vignettage sont en CSS par-dessus (cf. inv.css).
 *
 * Mode perf réduit : pixels nets seulement, sans halo.
 */

import { SCREEN_H, SCREEN_W } from './screen';

export const SCALE = 4;
export const VIEW_W = SCREEN_W * SCALE;
export const VIEW_H = SCREEN_H * SCALE;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  return { canvas, ctx };
}

export class CrtView {
  /** tampon RGBA de l'écran 224x256, à peindre avant present() */
  readonly pixels: Uint32Array;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly base: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  private readonly half: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  private readonly quarter: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  private readonly w: number;
  private readonly h: number;
  private reduced = false;

  /** `scale` : agrandissement entier de l'écran d'origine (4 en partie, 2 pour la vitrine du lobby) */
  constructor(canvas: HTMLCanvasElement, scale = SCALE) {
    this.w = SCREEN_W * scale;
    this.h = SCREEN_H * scale;
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas 2D indisponible');
    this.ctx = ctx;
    this.base = makeCanvas(SCREEN_W, SCREEN_H);
    this.half = makeCanvas(SCREEN_W / 2, SCREEN_H / 2);
    this.quarter = makeCanvas(SCREEN_W / 4, SCREEN_H / 4);
    this.image = this.base.ctx.createImageData(SCREEN_W, SCREEN_H);
    this.pixels = new Uint32Array(this.image.data.buffer);
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  present(): void {
    this.base.ctx.putImageData(this.image, 0, 0);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';
    if (!this.reduced) {
      // halo large : image réduite au quart puis ré-agrandie avec lissage
      this.half.ctx.clearRect(0, 0, SCREEN_W / 2, SCREEN_H / 2);
      this.half.ctx.imageSmoothingEnabled = true;
      this.half.ctx.drawImage(this.base.canvas, 0, 0, SCREEN_W / 2, SCREEN_H / 2);
      this.quarter.ctx.clearRect(0, 0, SCREEN_W / 4, SCREEN_H / 4);
      this.quarter.ctx.imageSmoothingEnabled = true;
      this.quarter.ctx.drawImage(this.half.canvas, 0, 0, SCREEN_W / 4, SCREEN_H / 4);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.quarter.canvas, 0, 0, this.w, this.h);
      // halo proche : moitié de résolution
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.half.canvas, 0, 0, this.w, this.h);
      // bord adouci des pixels
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.base.canvas, 0, 0, this.w, this.h);
    }
    // pixels nets par-dessus (additif : le noir n'efface pas les halos)
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base.canvas, 0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';
  }
}
