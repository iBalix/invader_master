/**
 * Écran de règles du quiz/blindtest — séquence animée : slide titre puis chapitres.
 *
 * MÊME MÉCANIQUE QUE LE TUTORIEL BLACKJACK : tout est cadencé sur
 * `phaseStartedAt` (horloge serveur) et non sur le montage du composant. Une
 * dalle qui se réveille en plein milieu retombe exactement sur le chapitre et
 * la sous-étape du moment. La phase règles n'a pas de durée fixe (le GM la
 * coupe quand il veut), donc la séquence BOUCLE (modulo).
 *
 * Le sous-échelonnement intra-chapitre se fait par SEUILS comparés à `dansChapitre`
 * (ms écoulées depuis le début du chapitre courant) : pas de setTimeout en
 * cascade, pas de requestAnimationFrame (suspendu si le kiosque est occulté).
 *
 * Deux mises en page : table (deux colonnes, gros) et téléphone (empilé).
 * Pas de max-w en rem piégeux : la borne applique un zoom CSS 1.4.
 */

import React, { useEffect, useState } from 'react';
import {
  JOKER_DEFS,
  JOKER_TYPES,
  serverNow,
  SPEED_BONUS,
  STREAK_BONUS_FROM,
} from '../lib/gameClient';

// 7 s par slide : 8 s trainaient, 5 s ne laissaient pas finir de lire les
// chapitres denses (jokers, serie). Retour de la deuxieme soiree : +2 s.
const CHAPITRE_MS = 7000;

interface Chapitre {
  cle: string;
  titre: string;
  phrase: string;
  /** visuel du chapitre : reçoit (grand, dansChapitre ms) pour les sous-étapes */
  visuel: (grand: boolean, dans: number) => React.ReactNode;
}

/** apparition par seuil : opacité + translation, rien avant l'instant t */
function Seuil({
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
      className={`rounded-full border-2 font-black uppercase tracking-wider ${ton} ${
        grand ? 'px-6 py-3 text-3xl' : 'px-3 py-1.5 text-sm'
      }`}
    >
      {children}
    </span>
  );
}

