/**
 * Bar Invaders : simulation déterministe partagée serveur / dalles.
 *
 * COPIE IDENTIQUE dans :
 *   - backend/src/games/barinvaders/invSim.ts
 *   - frontend/src/tables/games/barinvaders/sim/invSim.ts
 * `scripts/check-flap-sim.js` (lancé par `npm run lint` à la racine) échoue si
 * les deux copies divergent. Railway construit backend/ et frontend/ depuis
 * deux racines séparées : un dossier partagé n'est pas importable des deux côtés.
 *
 * Reprise de la logique de Space Invaders (Taito, 1978) d'après le
 * désassemblage commenté de computerarcheology.com (adresses ROM citées entre
 * crochets). Comme la borne, la sim tient une MÉMOIRE VIDÉO 1 bit (224
 * colonnes x 256 lignes) et chaque objet s'y dessine avec les primitives
 * d'origine : OU avec détection de collision, écrasement, effacement ET NON.
 * Les collisions au pixel, l'érosion des bunkers, les bunkers mangés par la
 * flotte, la détection des bords et l'effet de vague (un seul envahisseur
 * redessiné par frame) en découlent exactement comme sur la borne. Le rendu
 * des dalles lit directement cette mémoire.
 *
 * Coordonnées de la ROM conservées telles quelles : X = ligne de balayage
 * (colonne écran x = X - 0x20), Y = rang du bit depuis le BAS (ligne écran
 * y = 255 - Y). Les valeurs 8 bits bouclent (& 0xFF) comme sur le 8080.
 *
 * Pourquoi déterministe : le serveur rejoue les entrées déclarées à la fin
 * de partie pour fixer le score officiel, et chaque dalle rejoue ses
 * adversaires (panneau des joueurs, mode spectateur). Une même liste
 * d'entrées doit donc donner exactement le même état sous Node et sous Chrome :
 *   - aucun import, aucune dépendance ;
 *   - entiers seulement (+ - *, décalages et masques sur des octets) ;
 *   - aucun hasard : la borne n'en a pas, tout passe par des tables.
 *
 * Écarts assumés avec la borne :
 *   - score non plafonné (la borne repasse à 0 à 10 000 : incompatible avec
 *     les records) ;
 *   - un seul joueur par sim (chacun sa dalle, pas d'alternance) ;
 *   - au-delà de la vague 1, la vague accélère (flotte, recharge et vitesse
 *     des tirs) : cf. DIFFICULTY ;
 *   - le dernier envahisseur (pas de 3 px) efface sa colonne de traîne ;
 *   - les lectures hors de la table des envahisseurs (bugs de la ROM qui
 *     lisent d'autres octets de la RAM) sont traitées comme « personne ».
 *
 * Ordre d'une frame (`stepSim`), calqué sur les deux interruptions vidéo puis
 * la boucle principale de la borne :
 *   1. minuterie du son de flotte [1740] et de la soucoupe [0913]
 *   2. objet canon [028E], objet tir du canon [03BB]
 *   3. UN des trois tirs ennemis, à tour de rôle (roulant, piston, zigzag ou
 *      soucoupe) [0476, 04B6, 0682]
 *   4. flotte : dessin de l'envahisseur courant puis curseur suivant
 *      [0100, 0141], ou minuterie d'explosion d'un envahisseur
 *   5. boucle principale : tir [1618], impact du tir [14D8], rebond aux bords
 *      [1597], comptage, recharge des tirs ennemis [170E], vie bonus [0935],
 *      vitesse des tirs [08D8], tempo de la marche [1775]
 */

export const SIM = {
  /** pas fixe */
  FPS: 60,
  /** écran d'origine (vertical) */
  WIDTH: 224,
  HEIGHT: 256,
  /** 20 min : plafond d'une manche */
  MAX_FRAMES: 72_000,
  START_LIVES: 3,
  EXTRA_LIFE_SCORE: 1500,
  /** octets de la mémoire vidéo : 224 colonnes de 32 octets */
  FB_BYTES: 224 * 32,
  /** entrées : bits du masque */
  IN_LEFT: 1,
  IN_RIGHT: 2,
  IN_FIRE: 4,
  /** plafond de changements d'entrée par seconde de jeu (anti-abus) */
  MAX_INPUTS_PER_SEC: 30,
} as const;

/** événements d'une frame, pour les sons et les effets (ignorés côté serveur) */
export const EV = {
  SHOT: 1,
  INVADER_HIT: 2,
  PLAYER_HIT: 4,
  UFO_ON: 8,
  UFO_OFF: 16,
  UFO_HIT: 32,
  UFO_SCORE: 64,
  EXTRA_LIFE: 128,
  FLEET_NOTE: 256,
  WAVE_START: 512,
  WAVE_CLEAR: 1024,
  GAME_OVER: 2048,
  SHOT_MISS: 4096,
} as const;

/**
 * Accélération au-delà de la vague 1 (choix produit : parties de 3 à 8 min).
 * La vague 1 est strictement celle de la borne.
 *   - fleetRate : envahisseurs redessinés par frame, en huitièmes (8 = 1,
 *     la borne) ;
 *   - reloadPct : recharge des tirs ennemis en % de la table d'origine ;
 *   - shotBonus : pixels ajoutés au pas de chute des tirs ennemis.
 */
export const DIFFICULTY = {
  FLEET_RATE_BASE: 8,
  FLEET_RATE_PER_WAVE: 1,
  FLEET_RATE_MAX: 16,
  RELOAD_PCT_PER_WAVE: 10,
  RELOAD_PCT_MIN: 50,
  RELOAD_MIN: 4,
  SHOT_BONUS_FROM_WAVE: 4,
} as const;

// ---------------------------------------------------------------------------
// Images de la ROM : un octet par colonne, bit 0 = pixel du BAS
// ---------------------------------------------------------------------------

