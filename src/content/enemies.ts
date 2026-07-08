import { MOTHERSHIP } from "../balance";

// Data-driven enemy definitions (GAME-DESIGN.md §5). All numbers [tunable].

export interface EnemyDef {
  id: string;
  hp: number;
  bounty: number;
  behavior: "formationDrift" | "seekAndBomb" | "plunge" | "transit" | "boss" | "splitter" | "fragment";
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  grunt: { id: "grunt", hp: 20, bounty: 8, behavior: "formationDrift" },
  bomber: { id: "bomber", hp: 60, bounty: 25, behavior: "seekAndBomb" },
  diver: { id: "diver", hp: 15, bounty: 15, behavior: "plunge" },
  ufo: { id: "ufo", hp: 80, bounty: 150, behavior: "transit" },
  mothership: { id: "mothership", hp: MOTHERSHIP.hp, bounty: MOTHERSHIP.bounty, behavior: "boss" },
  // Phase 7 (§5): splitter bursts into fragments on kill OR at low altitude —
  // the fragment phase is never skippable, only relocatable.
  splitter: { id: "splitter", hp: 80, bounty: 30, behavior: "splitter" },
  fragment: { id: "fragment", hp: 10, bounty: 4, behavior: "fragment" },
  // Phase 7 (§5): swarmlings ride the grunt group system with swarm params.
  swarmling: { id: "swarmling", hp: 6, bounty: 3, behavior: "formationDrift" },
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
  coreTargetChance: 0.7,
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

export const SPLITTER = {
  spawnY: 135,
  spawnRadius: 75,
  descentSpeed: 4.5,
  weaveSpeed: 6, // u/s horizontal serpentine drift
  weaveTurn: 0.6, // rad/s heading wander
  boundRadius: 80,
  splitY: 20, // auto-splits here if still intact
  fragmentCount: 4,
  fragmentScatterSpeed: 11, // outward radial velocity at split
  fragmentFallSpeed: 10,
  fragmentBlastRadius: 8, // fragment landing = grunt-style detonation
} as const;

// Swarm cluster: denser, faster, weaker grunt-group variant. Landings destroy
// towers as usual but only charge cores — every `landingsPerCoreHit`th landing
// near a core deals 1 hit (§5/§8; charge resets at round end [tunable]).
export const SWARM = {
  spawnY: 150,
  formationTop: 90,
  entryDiveSpeed: 22,
  driftSpeed: 11,
  sinkSpeed: 2.2,
  sinkSwell: 0.4,
  wanderTurn: 0.75,
  boundRadius: 80,
  spacing: 4.5,
  bobAmp: 1.6,
  bobFreq: 1.8,
  detonateRadius: 6,
  landingsPerCoreHit: 3,
} as const;
