/**
 * Bar Invaders : contrôles de la simulation partagée (invSim.ts).
 *
 *   npx --prefix backend tsx scripts/inv-sim-check.ts            déterminisme + rejeu
 *   npx --prefix backend tsx scripts/inv-sim-check.ts --calibrate [--games 40]
 *
 * 1. Déterminisme : une même liste d'entrées donne la même empreinte d'état,
 *    qu'on rejoue d'un coup ou par tranches (rejeu incrémental des dalles).
 * 2. Rejeu de fin de partie : la frame de fin rejouée par le serveur tombe
 *    sur celle observée en jouant.
 * 3. Calibrage (--calibrate) : un bot heuristique joue des parties à trois
 *    niveaux d'habileté ; on lit la durée, le score et la vague atteinte pour
 *    régler DIFFICULTY (objectif produit : durée médiane de 3 à 8 min).
 *    Mesure aussi le coût du rejeu serveur d'une longue partie.
 */

import {
  SIM,
  createSim,
  isValidInputList,
  newCursor,
  runTo,
  simDigest,
  simulate,
  stepSim,
  type InvSimState,
} from '../backend/src/games/barinvaders/invSim.js';

export function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function fail(message: string): never {
  console.error(`[inv-sim-check] ÉCHEC : ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

export interface Skill {
  name: string;
  /** frames entre deux décisions */
  react: number;
  /** distance (en Y) à laquelle il voit venir un tir */
  vision: number;
  /** probabilité de rater une esquive */
  slip: number;
}

export const SKILLS: Skill[] = [
  { name: 'débutant', react: 14, vision: 40, slip: 0.35 },
  { name: 'habitué', react: 8, vision: 64, slip: 0.15 },
  { name: 'expert', react: 3, vision: 96, slip: 0.03 },
];

/** un tir ennemi visible descend-il sur un canon placé en `plX` ? (marge de 4 px) */
function dangerAt(s: InvSimState, plX: number, vision: number): number | null {
  for (const sh of s.shots) {
    if (!sh.active || sh.blowing) continue;
    if (sh.y <= 0x1c || sh.y >= 0x20 + vision) continue;
    if (sh.x + 2 >= plX - 2 && sh.x <= plX + 18) return sh.x + 1;
  }
  return null;
}

export function decide(s: InvSimState, rand: () => number, skill: Skill, fireHeld: boolean): number {
  const center = s.plX + 8;
  const step = skill.react + 4;
  // danger : on s'écarte franchement, du côté qui a de la place
  const threat = dangerAt(s, s.plX, skill.vision);
  if (threat !== null && rand() > skill.slip) {
    const leftOk = s.plX - step >= 0x30 && dangerAt(s, s.plX - step, skill.vision) === null;
    const rightOk = s.plX + step <= 0xd9 && dangerAt(s, s.plX + step, skill.vision) === null;
    if (threat >= center && leftOk) return SIM.IN_LEFT;
    if (threat < center && rightOk) return SIM.IN_RIGHT;
    if (leftOk) return SIM.IN_LEFT;
    if (rightOk) return SIM.IN_RIGHT;
    return threat >= center ? SIM.IN_LEFT : SIM.IN_RIGHT;
  }
  // cible : la colonne vivante la plus proche
  let best = -1;
  let bestDist = 1e9;
  for (let col = 0; col < 11; col += 1) {
    let alive = false;
    for (let row = 0; row < 5; row += 1) if (s.aliens[row * 11 + col]) alive = true;
    if (!alive) continue;
    const x = ((s.refX + 16 * col) & 0xff) + 8;
    const d = Math.abs(x - center);
    if (d < bestDist) {
      bestDist = d;
      best = x;
    }
  }
  let mask = 0;
  if (best >= 0) {
    // on ne se jette pas sous un tir pour viser
    if (best > center + 2 && dangerAt(s, s.plX + step, skill.vision) === null) mask |= SIM.IN_RIGHT;
    else if (best < center - 2 && dangerAt(s, s.plX - step, skill.vision) === null) mask |= SIM.IN_LEFT;
    // un tir par appui : il faut relâcher entre deux tirs
    if (Math.abs(best - center) < 6 && !fireHeld && s.psStatus === 0) mask |= SIM.IN_FIRE;
  }
  return mask;
}

function playBot(seed: number, skill: Skill): { inputs: number[]; state: InvSimState } {
  const rand = lcg(seed);
  const s = createSim();
  const inputs: number[] = [];
  let mask = 0;
  let next = 0;
  while (!s.over && s.frame < SIM.MAX_FRAMES) {
    if (s.frame >= next) {
      const m = decide(s, rand, skill, (mask & SIM.IN_FIRE) !== 0);
      next = s.frame + skill.react + Math.floor(rand() * skill.react);
      if (m !== mask) {
        mask = m;
        inputs.push(s.frame, mask);
      }
    } else if ((mask & SIM.IN_FIRE) !== 0) {
      // relâche le tir à la frame suivante
      mask &= ~SIM.IN_FIRE;
      inputs.push(s.frame, mask);
    }
    stepSim(s, mask);
  }
  return { inputs, state: s };
}

// ---------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------

function checkDeterminism(): void {
  for (let seed = 1; seed <= 6; seed += 1) {
    const { inputs, state } = playBot(seed, SKILLS[seed % 3]);
    if (!isValidInputList(inputs)) fail(`liste d'entrées invalide (seed ${seed})`);
    const replay = simulate(inputs, SIM.MAX_FRAMES);
    if (simDigest(replay) !== simDigest(state)) fail(`rejeu complet divergent (seed ${seed})`);
    if (replay.overFrame !== state.overFrame) fail(`frame de fin divergente (seed ${seed})`);

    // rejeu par tranches irrégulières, comme une dalle qui suit un adversaire
    const inc = createSim();
    const cur = newCursor();
    const rand = lcg(seed * 7);
    while (!inc.over && inc.frame < SIM.MAX_FRAMES) runTo(inc, inputs, cur, inc.frame + 1 + Math.floor(rand() * 40));
    if (simDigest(inc) !== simDigest(state)) fail(`rejeu incrémental divergent (seed ${seed})`);

    // rejeu « serveur » borné à la frame déclarée + tolérance
    const declared = state.overFrame;
    const bounded = simulate(inputs, declared + 3);
    if (!bounded.over || bounded.overFrame !== declared) fail(`rejeu borné incorrect (seed ${seed})`);
  }
  console.log('[inv-sim-check] OK : déterminisme, rejeu complet, incrémental et borné');
}

