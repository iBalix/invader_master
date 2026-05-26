/**
 * Bouton "Touchez pour commencer" de l'ecran de veille, version "vivante" :
 *   - halo qui scintille en alternance entre les deux couleurs de la config
 *     design active (colorA / colorB), GPU-cheap (opacity uniquement)
 *   - petites particules qui s'echappent vers le haut (transform + opacity)
 *
 * Tout est en CSS keyframes (composited : transform/opacity uniquement),
 * aucun travail JS par frame -> non laggy meme sur mini-PC.
 */

import { Hand } from 'lucide-react';

const DEFAULT_A = '#7b2bff';
const DEFAULT_B = '#ff2bd6';

// Positions/delais/durees pre-calcules pour un rendu organique sans Math.random.
// La couleur est appliquee a l'exterieur (alternance colorA / colorB).
const PARTICLES = [
  { left: '12%', delay: 0,    dur: 2.8, size: 6 },
  { left: '24%', delay: 0.9,  dur: 3.4, size: 5 },
  { left: '38%', delay: 1.8,  dur: 3.0, size: 7 },
  { left: '50%', delay: 0.4,  dur: 3.6, size: 5 },
  { left: '63%', delay: 1.3,  dur: 2.9, size: 6 },
  { left: '76%', delay: 2.1,  dur: 3.3, size: 5 },
  { left: '88%', delay: 0.7,  dur: 3.1, size: 6 },
];

interface Props {
  label: string;
  /** Couleur principale (config design : menuButtonColor). */
  colorA?: string | null;
  /** Couleur secondaire (config design : gamesButtonColor). */
  colorB?: string | null;
}

export default function LiveStartButton({ label, colorA, colorB }: Props) {
  const a = colorA || DEFAULT_A;
  const b = colorB || DEFAULT_B;

  return (
    <div className="relative inline-flex items-center justify-center">
      <style>{`
        @keyframes lsb-glow-a { 0%,100%{opacity:.6} 50%{opacity:.18} }
        @keyframes lsb-glow-b { 0%,100%{opacity:.18} 50%{opacity:.6} }
        @keyframes lsb-particle {
          0%   { transform: translate3d(0,0,0) scale(1); opacity: 0; }
          15%  { opacity: .95; }
          100% { transform: translate3d(var(--lsb-dx,0), -72px, 0) scale(.35); opacity: 0; }
        }
        @keyframes lsb-breathe { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.035); } }
      `}</style>

      {/* Halos scintillants (2 couches en opposition de phase) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${a} 0%, transparent 70%)`, animation: 'lsb-glow-a 2.6s ease-in-out infinite' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${b} 0%, transparent 70%)`, animation: 'lsb-glow-b 2.6s ease-in-out infinite' }}
      />

      {/* Particules qui s'echappent vers le haut */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
        {PARTICLES.map((p, i) => {
          const color = i % 2 === 0 ? a : b;
          return (
            <span
              key={i}
              className="absolute bottom-2 rounded-full"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}`,
                opacity: 0,
                animation: `lsb-particle ${p.dur}s ease-out ${p.delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Le bouton lui-meme (respiration douce) */}
      <div
        className="relative flex items-center gap-3 rounded-full border border-white/25 px-9 py-4 font-display text-xl uppercase tracking-widest text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
          animation: 'lsb-breathe 3s ease-in-out infinite',
          boxShadow: `0 0 28px ${a}73`,
        }}
      >
        <Hand className="h-6 w-6" />
        {label}
      </div>
    </div>
  );
}
