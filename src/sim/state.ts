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
export interface Effects {
  tracers: { from: THREE.Vector3; to: THREE.Vector3; ttl: number }[];
  blasts: { pos: THREE.Vector3; radius: number; ttl: number; maxTtl: number }[];
}

export interface PendingSpawn {
  at: number; // roundTime seconds
  enemy: string;
  count: number;
}

export interface GameState {
  simTime: number;
  tick: number;
  cash: number;
  score: number;
  round: number; // last started round (0 before round 1)
  phase: RoundPhase;
  roundTime: number;
  pending: PendingSpawn[];
  cities: City[];
  towers: Tower[];
  enemies: Enemy[];
  groups: GruntGroup[];
  shells: Shell[];
  bombs: Bomb[];
  effects: Effects;
  nextId: number;
  message: string;
  messageTtl: number;
  citiesDirty: boolean; // city visuals need refresh
}

export function createGameState(): GameState {
  return {
    simTime: 0,
    tick: 0,
    cash: ECONOMY.startingCash,
    score: 0,
    round: 0,
    phase: "build",
    roundTime: 0,
    pending: [],
    cities: CITY_POSITIONS.map(([x, z], index) => ({
      index,
      pos: new THREE.Vector3(x, 0, z),
      hp: CITY_HP,
    })),
    towers: [],
    enemies: [],
    groups: [],
    shells: [],
    bombs: [],
    effects: { tracers: [], blasts: [] },
    nextId: 1,
    message: "",
    messageTtl: 0,
    citiesDirty: false,
  };
}

export function toast(state: GameState, text: string, seconds = 3): void {
  state.message = text;
  state.messageTtl = seconds;
}

export function citiesAlive(state: GameState): number {
  return state.cities.filter((c) => c.hp > 0).length;
}
