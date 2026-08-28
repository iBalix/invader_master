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
import { SCENARIOS } from './labFixtures';
import '../game.css';

type Gabarit = 'phone' | 'table' | 'projo';

const GABARITS: Array<{ cle: Gabarit; label: string; note: string }> = [
  { cle: 'phone', label: '📱 Téléphone', note: '375 px' },
  { cle: 'table', label: '🖥 Table', note: '1920×1080, zoom 1.4' },
  { cle: 'projo', label: '📽 Projecteur', note: '1920×1080' },
];

export default function GameLabPage() {
  const [scenarioCle, setScenarioCle] = useState(SCENARIOS[0].cle);
  const [gabarit, setGabarit] = useState<Gabarit>('phone');
  const [runId, setRunId] = useState(0);
  /**
   * Saut dans le temps de la sequence : regenere l'etat avec un phaseStartedAt
   * decale dans le passe, pour tomber directement sur le temps voulu
   * (verdict / serie / jokers) sans attendre. Tres utile pour regler un ecran
   * precis, et pour les captures.
   */
  const [sautMs, setSautMs] = useState(0);

  const scenario = SCENARIOS.find((s) => s.cle === scenarioCle) ?? SCENARIOS[0];
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
    if (scenario.groupe === 'Joueur' && gabarit === 'projo') setGabarit('phone');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.groupe]);

  return (
    <div className="min-h-dvh bg-[#0a0817] text-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 lg:flex-row">
        {/* panneau de gauche : scenarios */}
        <aside className="shrink-0 lg:w-72">
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
        <main className="min-w-0 flex-1">
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
          ) : gabarit === 'phone' ? (
            <CadrePhone key={runId}>
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
    <div className={`game-bg flex flex-col text-white ${embedded ? 'h-full' : 'min-h-full'}`}>
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

/** cadre téléphone : taille réelle 375 px, centré */
function CadrePhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      <div className="h-[740px] w-[375px] overflow-hidden rounded-[2rem] border-4 border-white/15 bg-black shadow-2xl">
        <div className="h-full w-full overflow-y-auto">{children}</div>
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
