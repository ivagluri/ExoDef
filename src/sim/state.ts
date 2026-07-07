import * as THREE from "three";
import { CITY_HP, CITY_POSITIONS, ECONOMY } from "../balance";

// Fixed-timestep simulation state (GAME-DESIGN.md §13).
// The sim is decoupled from rendering and NEVER pauses for camera/view changes —
// pillar 1 ("the camera switch is the drama") depends on this.

export type Priority = "first" | "strong" | "close";
export type RoundPhase = "build" | "combat" | "gameover";

export interface City {
  index: number;
  pos: THREE.Vector3;
  hp: number; // CITY_HP → damaged at 1 → destroyed at 0
}

export interface Tower {
  id: number;
  defId: string;
  tier: number;
  pos: THREE.Vector3;
  cooldown: number;
  priority: Priority;
  alive: boolean;
  /** batteries only: per-volley ammo, reload timer, interceptors in flight (§6.5) */
  battery?: { ammo: number; reloadLeft: number; inFlight: number };
  /** the free pre-placed central battery: no cash-out of a free tower */
  noSell?: boolean;
}

/** Per-enemy behavior state for individually-moving enemies (bomber/diver/ufo). */
export interface EnemyAI {
  mode: string;
  timer: number;
  vel: THREE.Vector3;
  /** current destination / plunge impact point */
  target: THREE.Vector3;
  targetKind?: "city" | "tower";
  targetId?: number; // city index or tower id
  emitCount?: number;
  emitTimer?: number;
  bombTimer?: number;
  hpScale?: number;
}

export interface Enemy {
  id: number;
  defId: string;
  hp: number;
  pos: THREE.Vector3;
  alive: boolean;
  groupId: number | null;
  ai?: EnemyAI;
}

export interface Bomb {
  id: number;
  pos: THREE.Vector3;
  alive: boolean;
}

export interface GruntGroup {
  id: number;
  y: number;
  anchorX: number;
  anchorZ: number;
  heading: number; // radians, XZ plane
  wanderSeed: number; // per-group phase for the serpentine wander
  speedScale: number;
  /** enemy id → formation offset (+ per-member wobble phase) */
  members: { enemyId: number; dx: number; dz: number; phase: number }[];
}

export interface Shell {
  id: number;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  damage: number;
  aoeRadius: number;
  alive: boolean;
}

/** Transient render-only effects, produced by the sim, aged by the sim. */
export type BlastKind = "flak" | "impact" | "bossBay";

export interface Effects {
  tracers: { from: THREE.Vector3; to: THREE.Vector3; ttl: number }[];
  blasts: { pos: THREE.Vector3; radius: number; ttl: number; maxTtl: number; kind?: BlastKind }[];
}

/** Ballistic warhead on a precomputed quadratic bézier arc (§6.1/§7.3 —
 *  deterministic, so leading a shot is learnable). */
export interface Warhead {
  id: number;
  pos: THREE.Vector3;
  p0: THREE.Vector3; // entry (over the horizon, y = ENTRY top)
  p1: THREE.Vector3; // arc control point
  p2: THREE.Vector3; // impact point (target position, y = 0)
  t: number; // 0..1 flight progress
  duration: number; // seconds for the full arc
  targetKind: "city" | "tower";
  targetId: number;
  alive: boolean;
}

export interface Interceptor {
  id: number;
  pos: THREE.Vector3;
  target: THREE.Vector3; // the plotted point C, world space
  speed: number;
  blastRadius: number;
  batteryId: number; // frees the silo on arrival
  alive: boolean;
}

/** Expanding blast sphere from an interceptor: kills warheads inside its
 *  radius while active (§7.3). Also rendered directly. */
export interface InterceptBlast {
  pos: THREE.Vector3;
  radius: number;
  ttl: number;
  maxTtl: number;
}

/** One missile volley (§6). Lives from launch alert until the last warhead
 *  is dead or landed; ammo refills when it ends. */
export interface Volley {
  heading: THREE.Vector3; // volley direction, XZ unit vector — defines the frame (§7.1)
  pending: { at: number }[]; // staggered launch times (roundTime); targets resolve at launch
  total: number;
  counterforce: boolean;
}

export interface PendingSpawn {
  at: number; // roundTime seconds
  enemy: string;
  count: number;
  hpScale?: number;
  speedScale?: number;
}

export interface GameState {
  simTime: number;
  tick: number;
  cash: number;
  score: number;
  round: number; // last started round (0 before round 1)
  phase: RoundPhase;
  testCombat: boolean; // dev/test threats run like combat without advancing waves
  roundTime: number;
  pending: PendingSpawn[];
  cities: City[];
  towers: Tower[];
  enemies: Enemy[];
  groups: GruntGroup[];
  shells: Shell[];
  bombs: Bomb[];
  volley: Volley | null;
  warheads: Warhead[];
  interceptors: Interceptor[];
  interceptBlasts: InterceptBlast[];
  batteryAwake: boolean; // the central battery "wakes" at the first siren (§3)
  effects: Effects;
  nextId: number;
  message: string;
  messageTtl: number;
  citiesDirty: boolean; // city visuals need refresh
  won: boolean; // wave 50 cleared; freeplay remains available
}

export function createGameState(): GameState {
  return {
    simTime: 0,
    tick: 0,
    cash: ECONOMY.startingCash,
    score: 0,
    round: 0,
    phase: "build",
    testCombat: false,
    roundTime: 0,
    pending: [],
    cities: CITY_POSITIONS.map(([x, z], index) => ({
      index,
      pos: new THREE.Vector3(x, 0, z),
      hp: CITY_HP,
    })),
    // The free T1 battery, pre-placed at map center — dormant until the first
    // volley, unsellable (§2/§3, 2026-07-07 review).
    towers: [{
      id: 1,
      defId: "battery",
      tier: 0,
      pos: new THREE.Vector3(0, 0, 0),
      cooldown: 0,
      priority: "first",
      alive: true,
      battery: { ammo: 0, reloadLeft: 0, inFlight: 0 },
      noSell: true,
    }],
    enemies: [],
    groups: [],
    shells: [],
    bombs: [],
    volley: null,
    warheads: [],
    interceptors: [],
    interceptBlasts: [],
    batteryAwake: false,
    effects: { tracers: [], blasts: [] },
    nextId: 2,
    message: "",
    messageTtl: 0,
    citiesDirty: false,
    won: false,
  };
}

export function toast(state: GameState, text: string, seconds = 3): void {
  state.message = text;
  state.messageTtl = seconds;
}

export function citiesAlive(state: GameState): number {
  return state.cities.filter((c) => c.hp > 0).length;
}
