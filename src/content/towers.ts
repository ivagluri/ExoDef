// Data-driven tower definitions (GAME-DESIGN.md §4). Adding a tower = adding an
// entry here + a model in render/models.ts. All numbers [tunable].

export interface TowerTier {
  upgradeCost: number; // 0 for base tier
  rangeRadius: number;
  maxAltitude: number;
  /** direct-fire towers: one shot of `damage` every `period` seconds */
  shot?: { damage: number; period: number };
  /** aoe towers: shell flies to target point, bursts for `damage` in `aoeRadius` */
  burst?: { damage: number; period: number; aoeRadius: number; shellSpeed: number };
}

export interface TowerDef {
  id: string;
  name: string;
  cost: number;
  hotkey: string;
  role: "direct" | "aoe" | "interceptor" | "support";
  tiers: TowerTier[];
}

export const TOWER_DEFS: Record<string, TowerDef> = {
  gun: {
    id: "gun",
    name: "GUN",
    cost: 150,
    hotkey: "1",
    role: "direct",
    tiers: [
      { upgradeCost: 0, rangeRadius: 45, maxAltitude: 40, shot: { damage: 3, period: 0.25 } }, // 12 dps
      { upgradeCost: 120, rangeRadius: 55, maxAltitude: 40, shot: { damage: 5, period: 0.25 } }, // 20 dps
      { upgradeCost: 250, rangeRadius: 55, maxAltitude: 55, shot: { damage: 8, period: 0.25 } }, // 32 dps, clips MID
    ],
  },
  flak: {
    id: "flak",
    name: "FLAK",
    cost: 300,
    hotkey: "2",
    role: "aoe",
    tiers: [
      { upgradeCost: 0, rangeRadius: 60, maxAltitude: 80, burst: { damage: 15, period: 1.5, aoeRadius: 8, shellSpeed: 90 } },
      { upgradeCost: 250, rangeRadius: 60, maxAltitude: 80, burst: { damage: 15, period: 1.1, aoeRadius: 10, shellSpeed: 90 } },
      { upgradeCost: 450, rangeRadius: 60, maxAltitude: 95, burst: { damage: 25, period: 1.1, aoeRadius: 10, shellSpeed: 110 } },
    ],
  },
  // "battery" (interceptor) arrives in Phase 4; "beam"/"radar" are backlog (§14)
};

/** Towers available on the build bar this phase. */
export const BUILDABLE = ["gun", "flak"] as const;
