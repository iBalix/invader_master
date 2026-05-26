/**
 * Schema manette SNES + legende des touches.
 *
 *  - SVG manette stylisee en haut (illustratif, lit-mais-pas-trop)
 *  - Grille de legendes en dessous : pastille couleur + lettre + action
 *  - Ne rend que les touches dont une action a ete renseignee
 *  - Retourne null si aucune touche n'est renseignee
 */

interface ControlsMap {
  controlA?: string | null;
  controlB?: string | null;
  controlX?: string | null;
  controlY?: string | null;
  controlL?: string | null;
  controlR?: string | null;
  controlStart?: string | null;
  controlSelect?: string | null;
}

interface Props {
  controls: ControlsMap;
  className?: string;
}

interface ButtonSpec {
  key: keyof ControlsMap;
  letter: string;
  color: string;
  textColor: string;
}

const BUTTON_SPECS: ButtonSpec[] = [
  { key: 'controlY',      letter: 'Y',     color: '#22d3ee', textColor: '#0a0612' },
  { key: 'controlX',      letter: 'X',     color: '#7b2bff', textColor: '#ffffff' },
  { key: 'controlA',      letter: 'A',     color: '#ff2bd6', textColor: '#0a0612' },
  { key: 'controlB',      letter: 'B',     color: '#fbbf24', textColor: '#0a0612' },
  { key: 'controlL',      letter: 'L',     color: '#cbd5e1', textColor: '#0a0612' },
  { key: 'controlR',      letter: 'R',     color: '#cbd5e1', textColor: '#0a0612' },
  { key: 'controlSelect', letter: 'SEL',   color: '#94a3b8', textColor: '#0a0612' },
  { key: 'controlStart',  letter: 'START', color: '#94a3b8', textColor: '#0a0612' },
];

export default function SNESControllerSchematic({ controls, className }: Props) {
  const active = BUTTON_SPECS.filter((b) => {
    const v = controls[b.key];
    return typeof v === 'string' && v.trim().length > 0;
  });
  if (active.length === 0) return null;

  return (
    <div className={['flex flex-col items-center gap-5', className ?? ''].join(' ')}>
      {/* SVG manette SNES stylisee et simplifiee */}
      <svg
        viewBox="0 0 480 200"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[420px] h-auto"
        role="img"
        aria-label="Manette SNES"
      >
        {/* Epaules L / R (rectangles aux coins superieurs) */}
        <rect x="60"  y="20" width="80" height="16" rx="8" fill="rgba(255,255,255,0.22)" />
        <rect x="340" y="20" width="80" height="16" rx="8" fill="rgba(255,255,255,0.22)" />
        <text x="100" y="33" fill="rgba(255,255,255,0.85)" fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="700">L</text>
        <text x="380" y="33" fill="rgba(255,255,255,0.85)" fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="700">R</text>

        {/* Corps de manette : 2 lobes (gauche + droit) relies par une bande centrale plus mince.
            Forme epurée style SNES, sans angles complexes. */}
        <path
          d="M 100 50
             L 380 50
             Q 410 50 425 80
             Q 440 110 425 135
             Q 410 160 380 160
             L 330 160
             Q 300 160 285 150
             L 195 150
             Q 180 160 150 160
             L 100 160
             Q 70 160 55 135
             Q 40 110 55 80
             Q 70 50 100 50 Z"
          fill="rgba(123, 43, 255, 0.22)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />

        {/* Croix directionnelle (gauche) - non labellisee */}
        <g fill="rgba(255,255,255,0.55)">
          <rect x="115" y="100" width="50" height="14" rx="3" />
          <rect x="133" y="82"  width="14" height="50" rx="3" />
        </g>

        {/* Start / Select au centre (ovales gris fonce) */}
        <g>
          <ellipse cx="220" cy="120" rx="16" ry="5" fill="rgba(255,255,255,0.35)" />
          <ellipse cx="260" cy="120" rx="16" ry="5" fill="rgba(255,255,255,0.35)" />
          <text x="220" y="138" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="sans-serif" textAnchor="middle" fontWeight="700" letterSpacing="1">SELECT</text>
          <text x="260" y="138" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="sans-serif" textAnchor="middle" fontWeight="700" letterSpacing="1">START</text>
        </g>

        {/* Boutons A/B/X/Y en losange (centre 340, 105) bien espaces */}
        {/* Y en haut */}
        <circle cx="340" cy="78" r="15" fill="#22d3ee" />
        <text x="340" y="83" fill="#0a0612" fontSize="13" fontFamily="sans-serif" textAnchor="middle" fontWeight="800">Y</text>
        {/* X a gauche */}
        <circle cx="313" cy="105" r="15" fill="#7b2bff" />
        <text x="313" y="110" fill="#fff" fontSize="13" fontFamily="sans-serif" textAnchor="middle" fontWeight="800">X</text>
        {/* B en bas */}
        <circle cx="340" cy="132" r="15" fill="#fbbf24" />
        <text x="340" y="137" fill="#0a0612" fontSize="13" fontFamily="sans-serif" textAnchor="middle" fontWeight="800">B</text>
        {/* A a droite */}
        <circle cx="367" cy="105" r="15" fill="#ff2bd6" />
        <text x="367" y="110" fill="#0a0612" fontSize="13" fontFamily="sans-serif" textAnchor="middle" fontWeight="800">A</text>
      </svg>

      {/* Legende : grille de touches actives avec pastille couleur + lettre + action */}
      <ul className="grid w-full max-w-[480px] grid-cols-2 gap-x-6 gap-y-2.5">
        {active.map((b) => (
          <li
            key={b.key}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          >
            <span
              className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold tabular-nums"
              style={{ backgroundColor: b.color, color: b.textColor }}
            >
              {b.letter}
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-base uppercase tracking-wider text-table-ink">
              {controls[b.key]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
