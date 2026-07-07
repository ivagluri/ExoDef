import type { PendingSpawn } from "./state";

// Authored waves (GAME-DESIGN.md §9). Phase 2: waves 1–4.
// `at` is seconds after round start; grunts spawn as one formation group per entry.
// TODO Phase 3: wave 4 gains its bomber (§9); waves 5–15 added.
const WAVES: PendingSpawn[][] = [
  [{ at: 1, enemy: "grunt", count: 6 }],
  [
    { at: 1, enemy: "grunt", count: 5 },
    { at: 9, enemy: "grunt", count: 5 },
  ],
  [
    { at: 1, enemy: "grunt", count: 7 },
    { at: 7, enemy: "grunt", count: 7 },
  ],
  [
    { at: 1, enemy: "grunt", count: 6 },
    { at: 6, enemy: "grunt", count: 6 },
    { at: 12, enemy: "grunt", count: 4 }, // stand-in for the Phase 3 bomber
  ],
];

export const WAVE_COUNT = WAVES.length;

export function waveSpawns(round: number): PendingSpawn[] {
  const wave = WAVES[round - 1];
  if (!wave) return [];
  return wave.map((e) => ({ ...e })).sort((a, b) => a.at - b.at);
}
