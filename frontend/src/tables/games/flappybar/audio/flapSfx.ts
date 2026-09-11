/**
 * Effets sonores synthétisés (WebAudio, aucun fichier) : oscillateurs +
 * enveloppes de gain, bruit filtré pour la mort. Le contexte audio n'est créé
 * qu'au premier pointerdown (`unlock`, politique d'autoplay de Chrome). Les
 * événements des fantômes ne passent jamais par ici.
 */

export type FlapCue = 'flap' | 'pass' | 'death' | 'tick' | 'go' | 'record' | 'roundEnd';

export interface FlapSfx {
  unlock(): void;
  play(cue: FlapCue): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const g = globalThis as typeof globalThis & { webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const MASTER_GAIN = 0.8;

export function createFlapSfx(): FlapSfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  let disposed = false;

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
    return ctx;
  };

  const tone = (
    ac: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number,
    t0: number,
    duration: number,
    gain: number,
  ) => {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  };

  const noiseBuffer = (ac: AudioContext): AudioBuffer => {
    if (noise) return noise;
    const length = Math.floor(ac.sampleRate * 0.5);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noise = buffer;
    return buffer;
  };

  const cues: Record<FlapCue, (ac: AudioContext, out: AudioNode, t: number) => void> = {
    flap: (ac, out, t) => tone(ac, out, 'sine', 520, 720, t, 0.06, 0.25),
    pass: (ac, out, t) => {
      tone(ac, out, 'triangle', 880, 880, t, 0.04, 0.2);
      tone(ac, out, 'triangle', 1320, 1320, t + 0.06, 0.04, 0.2);
    },
    death: (ac, out, t) => {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      const env = ac.createGain();
      env.gain.setValueAtTime(0.35, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      src.connect(filter);
      filter.connect(env);
      env.connect(out);
      src.start(t);
      src.stop(t + 0.42);
      tone(ac, out, 'sine', 120, 40, t, 0.4, 0.35);
    },
    tick: (ac, out, t) => tone(ac, out, 'square', 880, 880, t, 0.06, 0.12),
    go: (ac, out, t) => tone(ac, out, 'square', 1320, 1320, t, 0.2, 0.14),
    record: (ac, out, t) => {
      [523, 659, 784, 1046].forEach((f, i) => tone(ac, out, 'triangle', f, f, t + i * 0.11, 0.22, 0.2));
    },
    roundEnd: (ac, out, t) => {
      [784, 659, 523, 392].forEach((f, i) => tone(ac, out, 'triangle', f, f * 0.98, t + i * 0.08, 0.5, 0.12));
    },
  };

  return {
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') void ac.resume().catch(() => undefined);
    },
    play(cue) {
      if (muted || disposed) return;
      const ac = ensure();
      if (!ac || !master) return;
      if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
      try {
        cues[cue](ac, master, ac.currentTime + 0.005);
      } catch {
        /* contexte fermé entre-temps */
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : MASTER_GAIN;
    },
    dispose() {
      disposed = true;
      const closing = ctx;
      ctx = null;
      master = null;
      if (closing) void closing.close().catch(() => undefined);
    },
  };
}
