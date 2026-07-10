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
  /** repulsor: applies an upward-retreat debuff, then retargets after cooldown */
  repulsor?: { cooldown: number; duration: number; liftSpeed: number };
  /** automatic guided missile vs airborne invaders only, never warheads */
  guided?: { damage: number; period: number; speed: number };
  /** persistent reusable drones maintained by the tower */
  drone?: { count: number; damage: number; period: number; speed: number; attackRange: number };
  /** napalm: lobbed canister bursts into a lingering chip-damage cloud; never affects warheads */
  cloud?: { period: number; shellSpeed: number; dps: number; cloudRadius: number; cloudDuration: number };
  /** hack array: converts one invader into a kamikaze that rams the closest other invader; mothership immune */
  hack?: { cooldown: number; kamikazeSpeed: number; damage: number; aoeRadius: number };
  /** blockade: maintains hovering barriers over nearby cores that soak descending impacts */
  barrier?: { hp: number; rebuildTime: number; radius: number; count: number };
  /** nuke: one-shot player-fired silo — wipes non-boss invaders AND all towers except batteries */
  nuke?: { bossDamage: number };
}

export interface TowerDef {
  id: string;
  name: string;
  cost: number;
  hotkey: string;
  role: "direct" | "aoe" | "interceptor" | "support" | "control";
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
    // Phase 9 (2026-07-09): upper-tier DPS roughly halved (T2 16→10, T3 24→12) so
    // a mono-gun spam is competitive-but-not-guaranteed (limps to ~w49, bleeds out)
    // rather than a comfortable 6/6 w50 cruise. Guns stay the cheap chip backbone.
    tiers: [
      { upgradeCost: 0, rangeRadius: 80, maxAltitude: 90, shot: { damage: 2, period: 0.25 } }, // 8 dps
      { upgradeCost: 120, rangeRadius: 90, maxAltitude: 100, shot: { damage: 2.5, period: 0.25 } }, // 10 dps
      { upgradeCost: 250, rangeRadius: 100, maxAltitude: 110, shot: { damage: 3, period: 0.25 } }, // 12 dps
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
  repulsor: {
    id: "repulsor",
    name: "REPULSOR",
    cost: 250,
    hotkey: "4",
    role: "control",
    tiers: [
      { upgradeCost: 0, rangeRadius: 76, maxAltitude: 120, repulsor: { cooldown: 5, duration: 2.4, liftSpeed: 18 } },
      { upgradeCost: 260, rangeRadius: 86, maxAltitude: 130, repulsor: { cooldown: 3.8, duration: 3.0, liftSpeed: 22 } },
      { upgradeCost: 520, rangeRadius: 96, maxAltitude: 145, repulsor: { cooldown: 2.8, duration: 3.6, liftSpeed: 26 } },
    ],
  },
  aaMissile: {
    id: "aaMissile",
    name: "AA MISSILE",
    cost: 450,
    hotkey: "5",
    role: "direct",
    tiers: [
      { upgradeCost: 0, rangeRadius: 190, maxAltitude: 160, guided: { damage: 80, period: 4.2, speed: 52 } },
      { upgradeCost: 380, rangeRadius: 205, maxAltitude: 165, guided: { damage: 125, period: 3.5, speed: 68 } },
      { upgradeCost: 700, rangeRadius: 220, maxAltitude: 170, guided: { damage: 180, period: 2.9, speed: 86 } },
    ],
  },
  drone: {
    id: "drone",
    name: "DRONE",
    cost: 350,
    hotkey: "6",
    role: "support",
    tiers: [
      { upgradeCost: 0, rangeRadius: 130, maxAltitude: 125, drone: { count: 1, damage: 4, period: 0.55, speed: 38, attackRange: 13 } },
      { upgradeCost: 330, rangeRadius: 145, maxAltitude: 140, drone: { count: 2, damage: 4, period: 0.48, speed: 44, attackRange: 14 } },
      { upgradeCost: 620, rangeRadius: 160, maxAltitude: 155, drone: { count: 3, damage: 5, period: 0.45, speed: 50, attackRange: 15 } },
    ],
  },
  napalm: {
    id: "napalm",
    name: "NAPALM",
    cost: 350,
    hotkey: "7",
    role: "aoe",
    // Area denial: clouds melt lingerers (swarm clusters, splitter fragments,
    // the slow-sinking mothership). Low reach — this is a landing-zone tool.
    tiers: [
      { upgradeCost: 0, rangeRadius: 70, maxAltitude: 60, cloud: { period: 6, shellSpeed: 70, dps: 12, cloudRadius: 14, cloudDuration: 6 } },
      { upgradeCost: 300, rangeRadius: 78, maxAltitude: 70, cloud: { period: 5, shellSpeed: 75, dps: 16, cloudRadius: 17, cloudDuration: 7 } },
      { upgradeCost: 560, rangeRadius: 86, maxAltitude: 80, cloud: { period: 4.2, shellSpeed: 80, dps: 22, cloudRadius: 20, cloudDuration: 8 } },
    ],
  },
  hack: {
    id: "hack",
    name: "HACK ARRAY",
    cost: 500,
    hotkey: "8",
    role: "control",
    // Phase 9 (2026-07-09): cooldowns lengthened (T1 9→11, T2 7→9, T3 5.5→7) to
    // throttle the self-sustaining mono-hack spam (was a w50 4/6 cruise, now dies
    // ~w11-17). Per-conversion punch (damage/AoE/speed) is untouched, so a single
    // hack in a mixed build stays worth buying — it just can't carry a whole grid.
    tiers: [
      { upgradeCost: 0, rangeRadius: 90, maxAltitude: 130, hack: { cooldown: 11, kamikazeSpeed: 34, damage: 60, aoeRadius: 10 } },
      { upgradeCost: 420, rangeRadius: 100, maxAltitude: 140, hack: { cooldown: 9, kamikazeSpeed: 40, damage: 90, aoeRadius: 12 } },
      { upgradeCost: 760, rangeRadius: 110, maxAltitude: 155, hack: { cooldown: 7, kamikazeSpeed: 46, damage: 130, aoeRadius: 14 } },
    ],
  },
  blockade: {
    id: "blockade",
    name: "BLOCKADE",
    cost: 400,
    hotkey: "9",
    role: "support",
    // Purely defensive: launches a hovering barrier over the nearest core in
    // range (or over itself). Descending impacts consume charges; the tower
    // slowly builds the next barrier after one shatters.
    tiers: [
      { upgradeCost: 0, rangeRadius: 60, maxAltitude: 0, barrier: { hp: 3, rebuildTime: 12, radius: 11, count: 1 } },
      { upgradeCost: 320, rangeRadius: 70, maxAltitude: 0, barrier: { hp: 4, rebuildTime: 9, radius: 12, count: 1 } },
      { upgradeCost: 600, rangeRadius: 80, maxAltitude: 0, barrier: { hp: 5, rebuildTime: 8, radius: 13, count: 2 } },
    ],
  },
  nuke: {
    id: "nuke",
    name: "NUKE",
    // "Fool's gold" (user, 2026-07-07): temptingly cheap — the real price is
    // your defense grid. One shot, fired from the tower panel, consumes the silo.
    cost: 250,
    hotkey: "0",
    role: "support",
    tiers: [
      { upgradeCost: 0, rangeRadius: 0, maxAltitude: 0, nuke: { bossDamage: 600 } },
    ],
  },
  // "radar" is backlog; the persistent HUD radar covers the v1 readability need.
  // Orbital mine launcher deferred: its parked-area-damage niche overlaps napalm for now.
};

/** Towers available on the build bar this phase. */
export const BUILDABLE = ["gun", "flak", "battery", "repulsor", "aaMissile", "drone", "napalm", "hack", "blockade", "nuke"] as const;
