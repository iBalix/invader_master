/**
 * Flappy Bar : simulation déterministe partagée serveur / dalles.
 *
 * COPIE IDENTIQUE dans :
 *   - backend/src/games/flappybar/flapSim.ts
 *   - frontend/src/tables/games/flappybar/sim/flapSim.ts
 * `scripts/check-flap-sim.js` (lancé par `npm run lint` à la racine) échoue si
 * les deux copies divergent. Railway construit backend/ et frontend/ depuis
 * deux racines séparées : un dossier partagé n'est pas importable des deux côtés.
 *
 * Pourquoi déterministe : tous les joueurs d'une manche affrontent le même
 * niveau (même seed) et chaque dalle rejoue les adversaires à partir de leurs
 * seuls flaps (fantômes). Le serveur rejoue de la même façon les flaps déclarés
 * à la mort pour calculer la distance officielle. Un même (seed, flaps) doit
 * donc donner exactement le même résultat sous Node et sous Chrome :
 *   - aucun import, aucune dépendance ;
 *   - uniquement + - * /, Math.floor, Math.imul et des comparaisons (pas de
 *     fonction transcendante dont l'arrondi pourrait varier d'un moteur à l'autre) ;
 *   - le PRNG (mulberry32) n'est tiré qu'à l'apparition des tuyaux, à des frames
 *     fixes indépendantes des entrées : le niveau ne dépend que du seed.
 *
 * Constantes héritées de l'ancien "Flappy Neon" du bar (Phaser 3 + Arcade),
 * converties en pas de 1/60 s. Différences assumées : les points sont comptés
 * quand l'oiseau PASSE un tuyau (le legacy comptait à l'apparition) et le trou
 * se resserre avec l'INDEX du tuyau (le legacy utilisait le score du joueur,
 * incompatible avec un niveau commun).
 *
 * Ordre d'une frame (`stepSim`) :
 *   1. flap éventuel (vy = FLAP_VY)
 *   2. gravité puis position
 *   3. clamp sol / plafond (vy remis à 0), ne tue pas (règle legacy)
 *   4. défilement : scroll += v*dt, tuyaux déplacés d'autant
 *   5. apparition d'un tuyau toutes les PIPE_EVERY frames (frame 0 incluse), seul
 *      tirage du PRNG
 *   6. tuyaux passés => pipesPassed, mise à jour de la vitesse
 *   7. collision AABB avec les tuyaux => mort (deathFrame = frame courante)
 *   8. purge des tuyaux sortis à gauche
 *   9. frame += 1
 *
 * Conséquence utile : la vitesse ne dépend que des tuyaux passés, qui ne
 * dépendent que du temps pour un joueur vivant. Tous les joueurs vivants ont
 * donc exactement les mêmes tuyaux aux mêmes positions à une frame donnée.
 */

export const SIM = {
  /** pas fixe */
  FPS: 60,
  DT: 1 / 60,
  /** monde = dalle 1080p */
  WIDTH: 1920,
  HEIGHT: 1080,
  /** px/s² */
  GRAVITY: 800,
  /** vitesse verticale imposée par un flap, px/s */
  FLAP_VY: -300,
  /** abscisse fixe de l'oiseau (centre) */
  BIRD_X: 480,
  /** ordonnée de départ (centre) */
  BIRD_START_Y: 540,
  /** taille affichée du sprite (34x24 legacy, échelle 2) */
  BIRD_W: 68,
  BIRD_H: 48,
  /** hitbox centrée sur l'oiseau (20x20 texture x2 legacy) */
  HITBOX_W: 40,
  HITBOX_H: 40,
  /** défilement px/s : base, palier tous les PIPES_PER_STEP tuyaux, plafond */
  SCROLL_BASE: 200,
  SCROLL_STEP: 30,
  SCROLL_MAX: 800,
  PIPES_PER_STEP: 5,
  /** un tuyau toutes les 2 s, apparaît hors écran à droite */
  PIPE_EVERY: 120,
  PIPE_SPAWN_X: 2000,
  PIPE_W: 80,
  /** trou : 280 px au départ, 160 px atteint au 10e tuyau (index 0 = premier) */
  GAP_MAX: 280,
  GAP_MIN: 160,
  GAP_RAMP_PIPES: 10,
  /** le centre du trou bouge de 150 px max d'un tuyau au suivant, 50 px des bords */
  GAP_SHIFT_MAX: 150,
  GAP_MARGIN: 50,
  GAP_START_CENTER: 540,
  /** 100 px de défilement = 1 m (2 m/s au départ, 8 m/s au plafond) */
  PX_PER_METER: 100,
  /** durée max d'une manche : 5 min à 60 Hz */
  MAX_FRAMES: 18000,
} as const;

