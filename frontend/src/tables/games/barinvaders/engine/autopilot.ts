/**
 * Pilote automatique : adversaires du mode démo et vitrine animée du lobby.
 * Heuristique simple (même logique que le bot de calibrage de
 * scripts/inv-sim-check.ts) : esquiver franchement les tirs qui descendent
 * sur le canon, sinon se placer sous la colonne vivante la plus proche et
 * tirer (un appui, un relâchement).
 */

import { SIM, type InvSimState } from '../sim/invSim';

export interface PilotSkill {
  /** frames entre deux décisions */
  react: number;
  /** distance (en Y) à laquelle il voit venir un tir */
  vision: number;
  /** probabilité de rater une esquive */
  slip: number;
}

export const PILOT_SKILLS: readonly PilotSkill[] = [
  { react: 14, vision: 40, slip: 0.35 },
  { react: 8, vision: 64, slip: 0.15 },
  { react: 3, vision: 96, slip: 0.03 },
];

function dangerAt(s: InvSimState, plX: number, vision: number): number | null {
  for (const sh of s.shots) {
    if (!sh.active || sh.blowing) continue;
    if (sh.y <= 0x1c || sh.y >= 0x20 + vision) continue;
    if (sh.x + 2 >= plX - 2 && sh.x <= plX + 18) return sh.x + 1;
  }
  return null;
}

function decide(s: InvSimState, rand: () => number, skill: PilotSkill, fireHeld: boolean): number {
  const center = s.plX + 8;
  const step = skill.react + 4;
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
    if (best > center + 2 && dangerAt(s, s.plX + step, skill.vision) === null) mask |= SIM.IN_RIGHT;
    else if (best < center - 2 && dangerAt(s, s.plX - step, skill.vision) === null) mask |= SIM.IN_LEFT;
    if (Math.abs(best - center) < 6 && !fireHeld && s.psStatus === 0) mask |= SIM.IN_FIRE;
  }
  return mask;
}

/** pseudo-aléatoire reproductible (un pilote = une graine) */
function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

export class AutoPilot {
  private readonly rand: () => number;
  private mask = 0;
  private next = 0;

  constructor(
    seed: number,
    private readonly skill: PilotSkill,
  ) {
    this.rand = lcg(seed);
  }

  /** masque d'entrées pour la frame courante de `s` */
  maskFor(s: InvSimState): number {
    if (s.frame >= this.next) {
      this.mask = decide(s, this.rand, this.skill, (this.mask & SIM.IN_FIRE) !== 0);
      this.next = s.frame + this.skill.react + Math.floor(this.rand() * this.skill.react);
    } else if ((this.mask & SIM.IN_FIRE) !== 0) {
      this.mask &= ~SIM.IN_FIRE;
    }
    return this.mask;
  }
}
