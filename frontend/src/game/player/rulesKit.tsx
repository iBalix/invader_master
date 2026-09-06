/**
 * Mecanique commune aux sequences de regles (quiz et battle royale).
 *
 * MEME MECANIQUE QUE LE TUTORIEL BLACKJACK : tout est cadence sur
 * `phaseStartedAt` (horloge serveur) et non sur le montage du composant. Une
 * dalle qui se reveille en plein milieu retombe exactement sur le chapitre et
 * la sous-etape du moment.
 *
 * Le sous-echelonnement intra-chapitre se fait par SEUILS compares a
 * `dansChapitre` (ms ecoulees depuis le debut du chapitre courant) : pas de
 * setTimeout en cascade, pas de requestAnimationFrame (suspendu si le kiosque
 * est occulte).
 *
 * Deux mises en page : grand ecran (deux colonnes) et telephone (empile).
 * Pas de max-w en rem piegeux : la borne applique un zoom CSS 1.4.
 *
 * Les CHAPITRES eux-memes vivent dans QuizRules.tsx et BattleRules.tsx : ce
 * fichier ne connait que la cadence, la mise en page et la progression.
 */

import React, { useEffect, useState } from 'react';
import { serverNow } from '../lib/gameClient';

// 7 s par slide : 8 s trainaient, 5 s ne laissaient pas finir de lire les
// chapitres denses. Retour de la deuxieme soiree : +2 s.
export const CHAPITRE_MS = 7000;

export interface Chapitre {
  cle: string;
  titre: string;
  phrase: string;
  /** visuel du chapitre : recoit (grand, dansChapitre ms) pour les sous-etapes */
  visuel: (grand: boolean, dans: number) => React.ReactNode;
}

/** apparition par seuil : opacité + translation, rien avant l'instant t */
export function Seuil({
  dans,
  a,
  children,
  className = '',
}: {
  dans: number;
  a: number;
  children: React.ReactNode;
  className?: string;
}) {
  const visible = dans >= a;
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.94)',
        transition: 'opacity 420ms ease, transform 420ms cubic-bezier(0.3, 1.2, 0.4, 1)',
      }}
    >
      {children}
    </div>
  );
}

export function Pastille({
  children,
  ton,
  grand,
}: {
  children: React.ReactNode;
  ton: string;
  grand: boolean;
}) {
  return (
    <span
      className={`rounded-full border-2 font-black uppercase tracking-wider ${ton} ${
        grand ? 'px-6 py-3 text-3xl' : 'px-3 py-1.5 text-sm'
      }`}
    >
      {children}
    </span>
  );
}