/** envahisseurs [1C00..1C5F] : [animation][type], type 0 = poulpe (rangées 0-1), 1 = crabe (2-3), 2 = calmar (4) */
export const ALIEN_SPR: readonly (readonly (readonly number[])[])[] = [
  [
    [0x00, 0x00, 0x39, 0x79, 0x7a, 0x6e, 0xec, 0xfa, 0xfa, 0xec, 0x6e, 0x7a, 0x79, 0x39, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x78, 0x1d, 0xbe, 0x6c, 0x3c, 0x3c, 0x3c, 0x6c, 0xbe, 0x1d, 0x78, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00, 0x19, 0x3a, 0x6d, 0xfa, 0xfa, 0x6d, 0x3a, 0x19, 0x00, 0x00, 0x00, 0x00],
  ],
  [
    [0x00, 0x00, 0x38, 0x7a, 0x7f, 0x6d, 0xec, 0xfa, 0xfa, 0xec, 0x6d, 0x7f, 0x7a, 0x38, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x0e, 0x18, 0xbe, 0x6d, 0x3d, 0x3c, 0x3d, 0x6d, 0xbe, 0x18, 0x0e, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00, 0x1a, 0x3d, 0x68, 0xfc, 0xfc, 0x68, 0x3d, 0x1a, 0x00, 0x00, 0x00, 0x00],
  ],
];

/** canon [1C60] */
export const PLAYER_SPR: readonly number[] = [
  0x00, 0x00, 0x0f, 0x1f, 0x1f, 0x1f, 0x1f, 0x7f, 0xff, 0x7f, 0x1f, 0x1f, 0x1f, 0x1f, 0x0f, 0x00,
];

/** explosion du canon, 2 images [1C70, 1C80] */
export const PLAYER_BLOW_SPR: readonly (readonly number[])[] = [
  [0x00, 0x04, 0x01, 0x13, 0x03, 0x07, 0xb3, 0x0f, 0x2f, 0x03, 0x2f, 0x49, 0x04, 0x03, 0x00, 0x01],
  [0x40, 0x08, 0x05, 0xa3, 0x0a, 0x03, 0x5b, 0x0f, 0x27, 0x27, 0x0b, 0x4b, 0x40, 0x84, 0x11, 0x48],
];

/** tir du canon [1C90] et son explosion, masque d'érosion [1C91] */
const PSHOT_SPR: readonly number[] = [0x0f];
const PSHOT_EXPLO_SPR: readonly number[] = [0x99, 0x3c, 0x7e, 0x3d, 0xbc, 0x3e, 0x7c, 0x99];

/** explosion d'un envahisseur [1CC0] */
const ALIEN_EXPLO_SPR: readonly number[] = [
  0x00, 0x08, 0x49, 0x22, 0x14, 0x81, 0x42, 0x00, 0x42, 0x81, 0x14, 0x22, 0x49, 0x08, 0x00, 0x00,
];

/** tirs ennemis, 4 images de 3 colonnes : roulant [1CEE], piston [1CE2], zigzag [1CD0] */
const ASHOT_SPR: readonly (readonly (readonly number[])[])[] = [
  [
    [0x00, 0xfe, 0x00],
    [0x24, 0xfe, 0x12],
    [0x00, 0xfe, 0x00],
    [0x48, 0xfe, 0x90],
  ],
  [
    [0x04, 0xfc, 0x04],
    [0x10, 0xfc, 0x10],
    [0x20, 0xfc, 0x20],
    [0x80, 0xfc, 0x80],
  ],
  [
    [0x44, 0xaa, 0x10],
    [0x88, 0x54, 0x22],
    [0x10, 0xaa, 0x44],
    [0x22, 0x54, 0x88],
  ],
];

/** explosion d'un tir ennemi, masque d'érosion [1CDC] */
const ASHOT_EXPLO_SPR: readonly number[] = [0x4a, 0x15, 0xbe, 0x3f, 0x5e, 0x25];

/** bunker 22x16 [1D20] : 2 octets par colonne (bas, haut) */
export const SHIELD_SPR: readonly number[] = [
  0xff, 0x0f, 0xff, 0x1f, 0xff, 0x3f, 0xff, 0x7f, 0xff, 0xff, 0xfc, 0xff, 0xf8, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0,
  0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf8, 0xff, 0xfc, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f,
  0xff, 0x3f, 0xff, 0x1f, 0xff, 0x0f,
];

/** soucoupe [1D64] et son explosion [1D7C], 24 colonnes */
export const SAUCER_SPR: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x04, 0x0c, 0x1e, 0x37, 0x3e, 0x7c, 0x74, 0x7e, 0x7e, 0x74, 0x7c, 0x3e, 0x37, 0x1e, 0x0c,
  0x04, 0x00, 0x00, 0x00, 0x00,
];
const SAUCER_EXPLO_SPR: readonly number[] = [
  0x00, 0x22, 0x00, 0xa5, 0x40, 0x08, 0x98, 0x3d, 0xb6, 0x3c, 0x36, 0x1d, 0x10, 0x48, 0x62, 0xb6, 0x1d, 0x98, 0x08,
  0x42, 0x90, 0x08, 0x00, 0x00,
];

/** colonnes vides, pour effacer par écrasement */
const BLANK: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** chiffres de la police de la borne [1ED0..1F1F], 8 colonnes par caractère */
export const DIGIT_GLYPHS: readonly (readonly number[])[] = [
  [0x00, 0x3e, 0x45, 0x49, 0x51, 0x3e, 0x00, 0x00],
  [0x00, 0x00, 0x21, 0x7f, 0x01, 0x00, 0x00, 0x00],
  [0x00, 0x23, 0x45, 0x49, 0x49, 0x31, 0x00, 0x00],
  [0x00, 0x42, 0x41, 0x49, 0x59, 0x66, 0x00, 0x00],
  [0x00, 0x0c, 0x14, 0x24, 0x7f, 0x04, 0x00, 0x00],
  [0x00, 0x72, 0x51, 0x51, 0x51, 0x4e, 0x00, 0x00],
  [0x00, 0x1e, 0x29, 0x49, 0x49, 0x46, 0x00, 0x00],
  [0x00, 0x40, 0x47, 0x48, 0x50, 0x60, 0x00, 0x00],
  [0x00, 0x36, 0x49, 0x49, 0x49, 0x36, 0x00, 0x00],
  [0x00, 0x31, 0x49, 0x49, 0x4a, 0x3c, 0x00, 0x00],
];

