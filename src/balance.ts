// All gameplay numbers live here, sourced from GAME-DESIGN.md.
// Numbers marked [tunable] in the design doc are expected to change in playtesting.

export const MAP_SIZE = 200; // ground is MAP_SIZE × MAP_SIZE world units, centered at origin

// GAME-DESIGN.md §2 — six cities, fixed authored positions (x, z)
export const CITY_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-60, -40],
  [60, -40],
  [-70, 30],
  [70, 30],
  [0, 70],
  [0, -75],
];

// GAME-DESIGN.md §2 — altitude bands (y ranges) [tunable]
export const BANDS = {
  landingTop: 10,
  lowTop: 40,
  midTop: 80,
  highTop: 120,
  entryTop: 160,
} as const;

// GAME-DESIGN.md §10 — main map camera [tunable]
export const CAMERA = {
  pitchDeg: 40,
  fovDeg: 40,
  // fit sphere: whole map + LOW band visible at any rotation/aspect
  fitRadius: 150,
  targetY: 12, // look slightly above ground so sky/horizon stays in frame
  zoomSteps: [1.0, 0.72] as const, // "table" and "lean in"
  orbitSpeedRad: 2.1, // Q/E, radians per second
  dragRadPerPixel: 0.006,
  distanceLerp: 6, // smoothing rate for zoom transitions
};

// GAME-DESIGN.md §12 — Spectre palette: flat-shaded, bright, spartan
export const PALETTE = {
  sky: 0x070b18,
  ground: 0xb5b09c,
  grid: 0x9d987f,
  cityWhite: 0xf4f6f8,
  cityCyan: 0x35e0e8,
  star: 0xffffff,
} as const;

export const SIM_HZ = 60; // fixed-timestep simulation rate (GAME-DESIGN.md §13)

// GAME-DESIGN.md §8 — economy [tunable]
export const ECONOMY = {
  startingCash: 650,
  cityIncome: 25, // per surviving city per round
  sellRefund: 0.7,
} as const;

// GAME-DESIGN.md §3 — score
export const SCORE = {
  roundClearPerWave: 100,
} as const;

// GAME-DESIGN.md §11.2 — placement rules
export const PLACEMENT = {
  footprintRadius: 6,
  minTowerGap: 13, // center-to-center
  cityClearance: 15,
  buildableHalf: 92, // |x|,|z| limit for tower centers
} as const;

// GAME-DESIGN.md §5 — grunt behavior [tunable]
// Movement went organic per playtest feedback (2026-07-07): meandering heading +
// continuous swelling descent + per-member bob, replacing the axis-locked
// drift/step-down march that felt too rigid.
export const GRUNT = {
  driftSpeed: 8, // u/s horizontal meander
  sinkSpeed: 1.3, // u/s average descent below formationTop
  sinkSwell: 0.5, // descent-rate modulation amplitude
  wanderTurn: 0.5, // rad/s max serpentine turn rate
  boundRadius: 80, // steer back toward center beyond this
  spacing: 9, // formation grid spacing
  bobAmp: 2.2, // per-member positional wobble (u)
  bobFreq: 1.1, // per-member wobble frequency (rad/s-ish)
  spawnY: 150,
  // Groups dive quickly from ENTRY down to the formation band, then meander.
  // Without this, reaching tower range takes minutes of dead time. §5 already
  // says waves "spend most of their descent" in MID.
  entryDiveSpeed: 18, // u/s while above formationTop
  formationTop: 100,
  detonateRadius: 8, // landing blast vs towers/cities
} as const;

export const CITY_HP = 2; // bomb/landing = 1 hit, warhead = 2 (§8)
export const CITY_RADIUS = 8; // for hit tests

// GAME-DESIGN.md §6 — missile volleys & interception [tunable]
export const VOLLEY = {
  entryY: 160, // warheads become visible at ENTRY top
  // Entry sits just beyond the platform edge on the approach side (playtest
  // 2026-07-07: the old fixed 260u-behind-target spawn kept warheads outside
  // the top view for half their flight). The top view extends further on the
  // approach side to keep this corridor in frame.
  entryOffset: 140, // entry depth (volley-frame v = -entryOffset)
  minApproach: 60, // targets near the back edge still get this much approach run
  entryLateralJitter: 18, // per-warhead sideways spread within the volley
  arcPeakY: 105, // bézier control-point altitude (shallow over-horizon arc)
  flightTime: 30, // seconds overhead at wave 5
  flightTimeDropPerWave: 0.35, // modest speed-up with wave (§9)
  flightTimeMin: 18,
  staggerMin: 1.5, // seconds between launches
  staggerMax: 3,
  firstLaunchDelay: 2, // after round start; ~8s grace is emergent (they enter high)
  warheadSplash: 12, // ground splash radius vs towers (§8)
  interceptBounty: 30,
  blastTtl: 1.5, // interceptor blast sphere active window
  proximityInhibitY: 15, // no aiming below this (§6.5)
} as const;

