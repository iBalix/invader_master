/**
 * Bots Flappy Bar : rejoignent une partie en REST, volent via le WebSocket
 * avec un autopilote sur la simulation partagée, et déclarent leur mort.
 *
 * Sert à tester les fantômes et le classement sans aligner 20 dalles :
 *   cd backend && ./node_modules/.bin/tsx ../scripts/flap-bot.ts --session <id> [--count 3]
 *       [--pseudo Bot] [--device TABLE09] [--api http://localhost:3001]
 *       [--start] [--rounds 2] [--skill 0.9]
 *
 *   --start   : le premier bot lance la manche dès qu'il est assis (sinon on
 *               attend qu'un joueur la lance depuis une dalle)
 *   --rounds  : nombre de manches à jouer avant de quitter (défaut 1)
 *   --skill   : 0..1, probabilité de suivre l'autopilote à chaque décision
 *               (plus bas = meurt plus tôt), varié légèrement par bot
 *
 * À lancer depuis backend/ pour profiter de ses node_modules (ws, tsx).
 */

import WebSocket from 'ws';
import { createSim, stepSim, SIM, metersOf, type SimState } from '../backend/src/games/flappybar/flapSim.ts';

interface Args {
  session: string;
  count: number;
  pseudo: string;
  device: string;
  api: string;
  start: boolean;
  rounds: number;
  skill: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, def: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const session = get('session', '');
  if (!session) {
    console.error('usage: flap-bot.ts --session <sessionId> [--count N] [--pseudo Bot] [--device TABLE09] [--start] [--rounds N] [--skill 0.9]');
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
    skill: Number(get('skill', '0.9')),
  };
}

interface RoundInfo {
  index: number;
  seed: number;
  startsAt: number;
  capAt: number;
  participants: string[];
}

const FRAME_MS = 1000 / SIM.FPS;
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

/** un bot = un siège + une socket + un autopilote par manche */
async function runBot(args: Args, n: number): Promise<void> {
  const pseudo = args.count > 1 ? `${args.pseudo}${n + 1}` : args.pseudo;
  // une dalle distincte par bot : TABLE09-1, TABLE09-2, TABLE10-1, ... (même dalle = même siège)
  const baseNum = Number((args.device.match(/(\d+)/) ?? ['', '9'])[1]);
  const device = `TABLE${String(baseNum + Math.floor(n / 2)).padStart(2, '0')}-${(n % 2) + 1}`;
  const skill = Math.max(0.2, Math.min(1, args.skill - n * 0.07));
  const joined = await post(args.api, `/public/flappybar/${args.session}/join`, { pseudo }, device);
  const token: string = joined.playerToken;
  const playerId: string = joined.you.playerId;
  log(pseudo, `assis (${device}, skill ${skill.toFixed(2)}), statut ${joined.you.status}`);

  let roundsPlayed = 0;
  let current: RoundInfo | null = null;
  let deadRounds = new Set<number>();

  const ws = new WebSocket(`${args.api.replace(/^http/, 'ws')}/ws/flappybar?session=${args.session}&token=${token}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const playRound = (round: RoundInfo) => {
    if (!round.participants.includes(playerId) || deadRounds.has(round.index)) return;
    current = round;
    const sim: SimState = createSim(round.seed);
    const flaps: number[] = [];
    let lastDecision = -1;
    log(pseudo, `manche ${round.index} : départ dans ${Math.max(0, round.startsAt - Date.now())} ms`);
    const timer = setInterval(() => {
      const target = Math.floor((Date.now() - round.startsAt) / FRAME_MS);
      let steps = 0;
      while (sim.alive && sim.frame < target && steps < 30) {
        // autopilote : viser le centre du trou du prochain tuyau
        const next = sim.pipes.find((p) => !p.passed && p.x + SIM.PIPE_W > SIM.BIRD_X - SIM.HITBOX_W / 2);
        const goal = next ? next.gapCenter : SIM.BIRD_START_Y;
        let flap = false;
        if (sim.y > goal - 20 && sim.vy > 60 && sim.frame !== lastDecision) {
          lastDecision = sim.frame;
          flap = Math.random() < skill;
        }
        if (flap) {
          flaps.push(sim.frame);
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'flap', f: sim.frame }));
        }
        stepSim(sim, flap);
        steps += 1;
      }
      if (!sim.alive || sim.frame >= SIM.MAX_FRAMES) {
        clearInterval(timer);
        deadRounds.add(round.index);
        const frame = sim.deathFrame ?? sim.frame;
        // la mort ne peut être déclarée qu'une fois l'instant atteint (anti-rejeu)
        const wait = Math.max(0, round.startsAt + frame * FRAME_MS - Date.now() + 100);
        setTimeout(() => {
          post(args.api, `/public/flappybar/${args.session}/round/death`, { playerToken: token, roundIndex: round.index, frame, flaps })
            .then((d) => {
              const r = d.result;
              log(pseudo, `mort à ${metersOf(sim.scroll)} m (frame ${frame}, ${flaps.length} flaps) => serveur ${r ? `${r.distance} m, ${r.pipes} tuyaux${r.mismatch ? ', MISMATCH' : ''}` : 'sans résultat'}`);
              roundsPlayed += 1;
              if (roundsPlayed >= args.rounds) {
                log(pseudo, 'manches terminées, je quitte la partie');
                ws.close();
                post(args.api, `/public/flappybar/${args.session}/action`, { playerToken: token, action: 'leave' }).catch(() => undefined);
              }
            })
            .catch((err) => log(pseudo, `déclaration de mort en échec : ${(err as Error).message}`));
        }, wait);
      }
    }, 16);
  };

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'hello' && m.round) playRound(m.round);
    else if (m.t === 'round') playRound(m.round);
    else if (m.t === 'end') log(pseudo, `fin de manche ${m.index}`);
    else if (m.t === 'bye') ws.close();
  });
  ws.on('close', () => log(pseudo, 'socket fermée'));

  // poll de présence : le serveur considère un joueur muet partout comme parti
  const poll = setInterval(() => {
    fetch(`${args.api}/public/flappybar/${args.session}/state?playerToken=${token}`).catch(() => undefined);
    if (ws.readyState === WebSocket.CLOSED) clearInterval(poll);
  }, 2000);

  if (args.start && n === 0) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await post(args.api, `/public/flappybar/${args.session}/action`, { playerToken: token, action: 'start' });
      log(pseudo, 'manche lancée');
    } catch (err) {
      log(pseudo, `lancement refusé : ${(err as Error).message}`);
    }
  }
  void current;
}

const args = parseArgs(process.argv.slice(2));
Promise.all(Array.from({ length: args.count }, (_, n) => runBot(args, n))).catch((err) => {
  console.error(err);
  process.exit(1);
});
