/**
 * Boucle de jeu de Bar Invaders (requestAnimationFrame, sans moteur).
 *
 *   targetFrame = floor((serverNow() - round.startsAt) / 16,667 ms)
 *
 * - Ma sim avance jusqu'à targetFrame avec le masque des commandes ; chaque
 *   changement de masque part au WebSocket (`input`), un filigrane toutes les
 *   200 ms (`mark`). Fin de partie => `gameOver` avec toute la liste
 *   d'entrées, que la page déclare au serveur (il rejoue et fixe le score).
 * - Chaque adversaire est une sim rejouée à partir de ses seules entrées,
 *   jamais au-delà de son filigrane et ~0,5 s derrière le temps réel : elle
 *   ne revient jamais en arrière. Elle alimente le panneau des joueurs et le
 *   mode spectateur.
 * - L'écran affiche la partie du joueur « focus » : moi tant que je joue,
 *   puis GAME OVER, puis le survivant choisi (ou le meilleur vivant).
 * - Une dalle qui recharge en pleine manche reprend sa partie : ses entrées
 *   déjà reçues par le serveur (hello du WebSocket) sont rejouées, puis la
 *   main revient aux commandes.
 */

import { serverNow } from '../../../lib/clockSync';
import { EV, SIM, createSim, newCursor, runTo, stepSim, type InputCursor, type InvSimState } from '../sim/invSim';
import { toRomText } from '../art/font';
import type { InvSfxApi } from '../audio/invSfx';
import type { BridgeState, InvBridge, InvPhase, MyStats, PanelRow } from './bridge';
import type { InvControls } from './controls';
import type { CrtView } from './crtView';
import { paintScreen, type ScreenBanner } from './screen';

const FRAME_MS = 1000 / SIM.FPS;
/** rattrapage maximal par image (onglet masqué, dalle lente) */
const MAX_STEPS_PER_TICK = 3600;
/** au-delà de ce nombre de pas dans une image, on rattrape en silence */
const SOUND_STEPS = 4;
/** retard des adversaires sur le temps réel : lecture fluide malgré les filigranes espacés */
const REMOTE_DELAY = 30;
const MARK_EVERY_MS = 200;
const PANEL_EVERY_MS = 250;
const STATS_EVERY_MS = 100;
/** GAME OVER à l'écran avant de passer à un survivant */
const GAME_OVER_HOLD_MS = 3500;
const WAVE_BANNER_MS = 2600;
const CHAR_MS = 7 * FRAME_MS;
const SPECTATE_VOLUME = 0.35;
/** manche rejointe en cours (dalle rechargée) : attente maximale du hello avant de jouer sans reprise */
const HELLO_WAIT_MS = 3000;
/** au-delà de ce retard sur le départ, on considère qu'on rejoint une manche en cours */
const LATE_JOIN_MS = 1500;

interface RemoteData {
  inputs: number[];
  mark: number;
  dead: { frame: number; score: number } | null;
}

interface RemoteSim {
  sim: InvSimState;
  cur: InputCursor;
}

interface BannerState {
  text: string;
  x: number;
  y: number;
  startedAt: number;
  until: number;
}

function sfxCue(ev: number, sfx: InvSfxApi, s: InvSimState, volume: number): void {
  if (ev & EV.FLEET_NOTE) sfx.play('fleet', { note: s.fleetNote, volume });
  if (ev & EV.SHOT) sfx.play('shot', { volume });
  if (ev & EV.INVADER_HIT) sfx.play('invader', { volume });
  if (ev & EV.PLAYER_HIT) sfx.play('playerHit', { volume });
  if (ev & EV.UFO_HIT) sfx.play('ufoHit', { volume });
  if (ev & EV.EXTRA_LIFE) sfx.play('extraLife', { volume });
  if (ev & EV.WAVE_CLEAR) sfx.play('waveClear', { volume });
  if (ev & EV.GAME_OVER) sfx.play('gameOver', { volume });
}

export class InvRunner {
  private raf = 0;
  private running = false;
  private readonly offs: Array<() => void> = [];

  // manche suivie par la boucle
  private roundIndex: number | null = null;
  private mine: InvSimState | null = null;
  private myInputs: number[] = [];
  private lastMask = 0;
  /** reprise après rechargement : frames rejouées depuis myInputs */
  private replayUntil = -1;
  private replayCur: InputCursor = newCursor();
  /** mes entrées renvoyées par le hello, gardées tant que la manche n'est pas installée */
  private pendingMine: { roundIndex: number; list: number[]; mark: number } | null = null;
  /** ma partie ne démarre pas avant le hello (ou cette échéance) quand on rejoint en cours */
  private awaitHelloUntil = 0;
  private overSent = false;
  private overAt = 0;
  private lastMarkAt = 0;
  private lastSentMark = -1;
  private recordBeaten = false;

