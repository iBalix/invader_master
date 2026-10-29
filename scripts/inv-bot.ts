/**
 * Bots Bar Invaders : rejoignent une partie en REST, jouent leur partie sur la
 * simulation partagée avec l'heuristique du bot de calibrage
 * (scripts/inv-sim-check.ts), envoient leurs entrées en direct sur le
 * WebSocket (changements + filigrane) et déclarent leur fin de partie.
 *
 * Sert à tester le panneau des adversaires, le mode spectateur et le
 * classement sans aligner 8 dalles :
 *   cd backend && ./node_modules/.bin/tsx ../scripts/inv-bot.ts --session <id> [--count 3]
 *       [--pseudo Bot] [--device TABLE09] [--api http://localhost:3001]
 *       [--start] [--rounds 2] [--skill 1] [--mute-after 0]
 *
 *   --start      : le premier bot lance la manche dès qu'il est assis (sinon on
 *                  attend qu'un joueur la lance depuis une dalle)
 *   --rounds     : nombre de manches à jouer avant de quitter (défaut 1)
 *   --skill      : 0 débutant, 1 habitué, 2 expert (défaut 1), le niveau baisse
 *                  d'un cran tous les deux bots pour étaler le classement
 *   --mute-after : secondes de jeu après lesquelles le DERNIER bot coupe sa
 *                  socket et ne déclare rien (teste la résolution d'office) ;
 *                  0 = jamais (défaut)
 *
 * À lancer depuis backend/ pour profiter de ses node_modules (ws, tsx).
 */

import WebSocket from 'ws';
import { SIM, createSim, stepSim } from '../backend/src/games/barinvaders/invSim.ts';
import { SKILLS, decide, lcg } from './inv-sim-check.ts';

interface Args {
  session: string;
  count: number;
  pseudo: string;
  device: string;
  api: string;
  start: boolean;
  rounds: number;
  skill: number;
  muteAfter: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, def: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const session = get('session', '');
  if (!session) {
    console.error(
      'usage: inv-bot.ts --session <sessionId> [--count N] [--pseudo Bot] [--device TABLE09] [--start] [--rounds N] [--skill 0..2] [--mute-after S]',
    );
    process.exit(2);
  }
  return {
    session,
    count: Number(get('count', '1')),
    pseudo: get('pseudo', 'Bot'),
    device: get('device', 'TABLE09'),
    api: get('api', 'http://localhost:3001').replace(/\/$/, ''),
    start: argv.includes('--start'),
    rounds: Number(get('rounds', '1')),
    skill: Number(get('skill', '1')),
    muteAfter: Number(get('mute-after', '0')),
  };
}

interface RoundInfo {
  index: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

const FRAME_MS = 1000 / SIM.FPS;
const MARK_EVERY_MS = 250;
const log = (who: string, msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} [${who}] ${msg}`);

async function post(api: string, path: string, body: unknown, device?: string): Promise<any> {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(device ? { 'X-Hostname': device } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${json?.message ?? ''}`);
  return json.data;
}

