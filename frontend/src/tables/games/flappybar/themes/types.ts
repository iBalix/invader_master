/**
 * Contrat des thèmes de Flappy Bar.
 *
 * ZÉRO image : chaque texture est dessinée en code (canvas 2D) au démarrage
 * de la scène. Un thème fournit deux générateurs :
 *   - `drawAtlas(b)` : les cases de l'atlas (oiseau x3, corps et chapeau de
 *     tuyau) via `b.frame(nom, w, h, draw)`. Le contexte passé à `draw` est
 *     déjà translaté sur la case (origine 0,0) et rogné à ses bords ;
 *   - `drawBackdrops(d)` : le ciel (1920x1080, fixe), les tuiles de parallaxe
 *     (1024 px de large, hauteur libre, DOIVENT boucler horizontalement) et la
 *     tuile de sol (512x120).
 *
 * Le halo est CUIT dans les textures (shadowBlur à la génération) : aucun
 * pipeline de post-traitement, trop coûteux pour les GPU intégrés des dalles.
 *
 * Ce fichier n'importe pas Phaser : les aperçus du lobby (FlapThemePreview)
 * réutilisent les mêmes générateurs sur un simple <canvas>.
 */

import type { FlapThemeId } from '../lib/flapTypes';

export type LayerKey = 'far' | 'mid' | 'near';

export interface FlapPalette {
  sky: string;
  skyBottom: string;
  accent: string;
  accent2: string;
  pipe: string;
  pipeEdge: string;
  bird: string;
  text: string;
  hudBg: string;
}

export interface ThemeLayer {
  key: LayerKey;
  /** facteur de défilement par rapport aux tuyaux (1 = solidaire du sol) */
  speed: number;
  /** ordonnée du haut de la tuile dans le monde 1920x1080 */
  y: number;
  height: number;
}

/** dessine dans un contexte dont l'origine est le coin haut-gauche de la zone w×h */
export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export interface AtlasBuilder {
  frame(name: string, w: number, h: number, draw: DrawFn): void;
}

export interface BackdropBuilder {
  /** ciel fixe 1920x1080 (WORLD_W x WORLD_H) */
  sky(draw: DrawFn): void;
  /** tuile de parallaxe TILE_W x height, bouclant horizontalement */
  layer(key: LayerKey, height: number, draw: DrawFn): void;
  /** tuile de sol GROUND_W x GROUND_H, bouclant horizontalement */
  ground(draw: DrawFn): void;
}

export type AmbientKind = 'sparks' | 'stars' | 'bubbles' | 'snow' | 'none';

export interface FlapTheme {
  id: FlapThemeId;
  label: string;
  palette: FlapPalette;
  /** rendu pixel art : filtre NEAREST sur toutes les textures */
  pixel: boolean;
  layers: ThemeLayer[];
  ambient: { kind: AmbientKind; count: number; tint: string };
  trail: { count: number; tint: string } | null;
  drawAtlas(b: AtlasBuilder): void;
  drawBackdrops(d: BackdropBuilder): void;
  /** teintes successives du ciel à chaque palier de 100 m (la dernière reste) */
  milestoneTints: string[];
}

/* ---------- géométrie partagée scène / thèmes / aperçus ---------- */

export const ATLAS_KEY = 'flap-atlas';
export const ATLAS_W = 2048;
export const ATLAS_H = 1024;
export const BG_SKY_KEY = 'flap-bg-sky';
export const BG_GROUND_KEY = 'flap-bg-ground';
export function bgLayerKey(key: LayerKey): string {
  return `flap-bg-${key}`;
}

export const WORLD_W = 1920;
export const WORLD_H = 1080;
export const TILE_W = 1024;
export const GROUND_W = 512;
export const GROUND_H = 120;
export const GROUND_Y = WORLD_H - GROUND_H;

/** l'oiseau est dessiné en 2x (136x96) et affiché en 68x48 */
export const BIRD_TEX_W = 136;
export const BIRD_TEX_H = 96;
export const PIPE_BODY_W = 80;
export const PIPE_BODY_H = 256;
/** le chapeau déborde de 8 px de chaque côté du corps (80 px = hitbox) */
export const PIPE_CAP_W = 96;
export const PIPE_CAP_H = 40;

export const FRAME = {
  bird: ['bird-0', 'bird-1', 'bird-2'],
  /** mêmes frames en nuances de gris : les adversaires (générées au boot à partir de bird-*) */
  ghost: ['ghost-0', 'ghost-1', 'ghost-2'],
  pipeBody: 'pipe-body',
  /** dessiné pour le tuyau du BAS (ouverture vers le haut), retourné pour le haut */
  pipeCap: 'pipe-cap',
  particle: 'particle',
  spark: 'spark',
  puff: 'puff',
} as const;