// ---------------------------------------------------------------------------
// Tables de la ROM
// ---------------------------------------------------------------------------

/** colonnes de tir du piston (index 0x00-0x0F) et du zigzag (0x06-0x14) [1D00] */
const COL_FIRE = [0x01, 0x07, 0x01, 0x01, 0x01, 0x04, 0x0b, 0x01, 0x06, 0x03, 0x01, 0x01, 0x0b, 0x09, 0x02, 0x08, 0x02, 0x0b, 0x04, 0x07, 0x0a];

/** score de la soucoupe en dizaines, lu à chaque tir terminé ; la ROM boucle après 15 valeurs (bug d'origine) [1D54] */
const SAUCER_SCORES = [10, 5, 5, 10, 15, 10, 10, 5, 30, 10, 10, 10, 5, 15, 10];

/** Y de départ de la rangée du bas : vague 1 puis table des vagues suivantes [07EA, 1DA3] */
const RACK_START_Y = 0x78;
const RACK_TABLE_Y = [0x60, 0x50, 0x48, 0x48, 0x48, 0x40, 0x40, 0x40];

/** points par rangée : poulpe, crabe, calmar [1DA0] */
const ALIEN_POINTS = [10, 20, 30];

/** tempo de la marche : nombre d'envahisseurs -> frames entre deux notes [1A11, 1A21] */
const FLEET_SND_COUNT = [50, 43, 36, 28, 22, 17, 13, 10, 8, 7, 6, 5, 4, 3, 2, 1];
const FLEET_SND_DELAY = [52, 46, 39, 34, 28, 24, 21, 19, 16, 14, 13, 12, 11, 9, 7, 5];

/** bunkers : X de la ROM (x écran 32, 77, 122, 167), Y du bas 0x30 [01F8] */
const SHIELD_X = [0x40, 0x6d, 0x9a, 0xc7];
const SHIELD_Y = 0x30;

const PLAYER_Y = 0x20;
const PLAYER_X_MIN = 0x30;
const PLAYER_X_MAX = 0xd9;
const PLAYER_TIMER = 0x80;
const SAUCER_Y = 0xd0;

// modes de tracé
const OR_COLLIDE = 1;
const OR = 2;
const SET = 3;
const ERASE = 4;
const SIMPLE = 5;
const CLEAR2 = 6;

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface AlienShot {
  active: boolean;
  blowing: boolean;
  /** pas effectués (cadence de tir des autres) */
  step: number;
  x: number;
  y: number;
  img: number;
  explo: boolean;
  blowCnt: number;
  /** index dans COL_FIRE (piston, zigzag) */
  col: number;
  /** le tir roulant saute sa première occasion après chaque réarmement */
  skip: boolean;
}

export interface InvSimState {
  frame: number;
  fb: Uint8Array;

  score: number;
  /** canons restants, celui en jeu compris */
  lives: number;
  extraGiven: boolean;
  wave: number;
  rackCnt: number;
  over: boolean;
  overFrame: number;
  invaded: boolean;

  // canon [2010..2018]
  plTimer: number;
  plX: number;
  plAlive: boolean;
  plBlowDelay: number;
  plBlowCount: number;
  plBlowImg: number;
  playerOK: boolean;
  alienFireOn: boolean;
  alienFireDelay: number;
  fireBounce: boolean;

  // tir du canon [2025..202C] : 0 aucun, 1 demandé, 2 en vol, 3 explose (raté), 4 fini, 5 envahisseur touché
  psStatus: number;
  psX: number;
  psY: number;
  psTimer: number;
  psExplo: boolean;
  /** collision du tir pendant son vol [2002] */
  hitFlag: boolean;
  expTimer: number;
  expX: number;
  expY: number;

  // flotte [2000..200E]
  aliens: Uint8Array;
  numAliens: number;
  refX: number;
  refY: number;
  dx: number;
  drop: number;
  rackDir: number;
  anim: number;
  cursor: number;
  waitOnDraw: boolean;
  curX: number;
  curY: number;
  curRow: number;
  fleetBudget: number;

  // tirs ennemis : 0 roulant, 1 piston, 2 zigzag
  shots: AlienShot[];
  sync: number;
  shotDelta: number;
  reload: number;
  skipPlunger: boolean;

  // soucoupe [2083..2092]
  ufoTimer: number;
  ufoStart: boolean;
  ufoActive: boolean;
  ufoHit: boolean;
  ufoHitTimer: number;
  ufoX: number;
  ufoDx: number;
  ufoScorePtr: number;
  shotCount: number;
  ufoScore: number;

  // marche de la flotte [2095..209B]
  fleetTimer: number;
  fleetReload: number;
  fleetNote: number;
  fleetChange: boolean;

  /** pause après le dernier envahisseur (0x30 frames) [0A3C] */
  waveWait: number;

  kills: number;
  ufoHits: number;
  shotsFired: number;

  /** événements EV.* de la dernière frame */
  ev: number;
}

function freshShot(kind: number): AlienShot {
  return {
    active: false,
    blowing: false,
    step: 0,
    x: 0,
    y: 0,
    img: 0,
    explo: false,
    blowCnt: 4,
    col: kind === 2 ? 0x06 : 0x00,
    skip: kind === 0,
  };
}

// ---------------------------------------------------------------------------
// Mémoire vidéo
// ---------------------------------------------------------------------------

/**
 * Trace `len` colonnes de `spr` (à partir de `off`) en (x, y) ROM. Retourne
 * true si un pixel tracé recouvre un pixel déjà allumé (mode OR_COLLIDE).
 * Hors de l'écran : la colonne est ignorée (la borne écrirait dans la RAM).
 */
