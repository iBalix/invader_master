/**
 * Sound design de Bar Invaders, synthétisé en WebAudio (aucun fichier).
 *
 * On reprend les sons de la borne, qui étaient des circuits analogiques et
 * non des échantillons (cf. MAME mw8080bw_a.cpp) :
 *   - marche de la flotte : 4 notes de basse descendantes, une par échéance
 *     du tempo de la ROM (la sim fournit la note) ; carrée filtrée + sous-basse ;
 *   - tir du canon : bruit filtré balayé vers le bas + sifflement ;
 *   - envahisseur touché : chirp descendant et craquement ;
 *   - explosion du canon : bruit « LFSR » (échantillonné-bloqué ~7,5 kHz,
 *     granuleux comme le circuit), filtre qui se referme en 1 s ;
 *   - soucoupe en vol : sirène modulée par un LFO, en boucle, panoramique
 *     selon sa position ; soucoupe touchée : trille descendante ;
 *   - vie bonus : carré à 480 Hz haché à 10 Hz.
 * Ajouts sobres : vague nettoyée, nouvelle vague, GAME OVER, compte à
 * rebours, fanfare de record.
 *
 * Chaîne : chaque son -> bus -> compresseur (+ réverbération courte générée,
 * « caisson de borne ») -> volume maître. Volume par défaut plus bas que
 * Flappy Bar : huit dalles jouent côte à côte. Le contexte audio n'est créé
 * qu'au premier toucher (politique d'autoplay de Chrome).
 */

export type InvCue =
  | 'fleet'
  | 'shot'
  | 'invader'
  | 'playerHit'
  | 'ufoHit'
  | 'extraLife'
  | 'waveStart'
  | 'waveClear'
  | 'gameOver'
  | 'tick'
  | 'go'
  | 'record'
  | 'roundEnd';

export interface PlayOptions {
  /** 0..1, multiplié au volume du son (spectateur : plus bas) */
  volume?: number;
  /** note de la marche, 0..3 */
  note?: number;
}

