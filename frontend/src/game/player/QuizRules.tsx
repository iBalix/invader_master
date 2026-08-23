/**
 * Presentation des regles du quiz, en chapitres animes.
 *
 * POURQUOI CE COMPOSANT : l'ecran precedent tenait en quatre puces de texte. Il
 * ne disait ni le deroule d'une question, ni les types de reponse, ni le bareme
 * de difficulte, et il laissait 80 % de la dalle vide. Sur une borne regardee a
 * un bras de distance, pendant que l'animateur presente la soiree, c'est le
 * moment ou on peut vraiment expliquer le jeu.
 *
 * CADENCE SUR L'HORLOGE SERVEUR, et c'est le point important, repris du
 * tutoriel blackjack : le chapitre affiche est deduit du temps ecoule depuis
 * `phaseStartedAt`, pas d'un minuteur local demarre au montage. Consequences :
 * toutes les bornes de la salle montrent le MEME chapitre au meme instant, et
 * une dalle qui se reveille ou se recharge en cours de route retombe pile sur
 * l'etat courant au lieu de repartir du debut.
 *
 * La boucle est volontaire : la phase de regles n'a pas de duree fixe, elle
 * dure le temps que l'animateur parle. On tourne donc en rond jusqu'au
 * demarrage.
 */

import { useEffect, useState } from 'react';
import { serverNow } from '../lib/gameClient';

/** duree d'un chapitre : assez pour lire sans avoir le temps de s'ennuyer */
const CHAPITRE_MS = 7000;

interface Chapitre {
  cle: string;
  titre: string;
  phrase: string;
  /** illustration de droite (ou du dessous sur telephone) */
  visuel: (embedded: boolean) => React.ReactNode;
}

/** Etiquette ronde, reprise a l'identique dans plusieurs chapitres. */
function Pastille({
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
      className={`inline-flex items-center gap-2 rounded-full border-2 font-black uppercase tracking-wider ${ton} ${
        grand ? 'px-6 py-3 text-2xl' : 'px-3 py-1.5 text-sm'
      }`}
    >
      {children}
    </span>
  );
}

