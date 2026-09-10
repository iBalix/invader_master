/**
 * Cues lumière (Philips Hue) dérivés de l'état de partie.
 *
 * Principe : le cloud envoie une INTENTION de haut niveau ("joue la scène
 * question, difficulté Difficile, elle dure 15 s"), jamais des ordres
 * d'ampoules. L'agent du bar joue l'animation localement, à l'horloge du bar.
 * Conséquences directes :
 *   - une question entière coûte ~3 messages au lieu de centaines de requêtes
 *     vers le bridge (le legacy le saturait, d'où les appels perdus) ;
 *   - le moment critique (rouge des 3 dernières secondes) ne traverse jamais
 *     le réseau : l'agent l'arme lui-même à la réception du cue.
 *
 * Émission : depuis withSession(), APRÈS saveSession, en fire-and-forget.
 * Les lumières ne doivent jamais casser ni ralentir le moteur de jeu.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { sendLightCue, type LightCue, type SceneName } from '../websocket/agent-bridge.js';
import { brVainqueurMs, type SessionRow } from './types.js';

/** marge avant la fin de la question pour l'alerte rouge */
const WARN_BEFORE_MS = 3000;

// ---------------------------------------------------------------------------
// État mémoire (mono-process, même hypothèse que le mutex de l'engine)
// ---------------------------------------------------------------------------

/** dernière clé de cue émise, par session : évite de rejouer la même scène */
const lastCueKey = new Map<string, string>();
/**
 * Compteur monotone GLOBAL. Une seule session éclaire le bar à la fois, donc
 * un compteur unique suffit — et il évite qu'un cue manuel (bouton Tester)
 * entre en conflit de numérotation avec les cues de partie.
 * Borné pour rester dans un entier 32 bits (contrainte du worker PowerShell).
 */
let cueSeq = 0;
function nextSeq(): number {
  cueSeq = (cueSeq + 1) % 2_000_000_000;
  return cueSeq;
}
/**
 * Époque = ce process-ci. `cueSeq` est en mémoire : il repart à zéro à chaque
 * redémarrage (redéploiement, réveil de l'hébergeur), tandis que le worker Hue
 * du bar tourne des semaines et garde son dernier seq. Il prenait alors les
 * cues d'après un redéploiement pour des retardataires et les ignorait tous :
 * le bar restait dans le noir jusqu'à ce que le compteur rattrape son niveau
 * d'avant la coupure. L'époque lui dit « nouvel émetteur, oublie l'ancienne
 * numérotation ».
 */
const cueEpoch = Date.now();
/**
 * Cues DIFFERES, par session.
 *
 * Presque toute la lumiere se declenche a un changement de phase, mais pas
 * tout : le jaune de manche remportee doit tomber au milieu de la phase de
 * revelation, pile quand l'ecran affiche « MANCHE REMPORTEE PAR X ». Un
 * minuteur cote serveur est le seul endroit qui connaisse a la fois l'horloge
 * de la phase et la topologie des scenes.
 *
 * Toujours annule au changement de scene suivant : une question annulee ou une
 * fin de manche anticipee ne doit pas voir arriver un jaune en retard.
 */
const cuesDifferes = new Map<string, { cle: string; timer: NodeJS.Timeout }>();
/** derniere scene differee DEJA jouee, par session : jamais deux fois */
const differesJoues = new Map<string, string>();

/**
 * Annule le cue en attente, SAUF s'il a ete arme pour la scene qu'on est en
 * train de (re)jouer : la meme scene peut etre reemise plusieurs fois pendant
 * une phase (agent absent au premier envoi, sauvegarde d'etat sans changement
 * de scene), et desarmer a chaque fois faisait perdre le jaune.
 */
function annuleCueDiffere(sessionId: string, cleCourante?: string): void {
  const arme = cuesDifferes.get(sessionId);
  if (!arme) return;
  if (cleCourante && arme.cle === cleCourante) return;
  clearTimeout(arme.timer);
  cuesDifferes.delete(sessionId);
}

/** session autorisée à piloter les lumières (une seule partie éclaire le bar) */
let activeSessionId: string | null = null;
let activeSessionCheckedAt = 0;
/**
 * Le cache de la session active a DEUX durées, et ce n'est pas un détail.
 *
 * Réponse OUI : on la garde 10 s, c'est le cas courant et ça évite une requête
 * par sauvegarde d'état.
 *
 * Réponse NON : on ne la garde qu'une seconde. Une réponse négative fait JETER
 * le cue, sans le mémoriser, donc sans le rejouer : sur une phase statique (le
 * classement de fin de manche, qui reste tant que l'animateur commente) il n'y
 * a pas de sauvegarde suivante pour retenter. Une réponse négative erronée —
 * requête qui gagne la course contre la création de session, ou latence de
 * réplication — bloquait donc les lumières sur la scène précédente pendant les
 * dix secondes du cache. C'est le décalage observé en salle.
 */
