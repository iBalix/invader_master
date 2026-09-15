/**
 * Moteur Stockfish en PROCESSUS SÉPARÉ, piloté en UCI sur stdin/stdout.
 *
 * Pourquoi un processus et pas un appel direct : ce serveur est mono-thread et
 * sert en même temps les commandes du bar, le blackjack et les autres tables.
 * Le moteur maison (ai.ts) était donc borné à 260 ms de calcul, ce qui le
 * rendait battable par n'importe quel joueur un peu sérieux. Ici Stockfish
 * calcule dans son propre processus : notre boucle d'événements reste libre,
 * et le budget par coup se compte en centaines de millisecondes sans que le
 * bar ne s'en aperçoive.
 *
 * Build « lite single-threaded » du paquet npm `stockfish` (WebAssembly,
 * ~7 Mo), chargé exactement comme l'exemple officiel `examples/loadEngine.js`
 * du projet : `spawn(process.execPath, [fichier.js])`. Surtout PAS
 * `initEngine()` du même paquet, qui charge le moteur dans le processus
 * courant, donc dans notre boucle d'événements.
 *
 * Un seul processus, partagé par toutes les tables, requêtes sérialisées (UCI
 * ne multiplexe pas), chacune portant une échéance absolue : sous charge, les
 * requêtes en file voient leur temps de calcul réduit plutôt que de rater
 * l'échéance (à ces niveaux bridés par Elo, la force dépend très peu du
 * temps de calcul). Démarré paresseusement, ou préchauffé à la création
 * d'une partie solo : une soirée sans partie d'échecs ne paie rien.
 *
 * Tout échec (fichier absent, processus mort, réponse trop lente) se traduit
 * par `null`, jamais par une exception : l'appelant retombe alors sur le
 * moteur maison, qui reste le filet de secours. La partie ne se fige jamais à
 * cause de ce module.
 *
 * Licence : Stockfish est GPLv3. Exécuté sur notre serveur sans redistribution
 * du backend, aucune obligation ne s'applique (Copying.txt dans le paquet).
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';

/** stdin/stdout en tube, stderr ignore : le moteur n'y ecrit rien d'utile */
type EngineProcess = ChildProcessByStdio<Writable, Readable, null>;

export interface BestMoveRequest {
  /** identifiant de partie : un changement declenche `ucinewgame` */
  gameId: string;
  /** historique UCI depuis la position initiale : le moteur voit les repetitions */
  movesUci: string[];
  /** force cible, bornes de Stockfish 18 : 1320 a 3190 */
  elo: number;
  /** temps de calcul souhaite ; reduit si l'echeance est proche */
  movetimeMs: number;
  /** epoch ms : au-dela, la reponse ne sert plus, le secours aura joue */
  deadline: number;
}

interface Job {
  req: BestMoveRequest;
  resolve: (uci: string | null) => void;
  /** resout `null` si le job attend encore en file a son echeance */
  deadlineTimer: NodeJS.Timeout;
}

type LineWaiter = { re: RegExp; resolve: (line: string | null) => void };

interface Engine {
  child: EngineProcess;
  /** attentes de lignes (regex) posees par le protocole */
  waiters: LineWaiter[];
  buffer: string;
  spawnedAt: number;
  /** derniere partie vue : `ucinewgame` quand elle change */
  gameId: string | null;
}

/** au-dela du movetime, marge avant de declarer la requete perdue */
const ANSWER_GRACE_MS = 1_500;
/** sous ce reste avant echeance, inutile de lancer un calcul */
const MIN_LEFT_MS = 350;
/** marge gardee entre la fin du calcul et l'echeance (IPC, verrou) */
const DEADLINE_MARGIN_MS = 250;
const MIN_MOVETIME_MS = 100;
/** deux morts prematurees d'affilee : on laisse le moteur de cote un moment */
const PREMATURE_EXIT_MS = 2_000;
const DISABLE_AFTER_CRASH_MS = 60_000;
/** la compilation WebAssembly peut etre lente sur un petit conteneur */
const HANDSHAKE_TIMEOUT_MS = 15_000;

const ELO_MIN = 1320;
const ELO_MAX = 3190;

let engine: Engine | null = null;
let starting: Promise<Engine | null> | null = null;
let queue: Job[] = [];
let busy = false;
let prematureExits = 0;
let disabledUntil = 0;
let enginePath: string | null | undefined; // undefined = pas encore cherche
let hooksInstalled = false;

/** chemin du moteur dans le paquet, robuste au hoisting de node_modules */
function resolveEnginePath(): string | null {
  if (enginePath !== undefined) return enginePath;
  try {
    const require = createRequire(import.meta.url);
    const pkgDir = path.dirname(require.resolve('stockfish/package.json'));
    const js = path.join(pkgDir, 'bin', 'stockfish-18-lite-single.js');
    const wasm = path.join(pkgDir, 'bin', 'stockfish-18-lite-single.wasm');
    enginePath = existsSync(js) && existsSync(wasm) ? js : null;
  } catch {
    enginePath = null;
  }
  if (enginePath === null) {
    console.warn('[chess-ai] Stockfish introuvable (paquet npm `stockfish`) : le moteur maison prend le relais');
  }
  return enginePath;
}

