/**
 * Écrans projecteur du mode BATTLE ROYALE (dispatch depuis ScreenApp).
 *
 * round_intro (MANCHE N), announce, question (compteur SURVIVANTS), verdict
 * (habillage suspense, compteur inchangé), reveal (décompte des éliminés,
 * repêchage, milestones), round_end (podium + général paginé + zone top 10),
 * closing (fondu), end (victoire couronne + confettis).
 */

import { useEffect, useRef, useState } from 'react';
import {
  BR_DECOMPTE_MS,
  BR_INTRO_ACTE_CATEGORIES,
  BR_INTRO_ACTE_COMBATTANTS,
  BR_PALIER_DUREE_MS,
  BR_REVEAL_BARRES_MS,
  BR_REVEAL_DECOMPTE_MS,
  BR_REVEAL_PAS_MS,
  BR_REVEAL_PREMIER_NOM_MS,
  BR_REVEAL_SURVIVANTS_MS,
  BR_REVEAL_SUSPENSE_MS,
  brPalierMs,
  QUESTION_REPONSES_MS,
  serverNow,
  type BattleStandingEntry,
  type PublicState,
} from '../lib/gameClient';
import { DifficultyBadge, TimerRing } from '../ui/bits';
import { FullCenter, LobbyProjo, PauseProjo } from './ScreenApp';
import BattleRules from '../player/BattleRules';
import { gameAudio } from './audio';
import { fondPourSurvivants, SON_BATTLE } from './battleSounds';

/**
 * Horloge de phase : ms ecoulees depuis phaseStartedAt, rafraichies a 150 ms.
 *
 * TOUTE la mise en scene de la battle se compare a cette valeur, jamais a un
 * minuteur lance au montage. Un ecran qui recharge en pleine sequence retombe
 * au bon endroit, et une page qui ne composite pas ne fige rien : c'est la
 * lecon des barres du reveal du quiz.
 */
function useEcoule(state: PublicState): number {
  const [maintenant, setMaintenant] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(serverNow()), 150);
    return () => clearInterval(t);
  }, []);
  return maintenant - (state.phaseStartedAt ?? maintenant);
}

/**
 * Joue un son UNE fois quand la condition devient vraie, et le rearme quand
 * elle redevient fausse. Les seuils etant des fonctions de l'horloge, la
 * condition reste vraie plusieurs ticks : sans cette garde, le son partirait
 * a chaque rendu.
 */
