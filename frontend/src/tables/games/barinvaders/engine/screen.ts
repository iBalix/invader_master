/**
 * Peinture de l'écran 224x256 de la borne dans un tampon RGBA : la mémoire
 * vidéo de la sim (qui contient tout le terrain de jeu), puis le HUD
 * d'origine aux places relevées dans la ROM.
 *
 *   y=8   « SCORE<1> »  « HI-SCORE »  « VAGUE » (à la place de SCORE<2>)
 *   y=24  score (x=24), record du bar (x=88), numéro de vague
 *   y=239 ligne de sol
 *   y=240 nombre de canons (x=8), canons de réserve (x=24, 40...), libellé (x=136)
 *
 * La bannière (« GAME OVER », « VAGUE 02 ») s'écrit lettre par lettre comme
 * les messages de la borne ; c'est l'appelant qui fait avancer `chars`.
 */

import { PLAYER_SPR, type InvSimState } from '../sim/invSim';
import { PX_BLACK, zoneColorMap } from '../art/palette';
import { drawColumns, drawText } from '../art/font';

export const SCREEN_W = 224;
export const SCREEN_H = 256;

export interface ScreenBanner {
  text: string;
  x: number;
  y: number;
  /** caractères déjà écrits */
  chars: number;
}

export interface ScreenHud {
  /** record du bar (affiché en HI-SCORE, dépassé en direct par le score) */
  hiScore: number;
  /** libellé en bas à droite : pseudo du joueur affiché */
  label: string;
  banner: ScreenBanner | null;
}

function drawNumber(px: Uint32Array, colors: Uint32Array, value: number, rightX: number, y: number, minDigits: number): void {
  const text = String(Math.max(0, Math.floor(value))).padStart(minDigits, '0');
  drawText(px, colors, text, rightX - text.length * 8, y);
}

export function paintScreen(px: Uint32Array, s: InvSimState, hud: ScreenHud): void {
  const colors = zoneColorMap();
  px.fill(PX_BLACK);

  // mémoire vidéo : colonne par colonne, bit 0 = bas de l'écran
  const fb = s.fb;
  for (let col = 0; col < SCREEN_W; col += 1) {
    const base = col * 32;
    for (let byte = 0; byte < 32; byte += 1) {
      const v = fb[base + byte];
      if (v === 0) continue;
      for (let k = 0; k < 8; k += 1) {
        if (((v >> k) & 1) === 0) continue;
        const i = (255 - (byte * 8 + k)) * SCREEN_W + col;
        px[i] = colors[i];
      }
    }
  }

  // en-tête et scores
  drawText(px, colors, 'SCORE<1>', 8, 8);
  drawText(px, colors, 'HI-SCORE', 80, 8);
  drawText(px, colors, 'VAGUE', 164, 8);
  drawNumber(px, colors, s.score, 56, 24, 4);
  drawNumber(px, colors, Math.max(hud.hiScore, s.score), 120, 24, 4);
  drawNumber(px, colors, s.wave, 192, 24, 2);

  // sol
  const ground = 239 * SCREEN_W;
  for (let x = 0; x < SCREEN_W; x += 1) px[ground + x] = colors[ground + x];

  // canons : le nombre, puis les canons de réserve
  const lives = Math.max(0, s.lives);
  drawText(px, colors, String(Math.min(lives, 9)), 8, 240);
  const reserve = Math.min(Math.max(0, lives - 1), 6);
  for (let k = 0; k < reserve; k += 1) drawColumns(px, colors, PLAYER_SPR, 24 + 16 * k, 240);

  if (hud.label) drawText(px, colors, hud.label.slice(0, 11), 136, 240);

  if (hud.banner && hud.banner.chars > 0) {
    drawText(px, colors, hud.banner.text.slice(0, hud.banner.chars), hud.banner.x, hud.banner.y);
  }
}