/** le moteur peut-il servir maintenant ? (fichier present, pas en quarantaine) */
export function stockfishAvailable(): boolean {
  if (Date.now() < disabledUntil) return false;
  return resolveEnginePath() !== null;
}

/**
 * Lance le processus et sa poignee de main en tache de fond, sans attendre.
 * Appele a la creation d'une partie solo : le joueur confirme, le decompte
 * tourne, il joue son premier coup, le moteur est pret depuis longtemps.
 */
export function warmStockfish(): void {
  if (engine || starting || !stockfishAvailable()) return;
  void ensureEngine();
}

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Railway envoie SIGTERM au redeploiement : on ne laisse pas un processus
  // orphelin calculer dans le vide. `once` retire ce gestionnaire, et on
  // re-emet le signal : Node retrouve sa sortie immediate par defaut, comme
  // avant ce module (poser un ecouteur sans re-emettre empecherait l'arret).
  const stop = (sig: NodeJS.Signals) => {
    engine?.child.kill();
    engine = null;
    process.kill(process.pid, sig);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

function send(eng: Engine, line: string): void {
  // le retour d'ecriture importe peu : une erreur arrive par l'evenement
  // 'error' du tube, ecoute au spawn
  eng.child.stdin.write(`${line}\n`);
}

/** promesse resolue par la prochaine ligne de sortie qui matche `re`, null au timeout */
function waitFor(eng: Engine, re: RegExp, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const waiter: LineWaiter = {
      re,
      resolve: (line) => {
        clearTimeout(timer);
        resolve(line);
      },
    };
    const timer = setTimeout(() => {
      eng.waiters = eng.waiters.filter((w) => w !== waiter);
      resolve(null);
    }, timeoutMs);
    eng.waiters.push(waiter);
  });
}

function onStdout(eng: Engine, chunk: Buffer): void {
  eng.buffer += chunk.toString();
  let nl: number;
  while ((nl = eng.buffer.indexOf('\n')) >= 0) {
    const line = eng.buffer.slice(0, nl).trim();
    eng.buffer = eng.buffer.slice(nl + 1);
    if (!line) continue;
    for (const w of [...eng.waiters]) {
      if (w.re.test(line)) {
        eng.waiters = eng.waiters.filter((x) => x !== w);
        w.resolve(line);
      }
    }
  }
}

function failAllQueued(): void {
  const pending = queue;
  queue = [];
  for (const job of pending) {
    clearTimeout(job.deadlineTimer);
    job.resolve(null);
  }
}

/** le processus est parti : on solde tout ce qui attendait, le secours prendra le relais */
function onExit(eng: Engine, code: number | null): void {
  if (engine === eng) engine = null;
  const lived = Date.now() - eng.spawnedAt;
  if (lived < PREMATURE_EXIT_MS) {
    prematureExits += 1;
    if (prematureExits >= 2) {
      disabledUntil = Date.now() + DISABLE_AFTER_CRASH_MS;
      console.error(`[chess-ai] Stockfish meurt au demarrage (code ${code}), mis de cote ${DISABLE_AFTER_CRASH_MS / 1000} s`);
    }
  } else {
    prematureExits = 0;
    console.warn(`[chess-ai] Stockfish s'est arrete (code ${code}) : redemarrage au prochain coup`);
  }
  // la requete en cours voit son attente resolue null ; la file est videe,
  // ses appelants basculent sur le moteur maison sans attendre la recompilation
  const waiters = eng.waiters;
  eng.waiters = [];
  for (const w of waiters) w.resolve(null);
  failAllQueued();
}

