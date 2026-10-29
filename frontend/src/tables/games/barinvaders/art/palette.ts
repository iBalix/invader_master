/**
 * Palette unique de Bar Invaders : la borne de 1978 en néon.
 *
 * L'écran d'origine est monochrome : les couleurs viennent de bandes de
 * cellophane collées sur le tube. On les applique de la même façon, PAR
 * ZONE D'ÉCRAN et non par objet (un tir ennemi vire au vert en descendant),
 * avec les zones relevées dans le décor MAME (invaders.lay) :
 *   - rouge (soucoupe) : y 32-62 ;
 *   - vert (bunkers, canon, sol) : y 184-239, et sous le sol x 16-134 (vies) ;
 *   - blanc partout ailleurs.
 */

/** couleurs de l'écran, en CSS */
export const INV_COLORS = {
  white: '#e8f4ff',
  red: '#ff3d6e',
  green: '#3dff8a',
  black: '#000000',
  /** accents du bar pour le cadre et les panneaux */
  magenta: '#ff2bd6',
  cyan: '#33e2ff',
  violet: '#7b2bff',
  ink: '#05040b',
} as const;

/** accent du jeu (lobby, pop-up de présentation, boutons) */
export const INV_ACCENT = INV_COLORS.green;

function rgbaU32(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  // ImageData en mémoire petit-boutiste : 0xAABBGGRR
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export const PX_BLACK = rgbaU32(INV_COLORS.black);
export const PX_WHITE = rgbaU32(INV_COLORS.white);
export const PX_RED = rgbaU32(INV_COLORS.red);
export const PX_GREEN = rgbaU32(INV_COLORS.green);

/** couleur d'un pixel allumé selon sa place sur l'écran 224x256 */
function zoneColor(x: number, y: number): number {
  if (y >= 32 && y <= 62) return PX_RED;
  if (y >= 184 && y <= 239) return PX_GREEN;
  if (y >= 240 && x >= 16 && x <= 134) return PX_GREEN;
  return PX_WHITE;
}

let cached: Uint32Array | null = null;

/** carte des couleurs de zone, calculée une fois (index y * 224 + x) */
export function zoneColorMap(): Uint32Array {
  if (cached) return cached;
  const map = new Uint32Array(224 * 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 224; x += 1) map[y * 224 + x] = zoneColor(x, y);
  }
  cached = map;
  return map;
}