  // adversaires
  private readonly data = new Map<string, RemoteData>();
  private dataRound: number | null = null;
  private readonly sims = new Map<string, RemoteSim>();

  // affichage
  private readonly idle = createSim();
  private banner: BannerState | null = null;
  private lastWave = new Map<string, number>();
  private focusId: string | null = null;
  private phase: InvPhase = 'idle';
  private lastPanelAt = 0;
  private lastPanelKey = '';
  private lastStatsAt = 0;
  private lastStats: MyStats | null = null;
  private fpsCount = 0;
  private fpsAt = 0;

  constructor(
    private readonly bridge: InvBridge,
    private readonly view: CrtView,
    private readonly controls: InvControls,
    private readonly getSfx: () => InvSfxApi | null,
  ) {
    const { toRunner } = bridge;
    this.offs.push(
      toRunner.on('remoteHello', (roundIndex, inputs, marks, dead) => this.onHello(roundIndex, inputs, marks, dead)),
      toRunner.on('remoteRound', (roundIndex) => this.adoptDataRound(roundIndex)),
      toRunner.on('remoteInput', (id, frame, mask) => {
        const d = this.dataFor(id);
        const n = d.inputs.length;
        if (n >= 2 && frame <= d.inputs[n - 2]) return;
        d.inputs.push(frame, mask);
        if (frame - 1 > d.mark) d.mark = frame - 1;
      }),
      toRunner.on('remoteMark', (id, frame) => {
        const d = this.dataFor(id);
        if (frame > d.mark) d.mark = frame;
      }),
      toRunner.on('remoteDead', (id, frame, score) => {
        const d = this.dataFor(id);
        d.dead = { frame, score };
        if (frame > d.mark) d.mark = frame;
      }),
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (now: number) => {
      if (!this.running) return;
      this.tick(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.bridge.fromRunner.emit('ready');
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.getSfx()?.ufo(false);
  }

  // -------------------------------------------------------------------------
  // Données des adversaires (WebSocket)
  // -------------------------------------------------------------------------

  private dataFor(id: string): RemoteData {
    let d = this.data.get(id);
    if (!d) {
      d = { inputs: [], mark: -1, dead: null };
      this.data.set(id, d);
    }
    return d;
  }

  private adoptDataRound(roundIndex: number | null): void {
    if (roundIndex === this.dataRound) return;
    this.data.clear();
    this.sims.clear();
    this.dataRound = roundIndex;
  }

  private onHello(
    roundIndex: number | null,
    inputs: Record<string, number[]>,
    marks: Record<string, number>,
    dead: Record<string, { frame: number; score: number }>,
  ): void {
    this.adoptDataRound(roundIndex);
    if (roundIndex === null) return;
    const myId = this.bridge.store.getState().myPlayerId;
    if (myId) {
      this.pendingMine = { roundIndex, list: (inputs[myId] ?? []).slice(), mark: marks[myId] ?? -1 };
      this.applyPendingMine();
    }
    for (const [id, list] of Object.entries(inputs)) {
      if (id === myId) continue;
      const d = this.dataFor(id);
      if (list.length >= d.inputs.length) {
        d.inputs = list.slice();
        // la liste a été remplacée : la sim repartira de zéro (rejeu instantané)
        this.sims.delete(id);
      }
    }
    for (const [id, mark] of Object.entries(marks)) {
      if (id === myId) continue;
      const d = this.dataFor(id);
      if (mark > d.mark) d.mark = mark;
    }
    for (const [id, info] of Object.entries(dead)) {
      if (id === myId) continue;
      const d = this.dataFor(id);
      d.dead = info;
      if (info.frame > d.mark) d.mark = info.frame;
    }
  }

  /**
   * Dalle rechargée en pleine manche : on reprend ma partie là où le serveur
   * l'a reçue (mes entrées et mon filigrane du hello), avant de rendre la
   * main aux commandes. Le hello peut arriver avant ou après l'installation
   * de la manche : il attend dans pendingMine.
   */
  private applyPendingMine(): void {
    const pending = this.pendingMine;
    if (!pending || !this.mine || pending.roundIndex !== this.roundIndex) return;
    this.pendingMine = null;
    this.awaitHelloUntil = 0;
    if (this.mine.frame > 0 || this.myInputs.length > 0) return;
    if (pending.list.length === 0 && pending.mark < 0) return;
    this.myInputs = pending.list;
    this.replayUntil = Math.max(pending.mark, pending.list.length >= 2 ? pending.list[pending.list.length - 2] : -1);
    this.replayCur = newCursor();
    this.lastSentMark = pending.mark;
  }

  // -------------------------------------------------------------------------
  // Manche
  // -------------------------------------------------------------------------

  private resetRound(st: BridgeState): void {
    const round = st.round;
    this.roundIndex = round ? round.index : null;
    const inRound = !!round && !!st.myPlayerId && round.participants.includes(st.myPlayerId);
    this.mine = inRound ? createSim() : null;
    this.myInputs = [];
    this.lastMask = 0;
    this.replayUntil = -1;
    this.replayCur = newCursor();
    this.overSent = false;
    this.overAt = 0;
    this.lastSentMark = -1;
    this.recordBeaten = false;
    this.sims.clear();
    this.banner = null;
    this.lastWave.clear();
    this.focusId = null;
    this.controls.resetPulses();
    if (round && this.dataRound !== round.index) this.adoptDataRound(round.index);
    this.awaitHelloUntil = this.mine && round && serverNow() - round.startsAt > LATE_JOIN_MS ? performance.now() + HELLO_WAIT_MS : 0;
    this.applyPendingMine();
  }

  private remoteSim(id: string): RemoteSim {
    let r = this.sims.get(id);
    if (!r) {
      r = { sim: createSim(), cur: newCursor() };
      this.sims.set(id, r);
    }
    return r;
  }

  private remoteAlive(id: string): boolean {
    const d = this.data.get(id);
    const r = this.sims.get(id);
    return !(d?.dead) && !(r?.sim.over);
  }

  // -------------------------------------------------------------------------
  // Image
  // -------------------------------------------------------------------------

  private tick(now: number): void {
    const st = this.bridge.store.getState();
    const round = st.round;
    if ((round ? round.index : null) !== this.roundIndex) this.resetRound(st);
    this.controls.pollGamepads();
    this.view.setReduced(st.reduced);
    const sfx = this.getSfx();

    let target = -1;
    if (round) {
      const capFrame = Math.min(SIM.MAX_FRAMES, Math.floor((round.capAt - round.startsAt) / FRAME_MS));
      target = Math.min(Math.floor((serverNow() - round.startsAt) / FRAME_MS), capFrame);
    }

    // ----- ma partie
    const mine = this.mine;
    if (mine && target > 0 && now >= this.awaitHelloUntil) {
      let steps = 0;
      let ev = 0;
      while (mine.frame < target && !mine.over && steps < MAX_STEPS_PER_TICK) {
        let mask: number;
        if (mine.frame <= this.replayUntil) {
          const cur = this.replayCur;
          while (cur.i < this.myInputs.length && this.myInputs[cur.i] <= mine.frame) {
            cur.mask = this.myInputs[cur.i + 1];
            cur.i += 2;
          }
          mask = cur.mask;
          this.lastMask = mask;
        } else {
          mask = this.controls.maskAt(mine.frame);
          if (mask !== this.lastMask) {
            this.myInputs.push(mine.frame, mask);
            this.lastMask = mask;
            this.bridge.fromRunner.emit('input', mine.frame, mask);
          }
        }
        stepSim(mine, mask);
        ev |= mine.ev;
        steps += 1;
      }
      if (sfx && steps > 0 && steps <= SOUND_STEPS) sfxCue(ev, sfx, mine, 1);
      if (ev & EV.WAVE_START && round) this.showBanner(`VAGUE ${String(mine.wave).padStart(2, '0')}`, 80, 56, now, WAVE_BANNER_MS);
      if (now - this.lastMarkAt >= MARK_EVERY_MS && mine.frame - 1 > this.lastSentMark) {
        this.lastMarkAt = now;
        this.lastSentMark = mine.frame - 1;
        this.bridge.fromRunner.emit('mark', mine.frame - 1);
      }
      if (!this.recordBeaten && st.hiScore > 0 && mine.score > st.hiScore) {
        this.recordBeaten = true;
        this.bridge.fromRunner.emit('barRecordBeaten', mine.score);
      }
      if (mine.over && !this.overSent && round) {
        this.overSent = true;
        this.overAt = now;
        // dernier filigrane : toutes mes entrées sont parties
        this.bridge.fromRunner.emit('mark', mine.overFrame);
        this.bridge.fromRunner.emit('gameOver', {
          roundIndex: round.index,
          frame: mine.overFrame,
          inputs: this.myInputs.slice(),
          score: mine.score,
          wave: mine.wave,
          kills: mine.kills,
          ufoHits: mine.ufoHits,
        });
      }
    }

    // ----- adversaires
    if (round && target > 0) {
      for (const id of round.participants) {
        if (id === st.myPlayerId) continue;
        const d = this.data.get(id);
        if (!d) continue;
        const r = this.remoteSim(id);
        const limit = d.dead ? d.dead.frame + 1 : Math.min(d.mark + 1, target - REMOTE_DELAY + 1);
        if (r.sim.frame >= limit || r.sim.over) continue;
        const before = r.sim.frame;
        let ev = 0;
        // pas à pas pour récupérer les événements (sons du joueur regardé)
        while (r.sim.frame < limit && !r.sim.over && r.sim.frame - before < MAX_STEPS_PER_TICK) {
          runTo(r.sim, d.inputs, r.cur, r.sim.frame + 1);
          ev |= r.sim.ev;
        }
        if (id === this.focusId && sfx && r.sim.frame - before <= SOUND_STEPS * 2) sfxCue(ev, sfx, r.sim, SPECTATE_VOLUME);
      }
    }

    // ----- phase et focus
    const phase = this.computePhase(st, target, now);
    if (phase !== this.phase) {
      this.phase = phase;
      this.bridge.store.setState({ phase });
      this.bridge.fromRunner.emit('phase', phase);
    }
    const focusId = this.computeFocus(st, phase);
    if (focusId !== this.focusId) {
      this.focusId = focusId;
      this.bridge.store.setState({ focusId });
    }

    // ----- soucoupe en boucle, d'après la partie affichée
    const shown = this.focusSim(st, target);
    if (sfx) {
      const flying = phase !== 'idle' && phase !== 'countdown' && shown.ufoActive && !shown.ufoHit && !shown.over;
      sfx.ufo(flying, ((shown.ufoX - 0x20 + 12) / 224) * 2 - 1, focusId === st.myPlayerId ? 1 : SPECTATE_VOLUME);
    }

    // bannière de vague pour le joueur regardé
    if (focusId && focusId !== st.myPlayerId) {
      const prev = this.lastWave.get(focusId) ?? shown.wave;
      if (shown.wave !== prev) this.showBanner(`VAGUE ${String(shown.wave).padStart(2, '0')}`, 80, 56, now, WAVE_BANNER_MS);
      this.lastWave.set(focusId, shown.wave);
    }

    // ----- compteurs pour React
    this.publishStats(now);
    this.publishPanel(st, now);

    // ----- écran
    paintScreen(this.view.pixels, shown, {
      hiScore: st.hiScore,
      label: toRomText(focusId ? st.players[focusId]?.pseudo ?? '' : '', 11),
      banner: this.currentBanner(phase, shown, now),
    });
    this.view.present();

    this.fpsCount += 1;
    if (now - this.fpsAt >= 1000) {
      this.bridge.store.setState({ fps: this.fpsCount });
      this.fpsCount = 0;
      this.fpsAt = now;
    }
  }

  private computePhase(st: BridgeState, target: number, now: number): InvPhase {
    const round = st.round;
    if (!round) return 'idle';
    if (target < 0) return 'countdown';
    const mine = this.mine;
    if (mine && !mine.over) return 'playing';
    if (mine && mine.over && now - this.overAt < GAME_OVER_HOLD_MS) return 'over';
    const anyAlive = round.participants.some((id) => id !== st.myPlayerId && this.data.has(id) && this.remoteAlive(id));
    // première seconde : les entrées des autres n'ont peut-être pas encore circulé
    const early = target < SIM.FPS && round.participants.some((id) => id !== st.myPlayerId);
    if (anyAlive || early) return 'spectating';
    return mine ? 'over' : 'ended';
  }

  private computeFocus(st: BridgeState, phase: InvPhase): string | null {
    const myId = st.myPlayerId;
    if (phase === 'idle') return null;
    if (this.mine && (phase === 'countdown' || phase === 'playing' || phase === 'over')) return myId;
    const round = st.round;
    if (!round) return null;
    const candidates = round.participants.filter((id) => id !== myId && this.data.has(id) && this.remoteAlive(id));
    if (st.watchId && candidates.includes(st.watchId)) return st.watchId;
    if (this.focusId && candidates.includes(this.focusId)) return this.focusId;
    let best: string | null = null;
    let bestScore = -1;
    for (const id of candidates) {
      const score = this.sims.get(id)?.sim.score ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best) return best;
    // plus personne en vie : on reste sur ma partie, sinon sur la dernière regardée
    return this.mine ? myId : this.focusId;
  }

  private focusSim(st: BridgeState, target: number): InvSimState {
    const id = this.focusId;
    if (id && id === st.myPlayerId && this.mine) return this.mine;
    if (id) {
      const r = this.sims.get(id);
      if (r) return r.sim;
    }
    if (this.mine && target >= 0) return this.mine;
    return this.idle;
  }

  private showBanner(text: string, x: number, y: number, now: number, durationMs: number): void {
    this.banner = { text, x, y, startedAt: now, until: now + durationMs };
  }

  private currentBanner(phase: InvPhase, shown: InvSimState, now: number): ScreenBanner | null {
    if (phase === 'countdown') {
      const text = 'PLAY PLAYER<1>';
      return { text, x: 56, y: 96, chars: text.length };
    }
    if (shown.over) {
      const startedAt = shown === this.mine ? this.overAt : now - 10_000;
      return { text: 'GAME OVER', x: 72, y: 56, chars: Math.floor((now - startedAt) / CHAR_MS) };
    }
    const b = this.banner;
    if (!b || now > b.until) return null;
    return { text: b.text, x: b.x, y: b.y, chars: Math.floor((now - b.startedAt) / CHAR_MS) };
  }

  private publishStats(now: number): void {
    if (now - this.lastStatsAt < STATS_EVERY_MS) return;
    this.lastStatsAt = now;
    const m = this.mine;
    if (!m) return;
    const prev = this.lastStats;
    if (prev && prev.score === m.score && prev.lives === m.lives && prev.wave === m.wave && prev.kills === m.kills && prev.ufoHits === m.ufoHits) return;
    const me: MyStats = { score: m.score, lives: m.lives, wave: m.wave, kills: m.kills, ufoHits: m.ufoHits };
    this.lastStats = me;
    this.bridge.store.setState({ me });
  }

  private publishPanel(st: BridgeState, now: number): void {
    if (now - this.lastPanelAt < PANEL_EVERY_MS) return;
    this.lastPanelAt = now;
    const round = st.round;
    const rows: PanelRow[] = [];
    const seen = new Set<string>();
    if (round) {
      for (const id of round.participants) {
        seen.add(id);
        const player = st.players[id];
        const pseudo = player?.pseudo ?? '?';
        const isMe = id === st.myPlayerId;
        const result = player?.result ?? null;
        let sim: InvSimState | null = null;
        if (isMe) sim = this.mine;
        else sim = this.sims.get(id)?.sim ?? null;
        const d = this.data.get(id);
        const officialScore = result?.score ?? d?.dead?.score ?? null;
        const alive = isMe ? !!sim && !sim.over && !result : !d?.dead && !result && !sim?.over;
        rows.push({
          playerId: id,
          pseudo,
          isMe,
          score: officialScore ?? sim?.score ?? 0,
          lives: alive ? sim?.lives ?? SIM.START_LIVES : 0,
          wave: result?.wave ?? sim?.wave ?? 1,
          alive,
          waiting: false,
          watched: id === this.focusId,
        });
      }
    }
    for (const player of Object.values(st.players)) {
      if (seen.has(player.playerId) || !player.waiting) continue;
      rows.push({
        playerId: player.playerId,
        pseudo: player.pseudo,
        isMe: player.isMe,
        score: 0,
        lives: 0,
        wave: 0,
        alive: false,
        waiting: true,
        watched: false,
      });
    }
    rows.sort((a, b) => Number(a.waiting) - Number(b.waiting) || b.score - a.score || Number(b.alive) - Number(a.alive));
    const key = rows.map((r) => `${r.playerId}:${r.score}:${r.lives}:${r.wave}:${r.alive ? 1 : 0}:${r.watched ? 1 : 0}:${r.waiting ? 1 : 0}`).join('|');
    if (key === this.lastPanelKey) return;
    this.lastPanelKey = key;
    this.bridge.store.setState({ panel: rows });
  }
}
