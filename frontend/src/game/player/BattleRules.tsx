/**
 * Chapitres de la sequence de regles de la BATTLE ROYALE.
 *
 * La mecanique (cadence sur l'horloge serveur, mise en page, barre de
 * progression) vit dans rulesKit.tsx et est partagee avec le quiz : ici,
 * uniquement le CONTENU propre a la battle.
 *
 * Le legacy affichait quatre lignes fixes. Les retours de soiree du quiz ont
 * montre qu'un tutoriel cadence, lu a voix haute par l'animateur pendant qu'il
 * defile, fait entrer les regles bien mieux qu'une liste : la battle a des
 * regles PLUS surprenantes que le quiz (on marque encore une fois elimine, la
 * place de manche rapporte plus que les questions), elles meritent ce temps.
 */

import { Etape, Pastille, SequenceRegles, Seuil, type Chapitre } from './rulesKit';

/** bareme de fin de manche, miroir de ROUND_BONUS cote serveur */
const BAREME: Array<[string, number]> = [
  ['1er', 25],
  ['2e', 20],
  ['3e', 18],
  ['4e', 17],
  ['…', 0],
  ['20e', 1],
];

const CHAPITRES: Chapitre[] = [
  {
    // Slide TITRE : on pose le cadre avant d'expliquer quoi que ce soit.
    // Rendu plein ecran dedie par le kit (pas de colonne titre/visuel).
    cle: 'titre',
    titre: 'Battle Royale',
    phrase: 'Règles du jeu',
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center text-center">
        <Seuil dans={dans} a={200}>
          <h1
            className={`anim-title-glow font-black uppercase ${
              grand ? 'text-9xl tracking-[0.12em]' : 'text-4xl tracking-[0.1em]'
            }`}
          >
            Battle Royale
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
            Une seule règle compte : rester debout. On t'explique le reste.
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'but',
    titre: 'Le but du jeu',
    phrase: 'Tout le monde répond en même temps. Le dernier debout remporte la manche.',
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center">
        <Seuil dans={dans} a={200}>
          <div className={`flex flex-wrap justify-center ${grand ? 'max-w-2xl gap-2' : 'gap-1'}`}>
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all duration-500 ${
                  grand ? 'h-7 w-7' : 'h-3.5 w-3.5'
                } ${
                  dans >= 1600 + i * 90 && i > 0
                    ? 'bg-white/10'
                    : 'bg-cyan-400 shadow-[0_0_12px_rgba(76,201,240,0.7)]'
                }`}
              />
            ))}
          </div>
        </Seuil>
        <Seuil dans={dans} a={4200}>
          <p className={`text-center font-black text-cyan-300 ${grand ? 'mt-8 text-4xl' : 'mt-4 text-base'}`}>
            👑 1 seul survivant
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'elimination',
    titre: 'Une erreur et tu tombes',
    phrase: 'Mauvaise réponse ou pas de réponse : tu es éliminé de la manche. Pas de seconde chance.',
    visuel: (grand, dans) => (
      <div className={`w-full ${grand ? 'max-w-2xl' : ''}`}>
        <Seuil dans={dans} a={200}>
          <div
            className={`rounded-2xl border border-white/15 bg-white/5 text-center font-bold ${
              grand ? 'px-8 py-5 text-3xl' : 'px-3 py-2 text-xs'
            }`}
          >
            « Quelle console a vu naître Zelda ? »
          </div>
        </Seuil>
        <div className={`mt-2 grid grid-cols-2 ${grand ? 'gap-4' : 'gap-1.5'}`}>
          {['Master System', 'NES', 'Game Boy', 'PC Engine'].map((r, i) => (
            <Seuil key={r} dans={dans} a={900 + i * 240}>
              <div
                className={`rounded-xl border-2 text-center font-bold ${
                  grand ? 'px-4 py-4 text-2xl' : 'px-2 py-1.5 text-xs'
                } ${
                  dans < 3000
                    ? 'border-white/15 bg-white/5 text-white/70'
                    : i === 1
                      ? 'anim-pop border-emerald-400 bg-emerald-400/20 text-emerald-200'
                      : 'border-rose-400/40 bg-rose-400/10 text-rose-200/70 line-through'
                }`}
              >
                {r}
              </div>
            </Seuil>
          ))}
        </div>
        <Seuil dans={dans} a={3600}>
          <p className={`mt-2 text-center font-black text-rose-300 ${grand ? 'text-3xl' : 'text-xs'}`}>
            💀 Les trois autres sont éliminés
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'deroule',
    titre: "Le déroulé d'une question",
    phrase: 'Trois temps, toujours les mêmes. Quinze secondes pour répondre, pas une de plus.',
    visuel: (grand, dans) => (
      <div className={`grid w-full grid-cols-3 ${grand ? 'max-w-3xl gap-5' : 'gap-2'}`}>
        {[
          { emoji: '📣', titre: 'Annonce', sous: 'Catégorie et difficulté, puis 3-2-1' },
          { emoji: '⏱️', titre: 'Question', sous: '15 secondes, tout le monde ensemble' },
          { emoji: '💀', titre: 'Verdict', sous: 'Qui reste, qui tombe' },
        ].map((e, i) => (
          <Seuil key={e.titre} dans={dans} a={300 + i * 650}>
            <Etape {...e} grand={grand} />
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'points',
    titre: 'Éliminé, mais pas fini',
    phrase: 'Chaque bonne réponse rapporte 1 point, même après ton élimination. Continue de jouer.',
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center gap-3">
        <Seuil dans={dans} a={200}>
          <div
            className={`flex items-center gap-3 rounded-2xl border-2 border-rose-400/40 bg-rose-400/10 ${
              grand ? 'px-8 py-5' : 'px-4 py-2.5'
            }`}
          >
            <span className={grand ? 'text-6xl' : 'text-3xl'}>💀</span>
            <span className={`font-black uppercase text-rose-300 ${grand ? 'text-4xl' : 'text-base'}`}>
              Éliminé
            </span>
          </div>
        </Seuil>
        <Seuil dans={dans} a={1600}>
          <p className={`font-black text-white/40 ${grand ? 'text-4xl' : 'text-lg'}`}>↓</p>
        </Seuil>
        <Seuil dans={dans} a={2600}>
          <div className={`flex flex-wrap justify-center ${grand ? 'gap-3' : 'gap-1.5'}`}>
            {['+1', '+1', '+1'].map((p, i) => (
              <Pastille key={i} ton="border-emerald-400/60 bg-emerald-400/15 text-emerald-200" grand={grand}>
                {p}
              </Pastille>
            ))}
          </div>
        </Seuil>
        <Seuil dans={dans} a={4000}>
          <p className={`text-center text-white/60 ${grand ? 'text-2xl' : 'text-xs'}`}>
            Ces points comptent au classement général.
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'bareme',
    titre: 'Ta place rapporte gros',
    phrase: 'À la fin de la manche, plus tu as tenu longtemps, plus tu marques. Le survivant rafle 25 points.',
    visuel: (grand, dans) => (
      <div className={`w-full ${grand ? 'max-w-2xl' : ''}`}>
        <div className={`flex flex-col ${grand ? 'gap-2.5' : 'gap-1'}`}>
          {BAREME.map(([rang, pts], i) => (
            <Seuil key={rang} dans={dans} a={300 + i * 420}>
              <div
                className={`flex items-center justify-between rounded-xl border ${
                  i === 0
                    ? 'border-amber-400/60 bg-amber-400/15'
                    : 'border-white/10 bg-white/5'
                } ${grand ? 'px-6 py-3' : 'px-3 py-1.5'}`}
              >
                <span className={`font-black ${i === 0 ? 'text-amber-300' : 'text-white/70'} ${grand ? 'text-3xl' : 'text-sm'}`}>
                  {i === 0 ? '👑 ' : ''}
                  {rang}
                </span>
                <span
                  className={`font-black tabular-nums ${i === 0 ? 'text-amber-300' : 'text-cyan-300'} ${
                    grand ? 'text-3xl' : 'text-sm'
                  }`}
                >
                  {pts > 0 ? `+${pts}` : '…'}
                </span>
              </div>
            </Seuil>
          ))}
        </div>
      </div>
    ),
  },
  {
    cle: 'manches',
    titre: 'On repart à zéro',
    phrase: 'À chaque nouvelle manche, tout le monde revient en jeu. Les points, eux, sont gardés.',
    visuel: (grand, dans) => (
      <div className={`grid w-full grid-cols-3 ${grand ? 'max-w-3xl gap-5' : 'gap-2'}`}>
        {[
          { emoji: '⚔️', titre: 'Manche 1', sous: 'Tout le monde en lice' },
          { emoji: '🔁', titre: 'Manche 2', sous: 'Les éliminés reviennent' },
          { emoji: '📈', titre: 'Les points', sous: "S'additionnent d'une manche à l'autre" },
        ].map((e, i) => (
          <Seuil key={e.titre} dans={dans} a={300 + i * 650}>
            <Etape {...e} grand={grand} />
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'paliers',
    titre: 'La salle se vide',
    phrase: "À vingt, dix, cinq puis trois survivants, l'écran s'arrête sur ceux qui tiennent encore.",
    visuel: (grand, dans) => (
      <div className={`flex flex-wrap items-center justify-center ${grand ? 'gap-4' : 'gap-2'}`}>
        {[20, 10, 5, 3].map((n, i) => (
          <Seuil key={n} dans={dans} a={400 + i * 800}>
            <div
              className={`rounded-2xl border-2 text-center font-black ${
                i === 3
                  ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                  : 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300'
              } ${grand ? 'px-8 py-5' : 'px-3 py-2'}`}
            >
              <span className={`block uppercase tracking-widest ${grand ? 'text-xl' : 'text-[9px]'}`}>
                Plus que
              </span>
              <span className={`block tabular-nums ${grand ? 'text-6xl' : 'text-2xl'}`}>{n}</span>
            </div>
          </Seuil>
        ))}
      </div>
    ),
  },
  {
    cle: 'finale',
    titre: 'La finale',
    phrase: 'Les dix meilleurs du classement général se retrouvent seuls en piste. Les autres regardent.',
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center">
        <Seuil dans={dans} a={200}>
          <div className={`grid grid-cols-5 ${grand ? 'gap-3' : 'gap-1.5'}`}>
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={`flex items-center justify-center rounded-xl border-2 border-amber-400/60 bg-amber-400/15 font-black tabular-nums text-amber-300 ${
                  grand ? 'h-16 w-16 text-2xl' : 'h-8 w-8 text-xs'
                }`}
                style={{
                  opacity: dans >= 400 + i * 160 ? 1 : 0,
                  transition: 'opacity 320ms ease',
                }}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </Seuil>
        <Seuil dans={dans} a={2800}>
          <p className={`text-center font-black text-amber-300 ${grand ? 'mt-8 text-4xl' : 'mt-4 text-base'}`}>
            👑 Le dernier debout gagne la soirée
          </p>
        </Seuil>
        <Seuil dans={dans} a={4200}>
          <p className={`text-center text-white/60 ${grand ? 'mt-3 text-2xl' : 'mt-2 text-xs'}`}>
            En finale, une élimination est définitive : plus de points bonus.
          </p>
        </Seuil>
      </div>
    ),
  },
  {
    cle: 'pret',
    titre: 'Prêt ?',
    phrase: "L'animateur lance la première manche dans un instant. Garde ton écran en main.",
    visuel: (grand, dans) => (
      <div className="flex flex-col items-center text-center">
        <Seuil dans={dans} a={200}>
          <div className={`anim-breathe ${grand ? 'text-9xl' : 'text-6xl'}`}>⚔️</div>
        </Seuil>
        <Seuil dans={dans} a={1400}>
          <p
            className={`font-black uppercase tracking-[0.3em] text-cyan-300 ${
              grand ? 'mt-8 text-4xl' : 'mt-4 text-base'
            }`}
          >
            Que le meilleur gagne
          </p>
        </Seuil>
      </div>
    ),
  },
];

/** nombre de chapitres, pour le selecteur du laboratoire */
export const NB_CHAPITRES_BATTLE = CHAPITRES.length;

export default function BattleRules({
  phaseStartedAt,
  embedded,
  chapitreForce,
}: {
  phaseStartedAt: number | null;
  embedded?: boolean;
  /** labo uniquement : fige un chapitre pour l'inspecter (jamais en partie) */
  chapitreForce?: number;
}) {
  return (
    <SequenceRegles
      chapitres={CHAPITRES}
      phaseStartedAt={phaseStartedAt}
      embedded={embedded}
      chapitreForce={chapitreForce}
      surTitre="Comment on survit"
    />
  );
}