const ACTIVE_CACHE_OUI_MS = 10_000;
const ACTIVE_CACHE_NON_MS = 1_000;

let enabled = true;

export function setLightsEnabled(value: boolean): void {
  enabled = value;
}

export function areLightsEnabled(): boolean {
  return enabled;
}

/** à appeler à la création d'une session : invalide le cache de session active */
export function invalidateActiveSession(): void {
  activeSessionCheckedAt = 0;
}

export function forgetSession(sessionId: string): void {
  lastCueKey.delete(sessionId);
  differesJoues.delete(sessionId);
  annuleCueDiffere(sessionId);
  invalidateActiveSession();
}

/**
 * Une seule session éclaire le bar : celle que /public/game/current renverrait.
 * Sans ça, une vieille session laissée ouverte dans un onglet GM piloterait
 * les lumières en pleine autre partie.
 */
async function isActiveSession(sessionId: string): Promise<boolean> {
  const now = Date.now();
  const perime =
    activeSessionId === sessionId ? ACTIVE_CACHE_OUI_MS : ACTIVE_CACHE_NON_MS;
  if (now - activeSessionCheckedAt > perime) {
    try {
      const { data } = await supabaseAdmin
        .from('game_sessions')
        .select('id')
        .is('ended_at', null)
        // même périmètre que /public/game/current : une partie d'échecs plus
        // récente ne doit pas voler le slot lumière du quiz en cours
        .in('mode', ['quiz', 'battle'])
        .order('created_at', { ascending: false })
        .limit(1);
      activeSessionId = data?.[0]?.id ?? null;
      activeSessionCheckedAt = now;
    } catch {
      return false;
    }
  }
  return activeSessionId === sessionId;
}

// ---------------------------------------------------------------------------
// Dérivation du cue depuis l'état
// ---------------------------------------------------------------------------

interface BattleRuntimeLike {
  roundNumber?: number;
  isFinal?: boolean;
  roundQuestionCount?: number;
  reveal?: { milestone?: number | null; victory?: boolean; repechage?: boolean; roundWinner?: string };
}

function battleOf(session: SessionRow): BattleRuntimeLike {
  return ((session.runtime as Record<string, unknown>).battle ?? {}) as BattleRuntimeLike;
}

function currentDifficulty(session: SessionRow): string | undefined {
  const q = session.question_order[session.current_question_index];
  return q?.difficulty;
}

function phaseDurationMs(session: SessionRow): number | undefined {
  if (!session.phase_ends_at || !session.phase_started_at) return undefined;
  const ms =
    new Date(session.phase_ends_at).getTime() - new Date(session.phase_started_at).getTime();
  return ms > 0 ? ms : undefined;
}

/** Reste-t-il assez de temps pour armer l'alerte ? (cue reçu en retard = pas d'alerte) */
function warnAtMs(session: SessionRow): number | undefined {
  if (!session.phase_ends_at) return undefined;
  const remaining = new Date(session.phase_ends_at).getTime() - Date.now();
  const warn = remaining - WARN_BEFORE_MS;
  return warn > 500 ? warn : undefined;
}

interface ComputedCue {
  key: string;
  scene: SceneName;
  params: LightCue['params'];
}

/**
 * Traduit l'état persisté en scène. Retourne null si la phase ne pilote pas
 * les lumières. La CLÉ intègre tous les discriminants : deux étapes de
 * cinématique partagent le même statut mais doivent produire deux cues.
 */
