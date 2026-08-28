/**
 * Laboratoire des écrans du quiz — /game-lab
 *
 * Chaque écran et chaque séquence du jeu, montés avec des données 100 %
 * factices (labFixtures), sans aucune session réelle. Sert à regarder, régler
 * et faire régler le rendu en deux clics : on choisit un scénario, un gabarit
 * d'écran (téléphone / table / projecteur), et on rejoue.
 *
 * Public et sans effet : aucune écriture, les boutons qui appellent l'API
 * échouent proprement (session « lab » inexistante). Les séquences cadencées
 * (règles, post-reveal) tournent en vrai puisque les fixtures posent
 * phaseStartedAt = maintenant.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import JokerWheel from '../components/JokerWheel';
import { PlayerScreen } from '../player/PlayerApp';
import { ProjectorBody } from '../screen/ScreenApp';
import { JOKER_TYPES, type JokerType, type PublicState, type You } from '../lib/gameClient';
import QuizRules, { NB_CHAPITRES_REGLES } from '../player/QuizRules';
import { SCENARIOS } from './labFixtures';
import '../game.css';

type Gabarit = 'mini' | 'phone' | 'table' | 'projo';

/**
 * Le gabarit « mini » (375x667, iPhone SE) est le pire cas reel du parc : c'est
 * lui qui dit si un ecran tient vraiment, pas le grand telephone. Zero
 * defilement etant la regle, tout doit entrer ici aussi.
 */
const HAUTEURS: Record<'mini' | 'phone', number> = { mini: 667, phone: 812 };

const GABARITS: Array<{ cle: Gabarit; label: string; note: string }> = [
  { cle: 'mini', label: '📱 Petit', note: '375×667' },
  { cle: 'phone', label: '📱 Grand', note: '375×812' },
  { cle: 'table', label: '🖥 Table', note: '1920×1080, zoom 1.4' },
  { cle: 'projo', label: '📽 Projecteur', note: '1920×1080' },
];

