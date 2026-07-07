import { MOTHERSHIP } from "../balance";

// Data-driven enemy definitions (GAME-DESIGN.md §5). All numbers [tunable].

export interface EnemyDef {
  id: string;
  hp: number;
  bounty: number;
  behavior: "formationDrift" | "seekAndBomb" | "plunge" | "transit" | "boss";
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  grunt: { id: "grunt", hp: 20, bounty: 8, behavior: "formationDrift" },
  bomber: { id: "bomber", hp: 60, bounty: 25, behavior: "seekAndBomb" },
  diver: { id: "diver", hp: 15, bounty: 15, behavior: "plunge" },
  ufo: { id: "ufo", hp: 80, bounty: 150, behavior: "transit" },
  mothership: { id: "mothership", hp: MOTHERSHIP.hp, bounty: MOTHERSHIP.bounty, behavior: "boss" },
};

// Behavior numbers [tunable]
export const BOMBER = {
  spawnY: 120,
  spawnRadius: 110,
  speed: 12, // u/s toward hover point
  hoverAltitude: 30,
  bombPeriod: 4,
  bombFallSpeed: 28,
  bombSplash: 6,
  cityTargetChance: 0.7,
} as const;

export const DIVER = {
  spawnY: 105,
  cruiseTime: 3,
  cruiseSpeed: 6,
  plungeSpeed: 40,
  blastRadius: 8,
} as const;

export const UFO = {
  altitude: 92, // just clippable by flak T3 (reach 95)
  speed: 25,
  edgeX: 125,
  chancePerRound: 0.1, // from round 6 (§9)
  firstRound: 6,
} as const;