function median(values: number[]): number {
  const v = values.slice().sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

function calibrate(games: number): void {
  for (const skill of SKILLS) {
    const durations: number[] = [];
    const scores: number[] = [];
    const waves: number[] = [];
    for (let g = 0; g < games; g += 1) {
      const { state } = playBot(1000 + g, skill);
      durations.push(state.frame / SIM.FPS / 60);
      scores.push(state.score);
      waves.push(state.wave);
    }
    console.log(
      `[calibrage] ${skill.name.padEnd(9)} durée médiane ${median(durations).toFixed(1)} min ` +
        `(max ${Math.max(...durations).toFixed(1)}), score médian ${median(scores)}, ` +
        `vague médiane ${median(waves)} (max ${Math.max(...waves)})`,
    );
  }
  // coût du rejeu serveur sur la plus longue partie d'un expert
  const { inputs, state } = playBot(4242, SKILLS[2]);
  const t0 = process.hrtime.bigint();
  simulate(inputs, SIM.MAX_FRAMES);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`[calibrage] rejeu d'une partie de ${(state.frame / 3600).toFixed(1)} min : ${ms.toFixed(1)} ms`);
}

// exécution directe seulement : scripts/inv-bot.ts importe le bot sans lancer les contrôles
if (/inv-sim-check\.ts$/.test(process.argv[1] ?? '')) {
  const args = process.argv.slice(2);
  checkDeterminism();
  if (args.includes('--calibrate')) {
    const i = args.indexOf('--games');
    calibrate(i >= 0 ? Number(args[i + 1]) || 40 : 40);
  }
}