async function startEngine(): Promise<Engine | null> {
  const file = resolveEnginePath();
  if (!file) return null;
  installHooks();
  let child: EngineProcess;
  try {
    child = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (err) {
    console.error('[chess-ai] impossible de lancer Stockfish', err);
    disabledUntil = Date.now() + DISABLE_AFTER_CRASH_MS;
    return null;
  }
  const eng: Engine = { child, waiters: [], buffer: '', spawnedAt: Date.now(), gameId: null };
  child.stdout.on('data', (chunk: Buffer) => onStdout(eng, chunk));
  // sans ecouteur, une erreur de tube (EPIPE quand le moteur meurt pendant
  // une ecriture) devient une exception non rattrapee qui tue tout le backend
  child.stdin.on('error', (err) => console.warn('[chess-ai] Stockfish stdin', err.message));
  child.stdout.on('error', (err) => console.warn('[chess-ai] Stockfish stdout', err.message));
  child.on('exit', (code) => onExit(eng, code));
  child.on('error', (err) => {
    console.error('[chess-ai] Stockfish : erreur de processus', err);
    onExit(eng, null);
  });

  // poignee de main UCI, puis une petite table de hachage : la force voulue
  // est bridee par UCI_Elo, pas par la memoire
  const uciok = waitFor(eng, /^uciok/, HANDSHAKE_TIMEOUT_MS);
  send(eng, 'uci');
  if ((await uciok) === null) {
    console.error('[chess-ai] Stockfish ne repond pas a `uci`');
    child.kill();
    return null;
  }
  send(eng, 'setoption name Hash value 16');
  const readyok = waitFor(eng, /^readyok/, HANDSHAKE_TIMEOUT_MS);
  send(eng, 'isready');
  if ((await readyok) === null) {
    console.error('[chess-ai] Stockfish ne repond pas a `isready`');
    child.kill();
    return null;
  }
  console.log(`[chess-ai] Stockfish demarre (lite, 1 thread) en ${Date.now() - eng.spawnedAt} ms`);
  return eng;
}

async function ensureEngine(): Promise<Engine | null> {
  if (engine) return engine;
  if (!starting) {
    starting = startEngine()
      .then((eng) => {
        engine = eng;
        return eng;
      })
      .finally(() => {
        starting = null;
      });
  }
  return starting;
}

async function runJob(eng: Engine, job: Job): Promise<void> {
  const { req } = job;
  const left = req.deadline - Date.now();
  if (left < MIN_LEFT_MS) {
    job.resolve(null);
    return;
  }
  const movetimeMs = Math.max(MIN_MOVETIME_MS, Math.min(req.movetimeMs, left - DEADLINE_MARGIN_MS));
  const elo = Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(req.elo)));

  if (eng.gameId !== req.gameId) {
    // nouvelle partie : le moteur oublie la precedente (table de hachage),
    // et on attend qu'il soit pret comme le veut le protocole
    eng.gameId = req.gameId;
    const ready = waitFor(eng, /^readyok/, 2_000);
    send(eng, 'ucinewgame');
    send(eng, 'isready');
    await ready;
  }
  // les options sont reposees a CHAQUE requete : le processus est partage
  // entre les niveaux, une partie « Normal » et une « Costaud » alternent
  send(eng, 'setoption name UCI_LimitStrength value true');
  send(eng, `setoption name UCI_Elo value ${elo}`);
  send(eng, req.movesUci.length > 0 ? `position startpos moves ${req.movesUci.join(' ')}` : 'position startpos');
  // l'attente ne depasse jamais l'echeance : la reponse n'aurait plus preneur
  const answer = waitFor(eng, /^bestmove/, Math.min(movetimeMs + ANSWER_GRACE_MS, left));
  send(eng, `go movetime ${movetimeMs}`);
  let line = await answer;
  if (line === null) {
    // trop lent : on lui demande de conclure, puis on abandonne la requete.
    // Le secours cote partie jouera le moteur maison.
    if (engine === eng) {
      const late = waitFor(eng, /^bestmove/, 500);
      send(eng, 'stop');
      line = await late;
    }
    if (line === null) {
      if (engine === eng) {
        // SIGKILL et pas SIGTERM : un processus fige (SIGSTOP, boucle WASM
        // bloquee) ne traiterait pas un signal ordinaire
        console.error('[chess-ai] Stockfish muet apres `stop` : processus relance');
        eng.child.kill('SIGKILL');
      }
      job.resolve(null);
      return;
    }
  }
  const uci = line.split(/\s+/)[1];
  job.resolve(uci && uci !== '(none)' ? uci : null);
}

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    while (queue.length > 0) {
      const eng = await ensureEngine();
      const job = queue.shift();
      if (!job) break;
      clearTimeout(job.deadlineTimer);
      if (!eng) {
        job.resolve(null);
        continue;
      }
      await runJob(eng, job);
    }
  } finally {
    busy = false;
  }
}

/**
 * Meilleur coup en UCI (`e2e4`, `e7e8q`) pour la position donnee, ou `null`
 * si le moteur est indisponible ou n'a pas repondu avant l'echeance. Ne
 * rejette jamais.
 */
export function stockfishBestMove(req: BestMoveRequest): Promise<string | null> {
  if (!stockfishAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const job: Job = {
      req,
      resolve,
      // en file a l'echeance : on rend la main tout de suite, le moteur
      // maison jouera, plutot que d'attendre un calcul devenu inutile
      deadlineTimer: setTimeout(() => {
        const i = queue.indexOf(job);
        if (i >= 0) {
          queue.splice(i, 1);
          resolve(null);
        }
      }, Math.max(0, req.deadline - Date.now())),
    };
    queue.push(job);
    pump().catch((err) => {
      console.error('[chess-ai] file Stockfish', err);
      failAllQueued();
      resolve(null);
    });
  });
}
