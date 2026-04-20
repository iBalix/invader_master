/**
 * Loader "Space Invader" pixel art anime.
 *
 * Theme arcade qui colle au nom du projet : un envahisseur en pixel art
 * 11x8 qui alterne 2 frames (les bras / tentacules qui bougent),
 * sway lateral subtil, et un texte "LOADING" avec dots qui clignotent.
 *
 *   - 100% SVG : pas d'image, pas d'asset, scalable.
 *   - Animation CSS native (steps + ease) : pas de runtime JS, GPU friendly.
 *   - Couleurs du theme (magenta + cyan) avec un leger glow dot par drop-shadow.
 *
 * Usage :
 *   <RetroLoader label="Chargement..." />  ou  <RetroLoader />
 */

interface Props {
  label?: string;
  accent?: 'magenta' | 'violet' | 'cyan' | 'yellow';
}

const ACCENT_COLOR: Record<NonNullable<Props['accent']>, string> = {
  magenta: '#FF2BD6',
  violet: '#7B2BFF',
  cyan: '#22D3EE',
  yellow: '#FFD124',
};

// 11 colonnes x 8 lignes. 1 = pixel allume, 0 = vide.
const FRAME_A: number[][] = [
  [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
  [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
];

const FRAME_B: number[][] = [
  [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
];

function FramePixels({ grid, color }: { grid: number[][]; color: string }) {
  const rects: JSX.Element[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === 1) {
        rects.push(
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
        );
      }
    }
  }
  return <>{rects}</>;
}

export default function RetroLoader({ label = 'LOADING', accent = 'magenta' }: Props) {
  const color = ACCENT_COLOR[accent];

  return (
    <div className="retro-loader flex flex-col items-center gap-6">
      <style>{`
        @keyframes retro-sway {
          0%, 100% { transform: translateX(-12px); }
          50% { transform: translateX(12px); }
        }
        @keyframes retro-frame-a {
          0%, 49.999% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes retro-frame-b {
          0%, 49.999% { opacity: 0; }
          50%, 100% { opacity: 1; }
        }
        @keyframes retro-dot {
          0%, 20% { opacity: 0; transform: translateY(-1px); }
          40%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes retro-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .retro-loader .invader-wrap {
          animation: retro-sway 2.4s ease-in-out infinite;
          will-change: transform;
        }
        .retro-loader .invader-frame-a {
          animation: retro-frame-a 0.6s steps(1) infinite;
        }
        .retro-loader .invader-frame-b {
          animation: retro-frame-b 0.6s steps(1) infinite;
        }
        .retro-loader .dot-1 { animation: retro-dot 1.2s steps(1) 0s infinite; }
        .retro-loader .dot-2 { animation: retro-dot 1.2s steps(1) 0.3s infinite; }
        .retro-loader .dot-3 { animation: retro-dot 1.2s steps(1) 0.6s infinite; }
        .retro-loader .bar-fill {
          animation: retro-bar 1.6s linear infinite;
        }
      `}</style>

      {/* Invader */}
      <div className="invader-wrap" style={{ filter: `drop-shadow(0 0 14px ${color}66)` }}>
        <svg
          viewBox="0 0 11 8"
          width={132}
          height={96}
          shapeRendering="crispEdges"
          aria-hidden
        >
          <g className="invader-frame-a">
            <FramePixels grid={FRAME_A} color={color} />
          </g>
          <g className="invader-frame-b">
            <FramePixels grid={FRAME_B} color={color} />
          </g>
        </svg>
      </div>

      {/* Petite barre de progression style arcade */}
      <div className="relative h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
        <div
          className="bar-fill absolute inset-y-0 left-0 w-1/3 rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          }}
        />
      </div>

      {/* Label LOADING + dots */}
      <div
        className="flex items-center gap-1.5 font-display text-xs uppercase tracking-[0.45em] text-table-ink-soft"
        style={{ textShadow: `0 0 14px ${color}55` }}
      >
        <span>{label}</span>
        <span className="dot-1">.</span>
        <span className="dot-2">.</span>
        <span className="dot-3">.</span>
      </div>
    </div>
  );
}
