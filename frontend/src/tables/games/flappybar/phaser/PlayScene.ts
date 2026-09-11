/**
 * Scène de jeu : boucle à pas fixe calée sur l'horloge serveur.
 *
 *   targetFrame = floor((serverNow() - round.startsAt) / 16,667 ms)
 *
 * La sim locale est avancée jusqu'à targetFrame (30 pas max par update, rejeu
 * complet si le retard dépasse 180 frames), jamais au-delà ; le rendu
 * interpole entre l'état précédent et l'état courant. Les fantômes tournent
 * 8 frames derrière (GhostManager). Phases publiées au pont :
 * idle | countdown | playing | dead | spectating | ended.
 *
 * Focus = oiseau dont on affiche les tuyaux : moi tant que je vole, puis le
 * fantôme vivant le plus avancé. Le changement de focus recale la caméra en
 * 300 ms (glissement + baisse d'opacité des tuyaux) au lieu de sauter.
 */

import Phaser from 'phaser';
import { serverNow } from '../../../lib/clockSync';
import { SIM, createSim, frameToMs, metersOf, simulate, stepSim, type SimState } from '../sim/flapSim';
import type { BridgeRound, BridgeState, FlapBridge, FlapPhase, RankingRow } from './bridge';
import { getFlapTheme } from '../themes';
import type { FlapTheme } from '../themes/types';
import { ATLAS_KEY, FRAME } from '../themes/types';
import { BIRD_ANIM, BirdActor } from './BirdActor';
import { Fx } from './Fx';
import { GhostManager } from './GhostManager';
import { Parallax } from './Parallax';
import { PipePool } from './PipePool';
import { createGamepadFlap, type GamepadFlap } from './gamepadFlap';

const FRAME_MS = 1000 / SIM.FPS;
const MAX_STEPS = 30;
const RESYNC_GAP = 180;
const GHOST_DELAY = 8;
const DEAD_HOLD_MS = 1200;
const FOCUS_BLEND_MS = 300;
const START_BLEND_MS = 160;
const IDLE_DRIFT_PX_S = 40;
const RANKING_MS = 250;
/** première seconde d'une manche : jamais "ended" même sans fantôme connu */
const GRACE_FRAMES = 90;

interface FocusView {
  id: string | null;
  sim: SimState | null;
  lastDx: number;
}

export class PlayScene extends Phaser.Scene {
  private bridge!: FlapBridge;
  private theme!: FlapTheme;
  private reduced = false;
  private parallax!: Parallax;
  private pipes!: PipePool;
  private bird!: BirdActor;
  private ghosts!: GhostManager;
  private fx!: Fx;
  private pad!: GamepadFlap;
  private offs: Array<() => void> = [];

  private round: BridgeRound | null = null;
  private roundKey = '';
  private capFrame: number = SIM.MAX_FRAMES;
  private mySim: SimState | null = null;
  private prevY: number = SIM.BIRD_START_Y;
  private lastDx = 0;
  private myFlaps: number[] = [];
  private flapCursor = 0;
  private deathEmitted = false;
  private diedAt = 0;
  private startedAt = -1;
  private phase: FlapPhase = 'idle';
  private focusId: string | null = null;
  private lastWorld = 0;
  private blendFrom = 0;
  private blendAt = -1;
  private idleScroll = 0;
  private lastPass = 0;
  private lastMilestone = 0;
  private lastDistance = -1;
  private recordDone = false;
  private nextRanking = 0;
  private nextSecond = 0;
  private maxGap = 0;

  constructor() {
    super('play');
  }