export function computeCue(session: SessionRow): ComputedCue | null {
  // Seuls les événements projo pilotent les lumières du bar. Les jeux de
  // tables (chess, ...) partagent des statuts ('lobby', 'end') qui matcheraient
  // le switch ci-dessous : on coupe court.
  if (session.mode !== 'quiz' && session.mode !== 'battle') return null;
  const mode = session.mode;
  const status = session.status;
  const qi = session.current_question_index;
  const b = battleOf(session);
  const runtime = session.runtime as Record<string, unknown>;

  const base = (scene: SceneName, params: LightCue['params'] = {}, extra = ''): ComputedCue => ({
    key: `${mode}|${status}|q${qi}|${extra}`,
    scene,
    params,
  });

  switch (status) {
    // Lobby et regles = theme par defaut du bar (le saumon chaud, cinq
    // cibles). La scene 'lobby' (cyan en boucle) s'allumait des l'ouverture de
    // la session, soit vingt bonnes minutes de bleu avant la premiere question :
    // l'ambiance ne doit changer qu'avec le jeu lui-meme.
    case 'lobby':
    case 'rules':
      return base('idle');

    // Pause = THEME PAR DEFAUT du bar. La scene 'pause' heritait de 'lobby'
    // (cyan en boucle sur les deux rampes, les autres cibles gardant la
    // couleur d'avant) : la salle passait dix minutes dans un bleu sombre qui
    // pulsait. 'idle' est la seule scene qui adresse les cinq cibles.
    case 'pause':
      return base('idle');

    // Décompte de reprise : l'écran reste celui de la pause, les lumières
    // aussi. Renvoyer null (et non un cue 'pause' de plus) évite un message
    // pour rien : la scène en cours est déjà la bonne.
    case 'resuming':
      return null;

    case 'round_intro':
      return base(
        'round_intro',
        { durationMs: phaseDurationMs(session), round: b.roundNumber, isFinal: b.isFinal },
        `r${b.roundNumber}`,
      );

    case 'announce':
      return base(
        'category',
        { difficulty: currentDifficulty(session), isFinal: b.isFinal },
        `d${currentDifficulty(session) ?? ''}`,
      );

    // Extrait video plein ecran : on reste sur la scene d'annonce (couleur de
    // difficulte), aucune nouvelle scene a jouer. Le cue 'question_start' - et
    // donc l'alerte rouge de fin - partira quand la fenetre de reponse
    // s'ouvrira reellement, apres la video.
    case 'media':
      return null;

    case 'question':
      return base('question_start', {
        durationMs: phaseDurationMs(session),
        warnAtMs: warnAtMs(session),
        difficulty: currentDifficulty(session),
        isFinal: b.isFinal,
      });

    // Fin de la fenetre de reponse et verification : on RESTE sur la couleur de
    // la difficulte, comme resetLightsDefault() du legacy. Ces deux cues ne la
    // transmettaient pas, donc les scenes retombaient sur leur teinte en dur
    // (saumon, puis un violet fonce sur tout le bar pendant la verification).
    case 'locked':
      return base(
        'question_end',
        { difficulty: currentDifficulty(session) },
        `d${currentDifficulty(session) ?? ''}`,
      );

    case 'verdict':
      return base(
        'verdict',
        { difficulty: currentDifficulty(session) },
        `d${currentDifficulty(session) ?? ''}`,
      );

    case 'reveal': {
      if (mode === 'battle') {
        const r = b.reveal ?? {};
        // MANCHE REMPORTEE : le jaune de setRoundWinnerLights() ne part pas
        // ici. Le legacy l'allumait a la fin de son animation d'elimination,
        // au moment ou le compteur cede la place a « MANCHE REMPORTEE PAR X ».
        // L'envoyer des le reveal, treize secondes plus tot, annonce a la
        // salle qu'il ne reste qu'un survivant avant que l'ecran ne le
        // raconte. Il partira en cue DIFFERE (cf. planifieCueDiffere).
        // En finale, le legacy n'y touchait pas du tout : c'est la ceremonie
        // qui prend la main juste apres.
        if (r.milestone != null) {
          return base('milestone', { milestone: r.milestone as 3 | 5 | 10 | 20 }, `m${r.milestone}`);
        }
        return base('reveal', { difficulty: currentDifficulty(session) });
      }
      const special = (runtime.reveal as { special?: string | null } | undefined)?.special;
      if (special) return base('bonus_question', {}, `s${special}`);
      return base('reveal', { difficulty: currentDifficulty(session) });
    }

    case 'leaderboard':
      return base('leaderboard_reveal');

    case 'cinematic': {
      const step = (runtime.cinematic as { step?: number } | undefined)?.step ?? 0;
      if (step <= 0) return base('leaderboard_reveal', {}, 'cine0');
      // étapes 1..5 dévoilent les rangs 5..1 ; le rang 1 a sa scène dorée
      const rank = 6 - step;
      if (rank === 1) return base('leaderboard_first', { rank }, 'cine1');
      if (rank >= 2 && rank <= 5) return base('cinematic_step', { rank }, `cine${step}`);
      return base('leaderboard_reveal', {}, `cine${step}`);
    }

    case 'rewards': {
      const revealed = (runtime.rewards as { revealed?: number } | undefined)?.revealed ?? 0;
      return base('rewards_step', {}, `rw${revealed}`);
    }

    case 'round_end':
      return base('round_end', { round: b.roundNumber }, `r${b.roundNumber}`);

    // Fondu de fin : le classement a deja eu son jeu de lumiere (cf. 'end'),
    // le bar redescend simplement sur son theme.
    case 'closing':
      return mode === 'battle'
        ? base('idle', {}, 'closing')
        : base('event_end', { durationMs: phaseDurationMs(session) });

    // Ceremonie : c'est ICI que le legacy lancait startLightEventEndAnimation()
    // (danse jaune/orange/blanc, cyan, flash blanc, retour au repos), sur
    // l'ecran du classement final et pas sur le fondu d'apres.
    // `end` est atteint DEUX fois : d'abord la ceremonie (session encore
    // ouverte), puis apres le fondu de fin, une fois la partie cloturee. La
    // seconde ne doit surtout pas rejouer vingt secondes de spectacle alors
    // que les ecrans sont deja revenus a l'accueil.
    case 'end':
      return mode === 'battle' && !session.ended_at
        ? base('event_end', {}, 'ceremonie')
        : base('idle', {}, 'termine');

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Émission
// ---------------------------------------------------------------------------

/**
 * Appelé par withSession après chaque sauvegarde d'état.
 * Fire-and-forget : ne throw jamais, n'est jamais attendu.
 */
export async function onSessionCommitted(session: SessionRow): Promise<void> {
  try {
    if (!enabled) return;

    const computed = computeCue(session);
    if (!computed) return;

    if (lastCueKey.get(session.id) === computed.key) return;

    // nouvelle scene : ce qui etait promis pour plus tard sur l'ancienne
    // n'a plus lieu d'etre
    annuleCueDiffere(session.id, computed.key);

    if (!(await isActiveSession(session.id))) return;

    const seq = nextSeq();
    const sent = sendLightCue({
      v: 1,
      seq,
      epoch: cueEpoch,
      scene: computed.scene,
      params: computed.params,
    });
    planifieCueDiffere(session, computed.key);
    // la cle n'est memorisee que si le cue est PARTI : un agent absent une
    // seconde au mauvais moment laissait sinon le cue marque comme joue, jamais
    // rejoue, et le bar figeait sur la scene precedente (parfois une boucle)
    if (sent) lastCueKey.set(session.id, computed.key);

    console.log(
      `[lights] cue=${computed.scene} session=${session.id.slice(0, 8)} seq=${seq} sent=${sent}`,
    );

    if (session.ended_at) forgetSession(session.id);
  } catch (err) {
    // jamais remonté : une panne de lumière ne casse pas une partie
    console.error('[lights] cue error', err);
  }
}

/**
 * Arme les cues qui ne tombent pas sur un changement de phase.
 *
 * Un seul cas aujourd'hui : le jaune de manche remportee, qui doit arriver
 * quand l'ecran remplace le compteur de survivants par le nom du vainqueur,
 * soit apres que les noms des elimines sont tous tombes. La formule est
 * partagee avec l'ecran (brVainqueurMs), donc l'image et la lumiere ne peuvent
 * pas se desynchroniser.
 */
function planifieCueDiffere(session: SessionRow, cle: string): void {
  if (session.mode !== 'battle' || session.status !== 'reveal') return;
  if (cuesDifferes.has(session.id)) return;
  // deja joue pour cette revelation : une reemission de la meme scene (agent
  // qui revient, sauvegarde d'etat sans changement) ne le rejoue pas
  if (differesJoues.get(session.id) === cle) return;
  const b = battleOf(session);
  const r = b.reveal;
  // en finale, le legacy ne mettait pas le bar en jaune : la ceremonie suit
  if (!r?.roundWinner || r.victory) return;
  const debut = session.phase_started_at ? new Date(session.phase_started_at).getTime() : Date.now();
  const nbElimines = (r as { eliminated?: unknown[] }).eliminated?.length ?? 0;
  const dans = debut + brVainqueurMs(nbElimines) - Date.now();
  const sessionId = session.id;
  const timer = setTimeout(
    () => {
      cuesDifferes.delete(sessionId);
      differesJoues.set(sessionId, cle);
      if (!enabled) return;
      const seq = nextSeq();
      const sent = sendLightCue({
        v: 1,
        seq,
        epoch: cueEpoch,
        scene: 'round_winner',
        params: {},
      });
      console.log(`[lights] cue=round_winner (differe) session=${sessionId.slice(0, 8)} seq=${seq} sent=${sent}`);
    },
    Math.max(0, dans),
  );
  // ne jamais retenir le process pour une lumiere
  timer.unref?.();
  cuesDifferes.set(sessionId, { cle, timer });
}

/** Cue ponctuel hors partie (bouton Tester, extinction manuelle) */
export function sendManualCue(scene: SceneName): boolean {
  return sendLightCue({ v: 1, seq: nextSeq(), epoch: cueEpoch, scene, params: {} });
}
