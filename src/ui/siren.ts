// Siren stub (GAME-DESIGN.md §12: "the siren is the star" — the real synth pass
// is Phase 5's audio work; this is a placeholder rising wail so the alert moment
// exists). WebAudio only ever runs after a user gesture (START ROUND click).

let ctx: AudioContext | null = null;

export function siren(): void {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    // two rising wails
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(720, t0 + 1.2);
    osc.frequency.exponentialRampToValueAtTime(340, t0 + 2.3);
    osc.frequency.exponentialRampToValueAtTime(740, t0 + 3.4);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.2);
    gain.gain.setValueAtTime(0.09, t0 + 3.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 4.5);
  } catch {
    // audio is decoration — never let it break the game
  }
}