export function Etape({
  emoji,
  titre,
  sous,
  grand,
}: {
  emoji: string;
  titre: string;
  sous: string;
  grand: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border border-white/15 bg-white/5 text-center ${
        grand ? 'gap-3 px-6 py-6' : 'gap-1.5 px-3 py-3'
      }`}
    >
      <span className={grand ? 'text-6xl' : 'text-3xl'}>{emoji}</span>
      <span className={`font-black ${grand ? 'text-3xl' : 'text-sm'}`}>{titre}</span>
      <span className={`text-white/50 ${grand ? 'text-2xl' : 'text-xs'}`}>{sous}</span>
    </div>
  );
}

/**
 * Rend une sequence de chapitres. `surTitre` est le bandeau affiche au-dessus
 * de tous les chapitres sauf le premier (le slide titre, plein ecran).
 */
export function SequenceRegles({
  chapitres,
  phaseStartedAt,
  embedded,
  chapitreForce,
  surTitre,
}: {
  chapitres: Chapitre[];
  phaseStartedAt: number | null;
  embedded?: boolean;
  /** labo uniquement : fige un chapitre pour l'inspecter (jamais en partie) */
  chapitreForce?: number;
  surTitre: string;
}) {
  const grand = Boolean(embedded);

  // tick a 200 ms : assez pour les seuils intra-chapitre sans surcout notable
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 200);
    return () => clearInterval(t);
  }, []);

  const ecoule = phaseStartedAt === null ? 0 : Math.max(0, serverNow() - phaseStartedAt);
  // PAS DE BOUCLE : au dernier chapitre on s'arrete et on attend l'animateur.
  // Une boucle infinie donnait l'impression que rien ne se passait ; le joueur
  // doit savoir qu'il a tout lu et qu'il n'attend plus que le lancement.
  const naturel = Math.min(Math.floor(ecoule / CHAPITRE_MS), chapitres.length - 1);
  const index = chapitreForce === undefined ? naturel : chapitreForce % chapitres.length;
  // Temps ecoule DANS le chapitre courant. Sur le dernier il continue de
  // croitre au lieu de repartir a zero : sans ca, les elements deja apparus
  // disparaitraient a chaque periode en clignotant.
  const dansNaturel = ecoule - naturel * CHAPITRE_MS;
  // Labo : un chapitre choisi s'affiche dans son etat FINAL, tous les seuils
  // franchis. C'est ce qu'on veut pour regler une mise en page ; l'animation
  // se regarde en mode « auto ».
  const dansChapitre = chapitreForce === undefined ? dansNaturel : CHAPITRE_MS;
  const c = chapitres[index];
  const dernier = index === chapitres.length - 1;

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden ${grand ? 'px-12 py-8' : 'px-4 py-4'}`}>
      {c.cle !== 'titre' && (
        <p
          className={`shrink-0 text-center font-black uppercase tracking-[0.3em] text-cyan-300 ${
            grand ? 'text-3xl' : 'text-[11px]'
          }`}
        >
          {surTitre}
        </p>
      )}

      {/* key = re-jeu de l'animation d'entree a chaque bascule de chapitre */}
      {c.cle === 'titre' ? (
        // slide titre : plein ecran centre, sans colonne titre/visuel
        <div key={c.cle} className="anim-fade-up flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {c.visuel(grand, dansChapitre)}
        </div>
      ) : (
      <div
        key={c.cle}
        className={`anim-fade-up flex min-h-0 flex-1 overflow-hidden ${
          grand ? 'mt-6 flex-row items-center gap-12' : 'mt-3 flex-col items-center justify-center gap-4'
        }`}
      >
        <div className={grand ? 'w-[42%] shrink-0' : 'w-full shrink-0 text-center'}>
          <h2 className={`text-balance font-black ${grand ? 'text-6xl' : 'text-xl'}`}>{c.titre}</h2>
          <p className={`text-balance text-white/60 ${grand ? 'mt-3 text-3xl leading-snug' : 'mt-1.5 text-sm leading-snug'}`}>
            {c.phrase}
          </p>
        </div>
        {/* Seule zone qui cede quand l'ecran est court : le visuel.
            min-w-0 IMPERATIF : sans lui, un enfant plus large que la colonne
            (une phrase, une rangee de cartes) elargit la zone au lieu d'y
            tenir, et le contenu debordait sous le bloc titre. */}
        <div
          className={`flex min-h-0 min-w-0 items-center justify-center overflow-hidden ${
            grand ? 'h-full flex-1' : 'w-full flex-1'
          }`}
        >
          {c.visuel(grand, dansChapitre)}
        </div>
      </div>
      )}

      {/* barre de progression du chapitre + pastilles, comme le blackjack */}
      <div className={`shrink-0 ${grand ? '' : 'mt-3'}`}>
        {dernier && (
          <p
            className={`mb-2 text-center font-bold uppercase tracking-[0.25em] text-cyan-300/70 ${
              grand ? 'text-2xl' : 'text-[11px]'
            }`}
          >
            En attente de l'animateur
          </p>
        )}
        <div className={`mx-auto overflow-hidden rounded-full bg-white/10 ${grand ? 'h-1.5 w-72' : 'h-1 w-40'}`}>
          <div
            className="h-full rounded-full bg-cyan-300/70"
            style={{ width: `${Math.min(1, dansChapitre / CHAPITRE_MS) * 100}%` }}
          />
        </div>
        <div className={`flex items-center justify-center gap-2 ${grand ? 'mt-3' : 'mt-2'}`}>
          {chapitres.map((ch, i) => (
            <span
              key={ch.cle}
              className={`rounded-full transition-all duration-300 ${
                i === index ? 'bg-cyan-300' : i < index ? 'bg-cyan-300/40' : 'bg-white/20'
              } ${
                grand
                  ? i === index
                    ? 'h-2.5 w-12'
                    : 'h-2.5 w-5'
                  : i === index
                    ? 'h-1.5 w-7'
                    : 'h-1.5 w-3'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