function Etape({
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

const CHAPITRES: Chapitre[] = [
  {
    // Slide TITRE, meme esprit que l'intro du tutoriel blackjack : on pose le
    // cadre avant d'expliquer quoi que ce soit. Rendu plein ecran dedie dans
    // le composant (pas de colonne titre/visuel pour celle-ci).
    cle: 'titre',
    titre: 'Quiz Invader',
    phrase: 'Règles du jeu',
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center text-center">
        <Seuil dans={dans} a={200}>
          <h1
            className={`anim-title-glow font-black uppercase ${
              grand ? 'text-9xl tracking-[0.12em]' : 'text-4xl tracking-[0.1em]'
            }`}
          >
            Quiz Invader
          </h1>
        </Seuil>
        <Seuil dans={dans} a={1400}>
          <p
            className={`font-black uppercase tracking-[0.35em] text-cyan-300 ${
              grand ? 'mt-8 text-5xl' : 'mt-4 text-lg'
            }`}
          >
            Règles du jeu
          </p>
        </Seuil>
        <Seuil dans={dans} a={2600}>
          <p className={`text-white/60 ${grand ? 'mt-10 text-3xl' : 'mt-6 text-sm'}`}>
            Tout se joue sur ton écran. On t'explique, la partie démarre juste après.
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'but',
    titre: 'Le but du jeu',
    phrase: 'Réponds juste, réponds vite, grimpe au classement. Ton écran est ta manette.',
    visuel: (grand, dans) => (
      <div className={`w-full ${grand ? 'max-w-2xl' : ''}`}>
        <Seuil dans={dans} a={200}>
          <div className={`rounded-2xl border border-white/15 bg-white/5 text-center font-bold ${grand ? 'px-8 py-5 text-4xl' : 'px-3 py-1.5 text-xs'}`}>
            🎵 « Quel groupe chante Smells Like Teen Spirit ? »
          </div>
        </Seuil>
        <div className={`mt-2 grid grid-cols-2 ${grand ? 'gap-4' : 'gap-1'}`}>
          {['Pearl Jam', 'Nirvana', 'Soundgarden', 'Alice in Chains'].map((r, i) => (
            <Seuil key={r} dans={dans} a={900 + i * 260}>
              <div
                className={`rounded-xl border-2 text-center font-bold ${grand ? 'px-4 py-4 text-3xl' : 'px-2 py-1.5 text-xs'} ${
                  i === 1 && dans >= 3200
                    ? 'anim-pop border-emerald-400 bg-emerald-400/20 text-emerald-200'
                    : 'border-white/15 bg-white/5 text-white/70'
                }`}
              >
                {r}
              </div>
            </Seuil>
          ))}
        </div>
        <Seuil dans={dans} a={2800}>
          <p className={`mt-1.5 text-center font-black text-emerald-300 ${grand ? 'text-3xl' : 'text-xs'}`}>
            ✓ Bonne réponse, les points tombent !
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'deroule',
    titre: "Le déroulé d'une question",
    phrase: 'Trois temps, toujours les mêmes. Les jokers se jouent à l’annonce, pas après.',
    visuel: (grand, dans) => (
      <div className={`grid w-full grid-cols-3 ${grand ? 'max-w-3xl gap-5' : 'gap-2'}`}>
        {[
          { emoji: '📣', titre: 'Annonce', sous: 'Thème et difficulté : joue tes jokers' },
          { emoji: '⏱️', titre: 'Question', sous: 'Réponds avant la fin du chrono' },
          { emoji: '✨', titre: 'Révélation', sous: 'Verdict, série et jokers gagnés' },
        ].map((e, i) => (
          <Seuil key={e.titre} dans={dans} a={300 + i * 650}>
            <Etape {...e} grand={grand} />
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'types',
    titre: 'Trois façons de répondre',
    phrase: 'QCM, estimation au plus proche, ou réponse libre jugée par une IA (et rattrapable par l\'animateur).',
    visuel: (grand, dans) => (
      <div className={`flex w-full flex-col ${grand ? 'max-w-2xl gap-4' : 'gap-1.5'}`}>
        {[
          { emoji: '🔤', titre: 'QCM', sous: '4 choix, un seul est bon' },
          { emoji: '🔢', titre: 'Estimation', sous: 'Un nombre : plus tu es proche, plus tu marques' },
          { emoji: '✍️', titre: 'Réponse libre', sous: 'Écris ta réponse, l\'orthographe approximative passe' },
        ].map((t, i) => (
          <Seuil key={t.titre} dans={dans} a={300 + i * 700}>
            <div className={`flex items-center rounded-2xl border border-white/15 bg-white/5 ${grand ? 'gap-5 px-6 py-4' : 'gap-2.5 px-2.5 py-1.5'}`}>
              <span className={grand ? 'text-5xl' : 'text-xl'}>{t.emoji}</span>
              <span className="text-left">
                <span className={`block font-black ${grand ? 'text-3xl' : 'text-[13px]'}`}>{t.titre}</span>
                <span className={`block leading-snug text-white/50 ${grand ? 'text-2xl' : 'text-[11px]'}`}>{t.sous}</span>
              </span>
            </div>
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'points',
    titre: 'Difficulté et points',
    phrase: 'La couleur annonce la mise. Les estimations paient selon ta précision.',
    visuel: (grand, dans) => (
      <div className={`flex w-full max-w-full flex-wrap items-center justify-center ${grand ? 'gap-6' : 'gap-3'}`}>
        {[
          { l: 'Facile · 1 pt', ton: 'border-emerald-400/70 bg-emerald-400/15 text-emerald-200' },
          { l: 'Moyen · 2 pts', ton: 'border-amber-400/70 bg-amber-400/15 text-amber-200' },
          { l: 'Difficile · 3 pts', ton: 'border-rose-400/70 bg-rose-400/15 text-rose-200' },
        ].map((x, i) => (
          <Seuil key={x.l} dans={dans} a={400 + i * 550}>
            <Pastille ton={x.ton} grand={grand}>
              {x.l}
            </Pastille>
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'rapidite',
    titre: 'Le podium de rapidité',
    phrase: `Sur les QCM, le plus rapide des bons répondeurs prend +${SPEED_BONUS[0]} points, les 2e et 3e +${SPEED_BONUS[1]}.`,
    visuel: (grand, dans) => (
      <div className={`flex items-end justify-center ${grand ? 'gap-8' : 'gap-4'}`}>
        {[
          { m: '🥈', h: grand ? 'h-24' : 'h-14', a: 900, pts: SPEED_BONUS[1] },
          { m: '🥇', h: grand ? 'h-32' : 'h-20', a: 400, pts: SPEED_BONUS[0] },
          { m: '🥉', h: grand ? 'h-20' : 'h-11', a: 1400, pts: SPEED_BONUS[2] },
        ].map((p, i) => (
          <Seuil key={i} dans={dans} a={p.a}>
            <div className="flex flex-col items-center">
              <span className={grand ? 'text-6xl' : 'text-3xl'}>{p.m}</span>
              <div
                className={`mt-2 flex w-16 items-center justify-center rounded-t-xl border-2 border-b-0 border-amber-400/60 bg-amber-400/15 ${p.h} ${grand ? 'w-24' : ''}`}
              >
                <span className={`font-black text-amber-300 ${grand ? 'text-5xl' : 'text-xl'}`}>
                  +{p.pts}
                </span>
              </div>
            </div>
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'serie',
    titre: 'La série',
    phrase: `${STREAK_BONUS_FROM} bonnes réponses d'affilée, et chaque bonne réponse paie +1. Une erreur, et tout repart de zéro.`,
    visuel: (grand, dans) => (
      <div className="flex w-full max-w-full flex-col items-center">
        <div className={`flex items-center ${grand ? 'gap-3' : 'gap-1.5'}`}>
          {Array.from({ length: STREAK_BONUS_FROM }, (_, i) => (
            <Seuil key={i} dans={dans} a={300 + i * 420}>
              <span
                className={`flex items-center justify-center rounded-full border-2 font-black tabular-nums ${
                  grand ? 'h-16 w-16 text-3xl' : 'h-9 w-9 text-sm'
                } ${
                  i + 1 >= STREAK_BONUS_FROM
                    ? 'border-amber-300 bg-amber-400/25 text-amber-200'
                    : 'border-orange-400/60 bg-orange-400/15 text-orange-200'
                }`}
              >
                {i + 1}
              </span>
            </Seuil>
          ))}
        </div>
        <Seuil dans={dans} a={300 + STREAK_BONUS_FROM * 420 + 300}>
          <p className={`mt-4 font-black text-amber-200 ${grand ? 'text-4xl' : 'text-lg'}`}>
            🔥 En feu : +1 pt par bonne réponse !
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'jokers',
    titre: 'Les jokers',
    phrase: "Trois pouvoirs, deux en main au maximum. Ils se jouent tous pendant l'annonce, avant la question.",
    visuel: (grand, dans) => (
      <div className={`grid w-full grid-cols-3 ${grand ? 'max-w-3xl gap-5' : 'gap-2'}`}>
        {JOKER_TYPES.map((t, i) => {
          const def = JOKER_DEFS[t];
          return (
            <Seuil key={t} dans={dans} a={300 + i * 700}>
              <div
                className={`flex h-full flex-col items-center rounded-2xl border-2 text-center ${
                  grand ? 'gap-2 px-4 py-5' : 'gap-1 px-2 py-3'
                }`}
                style={{
                  borderColor: `${def.couleur}88`,
                  background: `${def.couleur}12`,
                  boxShadow: dans >= 300 + i * 700 + 400 ? `0 0 22px ${def.ombre}` : undefined,
                  transition: 'box-shadow 500ms ease',
                }}
              >
                <span className={grand ? 'text-6xl' : 'text-2xl'}>{def.emoji}</span>
                <span className={`font-black uppercase ${grand ? 'text-2xl' : 'text-xs'}`} style={{ color: def.couleur }}>
                  {def.label}
                </span>
                <span className={`text-white/60 ${grand ? 'text-lg' : 'text-[10px]'}`}>{def.description}</span>
              </div>
            </Seuil>
          );
        })}
      </div>
    ),
  },
  {
    cle: 'gagner',
    titre: 'Comment on les gagne',
    phrase: 'Chaque bonne réponse peut déclencher un tirage. Plus tu es bas au classement, plus tu as de chances !',
    visuel: (grand, dans) => (
      <div className="flex w-full max-w-full flex-col items-center">
        {/* mini-roue décorative : trois cartes, celle du centre en avant */}
        <div className={`flex items-center ${grand ? 'gap-4' : 'gap-2'}`}>
          {JOKER_TYPES.map((t, i) => {
            const def = JOKER_DEFS[t];
            const centre = i === 1;
            return (
              <Seuil key={t} dans={dans} a={300 + i * 300}>
                <div
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 ${
                    grand
                      ? centre ? 'h-36 w-28' : 'h-28 w-24'
                      : centre ? 'h-20 w-16' : 'h-14 w-12'
                  }`}
                  style={{
                    borderColor: centre ? def.couleur : `${def.couleur}44`,
                    background: `${def.couleur}${centre ? '20' : '0c'}`,
                    transform: centre && dans >= 1600 ? 'scale(1.12)' : 'scale(1)',
                    boxShadow: centre && dans >= 1600 ? `0 0 30px ${def.ombre}` : undefined,
                    transition: 'transform 400ms cubic-bezier(0.3, 1.2, 0.4, 1), box-shadow 400ms ease',
                  }}
                >
                  <span className={grand ? 'text-5xl' : 'text-xl'}>{def.emoji}</span>
                </div>
              </Seuil>
            );
          })}
        </div>
        <Seuil dans={dans} a={2200}>
          <p className={`text-center text-white/60 ${grand ? 'mt-4 text-3xl' : 'mt-3 text-xs'}`}>
            🎁 L'animateur peut aussi en distribuer... reste attentif !
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'pret',
    titre: 'Prêt ?',
    phrase: "Tu sais tout. L'animateur lance la partie dans un instant, reste sur cet écran.",
    visuel: (grand, dans) => (
      <div className="flex w-full max-w-full flex-col items-center">
        <Seuil dans={dans} a={300}>
          <div className={`anim-glow flex items-center justify-center rounded-full border-4 border-cyan-300/70 bg-cyan-400/10 ${grand ? 'h-40 w-40' : 'h-24 w-24'}`}>
            <span className={grand ? 'text-8xl' : 'text-4xl'}>🚀</span>
          </div>
        </Seuil>
        <Seuil dans={dans} a={900}>
          <p className={`mt-5 font-black uppercase tracking-widest text-cyan-200 ${grand ? 'text-4xl' : 'text-lg'}`}>
            Que le meilleur gagne !
          </p>
        </Seuil>
        {/* trois points qui respirent : on attend, et ca se voit */}
        <Seuil dans={dans} a={1500}>
          <div className={`flex items-center justify-center gap-2 ${grand ? 'mt-6' : 'mt-4'}`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`anim-pulse-soft rounded-full bg-cyan-300/70 ${grand ? 'h-4 w-4' : 'h-2.5 w-2.5'}`}
                style={{ animationDelay: `${i * 0.22}s` }}
              />
            ))}
          </div>
        </Seuil>
      </div>
    ),
  },
];

/** nombre de chapitres, pour le selecteur du laboratoire */
export const NB_CHAPITRES_REGLES = CHAPITRES.length;

export default function QuizRules({
  phaseStartedAt,
  embedded,
  chapitreForce,
}: {
  phaseStartedAt: number | null;
  embedded?: boolean;
  /** labo uniquement : fige un chapitre pour l'inspecter (jamais en partie) */
  chapitreForce?: number;
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
  const naturel = Math.min(Math.floor(ecoule / CHAPITRE_MS), CHAPITRES.length - 1);
  const index = chapitreForce === undefined ? naturel : chapitreForce % CHAPITRES.length;
  // Temps ecoule DANS le chapitre courant. Sur le dernier il continue de
  // croitre au lieu de repartir a zero : sans ca, les elements deja apparus
  // disparaitraient a chaque periode en clignotant.
  const dansNaturel = ecoule - naturel * CHAPITRE_MS;
  // Labo : un chapitre choisi s'affiche dans son etat FINAL, tous les seuils
  // franchis. C'est ce qu'on veut pour regler une mise en page ; l'animation
  // se regarde en mode « auto ».
  const dansChapitre = chapitreForce === undefined ? dansNaturel : CHAPITRE_MS;
  const c = CHAPITRES[index];
  const dernier = index === CHAPITRES.length - 1;

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden ${grand ? 'px-12 py-8' : 'px-4 py-4'}`}>
      {c.cle !== 'titre' && (
        <p
          className={`shrink-0 text-center font-black uppercase tracking-[0.3em] text-cyan-300 ${
            grand ? 'text-3xl' : 'text-[11px]'
          }`}
        >
          Comment on joue
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
          {CHAPITRES.map((ch, i) => (
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