function blit(fb: Uint8Array, spr: readonly number[], len: number, x: number, y: number, mode: number): boolean {
  const shift = y & 7;
  const row = y >> 3;
  let hit = false;
  for (let i = 0; i < len; i += 1) {
    const col = x + i - 0x20;
    if (col < 0 || col >= 224) continue;
    const base = col * 32 + row;
    const v = (spr[i] ?? 0) << shift;
    const lo = v & 0xff;
    const hi = v >> 8;
    const hasHi = row < 31;
    switch (mode) {
      case OR_COLLIDE:
        if ((fb[base] & lo) !== 0 || (hasHi && (fb[base + 1] & hi) !== 0)) hit = true;
        fb[base] |= lo;
        if (hasHi) fb[base + 1] |= hi;
        break;
      case OR:
        fb[base] |= lo;
        if (hasHi) fb[base + 1] |= hi;
        break;
      case SET:
        fb[base] = lo;
        if (hasHi) fb[base + 1] = hi;
        break;
      case ERASE:
        fb[base] &= ~lo & 0xff;
        if (hasHi) fb[base + 1] &= ~hi & 0xff;
        break;
      case SIMPLE:
        fb[base] = spr[i] ?? 0;
        break;
      case CLEAR2:
        fb[base] = 0;
        if (hasHi) fb[base + 1] = 0;
        break;
      default:
        break;
    }
  }
  return hit;
}

/** au moins un pixel allumé dans une colonne écran, Y 32..215 [15C5] */
function columnLit(fb: Uint8Array, col: number): boolean {
  const base = col * 32 + 4;
  for (let i = 0; i < 23; i += 1) if (fb[base + i] !== 0) return true;
  return false;
}

function drawShields(fb: Uint8Array): void {
  for (const sx of SHIELD_X) {
    for (let i = 0; i < 22; i += 1) {
      const base = (sx + i - 0x20) * 32 + (SHIELD_Y >> 3);
      fb[base] = SHIELD_SPR[i * 2];
      fb[base + 1] = SHIELD_SPR[i * 2 + 1];
    }
  }
}

/**
 * Compte les pas de 16 qui amènent `ref` à `target`, avec la remise en boucle
 * bancale de la ROM quand ref dépasse déjà la cible [1554, 1590].
 */
function cnt16(ref: number, target: number): { a: number; c: number } {
  let a = ref;
  let c = 0;
  if (a >= target) {
    do {
      c += 1;
      a = (a + 16) & 0xff;
    } while ((a & 0x80) !== 0 && c < 32);
  }
  let guard = 0;
  while (a < target && guard < 32) {
    a = (a + 16) & 0xff;
    c += 1;
    guard += 1;
  }
  return { a, c };
}