/** Une etape du deroule, avec sa fleche. */
function Etape({ emoji, titre, sous, grand }: { emoji: string; titre: string; sous: string; grand: boolean }) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/5 text-center ${
        grand ? 'px-5 py-6' : 'px-3 py-4'
      }`}
    >
      <span className={grand ? 'text-5xl' : 'text-3xl'}>{emoji}</span>
      <span className={`font-black uppercase tracking-wider ${grand ? 'text-xl' : 'text-sm'}`}>{titre}</span>
      <span className={`text-white/60 ${grand ? 'text-base' : 'text-xs'}`}>{sous}</span>
    </div>
  );
}

const CHAPITRES: Chapitre[] = [
  {
    cle: 'but',
    titre: 'Le but du jeu',
    phrase:
      'Une question s\'affiche sur le grand écran. Tu réponds ici, sur cette table ou sur ton téléphone. Le plus juste ET le plus rapide gagne.',
    visuel: (grand) => (
      <div className="flex w-full flex-col gap-3">
        <div className={`rounded-2xl border border-white/15 bg-white/5 ${grand ? 'px-6 py-5' : 'px-4 py-3'}`}>
          <p className={`text-white/50 ${grand ? 'text-base' : 'text-xs'}`}>QUESTION 3 / 40</p>
          <p className={`mt-1 font-bold ${grand ? 'text-2xl' : 'text-base'}`}>
            Quel groupe chante « Smells Like Teen Spirit » ?
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['Oasis', 'Nirvana', 'Blur', 'Pixies'].map((r, i) => (
            <div
              key={r}
              className={`rounded-xl border-2 text-center font-bold ${
                i === 1
                  ? 'anim-pop border-emerald-400 bg-emerald-400/20 text-emerald-200'
                  : 'border-white/15 bg-white/5 text-white/70'
              } ${grand ? 'px-4 py-4 text-xl' : 'px-2 py-2 text-sm'}`}
            >
              {r}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    cle: 'deroule',
    titre: 'Le déroulé d\'une question',
    phrase:
      'Trois temps, toujours les mêmes. Pendant l\'annonce tu peux activer ton joker. Pendant la question tu réponds. Puis l\'écran révèle la bonne réponse.',
    visuel: (grand) => (
      <div className="flex w-full items-stretch gap-3">
        <Etape emoji="📣" titre="Annonce" sous="Active ton joker" grand={grand} />
        <Etape emoji="⏱️" titre="Question" sous="Réponds vite" grand={grand} />
        <Etape emoji="✅" titre="Révélation" sous="Le verdict tombe" grand={grand} />
      </div>
    ),
  },
  {
    cle: 'types',
    titre: 'Trois façons de répondre',
    phrase:
      'La plupart des questions sont des QCM. Certaines demandent un nombre, et tu marques selon ton écart. D\'autres attendent une réponse libre, jugée automatiquement.',
    visuel: (grand) => (
      <div className="flex w-full flex-col gap-3">
        {[
          { emoji: '🔤', nom: 'QCM', detail: '4 réponses, une seule bonne' },
          { emoji: '🔢', nom: 'Estimation', detail: 'un nombre, des points selon l\'écart' },
          { emoji: '✍️', nom: 'Réponse libre', detail: 'tu écris, l\'IA juge' },
        ].map((x) => (
          <div
            key={x.nom}
            className={`flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 ${
              grand ? 'px-6 py-5' : 'px-4 py-3'
            }`}
          >
            <span className={grand ? 'text-4xl' : 'text-2xl'}>{x.emoji}</span>
            <span className="min-w-0">
              <span className={`block font-black uppercase tracking-wider ${grand ? 'text-xl' : 'text-sm'}`}>
                {x.nom}
              </span>
              <span className={`block text-white/60 ${grand ? 'text-lg' : 'text-xs'}`}>{x.detail}</span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    cle: 'points',
    titre: 'Difficulté et points',
    phrase:
      'Chaque question annonce sa difficulté et ce qu\'elle rapporte. Plus c\'est dur, plus ça paye. Le barème est affiché avant que tu répondes.',
    visuel: (grand) => (
      <div className="flex w-full flex-col gap-4">
        {[
          { d: 'Facile', pts: '1 point', ton: 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200' },
          { d: 'Moyen', pts: '2 points', ton: 'border-amber-400/60 bg-amber-400/15 text-amber-200' },
          { d: 'Difficile', pts: '3 points', ton: 'border-rose-400/60 bg-rose-400/15 text-rose-200' },
        ].map((x) => (
          <div key={x.d} className="flex items-center justify-between gap-4">
            <Pastille ton={x.ton} grand={grand}>
              {x.d}
            </Pastille>
            <span className={`font-black tabular-nums text-white ${grand ? 'text-3xl' : 'text-lg'}`}>{x.pts}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    cle: 'rapidite',
    titre: 'Le bonus de rapidité',
    phrase:
      'Parmi tous ceux qui ont juste, le plus rapide empoche 1 point de plus. À égalité de connaissances, c\'est la main qui départage.',
    visuel: (grand) => (
      <div className="flex w-full flex-col items-center gap-4">
        <span className={grand ? 'text-8xl' : 'text-5xl'}>⚡</span>
        <div
          className={`rounded-3xl border-2 border-amber-400/60 bg-amber-400/15 text-center ${
            grand ? 'px-10 py-6' : 'px-6 py-4'
          }`}
        >
          <p className={`font-black text-amber-300 ${grand ? 'text-4xl' : 'text-2xl'}`}>+1 point</p>
          <p className={`mt-1 font-bold uppercase tracking-[0.2em] text-amber-200/80 ${grand ? 'text-lg' : 'text-xs'}`}>
            au plus rapide
          </p>
        </div>
      </div>
    ),
  },
  {
    cle: 'joker',
    titre: 'Le joker quitte ou double',
    phrase:
      'Deux jokers par partie. Active-le PENDANT L\'ANNONCE, avant de voir la question. Bonne réponse, tes points sont doublés. Mauvaise, tu ne perds rien.',
    visuel: (grand) => (
      <div className="flex w-full flex-col gap-4">
        <div
          className={`flex items-center gap-4 rounded-2xl border-2 border-violet-400/60 bg-violet-500/20 ${
            grand ? 'px-6 py-6' : 'px-4 py-4'
          }`}
        >
          <span className={`anim-pop ${grand ? 'text-6xl' : 'text-4xl'}`}>🎲</span>
          <span>
            <span className={`block font-black text-violet-100 ${grand ? 'text-3xl' : 'text-lg'}`}>×2</span>
            <span className={`block text-violet-200/80 ${grand ? 'text-lg' : 'text-xs'}`}>2 jokers par partie</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-2xl border border-emerald-400/50 bg-emerald-400/10 text-center ${
              grand ? 'px-4 py-5' : 'px-3 py-3'
            }`}
          >
            <p className={`font-black text-emerald-300 ${grand ? 'text-2xl' : 'text-base'}`}>Bonne</p>
            <p className={`text-emerald-200/70 ${grand ? 'text-lg' : 'text-xs'}`}>points doublés</p>
          </div>
          <div
            className={`rounded-2xl border border-white/20 bg-white/5 text-center ${
              grand ? 'px-4 py-5' : 'px-3 py-3'
            }`}
          >
            <p className={`font-black text-white/80 ${grand ? 'text-2xl' : 'text-base'}`}>Mauvaise</p>
            <p className={`text-white/50 ${grand ? 'text-lg' : 'text-xs'}`}>rien à perdre</p>
          </div>
        </div>
      </div>
    ),
  },
];

