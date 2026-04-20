/**
 * Vignette "info" inseree dans la grille des jeux preferes.
 * Pas un vrai jeu : juste une promo pour les tournois Mario Kart / Smash Bros
 * organises chaque semaine au bar.
 *
 *   - Meme format que GameCard (aspect-video) pour s'integrer dans la grille
 *     sans casser le rythme visuel.
 *   - Gradient violet -> magenta + sparkles pour pop par rapport aux covers.
 *   - Anim subtile sur le trophy (sway).
 */

import { Lightbulb, Trophy } from 'lucide-react';

export default function TournamentTipCard() {
  return (
    <div
      className="group relative block w-full overflow-hidden rounded-2xl border border-table-yellow/30 text-left"
      style={{
        background:
          'linear-gradient(135deg, rgba(123,43,255,0.85) 0%, rgba(255,43,214,0.7) 55%, rgba(255,209,36,0.45) 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,209,36,0.15) inset, 0 0 32px rgba(255,209,36,0.18)',
      }}
    >
      <style>{`
        @keyframes tip-sway {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes tip-bg-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .tip-card .trophy-anim {
          animation: tip-sway 2.6s ease-in-out infinite;
          transform-origin: 50% 80%;
          will-change: transform;
        }
        .tip-card .shimmer {
          background-size: 200% 200%;
          animation: tip-bg-shift 8s ease-in-out infinite;
        }
      `}</style>

      <div className="tip-card relative aspect-video w-full overflow-hidden">
        {/* Shimmer subtil en overlay */}
        <div
          aria-hidden
          className="shimmer pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.25), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(123,43,255,0.45), transparent 60%)',
          }}
        />

        {/* Trophy decoratif a droite */}
        <div className="pointer-events-none absolute -right-2 -top-2 opacity-25">
          <div className="trophy-anim">
            <Trophy className="h-32 w-32 text-table-yellow" strokeWidth={1.4} />
          </div>
        </div>

        {/* Contenu */}
        <div className="relative flex h-full flex-col justify-between p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-table-yellow">
              <Lightbulb className="h-5 w-5" />
            </span>
            <span className="font-display text-base uppercase tracking-[0.25em] text-white">
              Le savais-tu&nbsp;?
            </span>
          </div>

          <div className="space-y-1.5">
            <div
              className="font-display text-base uppercase leading-tight tracking-wide text-white"
              style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}
            >
              Tournois{' '}
              <span className="text-table-yellow">Mario Kart</span>{' '}
              &amp;{' '}
              <span className="text-table-yellow">Smash Bros</span>
              <br />
              chaque semaine&nbsp;!
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/30 px-3.5 py-1.5 font-display text-[13px] uppercase tracking-widest text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-table-yellow" />
              Renseigne-toi au comptoir
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
