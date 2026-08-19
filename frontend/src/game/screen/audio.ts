/**
 * Moteur audio du projecteur — 100% synthétisé en WebAudio (aucun asset).
 *
 * 3 canaux mixés : musique de fond (HTMLAudio + gain), effets (synthèse),
 * médias de question (gérés par les éléments <audio>/<iframe> de la page).
 * Ducking : la musique descend pendant les phases bruyantes et remonte
 * exactement à son niveau, jamais plus haut.
 */

export class GameAudio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private musicVolume = 0.35;
  private sfxVolume = 0.8;
  private ducked = false;
  private drumrollTimer: ReturnType<typeof setInterval> | null = null;
  enabled = false;

  /** À appeler depuis un geste utilisateur (overlay "Activer le son") */
  enable(): void {
    if (this.enabled) return;
    this.ctx = new AudioContext();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);
    this.enabled = true;
    void this.ctx.resume();
    if (this.musicEl) void this.musicEl.play().catch(() => undefined);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.sfxGain) {
      // annule une éventuelle automation en cours (fadeOutAll) avant de fixer
      if (this.ctx) this.sfxGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.sfxGain.gain.value = sfx;
    }
    this.applyMusicVolume();
  }

  private applyMusicVolume(): void {
    if (!this.musicGain || !this.ctx) {
      if (this.musicEl) this.musicEl.volume = Math.min(1, this.ducked ? this.musicVolume * 0.22 : this.musicVolume);
      return;
    }
    const target = this.ducked ? this.musicVolume * 0.22 : this.musicVolume;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  setMusic(url: string | null): void {
    if (this.musicEl?.src === url) {
      // même piste après un fadeOutAll : on relance au volume nominal
      if (url && this.enabled && this.musicEl.paused) {
        this.applyMusicVolume();
        void this.musicEl.play().catch(() => undefined);
      }
      return;
    }
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.remove();
      this.musicEl = null;
      this.musicGain = null;
    }
    if (!url) return;
    const el = new Audio(url);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    this.musicEl = el;
    if (this.ctx) {
      try {
        const src = this.ctx.createMediaElementSource(el);
        this.musicGain = this.ctx.createGain();
        src.connect(this.musicGain).connect(this.ctx.destination);
      } catch {
        /* fallback volume element */
      }
    }
    this.applyMusicVolume();
    if (this.enabled) void el.play().catch(() => undefined);
  }

  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyMusicVolume();
  }

  // -------------------------------------------------------------------------
  // Synthèse
  // -------------------------------------------------------------------------

  private tone(
    freq: number,
    duration: number,
    opts: { type?: OscillatorType; delay?: number; gain?: number; slideTo?: number } = {},
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + duration);
    const g = opts.gain ?? 0.5;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(g, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private noise(duration: number, opts: { delay?: number; gain?: number; lowpass?: number } = {}): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.lowpass ?? 2500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.gain ?? 0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t0);
  }

  // -------------------------------------------------------------------------
  // Cues (style jeu télévisé)
  // -------------------------------------------------------------------------

  /** annonce de question : arpège montant */
  announceSting(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', delay: i * 0.09, gain: 0.4 }));
  }

  /** question affichée : double note d'attaque */
  questionSting(): void {
    this.tone(660, 0.15, { type: 'square', gain: 0.18 });
    this.tone(880, 0.3, { type: 'square', delay: 0.12, gain: 0.18 });
  }

  /** tic du compte à rebours (dernières secondes) */
  tick(urgent: boolean): void {
    this.tone(urgent ? 1320 : 880, 0.07, { type: 'square', gain: urgent ? 0.3 : 0.16 });
  }

  /** fin de la fenêtre de réponse */
  lockSting(): void {
    this.tone(440, 0.4, { type: 'sawtooth', gain: 0.3, slideTo: 180 });
    this.noise(0.25, { gain: 0.16, lowpass: 1200 });
  }

  /** montée de suspense avant les pourcentages */
  revealSweep(): void {
    this.tone(220, 1.1, { type: 'sawtooth', gain: 0.16, slideTo: 880 });
  }

  /** bonne réponse dévoilée */
  correctHit(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', delay: i * 0.07, gain: 0.42 }));
  }

  /** le plus rapide */
  fastestChime(): void {
    this.tone(1568, 0.5, { type: 'sine', gain: 0.4 });
    this.tone(2093, 0.7, { type: 'sine', delay: 0.12, gain: 0.35 });
  }

  /** activation d'un quitte ou double (feed d'annonce) */
  bonusBlip(): void {
    this.tone(740, 0.12, { type: 'square', gain: 0.22 });
    this.tone(988, 0.2, { type: 'square', delay: 0.09, gain: 0.22 });
  }

  /** roulement de tambour (cinématique) */
  drumrollStart(): void {
    this.drumrollStop();
    this.drumrollTimer = setInterval(() => this.noise(0.09, { gain: 0.26, lowpass: 900 }), 60);
  }

  drumrollStop(withCymbal = false): void {
    if (this.drumrollTimer) {
      clearInterval(this.drumrollTimer);
      this.drumrollTimer = null;
    }
    if (withCymbal) this.noise(1.4, { gain: 0.3, lowpass: 9000 });
  }

  /** une place dévoilée dans la cinématique */
  rankHit(rank: number): void {
    const base = rank === 1 ? 784 : 523;
    this.noise(0.5, { gain: 0.22, lowpass: 6000 });
    this.tone(base, 0.6, { type: 'triangle', gain: 0.45 });
    if (rank === 1) {
      [988, 1175, 1568].forEach((f, i) => this.tone(f, 0.8, { type: 'triangle', delay: 0.15 + i * 0.12, gain: 0.4 }));
    }
  }

  /** fanfare de fin */
  fanfare(): void {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.35, { type: 'square', delay: i * 0.16, gain: 0.2 }));
    this.noise(1.8, { delay: notes.length * 0.16, gain: 0.2, lowpass: 8000 });
  }

  // -------------------------------------------------------------------------
  // Cues battle royale
  // -------------------------------------------------------------------------

  /** intro de manche : impact grave + montée */
  roundIntroSting(): void {
    this.noise(0.6, { gain: 0.3, lowpass: 500 });
    this.tone(110, 0.8, { type: 'sawtooth', gain: 0.3, slideTo: 220 });
    this.tone(440, 0.5, { type: 'triangle', delay: 0.5, gain: 0.35 });
  }

  /** sting d'élimination : chute dramatique */
  eliminationSting(): void {
    this.tone(660, 0.5, { type: 'sawtooth', gain: 0.3, slideTo: 110 });
    this.noise(0.4, { delay: 0.15, gain: 0.22, lowpass: 700 });
  }

  /** nappe de verdict : tension qui monte doucement */
  verdictPad(): void {
    this.tone(196, 2.4, { type: 'sine', gain: 0.14, slideTo: 233 });
    this.tone(294, 2.4, { type: 'sine', delay: 0.1, gain: 0.1, slideTo: 349 });
  }

  /** hit de repêchage : rebond joyeux */
  repechageHit(): void {
    [392, 523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.3, { type: 'triangle', delay: i * 0.07, gain: 0.4 }),
    );
  }

  /** bandeau milestone "PLUS QUE X !" */
  milestoneHit(): void {
    this.noise(0.5, { gain: 0.26, lowpass: 4000 });
    this.tone(523, 0.4, { type: 'square', gain: 0.22 });
    this.tone(784, 0.6, { type: 'square', delay: 0.14, gain: 0.22 });
  }

  /** victoire battle : fanfare longue + cymbale */
  battleVictory(): void {
    const notes = [392, 523, 659, 784, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', delay: i * 0.15, gain: 0.35 }));
    this.noise(2.2, { delay: notes.length * 0.15, gain: 0.25, lowpass: 9000 });
  }

  /**
   * Fondu de sortie global (phase closing) : musique + effets descendent à
   * zéro sur `ms`, le tambour s'arrête. Le retour à la normale passe par
   * setVolumes / setMusic (nouvelle partie).
   */
  fadeOutAll(ms: number): void {
    this.drumrollStop();
    const seconds = Math.max(0.1, ms / 1000);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGain?.gain.setTargetAtTime(0, t, seconds / 3);
      this.sfxGain?.gain.setTargetAtTime(0, t, seconds / 3);
    }
    const el = this.musicEl;
    if (el) {
      // fallback élément (musicGain absent) + pause en fin de fondu
      if (!this.musicGain) {
        const startVolume = el.volume;
        const steps = 20;
        for (let i = 1; i <= steps; i++) {
          setTimeout(() => {
            el.volume = Math.max(0, startVolume * (1 - i / steps));
          }, (ms / steps) * i);
        }
      }
      setTimeout(() => el.pause(), ms + 100);
    }
  }
}

export const gameAudio = new GameAudio();
