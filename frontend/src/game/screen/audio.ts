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
  /** vrai = coupure totale de la musique (extrait video plein ecran), pas un simple ducking */
  private duckFull = false;
  private drumrollTimer: ReturnType<typeof setInterval> | null = null;
  /** oscillateurs du battement de reponse, programmes a l'avance (cf. startAnswerTimer) */
  private timerNodes: OscillatorNode[] = [];
  /** question deja programmee : evite de reprogrammer a chaque rafraichissement d'etat */
  private timerKey: string | null = null;
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
    const target = this.ducked ? (this.duckFull ? 0 : this.musicVolume * 0.22) : this.musicVolume;
    if (!this.musicGain || !this.ctx) {
      if (this.musicEl) this.musicEl.volume = Math.min(1, target);
      return;
    }
    // Coupure totale : fondu court (~0.4 s pour devenir inaudible), sinon la
    // musique s'entend encore pendant les premieres secondes de l'extrait.
    // Les autres mouvements gardent leur fondu doux.
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, this.duckFull ? 0.12 : 0.4);
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

  /**
   * Baisse la musique de fond pendant qu'un media parle. `full` la coupe
   * completement (extrait video plein ecran : seule la video doit s'entendre),
   * sinon elle descend a 22 % (extrait audio : la musique reste un tapis).
   */
  duck(on: boolean, full = false): void {
    if (this.ducked === on && this.duckFull === (on && full)) return;
    this.ducked = on;
    this.duckFull = on && full;
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

  /**
   * Un battement du compte à rebours, façon plateau de jeu télévisé.
   *
   * Grave et sourd, jamais un bip. L'ancien tic tapait à 880 Hz puis 1320 Hz
   * en onde carrée : dans un bar, ça s'entend comme une alarme de réveil et ça
   * couvre la musique au lieu de la soutenir. Ici, un coup mat autour de 60 à
   * 120 Hz, sur le registre où l'on ressent la tension plutôt que de la subir.
   *
   * `octave` : une harmonique discrète une octave au-dessus. Le fondamental
   * seul est inaudible sur les petites enceintes, qui ne descendent pas si bas ;
   * l'harmonique restitue la hauteur perçue sans rendre le son criard.
   */
  private thud(when: number, freq: number, gain: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const mk = (f: number, g: number, type: OscillatorType) => {
      const osc = this.ctx!.createOscillator();
      const env = this.ctx!.createGain();
      osc.type = type;
      // léger plongeon de hauteur : c'est ce qui fait « coup » et non « note »
      osc.frequency.setValueAtTime(f * 1.6, when);
      osc.frequency.exponentialRampToValueAtTime(f, when + 0.06);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(g, when + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.34);
      osc.connect(env).connect(this.sfxGain!);
      osc.start(when);
      osc.stop(when + 0.38);
      this.timerNodes.push(osc);
    };
    mk(freq, gain, 'sine');
    // l'harmonique porte le son sur les enceintes qui ne descendent pas bas :
    // a 0.3 elle etait trop discrete et le battement passait inapercu
    mk(freq * 2, gain * 0.5, 'triangle');
    mk(freq * 3, gain * 0.18, 'triangle');
  }

  /**
   * Programme TOUT le compte à rebours de la fenêtre de réponse d'un coup.
   *
   * Pourquoi d'un coup : les battements sont posés sur l'horloge de
   * l'AudioContext, précise à l'échantillon. Piloter le son depuis React le
   * calait sur un `setInterval` à 250 ms, donc chaque battement tombait avec
   * jusqu'à un quart de seconde de dérive sur le chiffre affiché. Là, le coup
   * sonne exactement quand le chrono change de seconde.
   *
   * Le battement ne vit QUE sur les trois dernières secondes, celles où
   * l'anneau du chrono et les lumières du bar sont au rouge : un coup par
   * seconde pendant toute la question lassait et marchait sur les extraits
   * audio. Le reste de la fenêtre de réponse se joue en silence, l'oreille et
   * l'oeil basculent ensemble au même instant.
   */
  startAnswerTimer(remainingMs: number, key: string): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    if (this.timerKey === key) return;
    this.stopAnswerTimer();
    this.timerKey = key;

    const beats = Math.floor(remainingMs / 1000);
    // décalage jusqu'au prochain changement de seconde affichée
    const first = (remainingMs % 1000) / 1000;
    const t0 = this.ctx.currentTime;

    for (let i = 0; i < beats; i++) {
      const left = beats - i;            // secondes encore affichées après ce coup
      if (left > 3) continue;
      // Pouls lourd, calé sur le rouge. Registre autour de 104 à 124 Hz :
      // plus bas, la diffusion du bar ne le restitue pas ; plus haut, on
      // retombe sur le bip strident d'origine.
      const when = t0 + first + i;
      this.thud(when, 124, 0.72);
      this.thud(when + 0.17, 104, 0.56);
    }
  }

  /**
   * Décompte de reprise après la pause : « 5, 4, 3, 2, 1 » puis la question.
   *
   * Volontairement à l'opposé du battement de réponse : celui-ci MONTE en
   * hauteur à mesure qu'on approche de zéro. On ne met pas la salle sous
   * tension, on la rassemble - c'est une reprise, pas un chrono. Le « boum »
   * final est laissé à l'arpège d'annonce de la question, qui enchaîne juste
   * après : en ajouter un ici ferait doublon.
   */
  startResumeCountdown(remainingMs: number, key: string): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    if (this.timerKey === key) return;
    this.stopAnswerTimer();
    this.timerKey = key;
    const beats = Math.floor(remainingMs / 1000);
    const first = (remainingMs % 1000) / 1000;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < beats; i++) {
      const left = beats - i;
      // 5 -> 1 : la hauteur monte, le volume aussi, mais on reste grave
      const freq = 186 + (5 - Math.min(5, left)) * 34;
      this.thud(t0 + first + i, freq, 0.38 + (5 - Math.min(5, left)) * 0.05);
    }
  }

  /** coupe le compte à rebours (question verrouillée, annulée, phase changée) */
  stopAnswerTimer(): void {
    for (const osc of this.timerNodes) {
      try {
        osc.stop();
      } catch {
        // déjà terminé : rien à faire
      }
    }
    this.timerNodes = [];
    this.timerKey = null;
  }

  /**
   * Fin de la fenêtre de réponse : un « ding » clair, façon cloche de
   * comptoir. L'ancien « braaam » descendant (sawtooth + souffle) sonnait
   * comme une erreur ; ici une note franche qui laisse la révélation arriver.
   * La partielle à 2,52× (inharmonique, comme une vraie cloche) donne le
   * timbre métallique sans siffler.
   */
  lockSting(): void {
    this.tone(1318, 0.9, { type: 'sine', gain: 0.5 });
    this.tone(1318 * 2.52, 0.45, { type: 'sine', gain: 0.12 });
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