  create(): void {
    this.bridge = this.registry.get('bridge') as FlapBridge;
    const state = this.bridge.store.getState();
    this.theme = getFlapTheme(state.themeId);
    this.reduced = state.reduced;
    this.cameras.main.setBackgroundColor(this.theme.palette.skyBottom);
    this.anims.create({
      key: BIRD_ANIM,
      frames: [0, 1, 2, 1].map((i) => ({ key: ATLAS_KEY, frame: FRAME.bird[i] })),
      frameRate: 10,
      repeat: -1,
    });

    this.parallax = new Parallax(this, this.theme, this.reduced);
    this.fx = new Fx(this, this.theme, this.reduced, this.parallax.sky);
    this.pipes = new PipePool(this);
    this.ghosts = new GhostManager(this, this.fx);
    this.bird = new BirdActor(this, this.theme, this.reduced);
    this.pad = createGamepadFlap(() => this.localFlap());

    const to = this.bridge.toScene;
    this.offs = [
      to.on('localFlap', () => this.localFlap()),
      to.on('remoteHello', (players, dead) => {
        this.syncRound();
        this.ghosts.hello(players, dead);
      }),
      to.on('remoteFlap', (playerId, frame) => {
        this.syncRound();
        this.ghosts.flap(playerId, frame);
      }),
      to.on('remoteDead', (playerId, frame) => {
        this.syncRound();
        this.ghosts.dead(playerId, frame);
      }),
      to.on('remoteLeft', (playerId) => this.ghosts.left(playerId)),
    ];
    const teardown = () => {
      for (const off of this.offs) off();
      this.offs = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
    this.setPhase('idle');
  }

  update(time: number, delta: number): void {
    this.pad.poll();
    this.syncRound();
    const state = this.bridge.store.getState();
    const me = state.myPlayerId;
    const round = this.round;

    if (!round) {
      this.renderIdle(time, delta, me !== null);
      this.setPhase('idle');
      this.tick(time, state, null, 0);
      return;
    }

    const elapsed = serverNow() - round.startsAt;
    const meIn = me !== null && (state.players[me]?.inRound ?? false);
    if (elapsed < 0) {
      this.ghosts.sync(state.players, me);
      this.renderIdle(time, delta, meIn);
      this.setPhase('countdown');
      this.tick(time, state, null, 0);
      return;
    }

    const targetFrame = Math.min(Math.floor(elapsed / FRAME_MS), this.capFrame);
    if (this.startedAt < 0) this.startedAt = time;

    if (meIn && !this.mySim) {
      // arrivée en cours de manche (rechargement) : rejeu sans flap
      this.mySim = targetFrame > 0 ? simulate(round.seed, [], targetFrame) : createSim(round.seed);
      this.prevY = this.mySim.y;
      this.bird.reset();
      this.bird.setTrail(true);
    }
    if (this.mySim) this.stepMine(targetFrame, time);

    this.ghosts.sync(state.players, me);
    this.ghosts.step(Math.max(0, targetFrame - GHOST_DELAY));

    const simFrame = this.mySim ? this.mySim.frame : targetFrame;
    const alpha = Phaser.Math.Clamp((elapsed - simFrame * FRAME_MS) / FRAME_MS, 0, 1);

    // ----- focus et recalage caméra
    const focus = this.pickFocus(me);
    const focusScroll = focus.sim ? (focus.sim.alive ? focus.sim.scroll - (1 - alpha) * focus.lastDx : focus.sim.scroll) : 0;
    if (focus.id !== this.focusId) {
      if (this.focusId !== null && focus.id !== null) {
        this.blendFrom = this.lastWorld - focusScroll;
        this.blendAt = time;
      }
      this.focusId = focus.id;
      this.bridge.store.setState({ focusPlayerId: focus.id });
    }
    let shift = 0;
    if (this.blendAt >= 0) {
      const k = 1 - Math.min(1, (time - this.blendAt) / FOCUS_BLEND_MS);
      if (k <= 0) {
        this.blendAt = -1;
        this.pipes.setAlpha(1);
      } else {
        shift = this.blendFrom * k * k;
        this.pipes.setAlpha(1 - 0.45 * k);
      }
    }
    const world = focusScroll + shift;
    this.lastWorld = world;

    // ----- rendu
    this.parallax.update(this.idleScroll + world);
    if (focus.sim) this.pipes.render(focus.sim.pipes, focus.sim.alive ? (1 - alpha) * focus.lastDx : 0, shift);
    else this.pipes.hideAll();

    if (this.mySim) {
      const sim = this.mySim;
      let y = sim.alive ? Phaser.Math.Linear(this.prevY, sim.y, alpha) : sim.y;
      const sinceStart = time - this.startedAt;
      if (sim.alive && sinceStart < START_BLEND_MS) {
        y = Phaser.Math.Linear(BirdActor.bobY(time), y, sinceStart / START_BLEND_MS);
      }
      const scrollI = sim.alive ? sim.scroll - (1 - alpha) * this.lastDx : sim.scroll;
      this.bird.setVisible(true);
      this.bird.render(SIM.BIRD_X - (world - scrollI), y, sim.vy, delta);
    } else {
      this.bird.setVisible(false);
    }
    this.ghosts.render(alpha, world, focus.id, false);

    // ----- phase
    const anyAlive = (this.mySim?.alive ?? false) || this.ghosts.aliveCount() > 0;
    const stillGoing = anyAlive || targetFrame < GRACE_FRAMES;
    let phase: FlapPhase;
    if (targetFrame >= this.capFrame) phase = 'ended';
    else if (this.mySim) {
      if (this.mySim.alive) phase = 'playing';
      else if (time - this.diedAt < DEAD_HOLD_MS) phase = 'dead';
      else phase = stillGoing ? 'spectating' : 'ended';
    } else {
      phase = stillGoing ? 'spectating' : 'ended';
    }
    this.setPhase(phase);

    this.tick(time, state, focus, focusScroll);
  }

  /* ---------------- manche ---------------- */

  /** relit la manche du store et remet tout à zéro si elle a changé */
  private syncRound(): void {
    const round = this.bridge.store.getState().round;
    const key = round ? `${round.index}:${round.seed}` : '';
    if (key === this.roundKey) {
      this.round = round;
      return;
    }
    this.roundKey = key;
    this.round = round;
    this.capFrame = round
      ? Math.min(SIM.MAX_FRAMES, Math.max(0, Math.floor((round.capAt - round.startsAt) / FRAME_MS)))
      : SIM.MAX_FRAMES;
    this.mySim = null;
    this.prevY = SIM.BIRD_START_Y;
    this.lastDx = 0;
    this.myFlaps = [];
    this.flapCursor = 0;
    this.deathEmitted = false;
    this.diedAt = 0;
    this.startedAt = -1;
    this.focusId = null;
    this.lastWorld = 0;
    this.blendAt = -1;
    this.lastPass = 0;
    this.lastMilestone = 0;
    this.lastDistance = -1;
    this.recordDone = false;
    this.maxGap = 0;
    this.ghosts.reset(round?.seed ?? 0);
    this.bird.reset();
    this.pipes.hideAll();
    this.pipes.setAlpha(1);
    this.fx.resetSky();
    this.bridge.store.setState({ focusPlayerId: null });
  }

  private stepMine(targetFrame: number, time: number): void {
    const sim = this.mySim;
    if (!sim || !sim.alive) return;
    const gap = targetFrame - sim.frame;
    if (gap <= 0) return;
    if (gap > this.maxGap) this.maxGap = gap;
    if (gap > RESYNC_GAP) {
      this.mySim = simulate(sim.seed, this.myFlaps, targetFrame);
      this.flapCursor = 0;
      while (this.flapCursor < this.myFlaps.length && this.myFlaps[this.flapCursor] < this.mySim.frame) this.flapCursor += 1;
      this.prevY = this.mySim.y;
      this.lastDx = 0;
    } else {
      let steps = Math.min(gap, MAX_STEPS);
      while (steps > 0 && sim.alive) {
        steps -= 1;
        this.prevY = sim.y;
        this.lastDx = sim.speed * SIM.DT;
        const flap = this.flapCursor < this.myFlaps.length && this.myFlaps[this.flapCursor] === sim.frame;
        if (flap) this.flapCursor += 1;
        stepSim(sim, flap);
      }
    }
    if (this.mySim && !this.mySim.alive) this.onLocalDeath(time);
  }

  private localFlap(): void {
    const sim = this.mySim;
    if (this.phase !== 'playing' || !sim || !sim.alive) return;
    const last = this.myFlaps.length > 0 ? this.myFlaps[this.myFlaps.length - 1] : -1;
    const frame = Math.max(sim.frame + 1, last + 1);
    if (frame > this.capFrame) return;
    this.myFlaps.push(frame);
    this.bridge.fromScene.emit('flap', frame);
    this.bird.flap();
  }

  private onLocalDeath(time: number): void {
    const sim = this.mySim;
    if (!sim) return;
    this.diedAt = time;
    this.fx.burst(SIM.BIRD_X, sim.y, true);
    this.fx.shake();
    this.bird.die();
    if (this.deathEmitted) return;
    this.deathEmitted = true;
    const frame = sim.deathFrame ?? sim.frame;
    this.bridge.fromScene.emit('death', {
      frame,
      flaps: this.myFlaps.filter((f) => f <= frame),
      distanceM: metersOf(sim.scroll),
      pipes: sim.pipesPassed,
      timeMs: frameToMs(frame),
    });
  }

  /* ---------------- rendu ---------------- */

  private pickFocus(me: string | null): FocusView {
    if (this.mySim && this.mySim.alive) return { id: me, sim: this.mySim, lastDx: this.lastDx };
    const leader = this.ghosts.leader();
    if (leader) return leader;
    if (this.focusId !== null && this.focusId !== me) {
      const kept = this.ghosts.view(this.focusId);
      if (kept) return kept;
    }
    if (this.mySim) return { id: me, sim: this.mySim, lastDx: this.lastDx };
    return this.ghosts.farthest() ?? { id: null, sim: null, lastDx: 0 };
  }

  private renderIdle(time: number, delta: number, showBird: boolean): void {
    this.idleScroll += (IDLE_DRIFT_PX_S * delta) / 1000;
    this.parallax.update(this.idleScroll);
    this.pipes.hideAll();
    this.bird.setVisible(showBird);
    if (showBird) this.bird.idle(time);
    this.ghosts.render(0, 0, null, true);
  }

  private setPhase(phase: FlapPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.bridge.store.setState({ phase });
    this.bridge.fromScene.emit('phase', phase);
  }

  /* ---------------- événements vers React ---------------- */

  private tick(time: number, state: BridgeState, focus: FocusView | null, focusScroll: number): void {
    const sim = this.mySim;
    if (sim) {
      if (sim.pipesPassed > this.lastPass) {
        this.lastPass = sim.pipesPassed;
        this.bridge.fromScene.emit('pass', sim.pipesPassed);
        this.fx.scorePop(SIM.BIRD_X + 40, sim.y - 50, String(sim.pipesPassed));
      }
      const meters = metersOf(sim.scroll);
      const milestone = Math.floor(meters / 100);
      if (milestone > this.lastMilestone) {
        this.lastMilestone = milestone;
        this.bridge.fromScene.emit('milestone', milestone * 100);
        this.fx.milestone(milestone);
      }
      if (!this.recordDone && sim.alive && state.barRecordM !== null && state.barRecordM > 0 && meters > state.barRecordM) {
        this.recordDone = true;
        this.bridge.fromScene.emit('barRecordBeaten', meters);
      }
    }
    if (focus && focus.sim) {
      const distance = Math.floor(metersOf(focusScroll));
      if (distance !== this.lastDistance) {
        this.lastDistance = distance;
        this.bridge.fromScene.emit('distance', distance);
      }
    }
    if (time >= this.nextRanking) {
      this.nextRanking = time + RANKING_MS;
      if (this.round) this.bridge.fromScene.emit('ranking', this.rankingRows(state));
    }
    if (time >= this.nextSecond) {
      this.nextSecond = time + 1000;
      this.bridge.fromScene.emit('drift', this.maxGap);
      this.maxGap = 0;
      this.bridge.store.setState({ fps: Math.round(this.game.loop.actualFps) });
    }
  }

  /** tous les vivants sont à la même distance réelle : celle du focus vivant */
  private rankingRows(state: BridgeState): RankingRow[] {
    const rows: RankingRow[] = [];
    const me = state.myPlayerId;
    const leader = this.ghosts.leader();
    const aliveScroll = this.mySim && this.mySim.alive ? this.mySim.scroll : leader ? leader.sim.scroll : (this.ghosts.farthest()?.sim.scroll ?? 0);
    for (const player of Object.values(state.players)) {
      if (!player.inRound) continue;
      if (player.playerId === me) {
        // avant le départ (compte à rebours) ma sim n'existe pas encore : je
        // figure quand même au classement, sinon la dalle affiche "3 / 3 en vol"
        // pour une manche à 4 pendant cinq secondes
        if (!this.mySim) {
          rows.push({ playerId: player.playerId, pseudo: player.pseudo, isMe: true, alive: true, distanceM: 0 });
          continue;
        }
        rows.push({
          playerId: player.playerId,
          pseudo: player.pseudo,
          isMe: true,
          alive: this.mySim.alive,
          distanceM: metersOf(this.mySim.alive ? aliveScroll : this.mySim.scroll),
        });
        continue;
      }
      const ghost = this.ghosts.rowOf(player.playerId);
      if (!ghost) continue;
      rows.push({
        playerId: player.playerId,
        pseudo: player.pseudo,
        isMe: false,
        alive: ghost.alive,
        distanceM: metersOf(ghost.alive ? aliveScroll : ghost.scroll),
      });
    }
    return rows;
  }
}