export default function QuizRules({
  phaseStartedAt,
  embedded,
}: {
  phaseStartedAt: number | null;
  embedded?: boolean;
}) {
  const indexDe = () => {
    if (phaseStartedAt === null) return 0;
    const ecoule = Math.max(0, serverNow() - phaseStartedAt);
    return Math.floor(ecoule / CHAPITRE_MS) % CHAPITRES.length;
  };
  const [index, setIndex] = useState(indexDe);

  useEffect(() => {
    const tick = () => setIndex(indexDe());
    tick();
    // 250 ms : on ne cherche pas la fluidite, juste a ne pas rater la bascule
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseStartedAt]);

  const c = CHAPITRES[index];
  const grand = Boolean(embedded);

  return (
    <div className={`flex h-full w-full flex-col ${grand ? 'px-12 py-8' : 'px-5 py-6'}`}>
      <p
        className={`shrink-0 font-black uppercase tracking-[0.3em] text-cyan-300 ${
          grand ? 'text-xl' : 'text-xs'
        }`}
      >
        Comment on joue
      </p>

      {/* key sur la cle du chapitre : le contenu se rejoue a chaque bascule */}
      <div
        key={c.cle}
        className={`anim-fade-up flex min-h-0 flex-1 items-center ${
          grand ? 'mt-6 gap-12' : 'mt-4 flex-col justify-center gap-5'
        }`}
      >
        <div className={grand ? 'w-[42%] shrink-0' : 'w-full'}>
          <h2 className={`font-black leading-tight ${grand ? 'text-5xl' : 'text-2xl'}`}>{c.titre}</h2>
          <p className={`mt-4 text-balance text-white/70 ${grand ? 'text-2xl leading-snug' : 'text-base'}`}>
            {c.phrase}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">{c.visuel(grand)}</div>
      </div>

      {/* progression : on voit qu'il reste des chapitres, et lesquels */}
      <div className={`flex shrink-0 justify-center gap-2 ${grand ? 'mt-8' : 'mt-5'}`}>
        {CHAPITRES.map((ch, i) => (
          <span
            key={ch.cle}
            className={`rounded-full transition-all duration-300 ${
              i === index ? 'bg-cyan-300' : 'bg-white/20'
            } ${grand ? (i === index ? 'h-2.5 w-12' : 'h-2.5 w-5') : i === index ? 'h-1.5 w-7' : 'h-1.5 w-3'}`}
          />
        ))}
      </div>
    </div>
  );
}
