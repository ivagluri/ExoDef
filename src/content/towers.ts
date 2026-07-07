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
  /** batteries: player-plotted interception only, never auto-fire (§6.5) */
  interceptor?: { speed: number; reload: number; blastRadius: number; ammoPerVolley: number; silos: number };
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
    // Rebalanced per 2026-07-07 playtest: long reach, weak hits (chip damage from
    // the moment swarms settle into the formation band); flak owns kill power.
    tiers: [
      { upgradeCost: 0, rangeRadius: 80, maxAltitude: 90, shot: { damage: 2, period: 0.25 } }, // 8 dps
      { upgradeCost: 120, rangeRadius: 90, maxAltitude: 100, shot: { damage: 4, period: 0.25 } }, // 16 dps
      { upgradeCost: 250, rangeRadius: 100, maxAltitude: 110, shot: { damage: 6, period: 0.25 } }, // 24 dps
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
  battery: {
    id: "battery",
    name: "BATTERY",
    // §4: listed $500 with the first free — but the first is pre-placed at map
    // center (2026-07-07 review), so every *purchased* battery is the $600
    // "additional battery" price.
    cost: 600,
    hotkey: "3",
    role: "interceptor",
    // rangeRadius/maxAltitude unused: interception is player-plotted, any range (§6)
    tiers: [
      { upgradeCost: 0, rangeRadius: 0, maxAltitude: 0, interceptor: { speed: 60, reload: 3, blastRadius: 12, ammoPerVolley: 6, silos: 1 } },
      { upgradeCost: 400, rangeRadius: 0, maxAltitude: 0, interceptor: { speed: 80, reload: 2, blastRadius: 16, ammoPerVolley: 8, silos: 1 } },
      { upgradeCost: 700, rangeRadius: 0, maxAltitude: 0, interceptor: { speed: 100, reload: 2, blastRadius: 20, ammoPerVolley: 10, silos: 2 } },
    ],
  },
  // "beam"/"radar" are backlog (§14)
};

/** Towers available on the build bar this phase. */
export const BUILDABLE = ["gun", "flak", "battery"] as const;