export default function GameLabPage() {
  const [scenarioCle, setScenarioCle] = useState(SCENARIOS[0].cle);
  const [gabarit, setGabarit] = useState<Gabarit>('mini');
  const [runId, setRunId] = useState(0);
  /**
   * Saut dans le temps de la sequence : regenere l'etat avec un phaseStartedAt
   * decale dans le passe, pour tomber directement sur le temps voulu
   * (verdict / serie / jokers) sans attendre. Tres utile pour regler un ecran
   * precis, et pour les captures.
   */
  const [sautMs, setSautMs] = useState(0);
  /** regles : chapitre fige, ou null pour laisser la sequence tourner */
  const [chapitre, setChapitre] = useState<number | null>(null);

  const scenario = SCENARIOS.find((s) => s.cle === scenarioCle) ?? SCENARIOS[0];
  const estRegles = scenario.cle === 'regles' || scenario.cle === 'projo-regles';
  // regeneres a chaque "rejouer" : phaseStartedAt repart de maintenant
  const { state: stateBrut, you } = useMemo(
    () => ({ state: scenario.state(), you: scenario.you?.() ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario.cle, runId],
  );

  // Saut MAINTENU : tant qu'un temps est choisi, phaseStartedAt est recalcule
  // en continu pour que la sequence reste FIGEE sur cet instant. C'est ce qui
  // permet de regler un ecran precis sans le voir defiler.
  const [, tick] = useState(0);
  useEffect(() => {
    if (sautMs <= 0) return;
    const t = setInterval(() => tick((v) => v + 1), 300);
    return () => clearInterval(t);
  }, [sautMs]);
  const state = useMemo(() => {
    if (sautMs <= 0 || stateBrut.phaseStartedAt === null) return stateBrut;
    return { ...stateBrut, phaseStartedAt: Date.now() - sautMs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateBrut, sautMs, sautMs > 0 ? Math.floor(Date.now() / 300) : 0]);

  // le gabarit projecteur n'a de sens que pour les scenarios projecteur, et
  // inversement : on bascule automatiquement pour eviter les etats absurdes
  useEffect(() => {
    if (scenario.groupe === 'Projecteur' && gabarit !== 'projo') setGabarit('projo');
    if (scenario.groupe === 'Joueur' && gabarit === 'projo') setGabarit('mini');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.groupe]);

  return (
    // h-dvh + overflow-hidden sur la coque : chaque colonne gere SON propre
    // defilement. Avant, la page entiere defilait d'un bloc et choisir un
    // scenario en bas de liste faisait sortir l'apercu de l'ecran.
    <div className="h-dvh overflow-hidden bg-[#0a0817] text-white">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-4 px-4 py-5 lg:flex-row">
        {/* panneau de gauche : scenarios, defilement independant */}
        <aside className="shrink-0 overflow-y-auto pb-4 lg:h-full lg:w-72">
          <h1 className="font-black uppercase tracking-[0.25em] text-cyan-300">Game Lab</h1>
          <p className="mt-1 text-xs text-white/40">
            Écrans du quiz montés avec des données factices. Aucun impact sur les vraies parties.
          </p>
          {(['Joueur', 'Projecteur'] as const).map((groupe) => (
            <div key={groupe} className="mt-4">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-white/35">
                {groupe}
              </p>
              <div className="flex flex-col gap-1">
                {SCENARIOS.filter((s) => s.groupe === groupe).map((s) => (
                  <button
                    key={s.cle}
                    type="button"
                    onClick={() => {
                      setScenarioCle(s.cle);
                      setSautMs(0);
                      setChapitre(null);
                      setRunId((v) => v + 1);
                    }}
                    className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                      s.cle === scenarioCle
                        ? 'bg-cyan-400/15 text-cyan-200'
                        : 'text-white/60 hover:bg-white/5'
                    }`}
                  >
                    {s.label}
                    <span className="block text-[11px] font-normal text-white/35">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* scene */}
        <main className="min-w-0 flex-1 overflow-y-auto pb-6 lg:h-full">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {GABARITS.map((g) => (
              <button
                key={g.cle}
                type="button"
                disabled={
                  (scenario.groupe === 'Projecteur' && g.cle !== 'projo') ||
                  (scenario.groupe === 'Joueur' && g.cle === 'projo')
                }
                onClick={() => setGabarit(g.cle)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-25 ${
                  gabarit === g.cle ? 'bg-white/15' : 'text-white/50 hover:bg-white/5'
                }`}
              >
                {g.label} <span className="text-[10px] font-normal text-white/40">{g.note}</span>
              </button>
            ))}
            {estRegles && (
              <span className="flex items-center gap-1 rounded-lg border border-white/10 px-1 py-1">
                <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Chapitre
                </span>
                <button
                  type="button"
                  onClick={() => setChapitre(null)}
                  className={`rounded px-2 py-1 text-xs font-bold ${
                    chapitre === null ? 'bg-white/15' : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  auto
                </button>
                {Array.from({ length: NB_CHAPITRES_REGLES }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setChapitre(i)}
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      chapitre === i ? 'bg-white/15' : 'text-white/50 hover:bg-white/5'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </span>
            )}
            {state.status === 'reveal' && (
              <span className="flex items-center gap-1 rounded-lg border border-white/10 px-1 py-1">
                <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Aller à
                </span>
                {(
                  [
                    ['Verdict', 5200],
                    ['Série', 8600],
                    ['Jokers', 9800],
                  ] as Array<[string, number]>
                ).map(([lbl, ms]) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => {
                      setSautMs(ms);
                      setRunId((v) => v + 1);
                    }}
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      sautMs === ms ? 'bg-white/15' : 'text-white/50 hover:bg-white/5'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSautMs(0);
                setRunId((v) => v + 1);
              }}
              className="ml-auto rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-4 py-1.5 text-sm font-bold text-cyan-200 hover:bg-cyan-400/20"
            >
              ↻ Rejouer la séquence
            </button>
          </div>

          {scenario.cle === 'roue' ? (
            <RoueEnBoucle key={runId} />
          ) : scenario.cle === 'projo-fin-animee' ? (
            <CadreLarge key={runId}>
              <FinDePartieAnimee state={state} />
            </CadreLarge>
          ) : estRegles && chapitre !== null ? (
            gabarit === 'phone' || gabarit === 'mini' ? (
              <CadrePhone key={`${runId}-${chapitre}`} hauteur={HAUTEURS[gabarit]}>
                <div className="game-bg h-full w-full overflow-hidden text-white">
                  <QuizRules phaseStartedAt={state.phaseStartedAt} chapitreForce={chapitre} />
                </div>
              </CadrePhone>
            ) : (
              <CadreLarge key={`${runId}-${chapitre}`}>
                {/* zoom 1.4 sur la borne uniquement ; le projecteur rend a 1 */}
                <div
                  className="game-bg h-full w-full overflow-hidden text-white"
                  style={gabarit === 'table' ? { zoom: 1.4 } : undefined}
                >
                  <QuizRules phaseStartedAt={state.phaseStartedAt} embedded chapitreForce={chapitre} />
                </div>
              </CadreLarge>
            )
          ) : gabarit === 'phone' || gabarit === 'mini' ? (
            <CadrePhone key={runId} hauteur={HAUTEURS[gabarit]}>
              <SceneJoueur state={state} you={you} embedded={false} />
            </CadrePhone>
          ) : (
            <CadreLarge key={runId}>
              {scenario.groupe === 'Projecteur' ? (
                <div className="game-bg flex h-full w-full flex-col text-white">
                  <ProjectorBody state={state} remaining={null} answeredCount={state.reveal?.answeredCount ?? 0} />
                </div>
              ) : (
                /* la borne applique un zoom CSS 1.4 sur la surface joueur */
                <div className="game-bg h-full w-full text-white" style={{ zoom: 1.4 }}>
                  <SceneJoueur state={state} you={you} embedded />
                </div>
              )}
            </CadreLarge>
          )}
        </main>
      </div>
    </div>
  );
}

function SceneJoueur({
  state,
  you,
  embedded,
}: {
  state: PublicState;
  you: You | null;
  embedded: boolean;
}) {
  return (
    <div className="game-bg flex h-full flex-col overflow-hidden text-white">
      <PlayerScreen
        state={state}
        you={you}
        sessionRef="lab"
        playerToken="lab-token"
        embedded={embedded}
        deviceLabel={embedded ? 'LAB-1' : undefined}
        onJoined={() => {}}
        onLeft={() => {}}
        refresh={async () => {}}
      />
    </div>
  );
}

/**
 * Cadre téléphone : 375 px de large, hauteur au choix, taille réelle.
 *
 * PAS de defilement interne : c'est justement ce qu'on veut verifier ici. Si
 * un ecran deborde de ce cadre, il debordera sur un vrai telephone, et le
 * labo doit le montrer plutot que le masquer derriere une barre.
 */
function CadrePhone({ children, hauteur }: { children: React.ReactNode; hauteur: number }) {
  return (
    // shrink-0 imperatif : sans lui, une fenetre etroite ecrase le cadre a
    // quelques pixels de large et le rendu observe n'a plus rien a voir avec
    // un telephone. Le labo doit montrer 375 px, toujours.
    <div className="flex justify-center overflow-x-auto">
      <div
        className="w-[375px] shrink-0 overflow-hidden rounded-[2rem] border-4 border-white/15 bg-black shadow-2xl"
        style={{ height: hauteur }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Cadre 1920x1080 mis à l'échelle pour tenir dans la colonne : le contenu est
 * rendu en taille réelle puis réduit par transform, comme un vrai écran vu de
 * loin. Le zoom 1.4 des bornes s'applique DANS le cadre, avant l'échelle.
 */
function CadreLarge({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const mesurer = () => {
      const w = ref.current?.clientWidth ?? 960;
      setScale(Math.min(1, w / 1920));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);
  return (
    <div ref={ref} className="w-full">
      <div
        className="overflow-hidden rounded-xl border-2 border-white/15 shadow-2xl"
        style={{ width: 1920 * scale, height: 1080 * scale }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** la roue seule, qui enchaîne les trois jokers en boucle */
/**
 * Rejoue la VRAIE séquence de fin de partie, aux vrais timings serveur :
 * cinématique (tambour, puis 5e -> 1er, puis classement complet), récompenses
 * dévoilées une à une, écran de fin. Les fixtures figées n'en montraient que
 * des instantanés, et la séquence réelle paraissait « vraiment différente ».
 * Boucle en continu ; « Rejouer la séquence » repart du tambour.
 */
const ETAPES_FIN: Array<{ duree: number; patch: Partial<PublicState> }> = [
  { duree: 3800, patch: { status: 'cinematic', cinematic: { step: 0 } } }, // tambour
  { duree: 4500, patch: { status: 'cinematic', cinematic: { step: 1 } } }, // 5e
  { duree: 4500, patch: { status: 'cinematic', cinematic: { step: 2 } } }, // 4e
  { duree: 4500, patch: { status: 'cinematic', cinematic: { step: 3 } } }, // 3e
  { duree: 4500, patch: { status: 'cinematic', cinematic: { step: 4 } } }, // 2e
  { duree: 4500, patch: { status: 'cinematic', cinematic: { step: 5 } } }, // 1er
  { duree: 7000, patch: { status: 'cinematic', cinematic: { step: 6 } } }, // classement complet
  ...[1, 2, 3, 4].map((revealed) => ({
    duree: 6000,
    patch: {
      status: 'rewards',
      rewards: {
        revealed,
        fastest: { pseudo: 'Léa', avgMs: 3120 },
        bestRatio: { pseudo: 'Marco', correct: 18, answered: 20 },
        bestStrike: { pseudo: 'Sam', strike: 9 },
        bonnetDane: { pseudo: 'Tom', correct: 3, answered: 19 },
      },
    } as Partial<PublicState>,
  })),
  {
    duree: 10000,
    patch: {
      status: 'end',
      endTexts: {
        winnerText: 'Félicitations à Marco qui remporte un Cocktail signature !',
        endText: 'Rendez-vous mercredi pour le quiz Séries cultes !',
      },
    },
  },
];

function FinDePartieAnimee({ state }: { state: PublicState }) {
  const [etape, setEtape] = useState(0);
  useEffect(() => {
    const t = setTimeout(
      () => setEtape((v) => (v + 1) % ETAPES_FIN.length),
      ETAPES_FIN[etape].duree,
    );
    return () => clearTimeout(t);
  }, [etape]);
  const courant = { ...state, ...ETAPES_FIN[etape].patch } as PublicState;
  return (
    <div className="game-bg flex h-full w-full flex-col text-white">
      {/* key = les animations d'entree (anim-pop...) rejouent a chaque etape */}
      <div key={etape} className="flex min-h-0 flex-1 flex-col">
        <ProjectorBody state={courant} remaining={null} answeredCount={0} />
      </div>
    </div>
  );
}

function RoueEnBoucle() {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const type: JokerType = JOKER_TYPES[i % JOKER_TYPES.length];
  return (
    <div className="game-bg relative flex h-[740px] items-center justify-center overflow-hidden rounded-xl border-2 border-white/15 text-white">
      {visible ? (
        <JokerWheel
          type={type}
          reason="Tirage de démonstration"
          onDone={() => {
            setVisible(false);
            setTimeout(() => {
              setI((v) => v + 1);
              setVisible(true);
            }, 600);
          }}
        />
      ) : (
        <p className="text-white/40">Prochain tirage...</p>
      )}
    </div>
  );
}