export interface InvSfxApi {
  unlock(): void;
  play(cue: InvCue, opts?: PlayOptions): void;
  /** soucoupe en vol : démarre / arrête la boucle, pan -1..1 */
  ufo(on: boolean, pan?: number, volume?: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const g = globalThis as typeof globalThis & { webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const MASTER_GAIN = 0.5;
/** les 4 notes de la marche, descendantes (La2, Sol2, Fa2, Mi2) */
const FLEET_NOTES = [110, 98, 87.31, 82.41];

interface UfoLoop {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
}

export function createInvSfx(): InvSfxApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: GainNode | null = null;
  let white: AudioBuffer | null = null;
  let crunch: AudioBuffer | null = null;
  let ufoLoop: UfoLoop | null = null;
  let muted = false;
  let disposed = false;

  const impulse = (ac: AudioContext): AudioBuffer => {
    const length = Math.floor(ac.sampleRate * 0.7);
    const buffer = ac.createBuffer(2, length, ac.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    return buffer;
  };

  const ensure = (): AudioContext | null => {
    if (disposed) return null;
    if (ctx) return ctx;
    const Ctor = audioCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(master);
    bus = ctx.createGain();
    bus.connect(comp);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);
    return ctx;
  };

  const whiteNoise = (ac: AudioContext): AudioBuffer => {
    if (white) return white;
    const length = Math.floor(ac.sampleRate * 1.5);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    white = buffer;
    return buffer;
  };

  /** bruit échantillonné-bloqué à ~7,5 kHz : le grain du registre à décalage de la borne */
  const crunchNoise = (ac: AudioContext): AudioBuffer => {
    if (crunch) return crunch;
    const length = Math.floor(ac.sampleRate * 1.6);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    const hold = Math.max(1, Math.round(ac.sampleRate / 7500));
    let lfsr = 0x7ace;
    let v = 0;
    for (let i = 0; i < length; i += 1) {
      if (i % hold === 0) {
        const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (bit << 14);
        v = (lfsr & 1) === 1 ? 0.9 : -0.9;
      }
      data[i] = v;
    }
    crunch = buffer;
    return buffer;
  };

  const envelope = (ac: AudioContext, t: number, peak: number, attack: number, hold: number, release: number): GainNode => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  };

  const tone = (
    ac: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    duration: number,
    peak: number,
  ): OscillatorNode => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + duration);
    const env = envelope(ac, t, peak, 0.004, Math.max(0, duration * 0.3), duration * 0.7);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return osc;
  };

  const noiseBurst = (
    ac: AudioContext,
    out: AudioNode,
    buffer: AudioBuffer,
    t: number,
    duration: number,
    peak: number,
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    q = 0.8,
  ): void => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
    const env = envelope(ac, t, peak, 0.003, duration * 0.15, duration * 0.85);
    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(t + duration + 0.05);
  };

  const cues: Record<InvCue, (ac: AudioContext, out: AudioNode, t: number, opts: PlayOptions) => void> = {
    fleet: (ac, out, t, opts) => {
      const f = FLEET_NOTES[(opts.note ?? 0) & 3];
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.12);
      lp.Q.value = 5;
      lp.connect(out);
      // attaque « thump » : la note tombe légèrement en place
      const sq = ac.createOscillator();
      sq.type = 'square';
      sq.frequency.setValueAtTime(f * 1.18, t);
      sq.frequency.exponentialRampToValueAtTime(f, t + 0.025);
      const env = envelope(ac, t, 0.5, 0.003, 0.06, 0.11);
      sq.connect(env);
      env.connect(lp);
      sq.start(t);
      sq.stop(t + 0.2);
      tone(ac, out, 'sine', f / 2, f / 2, t, 0.17, 0.45);
    },
    shot: (ac, out, t) => {
      noiseBurst(ac, out, whiteNoise(ac), t, 0.3, 0.22, 'bandpass', 4200, 700, 1.4);
      tone(ac, out, 'square', 1500, 260, t, 0.24, 0.07);
    },
    invader: (ac, out, t) => {
      tone(ac, out, 'square', 720, 110, t, 0.17, 0.2);
      noiseBurst(ac, out, crunchNoise(ac), t, 0.14, 0.24, 'highpass', 2200, 900);
    },
    playerHit: (ac, out, t) => {
      noiseBurst(ac, out, crunchNoise(ac), t, 1.15, 0.55, 'lowpass', 3600, 120, 1.1);
      noiseBurst(ac, out, whiteNoise(ac), t, 0.5, 0.18, 'bandpass', 1800, 300, 0.7);
      tone(ac, out, 'sine', 95, 32, t, 0.7, 0.5);
    },
    ufoHit: (ac, out, t) => {
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1700, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 1.0);
      const lfo = ac.createOscillator();
      lfo.frequency.value = 19;
      const depth = ac.createGain();
      depth.gain.setValueAtTime(420, t);
      depth.gain.exponentialRampToValueAtTime(60, t + 1.0);
      lfo.connect(depth);
      depth.connect(osc.frequency);
      const env = envelope(ac, t, 0.16, 0.005, 0.6, 0.45);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 1.1);
      lfo.stop(t + 1.1);
    },
    extraLife: (ac, out, t) => {
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 480;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      // hachage à 10 Hz, comme le 555 de la borne
      for (let i = 0; i < 12; i += 1) {
        g.gain.setValueAtTime(0.13, t + i * 0.1);
        g.gain.setValueAtTime(0, t + i * 0.1 + 0.05);
      }
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 1.25);
    },
    waveStart: (ac, out, t) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, out, 'square', f, f, t + i * 0.075, 0.11, 0.09));
    },
    waveClear: (ac, out, t) => {
      tone(ac, out, 'triangle', 300, 1250, t, 0.28, 0.2);
      tone(ac, out, 'square', 600, 2400, t + 0.04, 0.24, 0.05);
    },
    gameOver: (ac, out, t) => {
      FLEET_NOTES.forEach((f, i) => {
        tone(ac, out, 'square', f * 2, f * 2 * 0.97, t + i * 0.32, 0.3, 0.12);
        tone(ac, out, 'sine', f, f, t + i * 0.32, 0.3, 0.35);
      });
      noiseBurst(ac, out, crunchNoise(ac), t + 1.28, 0.9, 0.12, 'lowpass', 900, 80);
    },
    tick: (ac, out, t) => tone(ac, out, 'square', 880, 880, t, 0.07, 0.1),
    go: (ac, out, t) => {
      tone(ac, out, 'square', 1318.5, 1318.5, t, 0.22, 0.11);
      tone(ac, out, 'square', 659.25, 659.25, t, 0.22, 0.08);
    },
    record: (ac, out, t) => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ac, out, 'square', f, f, t + i * 0.1, 0.16, 0.09));
      [1046.5, 1318.5, 1567.98].forEach((f) => tone(ac, out, 'triangle', f, f, t + 0.55, 0.7, 0.12));
    },
    roundEnd: (ac, out, t) => {
      [783.99, 659.25, 523.25, 392].forEach((f, i) => tone(ac, out, 'triangle', f, f * 0.98, t + i * 0.09, 0.45, 0.12));
    },
  };

  const stopUfo = (): void => {
    const loop = ufoLoop;
    ufoLoop = null;
    if (!loop || !ctx) return;
    const t = ctx.currentTime;
    try {
      loop.gain.gain.cancelScheduledValues(t);
      loop.gain.gain.setTargetAtTime(0, t, 0.03);
      loop.osc.stop(t + 0.2);
      loop.osc2.stop(t + 0.2);
      loop.lfo.stop(t + 0.2);
    } catch {
      /* déjà arrêtée */
    }
  };

  return {
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') void ac.resume().catch(() => undefined);
    },
    play(cue, opts = {}) {
      if (muted || disposed) return;
      const ac = ensure();
      if (!ac || !bus) return;
      if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
      try {
        const volume = Math.max(0, Math.min(1, opts.volume ?? 1));
        let out: AudioNode = bus;
        if (volume < 1) {
          const g = ac.createGain();
          g.gain.value = volume;
          g.connect(bus);
          out = g;
        }
        cues[cue](ac, out, ac.currentTime + 0.005, opts);
      } catch {
        /* contexte fermé entre-temps */
      }
    },
    ufo(on, pan = 0, volume = 1) {
      if (!on || muted || disposed) {
        if (ufoLoop) stopUfo();
        return;
      }
      const ac = ensure();
      if (!ac || !bus) return;
      const t = ac.currentTime;
      if (!ufoLoop) {
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 1040;
        const osc2 = ac.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 1046;
        const lfo = ac.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.value = 5.6;
        const depth = ac.createGain();
        depth.gain.value = 320;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        depth.connect(osc2.frequency);
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 0.9;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0, t);
        osc.connect(bp);
        osc2.connect(bp);
        bp.connect(gain);
        let panner: StereoPannerNode | null = null;
        if (typeof ac.createStereoPanner === 'function') {
          panner = ac.createStereoPanner();
          gain.connect(panner);
          panner.connect(bus);
        } else {
          gain.connect(bus);
        }
        osc.start(t);
        osc2.start(t);
        lfo.start(t);
        ufoLoop = { osc, osc2, lfo, gain, pan: panner };
      }
      ufoLoop.gain.gain.setTargetAtTime(0.055 * Math.max(0, Math.min(1, volume)), t, 0.04);
      ufoLoop.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * 0.8, t, 0.05);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : MASTER_GAIN;
      if (value) stopUfo();
    },
    dispose() {
      disposed = true;
      stopUfo();
      const closing = ctx;
      ctx = null;
      master = null;
      bus = null;
      if (closing) void closing.close().catch(() => undefined);
    },
  };
}
