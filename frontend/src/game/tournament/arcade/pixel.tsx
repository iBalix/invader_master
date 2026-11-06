/**
 * Pixel art des tournois, dessiné en code (pas d'image à charger) : chaque
 * sprite est une grille de caractères, rendue en SVG net (crispEdges) à la
 * taille voulue. Le caractère `X` prend la couleur du texte (currentColor) :
 * un sprite monochrome se teinte avec une classe `text-*`.
 *
 * Les envahisseurs sont un clin d'œil au nom du bar et à Bar Invaders.
 */

import { useMemo } from 'react';

export interface Sprite {
  rows: readonly string[];
  /** couleur de chaque caractère ; `X` = currentColor, `.` = vide */
  palette?: Readonly<Record<string, string>>;
}

interface Run {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** fusionne les pixels voisins d'une même couleur en bandes horizontales */
function runsOf(sprite: Sprite, override?: Readonly<Record<string, string>>): Run[] {
  const palette: Record<string, string> = { X: 'currentColor', ...(sprite.palette ?? {}), ...(override ?? {}) };
  const out: Run[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      const fill = palette[c];
      if (c === '.' || !fill) {
        x += 1;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w += 1;
      out.push({ x, y, w, fill });
      x += w;
    }
  });
  return out;
}

export function PixelSprite({
  sprite,
  scale = 4,
  className = '',
  style,
  title,
  palette,
}: {
  sprite: Sprite;
  /** taille d'un pixel, en px CSS */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  /** texte alternatif ; sans lui, le sprite est décoratif */
  title?: string;
  /** recoloration ponctuelle (rang, couleur d'échecs) */
  palette?: Readonly<Record<string, string>>;
}) {
  const w = sprite.rows[0]?.length ?? 1;
  const h = sprite.rows.length;
  const runs = useMemo(() => runsOf(sprite, palette), [sprite, palette]);
  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

/** sprite en deux images qui alternent (la marche des envahisseurs) */
export function PixelFrames({
  a,
  b,
  scale = 4,
  className = '',
  animate = true,
}: {
  a: Sprite;
  b: Sprite;
  scale?: number;
  className?: string;
  animate?: boolean;
}) {
  if (!animate) return <PixelSprite sprite={a} scale={scale} className={className} />;
  return (
    <span className={`ia-frames ${className}`} aria-hidden>
      <PixelSprite sprite={a} scale={scale} />
      <PixelSprite sprite={b} scale={scale} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Envahisseurs
// ---------------------------------------------------------------------------

export const INVADER_CRAB_A: Sprite = {
  rows: [
    '..X.....X..',
    '...X...X...',
    '..XXXXXXX..',
    '.XX.XXX.XX.',
    'XXXXXXXXXXX',
    'X.XXXXXXX.X',
    'X.X.....X.X',
    '...XX.XX...',
  ],
};

export const INVADER_CRAB_B: Sprite = {
  rows: [
    '..X.....X..',
    'X..X...X..X',
    'X.XXXXXXX.X',
    'XXX.XXX.XXX',
    'XXXXXXXXXXX',
    '.XXXXXXXXX.',
    '..X.....X..',
    '.X.......X.',
  ],
};

export const INVADER_SQUID_A: Sprite = {
  rows: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    'XX.XX.XX',
    'XXXXXXXX',
    '..X..X..',
    '.X.XX.X.',
    'X.X..X.X',
  ],
};

export const INVADER_SQUID_B: Sprite = {
  rows: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    'XX.XX.XX',
    'XXXXXXXX',
    '.X.XX.X.',
    'X......X',
    '.X....X.',
  ],
};

export const INVADER_OCTO_A: Sprite = {
  rows: [
    '....XXXX....',
    '.XXXXXXXXXX.',
    'XXXXXXXXXXXX',
    'XXX..XX..XXX',
    'XXXXXXXXXXXX',
    '...XX..XX...',
    '..XX.XX.XX..',
    'XX........XX',
  ],
};

export const INVADER_OCTO_B: Sprite = {
  rows: [
    '....XXXX....',
    '.XXXXXXXXXX.',
    'XXXXXXXXXXXX',
    'XXX..XX..XXX',
    'XXXXXXXXXXXX',
    '..XXX..XXX..',
    '.XX..XX..XX.',
    '..XX....XX..',
  ],
};

export const INVADERS: ReadonlyArray<[Sprite, Sprite]> = [
  [INVADER_CRAB_A, INVADER_CRAB_B],
  [INVADER_SQUID_A, INVADER_SQUID_B],
  [INVADER_OCTO_A, INVADER_OCTO_B],
];

// ---------------------------------------------------------------------------
// Trophée, couronne, podium
// ---------------------------------------------------------------------------

/** grand trophée doré sur socle violet (28 x 32) */
export const TROPHY: Sprite = {
  rows: [
    '....oooooooooooooooooooo....',
    '....ollllyyyyyyyyyysssdo....',
    '....olllwwyyyyyyyyysssdo....',
    '.oooolllwwyyyyyyyyysssdoooo.',
    'oyyyylllwwyyyyyyyyysssdsssso',
    'oyooolllwwyyyyyyyyysssdoooso',
    'oyo.olllwwyyyyyyyyysssdo.oso',
    'oyo..ollwwyyyyyyyyyssso..oso',
    'oyyooollwwyyyyyyyyysssooosso',
    '.oyyyyylwwyyyyyyyyyssssssso.',
    '..ooooolwwyyyyyyyyyssooooo..',
    '.......owwyyyyyyyyyso.......',
    '........oyyyyyyyyyyo........',
    '.........oyyyyyyyyo.........',
    '..........oyyyyyyo..........',
    '...........oyyyyo...........',
    '............oyyo............',
    '............oyyo............',
    '...........oyyyso...........',
    '............oyyo............',
    '.........oooyyysooo.........',
    '.........ollyyyssso.........',
    '....oooooBBBBBBBBBBooooo....',
    '....obbbbbbbbbbbbbbbbbbo....',
    '....obbssssssssssssssbbo....',
    '....obbsggggggggggggsbbo....',
    '....obbsggggggggggggsbbo....',
    '....obbsggggggggggggsbbo....',
    '....obbssssssssssssssbbo....',
    '....obbbbbbbbbbbbbbbbbbo....',
    '....obbbbbbbbbbbbbbbbbbo....',
    '...oooooooooooooooooooooo...',
  ],
  palette: {
    o: '#3d1a00',
    y: '#ffc93c',
    l: '#fff09a',
    w: '#ffffff',
    s: '#e2901c',
    d: '#a6520d',
    g: '#ffe955',
    b: '#3a1f78',
    B: '#6a3fd0',
  },
};

/** trophée de la place 2 et 3 : même dessin, autre métal */
export const TROPHY_SILVER: Readonly<Record<string, string>> = {
  o: '#1c1838',
  y: '#c9d2f2',
  l: '#f2f5ff',
  s: '#8f98c4',
  d: '#5b6290',
  g: '#d6dcff',
};
export const TROPHY_BRONZE: Readonly<Record<string, string>> = {
  o: '#2b1004',
  y: '#e98a4a',
  l: '#ffc497',
  s: '#b8582a',
  d: '#7a3414',
  g: '#ff8a4c',
};

export const CROWN: Sprite = {
  rows: [
    'y.....y.....y',
    'yy...yyy...yy',
    'yyy.yyyyy.yyy',
    'yyyyyyyyyyyyy',
    'yyryyybyyyryy',
    'yyyyyyyyyyyyy',
    'sssssssssssss',
  ],
  palette: { y: '#ffe955', s: '#e2901c', r: '#ff3b5c', b: '#33e2ff' },
};

/** petite coupe monochrome (onglet classement, puces) */
export const CUP: Sprite = {
  rows: [
    'XXXXXXXXXXX',
    'X.XXXXXXX.X',
    'X.XXXXXXX.X',
    '.XXXXXXXXX.',
    '..XXXXXXX..',
    '...XXXXX...',
    '....XXX....',
    '.....X.....',
    '....XXX....',
    '..XXXXXXX..',
    '..XXXXXXX..',
  ],
};

// ---------------------------------------------------------------------------
// Jeux
// ---------------------------------------------------------------------------

/** cavalier (échecs) */
export const KNIGHT: Sprite = {
  rows: [
    '....X.X...',
    '...XXXXX..',
    '..XX.XXXX.',
    '.XXXXXXXX.',
    'XXXXXXXXXX',
    'XXX..XXXXX',
    '....XXXXX.',
    '...XXXXXX.',
    '..XXXXXXX.',
    '..XXXXXXX.',
    '.XXXXXXXXX',
    '.XXXXXXXXX',
  ],
};

/** drapeau à damier (course) */
export const FLAG: Sprite = {
  rows: [
    'ppwwkkwwkkww',
    'ppwwkkwwkkww',
    'ppkkwwkkwwkk',
    'ppkkwwkkwwkk',
    'ppwwkkwwkkww',
    'ppwwkkwwkkww',
    'ppkkwwkkwwkk',
    'ppkkwwkkwwkk',
    'pp..........',
    'pp..........',
    'pp..........',
    'pp..........',
  ],
  palette: { p: '#c9c3e8', w: '#f5f2ff', k: '#2a1d55' },
};

/** éclair (combat) */
export const BOLT: Sprite = {
  rows: [
    '....XXXX',
    '...XXXX.',
    '..XXXX..',
    '.XXXX...',
    'XXXXXXXX',
    'XXXXXXX.',
    '...XXX..',
    '..XXX...',
    '.XXX....',
    '.XX.....',
    'XX......',
    'X.......',
  ],
};

/** pion (couleur aux échecs) : remplissage `X`, contour `o` */
export const PAWN: Sprite = {
  rows: [
    '..ooo..',
    '.oXXXo.',
    '.oXXXo.',
    '..oXo..',
    '.oXXXo.',
    '..oXo..',
    '.oXXXo.',
    'oXXXXXo',
    'ooooooo',
  ],
};
export const PAWN_WHITE = { X: '#f5f2ff', o: '#8a84b2' } as const;
export const PAWN_BLACK = { X: '#1a1035', o: '#c9c3e8' } as const;

// ---------------------------------------------------------------------------
// Pictos d'état
// ---------------------------------------------------------------------------

export const HOURGLASS: Sprite = {
  rows: [
    'XXXXXXX',
    '.X...X.',
    '.XsssX.',
    '..XsX..',
    '...X...',
    '..X.X..',
    '.X.s.X.',
    '.XsssX.',
    'XXXXXXX',
  ],
  palette: { s: '#ffe955' },
};

export const CHECK: Sprite = {
  rows: [
    '........X',
    '.......XX',
    'X.....XX.',
    'XX...XX..',
    '.XX.XX...',
    '..XXX....',
    '...X.....',
  ],
};

export const CROSS: Sprite = {
  rows: [
    'XX...XX',
    'XXX.XXX',
    '.XXXXX.',
    '..XXX..',
    '.XXXXX.',
    'XXX.XXX',
    'XX...XX',
  ],
};

export const STAR: Sprite = {
  rows: [
    '....X....',
    '....X....',
    '...XXX...',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '..XX.XX..',
    '.XX...XX.',
    'XX.....XX',
  ],
};

/** curseur ► des menus de borne */
export const CURSOR: Sprite = {
  rows: ['X....', 'XX...', 'XXX..', 'XXXX.', 'XXXXX', 'XXXX.', 'XXX..', 'XX...', 'X....'],
};

/** liste (onglet « mes matchs ») */
export const LIST: Sprite = {
  rows: ['XX.XXXXXX', '.........', 'XX.XXXXXX', '.........', 'XX.XXXXXX', '.........', 'XX.XXXXXX'],
};

/** porte de sortie (a quitté le tournoi) */
export const DOOR: Sprite = {
  rows: [
    'XXXXXXX.',
    'X.....X.',
    'X.....X.',
    'X...X.X.',
    'X.....XX',
    'X.....X.',
    'X.....X.',
    'XXXXXXX.',
  ],
};
