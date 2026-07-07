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