function alienType(row: number): number {
  return row < 2 ? 0 : row < 4 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Difficulté (vague 1 = borne)
// ---------------------------------------------------------------------------

function fleetRate(wave: number): number {
  return Math.min(DIFFICULTY.FLEET_RATE_BASE + (wave - 1) * DIFFICULTY.FLEET_RATE_PER_WAVE, DIFFICULTY.FLEET_RATE_MAX);
}

function reloadPct(wave: number): number {
  if (wave <= 2) return 100;
  return Math.max(DIFFICULTY.RELOAD_PCT_MIN, 100 - (wave - 2) * DIFFICULTY.RELOAD_PCT_PER_WAVE);
}

// ---------------------------------------------------------------------------
// Création, vagues
// ---------------------------------------------------------------------------

/** remise à zéro des objets, comme la recopie du miroir RAM [01E4] à chaque vague */
function resetObjects(s: InvSimState): void {
  s.plTimer = PLAYER_TIMER;
  s.plX = PLAYER_X_MIN;
  s.plAlive = true;
  s.plBlowDelay = 5;
  s.plBlowCount = 12;
  s.plBlowImg = 0;
  s.playerOK = true;
  s.alienFireOn = false;
  s.alienFireDelay = 0x30;
  s.fireBounce = false;

  s.psStatus = 0;
  s.psX = PLAYER_X_MIN;
  s.psY = 0x28;
  s.psTimer = 0x10;
  s.psExplo = false;
  s.hitFlag = false;
  s.expTimer = 0;
  s.expX = 0;
  s.expY = 0;

  s.shots = [freshShot(0), freshShot(1), freshShot(2)];
  s.sync = 2;
  s.shotDelta = 4;
  s.reload = 0x30;
  s.skipPlunger = false;

  s.ufoTimer = 0x600;
  s.ufoStart = false;
  s.ufoActive = false;
  s.ufoHit = false;
  s.ufoHitTimer = 0x20;
  s.ufoX = 0x29;
  s.ufoDx = 2;
  s.ufoScorePtr = 0;
  s.shotCount = 0;

  s.fleetTimer = 0x40;
  s.fleetReload = FLEET_SND_DELAY[0];
  s.fleetNote = 0;
  s.fleetChange = true;
  s.fleetBudget = 0;
}

function initRack(s: InvSimState, refY: number): void {
  s.fb.fill(0);
  drawShields(s.fb);
  s.aliens.fill(1);
  s.numAliens = 55;
  s.refY = refY;
  s.refX = 0x38;
  s.dx = 2;
  s.drop = 0;
  s.rackDir = 0;
  s.anim = 0;
  s.cursor = 0;
  s.waitOnDraw = true;
  s.curX = s.refX;
  s.curY = s.refY;
  s.curRow = 0;
  s.waveWait = 0;
  resetObjects(s);
}

export function createSim(): InvSimState {
  const s = {
    frame: 0,
    fb: new Uint8Array(SIM.FB_BYTES),
    score: 0,
    lives: SIM.START_LIVES,
    extraGiven: false,
    wave: 1,
    rackCnt: 0,
    over: false,
    overFrame: -1,
    invaded: false,
    aliens: new Uint8Array(55),
    ufoScore: 0,
    kills: 0,
    ufoHits: 0,
    shotsFired: 0,
    ev: 0,
  } as InvSimState;
  initRack(s, RACK_START_Y);
  return s;
}

/** vague suivante : la flotte repart plus bas (table ROM, boucle sur 8) [09EF] */
function nextWave(s: InvSimState): void {
  s.rackCnt = (s.rackCnt & 7) + 1;
  s.wave += 1;
  initRack(s, RACK_TABLE_Y[s.rackCnt - 1]);
  s.ev |= EV.WAVE_START;
}

// ---------------------------------------------------------------------------
// Canon
// ---------------------------------------------------------------------------

function strikePlayer(s: InvSimState): void {
  if (!s.plAlive) return;
  s.plAlive = false;
  s.ev |= EV.PLAYER_HIT;
}

/** objet 0 : déplacement du canon ou son explosion [028E] */
function playerObj(s: InvSimState, input: number): void {
  if (s.plTimer > 0) {
    s.plTimer -= 1;
    return;
  }
  if (!s.plAlive) {
    s.plBlowDelay -= 1;
    if (s.plBlowDelay > 0) return;
    s.playerOK = false;
    s.alienFireOn = false;
    s.alienFireDelay = 0x30;
    s.plBlowDelay = 5;
    s.plBlowCount -= 1;
    if (s.plBlowCount > 0) {
      s.plBlowImg ^= 1;
      blit(s.fb, PLAYER_BLOW_SPR[s.plBlowImg], 16, s.plX, PLAYER_Y, SIMPLE);
      return;
    }
    // fin de l'explosion : canon suivant, ou fin de partie
    blit(s.fb, PLAYER_SPR, 16, s.plX, PLAYER_Y, CLEAR2);
    s.plTimer = PLAYER_TIMER;
    s.plX = PLAYER_X_MIN;
    s.plAlive = true;
    s.plBlowCount = 12;
    s.plBlowImg = 0;
    if (s.invaded || s.lives <= 1) {
      s.lives = 0;
      s.over = true;
      s.overFrame = s.frame;
      s.ev |= EV.GAME_OVER;
      return;
    }
    s.lives -= 1;
    return;
  }
  s.playerOK = true;
  if (!s.alienFireOn) {
    s.alienFireDelay -= 1;
    if (s.alienFireDelay <= 0) s.alienFireOn = true;
  }
  // la ROM teste la droite avant la gauche [0363]
  if ((input & SIM.IN_RIGHT) !== 0) {
    if (s.plX !== PLAYER_X_MAX) s.plX += 1;
  } else if ((input & SIM.IN_LEFT) !== 0) {
    if (s.plX !== PLAYER_X_MIN) s.plX -= 1;
  }
  blit(s.fb, PLAYER_SPR, 16, s.plX, PLAYER_Y, SIMPLE);
}

/** un tir par appui : il faut relâcher le bouton, et seulement sans tir en vol [1618] */
function playerFire(s: InvSimState, input: number): void {
  if (!s.plAlive || s.plTimer !== 0 || s.psStatus !== 0) return;
  const fire = (input & SIM.IN_FIRE) !== 0;
  if (s.fireBounce) {
    if (!fire) s.fireBounce = false;
    return;
  }
  if (!fire) return;
  s.psStatus = 1;
  s.fireBounce = true;
}

/** fin du tir : le compteur de tirs fait avancer le score de la soucoupe et choisit son côté [0436] */
function endOfShot(s: InvSimState): void {
  if (s.psExplo) blit(s.fb, PSHOT_EXPLO_SPR, 8, s.psX, s.psY, ERASE);
  else blit(s.fb, PSHOT_SPR, 1, s.psX, s.psY, ERASE);
  s.psStatus = 0;
  s.psTimer = 0x10;
  s.psExplo = false;
  s.psY = 0x28;
  s.ufoScorePtr += 1;
  if (s.ufoScorePtr >= SAUCER_SCORES.length) s.ufoScorePtr = 0;
  s.shotCount = (s.shotCount + 1) & 0xff;
  if (!s.ufoActive) {
    if ((s.shotCount & 1) !== 0) {
      s.ufoX = 0x29;
      s.ufoDx = 2;
    } else {
      s.ufoX = 0xe0;
      s.ufoDx = -2;
    }
  }
}

/** objet 1 : tir du canon [03BB] */
function playerShotObj(s: InvSimState): void {
  switch (s.psStatus) {
    case 0:
    case 5:
      return;
    case 1:
      s.psStatus = 2;
      s.psX = (s.plX + 8) & 0xff;
      s.psY = 0x28;
      s.psExplo = false;
      blit(s.fb, PSHOT_SPR, 1, s.psX, s.psY, OR);
      s.shotsFired += 1;
      s.ev |= EV.SHOT;
      return;
    case 2:
      blit(s.fb, PSHOT_SPR, 1, s.psX, s.psY, ERASE);
      s.psY = (s.psY + 4) & 0xff;
      if (blit(s.fb, PSHOT_SPR, 1, s.psX, s.psY, OR_COLLIDE)) s.hitFlag = true;
      return;
    case 3:
      s.psTimer -= 1;
      if (s.psTimer <= 0) {
        endOfShot(s);
        return;
      }
      if (s.psTimer === 0x0f) {
        blit(s.fb, PSHOT_SPR, 1, s.psX, s.psY, ERASE);
        s.psExplo = true;
        s.psY = (s.psY - 2) & 0xff;
        s.psX = (s.psX - 3) & 0xff;
        blit(s.fb, PSHOT_EXPLO_SPR, 8, s.psX, s.psY, OR);
        s.ev |= EV.SHOT_MISS;
      }
      return;
    default:
      endOfShot(s);
  }
}

/** qu'a touché le tir ? haut de l'écran, soucoupe, envahisseur ou autre chose [14D8] */
function playerShotHit(s: InvSimState): void {
  if (s.psStatus !== 2) return;
  const y = s.psY;
  if (y >= 0xd8) {
    s.psStatus = 3;
    s.hitFlag = false;
    return;
  }
  if (!s.hitFlag) return;
  if (y >= 0xce) {
    if (s.ufoActive) s.ufoHit = true;
    s.psStatus = 4;
    s.hitFlag = false;
    return;
  }
  const b = (y + 6) & 0xff;
  if (s.refY < 0x90 && s.refY >= b) {
    // sous la flotte : bunker ou tir ennemi
    s.psStatus = 3;
    s.hitFlag = false;
    return;
  }
  const r = cnt16(s.refY, b);
  const row = (r.c - 1) & 0xff;
  const rowY = (r.a - 16) & 0xff;
  const c = cnt16(s.refX, s.psX);
  const colX = (c.a - 16) & 0xff;
  const idx = (row * 11 + c.c - 1) & 0xff;
  s.psStatus = 5;
  if (idx < 55 && s.aliens[idx] !== 0) {
    s.aliens[idx] = 0;
    s.score += ALIEN_POINTS[alienType(row > 4 ? 4 : row)];
    s.kills += 1;
    s.expX = colX;
    s.expY = rowY;
    s.expTimer = 0x10;
    blit(s.fb, ALIEN_EXPLO_SPR, 16, colX, rowY, SET);
    s.ev |= EV.INVADER_HIT;
    return;
  }
  // case vide : c'était un tir ennemi
  s.psStatus = 3;
  s.hitFlag = false;
}

// ---------------------------------------------------------------------------
// Flotte
// ---------------------------------------------------------------------------

function moveRef(s: InvSimState): void {
  s.refY = (s.refY + s.drop) & 0xff;
  s.drop = 0;
  s.refX = (s.refX + s.dx) & 0xff;
  s.anim ^= 1;
}

/** curseur sur l'envahisseur vivant suivant ; la flotte avance quand il a fait le tour [0141] */
function cursorNext(s: InvSimState): boolean {
  if (!s.playerOK || s.waitOnDraw) return false;
  let idx = s.cursor + 1;
  let laps = 2;
  for (;;) {
    if (idx >= 55) {
      laps -= 1;
      if (laps === 0) return false;
      moveRef(s);
      idx = 0;
    }
    if (s.aliens[idx] !== 0) break;
    idx += 1;
  }
  const row = Math.floor(idx / 11);
  s.cursor = idx;
  s.curRow = row;
  s.curX = (s.refX + 16 * (idx - row * 11)) & 0xff;
  s.curY = (s.refY + 16 * row) & 0xff;
  if (s.curY < 0x28) {
    // la flotte a atteint la rangée du canon : invasion, fin de partie [1971]
    s.invaded = true;
    strikePlayer(s);
  }
  s.waitOnDraw = true;
  return true;
}

/** dessine l'envahisseur sous le curseur, en écrasant ce qu'il recouvre (bunkers compris) [0100] */
function drawAlien(s: InvSimState): void {
  s.waitOnDraw = false;
  if (s.aliens[s.cursor] === 0) return;
  blit(s.fb, ALIEN_SPR[s.anim][alienType(s.curRow)], 16, s.curX, s.curY, SET);
  // écart : le pas de 3 px du dernier envahisseur laisserait une colonne de traîne
  if (s.dx === 3) blit(s.fb, BLANK, 1, s.curX - 1, s.curY, CLEAR2);
}

function fleet(s: InvSimState): void {
  if (s.psStatus === 5) {
    // explosion d'un envahisseur : toute la marche est gelée 16 frames [1538]
    s.expTimer -= 1;
    if (s.expTimer <= 0) {
      blit(s.fb, ALIEN_EXPLO_SPR, 16, s.expX, s.expY, CLEAR2);
      s.psStatus = 4;
      s.hitFlag = false;
    }
    return;
  }
  if (!s.playerOK) {
    if (s.waitOnDraw) drawAlien(s);
    s.fleetBudget = 0;
    return;
  }
  s.fleetBudget += fleetRate(s.wave);
  let guard = 0;
  while (s.fleetBudget >= DIFFICULTY.FLEET_RATE_BASE && guard < 4) {
    s.fleetBudget -= DIFFICULTY.FLEET_RATE_BASE;
    guard += 1;
    if (s.waitOnDraw) drawAlien(s);
    if (!cursorNext(s)) break;
  }
}

/** rebond aux bords : détection sur les pixels allumés des colonnes x=213 et x=9 [1597] */
function rackBump(s: InvSimState): void {
  if (s.rackDir === 0) {
    if (!columnLit(s.fb, 213)) return;
    s.dx = -2;
    s.rackDir = 1;
  } else {
    if (!columnLit(s.fb, 9)) return;
    s.dx = s.numAliens === 1 ? 3 : 2;
    s.rackDir = 0;
  }
  s.drop = 0xf8;
}

// ---------------------------------------------------------------------------
// Tirs ennemis et soucoupe
// ---------------------------------------------------------------------------

function findInColumn(s: InvSimState, col: number): number {
  const c0 = (col - 1) & 0xff;
  if (c0 > 10) return -1;
  for (let idx = c0; idx < 55; idx += 11) if (s.aliens[idx] !== 0) return idx;
  return -1;
}

/** départ ou déplacement d'un tir ennemi [0563] */
function handleAlienShot(s: InvSimState, kind: number, other1: number, other2: number): void {
  const sh = s.shots[kind];
  if (!sh.active) {
    if (!s.alienFireOn) return;
    sh.step = 0;
    // trop tôt si un autre tir n'a pas fait assez de pas depuis son départ
    if (other1 !== 0 && s.reload >= other1) return;
    if (other2 !== 0 && s.reload >= other2) return;
    let col: number;
    if (kind === 0) {
      // le roulant vise la colonne au-dessus du canon [061B]
      col = cnt16(s.refX, (s.plX + 8) & 0xff).c;
      if (col >= 12) col = 11;
    } else {
      col = COL_FIRE[sh.col] ?? 1;
      sh.col += 1;
    }
    const idx = findInColumn(s, col);
    if (idx < 0) return;
    const row = Math.floor(idx / 11);
    const ax = (s.refX + 16 * (idx - row * 11)) & 0xff;
    const ay = (s.refY + 16 * row) & 0xff;
    sh.x = (ax + 7) & 0xff;
    sh.y = (ay - 10) & 0xff;
    sh.active = true;
    sh.step = 1;
    return;
  }
  if (sh.blowing) {
    sh.blowCnt -= 1;
    if (sh.blowCnt === 3) {
      blit(s.fb, ASHOT_SPR[kind][sh.img], 3, sh.x, sh.y, ERASE);
      sh.explo = true;
      sh.x = (sh.x - 2) & 0xff;
      sh.y = (sh.y - 2) & 0xff;
      blit(s.fb, ASHOT_EXPLO_SPR, 6, sh.x, sh.y, OR_COLLIDE);
    } else if (sh.blowCnt <= 0) {
      blit(s.fb, ASHOT_EXPLO_SPR, 6, sh.x, sh.y, ERASE);
    }
    return;
  }
  sh.step = (sh.step + 1) & 0xff;
  blit(s.fb, ASHOT_SPR[kind][sh.img], 3, sh.x, sh.y, ERASE);
  sh.img = (sh.img + 1) & 3;
  sh.y = sh.y - s.shotDelta;
  const hit = blit(s.fb, ASHOT_SPR[kind][sh.img], 3, sh.x, sh.y, OR_COLLIDE);
  if (sh.y < 0x15) {
    sh.blowing = true;
    return;
  }
  if (!hit) return;
  // seule cette bande de Y tue le canon : tout près, le tir explose sans le toucher [0600]
  if (sh.y >= 0x1e && sh.y < 0x27) strikePlayer(s);
  sh.blowing = true;
}

function alienShotDone(sh: AlienShot): boolean {
  return sh.active && sh.blowing && sh.blowCnt <= 0;
}

function resetShot(s: InvSimState, kind: number): void {
  const col = s.shots[kind].col;
  s.shots[kind] = freshShot(kind);
  if (kind !== 0) s.shots[kind].col = col;
}

function removeUfo(s: InvSimState): void {
  blit(s.fb, BLANK, 24, s.ufoX, SAUCER_Y, SIMPLE);
  s.ufoStart = false;
  s.ufoActive = false;
  s.ufoHit = false;
  s.ufoHitTimer = 0x20;
  s.ufoX = 0x29;
  s.ufoDx = 2;
  s.ev |= EV.UFO_OFF;
}

/** score de la soucoupe écrit à sa place, 3 caractères (« _50 », « 100 »...) [070C] */
function drawUfoScore(s: InvSimState, points: number): void {
  const text = points < 100 ? [-1, Math.floor(points / 10), 0] : [Math.floor(points / 100), Math.floor(points / 10) % 10, 0];
  for (let i = 0; i < 3; i += 1) {
    const d = text[i];
    blit(s.fb, d < 0 ? BLANK : DIGIT_GLYPHS[d], 8, s.ufoX + i * 8, SAUCER_Y, SIMPLE);
  }
}

/** objet 4 : soucoupe si son heure est venue et qu'aucun zigzag ne vole, sinon zigzag [0682] */
function saucerOrSquiggly(s: InvSimState): void {
  if (s.ufoStart && s.shots[2].step === 0) {
    if (!s.ufoActive) {
      if (s.numAliens < 8) {
        squiggly(s);
        return;
      }
      s.ufoActive = true;
      blit(s.fb, SAUCER_SPR, 24, s.ufoX, SAUCER_Y, SIMPLE);
      s.ev |= EV.UFO_ON;
    }
    if (s.ufoHit) {
      s.ufoHitTimer -= 1;
      if (s.ufoHitTimer === 0x1f) {
        blit(s.fb, SAUCER_EXPLO_SPR, 24, s.ufoX, SAUCER_Y, SIMPLE);
        s.ev |= EV.UFO_HIT;
      } else if (s.ufoHitTimer === 0x18) {
        const points = SAUCER_SCORES[s.ufoScorePtr] * 10;
        s.score += points;
        s.ufoScore = points;
        s.ufoHits += 1;
        drawUfoScore(s, points);
        s.ev |= EV.UFO_SCORE;
      } else if (s.ufoHitTimer <= 0) {
        removeUfo(s);
      }
      return;
    }
    s.ufoX = (s.ufoX + s.ufoDx) & 0xff;
    blit(s.fb, SAUCER_SPR, 24, s.ufoX, SAUCER_Y, SIMPLE);
    if (s.ufoX < 0x28 || s.ufoX >= 0xe1) removeUfo(s);
    return;
  }
  squiggly(s);
}

function squiggly(s: InvSimState): void {
  handleAlienShot(s, 2, s.shots[1].step, s.shots[0].step);
  if (s.shots[2].col >= 0x15) s.shots[2].col = 0x06;
  if (alienShotDone(s.shots[2])) resetShot(s, 2);
}

function alienShots(s: InvSimState): void {
  s.sync = s.sync === 0 ? 2 : s.sync - 1;
  if (s.sync === 0) {
    const sh = s.shots[0];
    if (sh.skip) {
      sh.skip = false;
      return;
    }
    handleAlienShot(s, 0, s.shots[1].step, s.shots[2].step);
    if (alienShotDone(sh)) resetShot(s, 0);
  } else if (s.sync === 1) {
    if (s.skipPlunger) return;
    handleAlienShot(s, 1, s.shots[0].step, s.shots[2].step);
    if (s.shots[1].col >= 0x10) s.shots[1].col = 0x00;
    if (alienShotDone(s.shots[1])) {
      resetShot(s, 1);
      if (s.numAliens === 1) s.skipPlunger = true;
    }
  } else {
    saucerOrSquiggly(s);
  }
}

/** la soucoupe ne se prépare qu'une fois la flotte descendue sous sa hauteur de départ [0913] */
function ufoTimerTick(s: InvSimState): void {
  if (s.refY >= RACK_START_Y) return;
  if (s.ufoTimer === 0) {
    s.ufoTimer = 0x600;
    s.ufoStart = true;
  }
  s.ufoTimer -= 1;
}

// ---------------------------------------------------------------------------
// Boucle principale
// ---------------------------------------------------------------------------

function fleetDelay(s: InvSimState): number {
  let i = 0;
  while (i < FLEET_SND_COUNT.length - 1 && s.numAliens < FLEET_SND_COUNT[i]) i += 1;
  return Math.max(3, Math.floor((FLEET_SND_DELAY[i] * DIFFICULTY.FLEET_RATE_BASE) / fleetRate(s.wave)));
}

/** une note de la marche à chaque échéance, tant que le canon est en jeu [1740, 1775] */
function fleetSound(s: InvSimState): void {
  if (!s.playerOK || s.numAliens === 0) return;
  s.fleetTimer -= 1;
  if (s.fleetTimer > 0) return;
  s.fleetReload = fleetDelay(s);
  s.fleetTimer = s.fleetReload;
  s.fleetNote = (s.fleetNote + 1) & 3;
  s.ev |= EV.FLEET_NOTE;
}

/** recharge des tirs ennemis selon les centaines du score [170E], réduite aux vagues accélérées */
function updateReload(s: InvSimState): void {
  const h = Math.floor(s.score / 100);
  const base = h <= 2 ? 0x30 : h <= 10 ? 0x10 : h <= 20 ? 0x0b : h <= 30 ? 0x08 : 0x07;
  s.reload = Math.max(DIFFICULTY.RELOAD_MIN, Math.floor((base * reloadPct(s.wave)) / 100));
}

function countAliens(s: InvSimState): void {
  let n = 0;
  for (let i = 0; i < 55; i += 1) n += s.aliens[i];
  s.numAliens = n;
}

/**
 * Avance d'UNE frame avec le masque d'entrées `input` (SIM.IN_*). Sans effet
 * (à part frame + 1) une fois la partie finie.
 */
export function stepSim(s: InvSimState, input: number): void {
  s.ev = 0;
  if (s.over) {
    s.frame += 1;
    return;
  }

  // --- interruptions vidéo
  fleetSound(s);
  ufoTimerTick(s);
  playerObj(s, input);
  if (s.over) {
    s.frame += 1;
    return;
  }
  playerShotObj(s);
  alienShots(s);
  fleet(s);

  // --- boucle principale
  if (s.waveWait === 0) playerFire(s, input);
  playerShotHit(s);
  if (s.waveWait === 0) rackBump(s);
  countAliens(s);
  updateReload(s);
  if (!s.extraGiven && s.score >= SIM.EXTRA_LIFE_SCORE) {
    s.extraGiven = true;
    s.lives += 1;
    s.ev |= EV.EXTRA_LIFE;
  }
  const bonus = s.wave >= DIFFICULTY.SHOT_BONUS_FROM_WAVE ? 1 : 0;
  s.shotDelta = (s.numAliens <= 8 ? 5 : 4) + bonus;

  // --- fin de vague : une demi-seconde, puis la flotte suivante [0A3C]
  if (s.numAliens === 0) {
    if (s.waveWait === 0) {
      s.waveWait = 0x30;
      s.ev |= EV.WAVE_CLEAR;
    } else if (s.plAlive) {
      s.waveWait -= 1;
      if (s.waveWait === 0) nextWave(s);
    }
  }
  s.frame += 1;
}

// ---------------------------------------------------------------------------
// Rejeu
// ---------------------------------------------------------------------------

/**
 * Entrées d'une partie : liste PLATE [frame0, masque0, frame1, masque1, ...],
 * frames strictement croissantes. Un masque s'applique à partir de sa frame
 * (incluse) ; avant le premier changement, le masque vaut 0.
 */
export function isValidInputList(list: unknown): list is number[] {
  if (!Array.isArray(list) || list.length % 2 !== 0) return false;
  let prev = -1;
  for (let i = 0; i < list.length; i += 2) {
    const f = list[i];
    const m = list[i + 1];
    if (!Number.isInteger(f) || f <= prev || f < 0 || f > SIM.MAX_FRAMES) return false;
    if (!Number.isInteger(m) || m < 0 || m > 7) return false;
    prev = f;
  }
  return true;
}

/** curseur de lecture d'une liste d'entrées (rejeu incrémental) */
export interface InputCursor {
  i: number;
  mask: number;
}

export function newCursor(): InputCursor {
  return { i: 0, mask: 0 };
}

/**
 * Avance `s` jusqu'à la frame `untilFrame` (exclue) en lisant `inputs` via
 * `cur`. S'arrête à la fin de partie. Les entrées au-delà de la frame
 * atteinte restent pour un appel suivant.
 */
export function runTo(s: InvSimState, inputs: readonly number[], cur: InputCursor, untilFrame: number): void {
  const end = Math.min(untilFrame, SIM.MAX_FRAMES);
  while (s.frame < end && !s.over) {
    while (cur.i < inputs.length && inputs[cur.i] <= s.frame) {
      cur.mask = inputs[cur.i + 1];
      cur.i += 2;
    }
    stepSim(s, cur.mask);
  }
}

/** rejoue une partie depuis le début jusqu'à `untilFrame` (exclue) ou la fin de partie */
export function simulate(inputs: readonly number[], untilFrame: number): InvSimState {
  const s = createSim();
  runTo(s, inputs, newCursor(), untilFrame);
  return s;
}

export function cloneSim(s: InvSimState): InvSimState {
  return {
    ...s,
    fb: s.fb.slice(),
    aliens: s.aliens.slice(),
    shots: s.shots.map((sh) => ({ ...sh })),
  };
}

export function frameToMs(frame: number): number {
  return Math.round((frame * 1000) / SIM.FPS);
}

/** empreinte FNV-1a de l'état utile (tests de déterminisme) */
export function simDigest(s: InvSimState): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < s.fb.length; i += 1) mix(s.fb[i]);
  for (let i = 0; i < 55; i += 1) mix(s.aliens[i]);
  const fields = [s.frame, s.score, s.lives, s.wave, s.refX, s.refY, s.plX, s.psStatus, s.psX, s.psY, s.ufoX, s.shotCount];
  for (const v of fields) {
    mix(v);
    mix(v >> 8);
    mix(v >> 16);
  }
  return h >>> 0;
}
