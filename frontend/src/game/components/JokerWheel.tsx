/**
 * Roue de tirage d'un joker, en overlay plein écran.
 *
 * LE SERVEUR A DÉJÀ TIRÉ. Cette roue est du théâtre : une bande horizontale de
 * cartes défile à toute vitesse, décélère, et s'arrête exactement sur le joker
 * gagné. Le suspense est réel pour le joueur, le résultat ne l'est pas.
 *
 * Mécanique volontairement en CSS transition + setTimeout, pas en
 * requestAnimationFrame : rAF est suspendu quand la page ne composite pas
 * (kiosque occulté) et la roue resterait figée. Un filet force l'état final.
 *
 * La transition ne joue que sur un CHANGEMENT de valeur : le transform de
 * départ est posé au premier rendu, celui d'arrivée un tick plus tard.
 *
 * Dimensions en unités relatives simples : la borne applique un zoom CSS 1.4
 * qui multiplie les rem, le composant doit rester fluide aux deux échelles
 * (téléphone ~375 px, dalle 1920x1080).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { JOKER_DEFS, JOKER_TYPES, type JokerType } from '../lib/gameClient';

/** durée du défilement, puis temps de célébration avant fermeture auto */
const SPIN_MS = 2600;
const CELEBRATE_MS = 2600;

/** largeur d'une carte, en fraction de la fenêtre visible de la roue */
const CARD_W_REM = 7.5;
const CARD_GAP_REM = 0.75;

interface Props {
  /** le joker gagné (déjà tiré par le serveur) */
  type: JokerType;
  /** libellé au-dessus de la roue ("Bonne réponse !" / "Cadeau du maître du jeu") */
  reason?: string;
  onDone: () => void;
  /** true : pas de spin, révélation directe (prefers-reduced-motion) */
  reduced?: boolean;
}

export default function JokerWheel({ type, reason, onDone, reduced }: Props) {
  const [phase, setPhase] = useState<'spin' | 'landed'>(reduced ? 'landed' : 'spin');
  const [launched, setLaunched] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // La bande : les 3 jokers répétés, avec la cible en avant-dernière position
  // pour laisser une carte dépasser à droite (l'arrêt "au milieu de la bande"
  // vend le hasard bien mieux qu'un arrêt en butée).
  const { cards, targetIndex } = useMemo(() => {
    const reps = 9;
    const list: JokerType[] = [];
    for (let i = 0; i < reps; i++) list.push(...JOKER_TYPES);
    // remplace l'avant-dernière carte par la cible
    const target = list.length - 2;
    list[target] = type;
    return { cards: list, targetIndex: target };
  }, [type]);

  const step = CARD_W_REM + CARD_GAP_REM;
  // translation pour centrer la carte cible sous le curseur
  const finalX = -(targetIndex * step);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => doneRef.current(), CELEBRATE_MS);
      return () => clearTimeout(t);
    }
    // lance la transition un tick après le montage (jamais au premier rendu)
    const t0 = setTimeout(() => setLaunched(true), 60);
    const t1 = setTimeout(() => setPhase('landed'), SPIN_MS + 120);
    const t2 = setTimeout(() => doneRef.current(), SPIN_MS + 120 + CELEBRATE_MS);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduced]);

  // confetti à l'atterrissage, aux couleurs du joker gagné
  useEffect(() => {
    if (phase !== 'landed') return;
    try {
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 42,
        origin: { y: 0.55 },
        colors: [JOKER_DEFS[type].couleur, '#FFE955', '#F5F2FF'],
        disableForReducedMotion: true,
      });
    } catch {
      /* canvas indisponible : la célébration CSS suffit */
    }
  }, [phase, type]);

  const def = JOKER_DEFS[type];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm px-4">
      <p className="anim-fade-up mb-2 text-sm font-bold uppercase tracking-[0.3em] text-white/60">
        {reason ?? 'Tu gagnes un joker'}
      </p>

      {phase === 'spin' ? (
        <>
          {/* fenêtre de la roue : une carte visible au centre, masque dégradé sur les bords */}
          <div
            className="relative w-full max-w-[26rem] overflow-hidden py-6"
            style={{
              maskImage:
                'linear-gradient(to right, transparent, black 22%, black 78%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 22%, black 78%, transparent)',
            }}
          >
            {/* curseur central */}
            <div className="pointer-events-none absolute inset-y-2 left-1/2 z-10 w-[8.1rem] -translate-x-1/2 rounded-2xl border-2 border-white/70 shadow-[0_0_30px_rgba(255,255,255,0.35)]" />
            <div
              className="flex"
              style={{
                gap: `${CARD_GAP_REM}rem`,
                // départ décalé pour centrer la première carte, arrivée sur la cible
                transform: `translateX(calc(50% - ${CARD_W_REM / 2}rem + ${launched ? finalX : 0}rem))`,
                transition: launched
                  ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.75, 0.15, 1)`
                  : undefined,
              }}
            >
              {cards.map((t, i) => {
                const d = JOKER_DEFS[t];
                return (
                  <div
                    key={i}
                    className="flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 bg-white/5"
                    style={{
                      width: `${CARD_W_REM}rem`,
                      height: '8.5rem',
                      borderColor: `${d.couleur}55`,
                    }}
                  >
                    <span className="text-4xl">{d.emoji}</span>
                    <span className="mt-2 text-xs font-black uppercase tracking-wider text-white/70">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-xs uppercase tracking-widest text-white/40">Tirage en cours...</p>
        </>
      ) : (
        <div className="anim-pop flex flex-col items-center">
          <div
            className="flex h-44 w-44 flex-col items-center justify-center rounded-3xl border-4 bg-white/10"
            style={{
              borderColor: def.couleur,
              boxShadow: `0 0 60px ${def.ombre}, inset 0 0 40px ${def.ombre}`,
            }}
          >
            <span className="text-7xl leading-none">{def.emoji}</span>
          </div>
          <p
            className="mt-5 text-4xl font-black uppercase tracking-wider"
            style={{ color: def.couleur, textShadow: `0 0 24px ${def.ombre}` }}
          >
            {def.label}
          </p>
          <p className="mt-2 max-w-xs text-center text-sm text-white/70">{def.description}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-white/40">
            Ajouté à ta main
          </p>
        </div>
      )}
    </div>
  );
}