function useCue(actif: boolean, jouer: () => void): void {
  const arme = useRef(false);
  useEffect(() => {
    if (actif && !arme.current) {
      arme.current = true;
      jouer();
    } else if (!actif) {
      arme.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
}

/** repli si la session ne publie pas le reglage (vieille session en cours) */
const STANDINGS_PAGE_DEFAUT_MS = 10000;

export function BattleProjectorBody({
  state,
  remaining,
  answeredCount,
}: {
  state: PublicState;
  remaining: number | null;
  answeredCount: number;
}) {
  const s = state.status;
  const survivants = state.battle?.survivorCount ?? 0;

  // LIT DE FOND ADAPTATIF. Le legacy remplacait la piste a 20, 10 puis 4
  // survivants : la tension montait toute seule, sans que l'animateur touche a
  // rien. La piste est choisie sur la valeur PUBLIEE par le serveur, donc un
  // ecran qui recharge retombe sur la bonne, et le changement se fait en fondu
  // croise (une coupure nette s'entend comme un bug).
  useEffect(() => {
    if (s === 'closing' || s === 'end') {
      gameAudio.battleBed(null);
      return;
    }
    // hors manche (salle d'attente, regles), le nombre de survivants vaut 0 :
    // sans cette garde on tombait sur la piste des 4 derniers, la plus tendue
    const enManche = survivants > 0 && s !== 'lobby' && s !== 'rules';
    gameAudio.battleBed(enManche ? fondPourSurvivants(survivants) : SON_BATTLE.fondNormal);
  }, [s, survivants]);

  // nappe des regles, en boucle, coupee des qu'on en sort
  useEffect(() => {
    if (s === 'rules') gameAudio.sample(SON_BATTLE.regles, { volume: 0.45, loop: true });
    else gameAudio.stopSample(SON_BATTLE.regles);
    return () => gameAudio.stopSample(SON_BATTLE.regles);
  }, [s]);

  // les trois dernieres secondes du chrono : le son travaille du legacy
  useEffect(() => {
    if (s !== 'question' || state.phaseEndsAt === null) {
      gameAudio.stopAnswerTimer();
      return;
    }
    gameAudio.startBattleTimer(
      state.phaseEndsAt - serverNow(),
      String(state.phaseEndsAt),
      SON_BATTLE.troisSecondes,
    );
    return () => gameAudio.stopAnswerTimer();
  }, [s, state.phaseEndsAt]);

  useCue(s === 'round_end', () => gameAudio.sample(SON_BATTLE.finManche, { volume: 0.7 }));
  useCue(s === 'end', () => gameAudio.sample(SON_BATTLE.finPartie, { volume: 0.75 }));

  switch (state.status) {
    case 'lobby':
      return <LobbyProjo state={state} />;
    case 'rules':
      return <BattleRules phaseStartedAt={state.phaseStartedAt} embedded />;
    case 'round_intro':
      return <RoundIntroProjo state={state} />;
    case 'announce':
      return <BattleAnnounceProjo state={state} />;
    case 'question':
    case 'locked':
      return <BattleQuestionProjo state={state} remaining={remaining} answeredCount={answeredCount} />;
    case 'verdict':
      return <VerdictProjo state={state} />;
    case 'reveal':
      return <BattleRevealProjo state={state} />;
    case 'round_end':
      return <RoundEndProjo state={state} />;
    case 'pause':
    case 'resuming':
      // meme ecran vivant que le quiz : pseudos qui derivent et compte a
      // rebours. Le bloc statique d'avant ne disait pas combien de temps
      // durait la pause, et la salle revenait au hasard. En 'resuming', le
      // meme ecran affiche le decompte des cinq dernieres secondes.
      return <PauseProjo state={state} remaining={remaining} />;
    case 'closing':
      return <ClosingProjo />;
    case 'end':
      return <BattleEndProjo state={state} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Règles + intro de manche
// ---------------------------------------------------------------------------

/**
 * Intro de manche, en trois actes, dans l'ordre du legacy :
 *
 *   1. le TITRE  — « BATTLE ROYALE », « MANCHE N », l'effectif en piste.
 *      C'est ce qui doit tomber en premier : la salle a besoin de savoir ou
 *      elle en est avant qu'on lui parle de categories.
 *   2. AU PROGRAMME — le nuage de categories de la banque.
 *   3. LES COMBATTANTS — le nuage de pseudos, ou la grille des finalistes.
 *
 * Les bornes sont des FRACTIONS de la duree reelle de la phase (cf.
 * BR_INTRO_ACTE_*), jamais des ms en dur : le serveur est maitre de la duree
 * et l'ecran s'y adapte. C'est ce qui manquait, et l'intro se faisait couper
 * par la premiere question.
 *
 * Les tailles des nuages sont tirees d'un hachage du mot : stables d'un rendu
 * a l'autre et identiques sur les deux dalles d'une table, contrairement a un
 * Math.random() qui rebattait tout a chaque tick.
 */
function RoundIntroProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const isFinal = b?.isFinal ?? false;
  const ecoule = useEcoule(state);
  const duree =
    state.phaseEndsAt !== null && state.phaseStartedAt !== null
      ? Math.max(1, state.phaseEndsAt - state.phaseStartedAt)
      : 12_000;
  const part = Math.min(1, Math.max(0, ecoule / duree));
  const acte = part < BR_INTRO_ACTE_CATEGORIES ? 0 : part < BR_INTRO_ACTE_COMBATTANTS ? 1 : 2;

  useCue(ecoule >= 150, () => gameAudio.sample(SON_BATTLE.introManche, { volume: 0.7 }));

  const finalistes = (b?.generalStandings ?? [])
    .filter((e) => e.qualifiedForFinal)
    .slice(0, b?.finalSize ?? 10);
  const noms =
    isFinal && finalistes.length > 0
      ? finalistes.map((e) => e.pseudo)
      : state.players.map((p) => p.pseudo);

  // ACTE 1 : le titre de la manche
  if (acte === 0) {
    const dans = ecoule;
    return (
      <FullCenter>
        <p
          className="font-black uppercase tracking-[0.5em] text-white/40"
          style={{
            fontSize: '2.5rem',
            opacity: dans >= 150 ? 1 : 0,
            transition: 'opacity 500ms ease',
          }}
        >
          Battle Royale
        </p>
        <h1
          className={`anim-stomp mt-6 text-center font-black uppercase tracking-widest ${
            isFinal ? 'text-amber-300' : 'text-white'
          }`}
          style={{ fontSize: isFinal ? '10rem' : '12rem', lineHeight: 1 }}
        >
          {isFinal ? '👑 La finale' : `Manche ${b?.roundNumber ?? 1}`}
        </h1>
        <p
          className="mt-10 font-black uppercase tracking-[0.2em] text-cyan-300"
          style={{
            fontSize: '3.5rem',
            opacity: dans >= 1400 ? 1 : 0,
            transform: dans >= 1400 ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 500ms ease, transform 560ms cubic-bezier(0.3, 1.2, 0.4, 1)',
          }}
        >
          {b?.survivorCount} combattant{(b?.survivorCount ?? 0) > 1 ? 's' : ''}
        </p>
        <p
          className="mt-3 font-bold uppercase tracking-[0.35em] text-white/50"
          style={{
            fontSize: '2rem',
            opacity: dans >= 2200 ? 1 : 0,
            transition: 'opacity 500ms ease',
          }}
        >
          1 seul survivant
        </p>
      </FullCenter>
    );
  }

  // ACTE 2 : les categories au programme
  if (acte === 1) {
    const dans = ecoule - duree * BR_INTRO_ACTE_CATEGORIES;
    return (
      <FullCenter>
        <p className="font-black uppercase tracking-[0.45em] text-white/40" style={{ fontSize: '2.25rem' }}>
          Au programme
        </p>
        <div className="mt-14 flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {CATEGORIES_INTRO.map((c, i) => (
            <span
              key={c}
              className="font-black uppercase text-cyan-300"
              style={{
                fontSize: `${3.4 + (hachage(c) % 4) * 0.9}rem`,
                lineHeight: 1,
                opacity: dans >= 200 + i * 150 ? 1 : 0,
                transform: dans >= 200 + i * 150 ? 'scale(1)' : 'scale(0.6)',
                transition: 'opacity 380ms ease, transform 460ms cubic-bezier(0.3, 1.4, 0.4, 1)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </FullCenter>
    );
  }

  // ACTE 3 : les combattants
  const dans = ecoule - duree * BR_INTRO_ACTE_COMBATTANTS;
  return (
    <FullCenter>
      <p
        className={`font-black uppercase tracking-[0.45em] ${isFinal ? 'text-amber-300/70' : 'text-white/40'}`}
        style={{ fontSize: '2.25rem' }}
      >
        {isFinal ? 'Les finalistes' : 'Les combattants'}
      </p>
      <div className="mt-12 flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {noms.slice(0, 40).map((pseudo, i) => (
          <span
            key={pseudo}
            className={`font-black ${isFinal ? 'text-amber-300' : 'text-white/90'}`}
            style={{
              fontSize: `${2.6 + (hachage(pseudo) % 4) * 0.7}rem`,
              lineHeight: 1,
              opacity: dans >= 120 + i * 70 ? 1 : 0,
              transform: dans >= 120 + i * 70 ? 'translateY(0)' : 'translateY(18px)',
              transition: 'opacity 340ms ease, transform 380ms ease',
            }}
          >
            {pseudo}
          </span>
        ))}
      </div>
    </FullCenter>
  );
}

/** hachage stable d'un pseudo : meme taille sur les deux dalles d'une table */
function hachage(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** les categories de la banque battle, pour le nuage d'intro */
const CATEGORIES_INTRO = [
  'Cinéma', 'Musique', 'Histoire', 'Géographie', 'Jeux-vidéo', 'Sport',
  'Séries TV', 'Culture Pop', 'Montpellier', 'Célébrités', 'France', 'Actualités',
];

// ---------------------------------------------------------------------------
// Annonce + question + verdict
// ---------------------------------------------------------------------------

function BattleAnnounceProjo({ state }: { state: PublicState }) {
  const q = state.question;
  const ecoule = useEcoule(state);
  // Reste calcule sur l'HORLOGE de phase, pas sur la propriete `remaining` du
  // conteneur : celle-ci n'existe pas dans le laboratoire, et un ecran qui
  // recharge doit retomber sur le bon chiffre.
  const total =
    state.phaseEndsAt !== null && state.phaseStartedAt !== null
      ? state.phaseEndsAt - state.phaseStartedAt
      : state.config.announceMs;
  const reste = Math.max(0, total - ecoule);
  const enDecompte = reste <= BR_DECOMPTE_MS;
  useCue(enDecompte, () => gameAudio.sample(SON_BATTLE.decompte, { volume: 0.65 }));
  if (!q) return null;
  const progress = Math.max(0, Math.min(1, reste / total));
  const decompte = enDecompte ? Math.max(1, Math.ceil(reste / 1000)) : null;
  return (
    <FullCenter>
      <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-white/40">
        {state.battle?.isFinal ? 'Finale' : `Manche ${state.battle?.roundNumber}`} · Question{' '}
        {state.battle?.questionInRound ?? q.index + 1}
      </p>
      <h1 className="anim-pop mt-6 text-balance text-center text-7xl font-black">{q.theme ?? 'Culture générale'}</h1>
      <div className="mt-8 flex items-center gap-4">
        <DifficultyBadge difficulty={q.difficulty} className="!px-6 !py-2 !text-2xl" />
        <span className="rounded-full border border-cyan-400/50 bg-cyan-400/15 px-6 py-2 text-2xl font-black text-cyan-300">
          {state.battle?.survivorCount} SURVIVANT{(state.battle?.survivorCount ?? 0) > 1 ? 'S' : ''}
        </span>
      </div>
      {/* Les trois dernieres secondes deviennent un decompte, comme le legacy :
          la salle sait EXACTEMENT quand la question tombe et personne ne rate
          le depart du chrono. */}
      {decompte !== null ? (
        <p className="anim-pop mt-10 text-[9rem] font-black leading-none tabular-nums text-cyan-300">
          {decompte}
        </p>
      ) : (
        <>
          <p className="mt-12 text-2xl uppercase tracking-[0.3em] text-white/50">Préparez-vous...</p>
          <div className="mt-4 h-2 w-[420px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%`, transition: 'width 0.25s linear' }} />
          </div>
        </>
      )}
    </FullCenter>
  );
}

function BattleQuestionProjo({
  state,
  remaining,
  answeredCount,
}: {
  state: PublicState;
  remaining: number | null;
  answeredCount: number;
}) {
  const ecoule = useEcoule(state);
  const q = state.question;
  if (!q) return null;
  const grace = state.status === 'locked';
  const totalMs = state.phaseEndsAt && state.phaseStartedAt ? state.phaseEndsAt - state.phaseStartedAt : state.config.questionMs;
  // meme mise en scene que le quiz : l'enonce se lit seul, les reponses
  // arrivent en fondu, toutes ensemble. En 'locked' tout est force visible.
  const reponsesVisibles = grace || ecoule >= QUESTION_REPONSES_MS;

  return (
    <div className="flex flex-1 flex-col px-12 py-8">
      <div className="mb-6 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-2xl font-bold uppercase tracking-widest text-white/50">
            {q.difficulty} · {state.battle?.survivorCount} survivant{(state.battle?.survivorCount ?? 0) > 1 ? 's' : ''} · {answeredCount} réponse{answeredCount > 1 ? 's' : ''}
          </p>
          <h1 className="mt-2 text-balance text-5xl font-black leading-tight">{q.question}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          {remaining !== null ? (
            <TimerRing remainingMs={remaining} totalMs={totalMs} size={110} />
          ) : (
            <span className="rounded-full bg-rose-500/20 px-5 py-2 text-2xl font-black text-rose-300">STOP</span>
          )}
        </div>
      </div>

      <div
        className="grid flex-1 grid-cols-2 content-center gap-4"
        style={{
          opacity: reponsesVisibles ? 1 : 0,
          transform: reponsesVisibles ? 'translateY(0)' : 'translateY(18px)',
          transition: 'opacity 700ms ease, transform 700ms cubic-bezier(0.3, 1.1, 0.4, 1)',
        }}
      >
        {(q.answers ?? []).map((a, i) => (
          <div key={i} className="rounded-2xl border-2 border-white/15 bg-white/5 px-7 py-5 text-[2.125rem] font-bold leading-snug">
            <span className="mr-3 font-black text-cyan-300">{String.fromCharCode(65 + i)}</span>
            {a}
          </div>
        ))}
      </div>

      {/* Fenetre de reponse fermee. Le serveur garde une tolerance reseau de
          quelques secondes (celle du legacy, qui acceptait les reponses
          jusqu'a 4 s apres la fin), mais elle ne s'ANNONCE pas : un « derniere
          chance » affiche donnait l'impression d'un second chrono offert. */}
      {grace && (
        <div className="anim-pop mt-6 text-center text-4xl font-black uppercase tracking-widest text-rose-300">
          Temps écoulé !
        </div>
      )}
    </div>
  );
}

function VerdictProjo({ state }: { state: PublicState }) {
  return (
    <FullCenter>
      <div className="anim-suspense text-center">
        <div className="mb-8 text-8xl">🔎</div>
        <h1 className="text-6xl font-black uppercase tracking-widest">Vérification...</h1>
      </div>
      <p className="mt-12 text-4xl text-white/60">
        {state.battle?.survivorCount} survivant{(state.battle?.survivorCount ?? 0) > 1 ? 's' : ''} avant le verdict
      </p>
      <p className="mt-6 animate-pulse text-3xl font-bold uppercase tracking-[0.3em] text-rose-300">
        Qui tombe au combat ?
      </p>
    </FullCenter>
  );
}

// ---------------------------------------------------------------------------
// Révélation
// ---------------------------------------------------------------------------

/**
 * Revelation, au tempo du legacy, cadencee sur l'horloge SERVEUR.
 *
 * Le portage enchainait tout en cinq secondes : la reponse a 600 ms, les
 * elimines a 2,2 s. La salle n'avait pas le temps de comprendre ce qui lui
 * arrivait. Le legacy prenait six secondes entre la reponse et l'ecran des
 * survivants, puis deux de plus avant le premier nom : c'est ce souffle qui
 * fait la tension.
 *
 * Trois temps, tous en seuils sur phaseStartedAt (jamais un minuteur lance au
 * montage : un ecran qui recharge en pleine revelation retombe au bon endroit,
 * et une page qui ne composite pas ne fige rien) :
 *
 *   1. SUSPENSE — l'enonce et les quatre reponses, rien de devoile, le
 *      compteur de survivants CACHE. Le legacy le masquait des la reception de
 *      la reponse, parce qu'il trahissait le resultat.
 *   2. LA REPONSE — elle s'allume en vert, les autres s'eteignent.
 *   3. LES SURVIVANTS — le grand compteur, puis les noms qui tombent un par
 *      un, et le compteur qui encaisse chaque elimination.
 */
function BattleRevealProjo({ state }: { state: PublicState }) {
  const q = state.question;
  const reveal = state.battle?.reveal;
  const ecoule = useEcoule(state);

  const elimines = reveal?.eliminated ?? [];
  const repechage = Boolean(reveal?.repechage);
  const palier = reveal?.milestone ?? null;
  const annule = Boolean(reveal?.cancelled);

  const reponseVisible = ecoule >= BR_REVEAL_SUSPENSE_MS;
  const survivantsVisible = ecoule >= BR_REVEAL_SURVIVANTS_MS;
  /** progression 0..1 de la montee des barres, sur l'horloge serveur */
  const avancement = Math.max(0, Math.min(1, ecoule / BR_REVEAL_BARRES_MS));
  /** la plus haute barre atteint sa valeur pile a BR_REVEAL_BARRES_MS */
  const pourcentMax = Math.max(1, ...(reveal?.percents ?? [1]));

  // Combien de noms sont deja tombes, et de combien le compteur a baisse. Deux
  // valeurs distinctes : le compteur suit le nom de BR_REVEAL_DECOMPTE_MS,
  // exactement comme le legacy.
  const tombes = Math.max(
    0,
    Math.min(elimines.length, Math.floor((ecoule - BR_REVEAL_PREMIER_NOM_MS) / BR_REVEAL_PAS_MS) + 1),
  );
  const decomptes = repechage
    ? 0
    : Math.max(
        0,
        Math.min(
          elimines.length,
          Math.floor((ecoule - BR_REVEAL_PREMIER_NOM_MS - BR_REVEAL_DECOMPTE_MS) / BR_REVEAL_PAS_MS) + 1,
        ),
      );
  const compteur = (reveal?.survivorsBefore ?? 0) - decomptes;
  /** vrai pendant la demi-seconde qui suit une baisse : le chiffre encaisse */
  const dansLeCoup = (() => {
    if (decomptes === 0) return false;
    const t = BR_REVEAL_PREMIER_NOM_MS + BR_REVEAL_DECOMPTE_MS + (decomptes - 1) * BR_REVEAL_PAS_MS;
    return ecoule >= t && ecoule < t + 500;
  })();

  const palierMs = brPalierMs(elimines.length);
  const palierPlein = palier !== null && ecoule >= palierMs && ecoule < palierMs + BR_PALIER_DUREE_MS;

  // Sons du legacy, aux memes instants que l'image.
  useCue(!annule && reponseVisible, () => gameAudio.sample(SON_BATTLE.bonneReponse, { volume: 0.7 }));
  useCue(!annule && survivantsVisible, () => gameAudio.sample(SON_BATTLE.survivants, { volume: 0.5 }));
  useCue(!annule && !repechage && elimines.length > 0 && tombes >= 1, () =>
    gameAudio.sample(SON_BATTLE.elimination, { volume: 0.7 }),
  );
  useCue(!annule && repechage && survivantsVisible, () =>
    gameAudio.sample(SON_BATTLE.transition, { volume: 0.7 }),
  );
  useCue(palierPlein, () => gameAudio.sample(SON_BATTLE.palier, { volume: 0.7 }));
  useCue(Boolean(reveal?.victory) && survivantsVisible, () =>
    gameAudio.sample(SON_BATTLE.vainqueurManche, { volume: 0.75 }),
  );

  if (!reveal) return null;
  if (reveal.cancelled) {
    return (
      <FullCenter>
        <div className="anim-pop text-center">
          <div className="mb-6 text-9xl">🚫</div>
          <h1 className="font-black" style={{ fontSize: '6rem', lineHeight: 1 }}>
            Question annulée
          </h1>
          <p className="mt-6 text-4xl text-white/60">Elle ne compte pas, on continue !</p>
        </div>
      </FullCenter>
    );
  }

  // PALIER : prise d'ecran plein cadre, les ecrans TOP X du legacy.
  if (palierPlein) {
    const dans = ecoule - palierMs;
    const survivants = (state.battle?.generalStandings ?? [])
      .filter((e) => !e.isSpectator)
      .slice(0, palier ?? 0);
    return (
      <FullCenter>
        <h1
          className="anim-stomp font-black uppercase tracking-widest text-amber-300"
          style={{ fontSize: '13rem', lineHeight: 1 }}
        >
          TOP {palier}
        </h1>
        <p className="anim-fade-up mt-8 font-black uppercase tracking-[0.3em] text-white/50" style={{ fontSize: '2.75rem' }}>
          Il ne reste que ça
        </p>
        {survivants.length > 0 && (
          <div className="mt-14 flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {survivants.map((e, i) => (
              <span
                key={e.pseudo}
                className="font-black text-white/90"
                style={{
                  fontSize: '3.25rem',
                  lineHeight: 1,
                  opacity: dans >= 400 + i * 140 ? 1 : 0,
                  transform: dans >= 400 + i * 140 ? 'scale(1)' : 'scale(0.75)',
                  transition: 'opacity 340ms ease, transform 400ms cubic-bezier(0.3, 1.3, 0.4, 1)',
                }}
              >
                {e.pseudo}
              </span>
            ))}
          </div>
        )}
      </FullCenter>
    );
  }

  // TEMPS 3 : les survivants. Plein ecran, le compteur est le heros.
  if (survivantsVisible) {
    const dans = ecoule - BR_REVEAL_SURVIVANTS_MS;
    // DERNIER DEBOUT. Le legacy remplacait le compteur par « MANCHE REMPORTEE
    // PAR X » des qu'il ne restait qu'un survivant, dans TOUTE manche : la
    // manche est jouee, il n'y a plus de question a poser. Le portage ne le
    // faisait qu'en finale.
    const vainqueur = reveal.victory
      ? (state.battle?.winner?.pseudo ?? reveal.roundWinner)
      : reveal.roundWinner;
    if (vainqueur) {
      return (
        <FullCenter>
          <div className="anim-breathe" style={{ fontSize: '6rem', lineHeight: 1 }}>
            🏆
          </div>
          <p className="mt-6 font-black uppercase tracking-[0.4em] text-amber-300/70" style={{ fontSize: '2rem' }}>
            {reveal.victory ? 'Vainqueur de la battle' : 'Manche remportée par'}
          </p>
          <h1
            className="anim-stomp mt-4 font-black uppercase text-amber-300"
            style={{ fontSize: '9rem', lineHeight: 1 }}
          >
            {vainqueur}
          </h1>
          <p className="anim-fade-up mt-10 text-4xl text-white/60" style={{ animationDelay: '0.5s' }}>
            👑 Dernier debout
          </p>
        </FullCenter>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-12 py-8">
        {/* Le cercle du legacy : 350 px de diametre, bordure cyan qui respire.
            C'est LUI qu'on regarde pendant que les noms tombent. */}
        <div
          className="anim-glow flex items-center justify-center rounded-full border-4 border-cyan-400/60"
          style={{
            width: 340,
            height: 340,
            background: 'radial-gradient(circle, rgba(76,201,240,0.12) 0%, transparent 70%)',
          }}
        >
          <span
            className={`font-black tabular-nums leading-none ${dansLeCoup ? 'anim-count-down' : ''}`}
            style={{ fontSize: '11rem' }}
          >
            {Math.max(0, compteur)}
          </span>
        </div>
        <p className="mt-5 font-black uppercase tracking-[0.45em] text-cyan-300" style={{ fontSize: '2.5rem' }}>
          Survivant{compteur > 1 ? 's' : ''}
        </p>

        <div className="mt-12 flex min-h-[180px] max-w-6xl flex-wrap items-start justify-center gap-4">
          {repechage ? (
            <div className="anim-stomp text-center">
              <div className="mb-4 text-8xl">🛟</div>
              <h2 className="font-black uppercase text-amber-300" style={{ fontSize: '5rem', lineHeight: 1 }}>
                Égalité, repêchage !
              </h2>
              <p className="mt-4 text-4xl text-white/70">Tout le monde reste en vie</p>
            </div>
          ) : elimines.length === 0 ? (
            <div
              className="text-center"
              style={{ opacity: dans >= 300 ? 1 : 0, transition: 'opacity 360ms ease' }}
            >
              <h2 className="font-black uppercase text-emerald-300" style={{ fontSize: '5rem', lineHeight: 1 }}>
                Aucun éliminé
              </h2>
            </div>
          ) : (
            elimines.map((e, i) => (
              <span
                key={e.pseudo}
                className="rounded-2xl border-2 border-rose-400/50 bg-rose-500/15 px-8 py-4 font-black text-rose-200"
                style={{
                  fontSize: '2.75rem',
                  lineHeight: 1,
                  opacity: i < tombes ? 1 : 0,
                  transform: i < tombes ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.8)',
                  transition: 'opacity 280ms ease, transform 360ms cubic-bezier(0.3, 1.3, 0.4, 1)',
                }}
              >
                💀 {e.pseudo}
                {e.reason === 'timeout' ? ' 😴' : ''}
              </span>
            ))
          )}
        </div>

        {reveal.endRoundTie && (
          <p className="anim-fade-up mt-10 text-4xl font-bold text-amber-300">
            Tous à égalité : la manche s'arrête, rang 1 partagé !
          </p>
        )}
      </div>
    );
  }

  // TEMPS 1 et 2 : le suspense, puis la reponse. Le compteur de survivants
  // n'apparait pas : il dirait combien tombent avant qu'on le raconte.
  return (
    <div className="flex flex-1 flex-col px-16 py-12">
      <p className="text-3xl font-black uppercase tracking-[0.35em] text-white/40">
        {state.battle?.isFinal ? 'Finale' : `Manche ${state.battle?.roundNumber}`} · Question{' '}
        {state.battle?.questionInRound ?? ''}
      </p>
      <h1 className="mt-4 text-balance font-black leading-tight" style={{ fontSize: '4rem' }}>
        {q?.question}
      </h1>

      {/* LES BARRES DE REPARTITION, comme au quiz.
          La largeur est une FONCTION DE L'HORLOGE, pas une transition lancee au
          montage : toutes montent a la meme vitesse et chacune s'arrete a sa
          valeur, la salle voit se dessiner ou elle a repondu et devine peu a
          peu qui s'est trompe. Le chiffre est la largeur arrondie, donc
          solidaire par construction. */}
      <div className="mt-auto grid grid-cols-2 gap-6">
        {(q?.answers ?? []).map((a, i) => {
          const juste = i === reveal.correctIndex;
          const pourcent = reveal.percents?.[i] ?? 0;
          const largeur = Math.min(pourcent, pourcentMax * avancement);
          return (
            <div
              key={i}
              className={`relative overflow-hidden rounded-2xl border-2 px-8 py-6 font-bold leading-snug transition-all duration-700 ${
                !reponseVisible
                  ? 'border-white/15 bg-white/5'
                  : juste
                    ? 'anim-shine border-emerald-400 bg-emerald-400/20 text-emerald-200'
                    : 'border-white/10 bg-white/5 opacity-30'
              }`}
              style={{ fontSize: '2.375rem' }}
            >
              {reveal.percents && (
                <span
                  className={`pointer-events-none absolute inset-y-0 left-0 ${
                    reponseVisible && juste ? 'bg-emerald-400/25' : 'bg-cyan-300/15'
                  }`}
                  style={{ width: `${largeur}%`, transition: 'width 160ms linear' }}
                />
              )}
              <span className={`relative mr-4 font-black ${reponseVisible && juste ? 'text-emerald-300' : 'text-cyan-300'}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="relative">{a}</span>
              {reveal.percents && (
                <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black tabular-nums text-white/70">
                  {Math.round(largeur)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex min-h-[80px] items-center justify-center">
        {reponseVisible ? (
          <p className="anim-pop font-black uppercase tracking-[0.3em] text-emerald-300" style={{ fontSize: '3rem' }}>
            ✔ {reveal.correctAnswer}
          </p>
        ) : (
          <p className="anim-suspense font-black uppercase tracking-[0.4em] text-white/50" style={{ fontSize: '2.5rem' }}>
            Qui a bon ?
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fin de manche : podium + général paginé + zone top 10
// ---------------------------------------------------------------------------

function BattleStandingRow({ s, big = false }: { s: BattleStandingEntry; big?: boolean }) {
  const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : null;
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-5 ${
        s.qualifiedForFinal ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/5'
      } ${big ? 'py-3 text-3xl' : 'py-2 text-2xl'} ${s.isSpectator ? 'opacity-50' : ''}`}
    >
      <span className={`w-10 shrink-0 text-center font-black tabular-nums ${s.position <= 3 ? 'text-amber-300' : 'text-white/40'}`}>
        {medal ?? s.position}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{s.pseudo}</span>
      {s.positionChange > 0 && <span className="text-emerald-300">▲{s.positionChange}</span>}
      {s.positionChange < 0 && <span className="text-rose-400">▼{Math.abs(s.positionChange)}</span>}
      <span className="font-black text-cyan-300 tabular-nums">{s.score}</span>
    </div>
  );
}

function RoundEndProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const standings = b?.generalStandings ?? [];
  const finalSize = b?.finalSize ?? 10;
  const top = standings.slice(0, finalSize);
  const rest = standings.slice(finalSize);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(rest.length / pageSize));
  const [page, setPage] = useState(0);

  // rotation lente des pages hors top 10 (retour terrain : ~10 s)
  const rotationMs = state.config.standingsPageMs ?? STANDINGS_PAGE_DEFAUT_MS;
  useEffect(() => {
    setPage(0);
    if (pageCount <= 1) return;
    const interval = setInterval(() => setPage((p) => (p + 1) % pageCount), rotationMs);
    return () => clearInterval(interval);
  }, [pageCount, state.status, rotationMs]);

  const visible = rest.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-14 py-8">
      <h1 className="mb-2 text-center font-black uppercase tracking-widest" style={{ fontSize: '5.5rem', lineHeight: 1 }}>
        Fin de la manche {b?.roundResult?.roundNumber}
      </h1>
      <p className="mb-6 text-center font-black uppercase tracking-[0.3em] text-white/50" style={{ fontSize: '2rem' }}>
        Classement général
      </p>
      <div className="grid flex-1 grid-cols-2 gap-12">
        <div className="flex flex-col gap-2">
          <p className="anim-glow mb-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-center text-3xl font-black uppercase tracking-widest text-amber-300">
            👑 En route pour la finale
          </p>
          {top.map((s) => <BattleStandingRow key={s.pseudo} s={s} big />)}
        </div>
        <div className="flex flex-col gap-1.5 overflow-hidden">
          {rest.length > 0 && (
            <p className="mb-1 px-4 text-center text-lg uppercase tracking-widest text-white/40">
              {pageCount > 1 ? `Page ${page + 1}/${pageCount}` : 'Le peloton'}
            </p>
          )}
          {visible.map((s) => <BattleStandingRow key={s.pseudo} s={s} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fondu de fin + victoire
// ---------------------------------------------------------------------------

function ClosingProjo() {
  return (
    <div className="anim-fade-to-black flex flex-1 flex-col items-center justify-center">
      <h1 className="anim-title-glow text-7xl font-black tracking-[0.3em]">INVADER</h1>
      <p className="mt-8 text-4xl text-white/50">Merci d'avoir combattu !</p>
    </div>
  );
}

function BattleEndProjo({ state }: { state: PublicState }) {
  const b = state.battle;
  const standings = b?.finalStandings ?? b?.generalStandings ?? [];
  const winner = b?.winner;
  return (
    <div className="relative flex flex-1 flex-col px-14 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-3xl"
            style={{
              left: `${(i * 41) % 100}%`,
              animation: `game-confetti-fall ${5 + (i % 5)}s linear ${(i % 10) * 0.6}s infinite`,
            }}
          >
            {['🎉', '✨', '👑'][i % 3]}
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center">
        <span className="anim-stomp text-8xl">👑</span>
        <h1 className="anim-pop mt-4 text-balance text-center text-7xl font-black text-amber-300">
          {winner?.pseudo ?? '?'}
        </h1>
        <p className="mt-4 text-balance text-center text-3xl text-white/80">{state.endTexts?.winnerText}</p>
      </div>
      <div className="mx-auto mt-10 grid w-full max-w-6xl flex-1 grid-cols-2 gap-x-12 gap-y-1.5 content-start overflow-hidden">
        {standings.slice(0, 20).map((s) => (
          <BattleStandingRow key={s.pseudo} s={{ ...s, qualifiedForFinal: false }} big={s.position <= 3} />
        ))}
      </div>
      <p className="mt-6 text-center text-2xl text-white/50">{state.endTexts?.endText}</p>
    </div>
  );
}
