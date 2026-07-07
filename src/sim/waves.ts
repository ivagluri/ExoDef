import type { PendingSpawn } from "./state";

// Authored waves 1–15 (GAME-DESIGN.md §9). `at` = seconds after round start.
// Grunts spawn as one swarm group per entry; bombers/divers spawn individually.
// Waves with `missiles` are volley rounds — stubbed until Phase 4 delivers
// interception; the stub only warns, it does not damage.

export interface WaveDef {
  spawns: PendingSpawn[];
  missiles?: { warheads: number; counterforce?: boolean };
}

const g = (at: number, count: number): PendingSpawn => ({ at, enemy: "grunt", count });
const b = (at: number, count = 1): PendingSpawn => ({ at, enemy: "bomber", count });
const d = (at: number, count: number): PendingSpawn => ({ at, enemy: "diver", count });

const WAVES: WaveDef[] = [
  { spawns: [g(1, 6)] },
  { spawns: [g(1, 5), g(9, 5)] },
  { spawns: [g(1, 7), g(7, 7)] },
  { spawns: [g(1, 6), g(6, 6), b(10)] },
  { spawns: [g(1, 8)], missiles: { warheads: 2 } },
  { spawns: [g(1, 8), g(8, 8), b(6), b(14)] },
  { spawns: [g(1, 7), g(7, 7), b(10), d(14, 2)] },
  { spawns: [g(1, 7), g(6, 7), g(12, 6), b(8), b(16), d(18, 2)] },
  { spawns: [g(1, 6), g(8, 6), b(10)], missiles: { warheads: 3 } },
  { spawns: [g(1, 8), g(6, 8), g(12, 8), b(6), b(12), b(18), d(20, 3)] },
  { spawns: [g(1, 7), g(6, 7), g(11, 6), b(8), b(16), d(10, 2), d(18, 2)] },
  { spawns: [g(1, 6), g(7, 6), g(13, 6), b(8), b(14), b(20)], missiles: { warheads: 3 } },
  { spawns: [g(1, 7), g(5, 7), g(10, 7), g(15, 7), b(8), b(12), b(18), b(24), d(20, 4)] },
  { spawns: [g(1, 8), g(6, 8), g(12, 8), b(6), b(12), b(18), b(24), d(10, 3), d(20, 3)] },
  { spawns: [g(1, 7), g(7, 7), g(13, 6), b(10), b(16), b(22)], missiles: { warheads: 4, counterforce: true } },
];

export const WAVE_COUNT = WAVES.length;

export function waveDef(round: number): WaveDef | null {
  return WAVES[round - 1] ?? null;
}

export function waveSpawns(round: number): PendingSpawn[] {
  const def = waveDef(round);
  if (!def) return [];
  return def.spawns.map((e) => ({ ...e })).sort((a, b2) => a.at - b2.at);
}
