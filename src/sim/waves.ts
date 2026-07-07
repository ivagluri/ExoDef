import type { PendingSpawn } from "./state";
import { WAVE_GOAL, WAVE_SCALING } from "../balance";

// Authored waves 1–15 (GAME-DESIGN.md §9). `at` = seconds after round start.
// Grunts spawn as one swarm group per entry; bombers/divers spawn individually.
// Waves with `missiles` launch live Phase 4 interception volleys.

export interface WaveDef {
  spawns: PendingSpawn[];
  missiles?: { warheads: number; counterforce?: boolean };
}

const g = (at: number, count: number): PendingSpawn => ({ at, enemy: "grunt", count });
const b = (at: number, count = 1): PendingSpawn => ({ at, enemy: "bomber", count });
const d = (at: number, count: number): PendingSpawn => ({ at, enemy: "diver", count });

const AUTHORED_WAVES: WaveDef[] = [
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

export const WAVE_COUNT = WAVE_GOAL;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b2: number, t: number): number {
  return a + (b2 - a) * t;
}

function noise(round: number, index: number): number {
  const x = Math.sin(round * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function normalStep(round: number): number {
  return Math.max(0, Math.min(round, WAVE_GOAL) - WAVE_SCALING.formulaBaseRound);
}

function freeplayStep(round: number): number {
  return Math.max(0, round - WAVE_GOAL);
}

function hpScale(round: number): number {
  return Math.pow(WAVE_SCALING.hpGrowthPerWave, normalStep(round))
    * Math.pow(WAVE_SCALING.freeplayHpGrowthPerWave, freeplayStep(round));
}

function countScale(round: number): number {
  return Math.pow(WAVE_SCALING.countGrowthPerWave, normalStep(round))
    * Math.pow(WAVE_SCALING.freeplayCountGrowthPerWave, freeplayStep(round));
}

function gruntSpeedScale(round: number): number {
  return Math.pow(WAVE_SCALING.gruntSpeedGrowthPerWave, Math.max(0, round - WAVE_SCALING.formulaBaseRound));
}

function spawnSpread(round: number): number {
  if (round <= WAVE_GOAL) {
    const t = clamp01((round - 16) / (WAVE_GOAL - 16));
    return lerp(WAVE_SCALING.spawnSpreadWave16, WAVE_SCALING.spawnSpreadWave50, t);
  }
  return Math.min(
    WAVE_SCALING.spawnSpreadFreeplayMax,
    WAVE_SCALING.spawnSpreadWave50 + (round - WAVE_GOAL) * 3,
  );
}

function scheduleEnemy(
  spawns: PendingSpawn[],
  enemy: string,
  count: number,
  round: number,
  spread: number,
  startAt: number,
  hp: number,
  speed = 1,
): void {
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const jitter = (noise(round, i + enemy.length * 17) - 0.5) * WAVE_SCALING.spawnJitter;
    spawns.push({
      at: Math.max(0.5, startAt + spread * t + jitter),
      enemy,
      count: 1,
      hpScale: hp,
      speedScale: speed,
    });
  }
}

function scheduleGrunts(spawns: PendingSpawn[], total: number, round: number, spread: number, hp: number, speed: number): void {
  const groups = Math.max(1, Math.ceil(total / WAVE_SCALING.formulaGruntGroupSize));
  let remaining = total;
  for (let i = 0; i < groups; i++) {
    const groupsLeft = groups - i;
    const count = Math.max(1, Math.ceil(remaining / groupsLeft));
    remaining -= count;
    const t = groups <= 1 ? 0 : i / (groups - 1);
    const jitter = (noise(round, i) - 0.5) * WAVE_SCALING.spawnJitter;
    spawns.push({
      at: Math.max(0.5, 1 + spread * t + jitter),
      enemy: "grunt",
      count,
      hpScale: hp,
      speedScale: speed,
    });
  }
}

function followsPattern(round: number, firstRound: number, gaps: readonly number[]): boolean {
  if (round < firstRound) return false;
  let current = firstRound;
  let i = 0;
  while (current < round) {
    current += gaps[i % gaps.length];
    i++;
  }
  return current === round;
}

function warheadsFor(round: number): number {
  const cap = round <= WAVE_GOAL ? 8 : 12;
  return Math.min(cap, 2 + Math.floor((round - 5) / 4));
}

function missileDef(round: number): WaveDef["missiles"] {
  const generatedVolley = round <= WAVE_GOAL
    ? followsPattern(round, WAVE_SCALING.volleyFirstGeneratedRound, WAVE_SCALING.volleyGapPattern)
    : followsPattern(round, WAVE_SCALING.freeplayVolleyFirstRound, WAVE_SCALING.freeplayVolleyGapPattern);
  if (!generatedVolley && round !== WAVE_GOAL) return undefined;
  const counterforce = round >= WAVE_SCALING.formulaBaseRound && (round === WAVE_GOAL || noise(round, 99) < WAVE_SCALING.counterforceChance);
  return { warheads: warheadsFor(round), counterforce };
}

function generatedWave(round: number): WaveDef {
  const volume = countScale(round);
  const hp = hpScale(round);
  const spread = spawnSpread(round);
  const spawns: PendingSpawn[] = [];
  const grunts = Math.round(WAVE_SCALING.formulaBaseGrunts * volume);
  const bombers = WAVE_SCALING.formulaBaseBombers
    + Math.floor((round - WAVE_SCALING.formulaBaseRound) / WAVE_SCALING.formulaBomberEveryWaves)
    + Math.floor(freeplayStep(round) / 2);
  const divers = WAVE_SCALING.formulaBaseDivers
    + Math.floor((round - WAVE_SCALING.formulaBaseRound) / WAVE_SCALING.formulaDiverEveryWaves)
    + freeplayStep(round);

  scheduleGrunts(spawns, grunts, round, spread, hp, gruntSpeedScale(round));
  scheduleEnemy(spawns, "bomber", bombers, round, spread * 0.78, 6, hp);
  scheduleEnemy(spawns, "diver", divers, round, spread * 0.9, 10, hp);
  spawns.sort((a, b2) => a.at - b2.at);
  return { spawns, missiles: missileDef(round) };
}

export function waveDef(round: number): WaveDef | null {
  if (round < 1) return null;
  return AUTHORED_WAVES[round - 1] ?? generatedWave(round);
}

export function waveSpawns(round: number): PendingSpawn[] {
  const def = waveDef(round);
  if (!def) return [];
  return def.spawns.map((e) => ({ ...e })).sort((a, b2) => a.at - b2.at);
}