export interface SimPipe {
  /** index dans le niveau (0 = premier tuyau) */
  index: number;
  /** bord gauche */
  x: number;
  /** centre du trou */
  gapCenter: number;
  /** hauteur du trou */
  gap: number;
  passed: boolean;
}

export interface SimState {
  seed: number;
  frame: number;
  /** centre de l'oiseau */
  y: number;
  vy: number;
  /** défilement cumulé en px */
  scroll: number;
  /** vitesse de défilement courante px/s */
  speed: number;
  pipes: SimPipe[];
  nextPipeIndex: number;
  lastGapCenter: number;
  pipesPassed: number;
  flapCount: number;
  alive: boolean;
  deathFrame: number | null;
  /** état interne du PRNG (entier 32 bits) */
  rng: number;
}

/** mulberry32 : un pas de PRNG, renvoie un flottant dans [0, 1) et fait avancer l'état */
function nextRandom(state: SimState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** entier dans [min, max] inclus (comme Phaser.Math.Between du legacy) */
function randomBetween(state: SimState, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function speedForPipes(pipesPassed: number): number {
  const level = Math.floor(pipesPassed / SIM.PIPES_PER_STEP);
  const speed = SIM.SCROLL_BASE + level * SIM.SCROLL_STEP;
  return speed > SIM.SCROLL_MAX ? SIM.SCROLL_MAX : speed;
}

export function gapForPipe(index: number): number {
  const factor = index >= SIM.GAP_RAMP_PIPES ? 1 : index / SIM.GAP_RAMP_PIPES;
  return SIM.GAP_MAX - (SIM.GAP_MAX - SIM.GAP_MIN) * factor;
}

export function createSim(seed: number): SimState {
  return {
    seed: seed | 0,
    frame: 0,
    y: SIM.BIRD_START_Y,
    vy: 0,
    scroll: 0,
    speed: SIM.SCROLL_BASE,
    pipes: [],
    nextPipeIndex: 0,
    lastGapCenter: SIM.GAP_START_CENTER,
    pipesPassed: 0,
    flapCount: 0,
    alive: true,
    deathFrame: null,
    rng: seed | 0,
  };
}

export function cloneSim(state: SimState): SimState {
  return {
    ...state,
    pipes: state.pipes.map((p) => ({ ...p })),
  };
}

function spawnPipe(state: SimState): void {
  const index = state.nextPipeIndex;
  const gap = gapForPipe(index);
  const half = gap / 2;
  const minCenter = half + SIM.GAP_MARGIN;
  const maxCenter = SIM.HEIGHT - half - SIM.GAP_MARGIN;
  let lo = state.lastGapCenter - SIM.GAP_SHIFT_MAX;
  let hi = state.lastGapCenter + SIM.GAP_SHIFT_MAX;
  if (lo < minCenter) lo = minCenter;
  if (hi > maxCenter) hi = maxCenter;
  const gapCenter = randomBetween(state, Math.floor(lo), Math.floor(hi));
  state.pipes.push({ index, x: SIM.PIPE_SPAWN_X, gapCenter, gap, passed: false });
  state.lastGapCenter = gapCenter;
  state.nextPipeIndex = index + 1;
}

function collides(state: SimState, pipe: SimPipe): boolean {
  const halfW = SIM.HITBOX_W / 2;
  const halfH = SIM.HITBOX_H / 2;
  const left = SIM.BIRD_X - halfW;
  const right = SIM.BIRD_X + halfW;
  if (right <= pipe.x || left >= pipe.x + SIM.PIPE_W) return false;
  const top = state.y - halfH;
  const bottom = state.y + halfH;
  const gapTop = pipe.gapCenter - pipe.gap / 2;
  const gapBottom = pipe.gapCenter + pipe.gap / 2;
  return top < gapTop || bottom > gapBottom;
}

/**
 * Avance la simulation d'UNE frame. `flap` = le joueur a tapé pendant cette
 * frame. Sans effet une fois mort (l'état est figé à la frame de mort).
 */
export function stepSim(state: SimState, flap: boolean): void {
  if (!state.alive) return;
  if (state.frame >= SIM.MAX_FRAMES) return;

  // 1. flap
  if (flap) {
    state.vy = SIM.FLAP_VY;
    state.flapCount += 1;
  }

  // 2. gravité + position
  state.vy += SIM.GRAVITY * SIM.DT;
  state.y += state.vy * SIM.DT;

  // 3. sol / plafond : on bloque sans tuer (legacy)
  const halfH = SIM.HITBOX_H / 2;
  if (state.y > SIM.HEIGHT - halfH) {
    state.y = SIM.HEIGHT - halfH;
    state.vy = 0;
  } else if (state.y < halfH) {
    state.y = halfH;
    state.vy = 0;
  }

  // 4. défilement
  const dx = state.speed * SIM.DT;
  state.scroll += dx;
  for (let i = 0; i < state.pipes.length; i += 1) {
    state.pipes[i].x -= dx;
  }

  // 5. apparition (frame 0 incluse : premier tuyau immédiat, comme le legacy)
  if (state.frame % SIM.PIPE_EVERY === 0) {
    spawnPipe(state);
  }

  // 6. tuyaux passés
  const birdLeft = SIM.BIRD_X - SIM.HITBOX_W / 2;
  for (let i = 0; i < state.pipes.length; i += 1) {
    const pipe = state.pipes[i];
    if (!pipe.passed && pipe.x + SIM.PIPE_W < birdLeft) {
      pipe.passed = true;
      state.pipesPassed += 1;
    }
  }
  state.speed = speedForPipes(state.pipesPassed);

  // 7. collision
  for (let i = 0; i < state.pipes.length; i += 1) {
    if (collides(state, state.pipes[i])) {
      state.alive = false;
      state.deathFrame = state.frame;
      break;
    }
  }

  // 8. purge
  if (state.pipes.length > 0 && state.pipes[0].x + SIM.PIPE_W < -200) {
    state.pipes.shift();
  }

  // 9. frame suivante
  state.frame += 1;
}

/**
 * Rejoue une partie complète : `flapFrames` trié croissant (frames où le joueur
 * a tapé), jusqu'à `untilFrame` exclue ou jusqu'à la mort. Sert au serveur
 * (validation d'une mort déclarée) et aux dalles (fantômes, resynchronisation).
 */
export function simulate(seed: number, flapFrames: readonly number[], untilFrame: number): SimState {
  const state = createSim(seed);
  const limit = untilFrame > SIM.MAX_FRAMES ? SIM.MAX_FRAMES : untilFrame;
  let next = 0;
  while (state.alive && state.frame < limit) {
    while (next < flapFrames.length && flapFrames[next] < state.frame) next += 1;
    const flap = next < flapFrames.length && flapFrames[next] === state.frame;
    stepSim(state, flap);
  }
  return state;
}

export function metersOf(scrollPx: number): number {
  return Math.floor((scrollPx / SIM.PX_PER_METER) * 10) / 10;
}

export function frameToMs(frame: number): number {
  return Math.round((frame * 1000) / SIM.FPS);
}

/** liste de flaps valide : entiers, strictement croissants, dans la fenêtre */
export function isValidFlapList(flaps: unknown): flaps is number[] {
  if (!Array.isArray(flaps)) return false;
  let prev = -1;
  for (let i = 0; i < flaps.length; i += 1) {
    const f = flaps[i];
    if (typeof f !== 'number' || !Number.isInteger(f) || f < 0 || f > SIM.MAX_FRAMES) return false;
    if (f <= prev) return false;
    prev = f;
  }
  return true;
}
