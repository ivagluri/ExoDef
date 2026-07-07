// WebAudio synth cues (GAME-DESIGN.md §12). The siren is deliberately harsh:
// stacked sawtooth wails through a narrow filter. Repeated combat sounds use
// sine/square waves at lower gain so long sessions stay tolerable.

type OscType = OscillatorType;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<string, number>();

  constructor(private volume: number) {}

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.02);
    }
  }

  unlock(): void {
    const ctx = this.ensure();
    void ctx?.resume();
  }

  siren(): void {
    this.withAudio((ctx, out) => {
      const t = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(820, t);
      filter.frequency.exponentialRampToValueAtTime(1250, t + 1.1);
      filter.frequency.exponentialRampToValueAtTime(780, t + 2.3);
      filter.frequency.exponentialRampToValueAtTime(1320, t + 3.5);
      filter.Q.value = 6.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
      gain.gain.setValueAtTime(0.18, t + 3.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 4.35);
      filter.connect(gain).connect(out);

      for (const detune of [-11, 9]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(760, t + 1.08);
        osc.frequency.exponentialRampToValueAtTime(330, t + 2.25);
        osc.frequency.exponentialRampToValueAtTime(820, t + 3.45);
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + 4.45);
      }
    });
  }

  gun(): void {
    this.tick("gun", 0.045, () => this.ping("square", 360, 0.028, 0.018));
  }

  flak(): void {
    this.tick("flak", 0.08, () => {
      this.ping("square", 120, 0.085, 0.045, 60);
      this.ping("sine", 70, 0.12, 0.035);
    });
  }

  launch(): void {
    this.tick("launch", 0.12, () => this.glide("sine", 180, 520, 0.32, 0.05));
  }

  blast(power = 1): void {
    this.tick("blast", 0.07, () => {
      this.glide("sine", 110 * power, 42, 0.34, 0.09);
      this.ping("square", 58, 0.12, 0.025);
    });
  }

  coreHit(destroyed: boolean): void {
    this.glide("sine", destroyed ? 150 : 220, destroyed ? 38 : 90, destroyed ? 0.9 : 0.32, destroyed ? 0.075 : 0.045);
  }

  roundClear(): void {
    this.withAudio((ctx, out) => {
      const t = ctx.currentTime;
      [440, 554, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const at = t + i * 0.09;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.055, at + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
        osc.connect(gain).connect(out);
        osc.start(at);
        osc.stop(at + 0.32);
      });
    });
  }

  ufo(): void {
    this.tick("ufo", 1.2, () => {
      this.withAudio((ctx, out) => {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.linearRampToValueAtTime(700, t + 0.25);
        osc.frequency.linearRampToValueAtTime(460, t + 0.55);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.045, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.7);
      });
    });
  }

  private ping(type: OscType, freq: number, duration: number, gainValue: number, endFreq = freq): void {
    this.withAudio((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    });
  }

  private glide(type: OscType, from: number, to: number, duration: number, gainValue: number): void {
    this.withAudio((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + duration + 0.04);
    });
  }

  private tick(key: string, interval: number, fn: () => void): void {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.last.get(key) ?? -Infinity) < interval) return;
    this.last.set(key, now);
    fn();
  }

  private withAudio(fn: (ctx: AudioContext, out: AudioNode) => void): void {
    try {
      if (this.volume <= 0) return;
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      void ctx.resume();
      fn(ctx, this.master);
    } catch {
      // Audio is decoration; never let browser audio policy break the game.
    }
  }

  private ensure(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (!this.master && this.ctx) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * this.volume;
        this.master.connect(this.ctx.destination);
      }
      return this.ctx;
    } catch {
      return null;
    }
  }
}