/** un bot = un siège + une socket + une partie simulée par manche */
async function runBot(args: Args, n: number): Promise<void> {
  const pseudo = args.count > 1 ? `${args.pseudo}${n + 1}` : args.pseudo;
  // une dalle distincte par bot : TABLE09-1, TABLE09-2, TABLE10-1, ... (même dalle = même siège)
  const baseNum = Number((args.device.match(/(\d+)/) ?? ['', '9'])[1]);
  const device = `TABLE${String(baseNum + Math.floor(n / 2)).padStart(2, '0')}-${(n % 2) + 1}`;
  const skill = SKILLS[Math.max(0, Math.min(SKILLS.length - 1, args.skill - Math.floor(n / 2)))];
  const muteMs = args.muteAfter > 0 && n === args.count - 1 ? args.muteAfter * 1000 : 0;
  const joined = await post(args.api, `/public/barinvaders/${args.session}/join`, { pseudo }, device);
  const token: string = joined.playerToken;
  const playerId: string = joined.you.playerId;
  log(pseudo, `assis (${device}, ${skill.name}), statut ${joined.you.status}`);

  let roundsPlayed = 0;
  const doneRounds = new Set<number>();

  const ws = new WebSocket(`${args.api.replace(/^http/, 'ws')}/ws/barinvaders?session=${args.session}&token=${token}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const wsSend = (payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  const playRound = (round: RoundInfo) => {
    if (!round.participants.includes(playerId) || doneRounds.has(round.index)) return;
    doneRounds.add(round.index);
    const sim = createSim();
    const rand = lcg(Date.now() + n * 7919);
    const inputs: number[] = [];
    let mask = 0;
    let next = 0;
    let lastMarkAt = 0;
    let muted = false;
    log(pseudo, `manche ${round.index} : départ dans ${Math.max(0, round.startsAt - Date.now())} ms`);
    const timer = setInterval(() => {
      const target = Math.min(Math.floor((Date.now() - round.startsAt) / FRAME_MS), SIM.MAX_FRAMES);
      let steps = 0;
      while (!sim.over && sim.frame < target && steps < 30) {
        let m = mask;
        if (sim.frame >= next) {
          m = decide(sim, rand, skill, (mask & SIM.IN_FIRE) !== 0);
          next = sim.frame + skill.react + Math.floor(rand() * skill.react);
        } else if ((mask & SIM.IN_FIRE) !== 0) {
          // un tir par appui : on relâche à la frame suivante
          m = mask & ~SIM.IN_FIRE;
        }
        if (m !== mask) {
          mask = m;
          inputs.push(sim.frame, mask);
          if (!muted) wsSend({ t: 'in', f: sim.frame, m: mask });
        }
        stepSim(sim, mask);
        steps += 1;
      }
      if (muteMs > 0 && !muted && Date.now() - round.startsAt > muteMs) {
        muted = true;
        log(pseudo, 'coupe sa socket et se tait (test de résolution d\'office)');
        ws.terminate();
        clearInterval(timer);
        return;
      }
      if (!muted && sim.frame > 0 && Date.now() - lastMarkAt >= MARK_EVERY_MS) {
        lastMarkAt = Date.now();
        wsSend({ t: 'hb', f: sim.frame - 1 });
      }
      if (sim.over || sim.frame >= SIM.MAX_FRAMES) {
        clearInterval(timer);
        const frame = sim.over ? sim.overFrame : sim.frame;
        // la fin ne peut être déclarée qu'une fois l'instant atteint (anti-rejeu)
        const wait = Math.max(0, round.startsAt + frame * FRAME_MS - Date.now() + 100);
        setTimeout(() => {
          post(args.api, `/public/barinvaders/${args.session}/gameover`, {
            playerToken: token,
            roundIndex: round.index,
            frame,
            inputs,
          })
            .then((d) => {
              const r = d.result;
              log(
                pseudo,
                `GAME OVER à ${sim.score} pts, vague ${sim.wave} (frame ${frame}, ${inputs.length / 2} entrées) => serveur ` +
                  (r ? `${r.score} pts, vague ${r.wave}${r.mismatch ? ', MISMATCH' : ''}` : 'sans résultat'),
              );
              roundsPlayed += 1;
              if (roundsPlayed >= args.rounds) {
                log(pseudo, 'manches terminées, je quitte la partie');
                ws.close();
                post(args.api, `/public/barinvaders/${args.session}/action`, { playerToken: token, action: 'leave' }).catch(
                  () => undefined,
                );
              }
            })
            .catch((err) => log(pseudo, `déclaration de fin en échec : ${(err as Error).message}`));
        }, wait);
      }
    }, 16);
  };

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'hello' && m.round) playRound(m.round);
    else if (m.t === 'round') playRound(m.round);
    else if (m.t === 'dead' && m.p !== playerId) log(pseudo, `adversaire ${m.p.slice(0, 6)} fini à ${m.score} pts`);
    else if (m.t === 'ended') log(pseudo, `fin de manche ${m.index}`);
    else if (m.t === 'bye') ws.close();
  });
  ws.on('close', () => log(pseudo, 'socket fermée'));

  // poll de présence : le serveur considère un joueur muet partout comme parti
  const poll = setInterval(() => {
    if (ws.readyState === WebSocket.CLOSED) {
      clearInterval(poll);
      return;
    }
    fetch(`${args.api}/public/barinvaders/${args.session}/state?playerToken=${token}`).catch(() => undefined);
  }, 2000);

  if (args.start && n === 0) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await post(args.api, `/public/barinvaders/${args.session}/action`, { playerToken: token, action: 'start' });
      log(pseudo, 'manche lancée');
    } catch (err) {
      log(pseudo, `lancement refusé : ${(err as Error).message}`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
Promise.all(Array.from({ length: args.count }, (_, n) => runBot(args, n))).catch((err) => {
  console.error(err);
  process.exit(1);
});
