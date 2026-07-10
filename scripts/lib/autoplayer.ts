// Shared headless auto-player machinery for the balance tooling.
//
// This module extracts the build-queue / autoBuild / autoIntercept / sim-loop
// logic that used to live inline in scripts/smoke.ts, and parameterizes it by a
// Strategy so both the smoke regression check and the balance scenario harness
// (scripts/scenarios.ts) can share one runner. It changes NO sim behavior — it
// only drives the public sim API the same way a player would.
import * as THREE from "three";
import { upgradeCost, upgradeTower } from "../../src/sim/actions";
import { simTick, startRound } from "../../src/sim/game";
import { batteryTier, fireInterceptor, pickBattery, warheadPointAt } from "../../src/sim/missiles";
import { seedRng } from "../../src/sim/rng";
import { coresAlive, createGameState, type GameState, type Warhead } from "../../src/sim/state";
import { WAVE_COUNT } from "../../src/sim/waves";
import { TOWER_DEFS } from "../../src/content/towers";
import { CORE_POSITIONS } from "../../src/balance";

/** A queued build: tower def id + XZ position (pushed directly like smoke). */
export type Placement = [defId: string, x: number, z: number];

/** A parameterized auto-player. Changing these fields is how balance scenarios
 *  differ from each other without touching any sim numbers. */
export interface Strategy {
  name: string;
  /** what to build, in priority order, as cash allows */
  buildQueue: Placement[];
  /** may the player upgrade towers once the queue is exhausted / unaffordable? */
  allowUpgrades: boolean;
  /** extra cash to keep in reserve before spending on an upgrade */
  upgradeReserve: number;
  /** does the player plot & fire interceptors at inbound warheads? */
  intercept: boolean;
}

export interface ScenarioReport {
  name: string;
  furthestWave: number; // highest round reached
  reachedGoal: boolean; // cleared WAVE_COUNT without a game over
  stalled: boolean; // hit the sim-hang guard — a round it can never clear (e.g. a pure control tower)
  finalPhase: string;
  coresRemaining: number;
  coresLostAt: number[]; // wave number for each core lost, in order
  towersBuilt: number; // towers the strategy purchased (excludes the free battery)
  towersLost: number; // towers destroyed (includes the free battery if it dies)
  towersAlive: number;
  aliveTiers: number[]; // tier (1-based) of each surviving tower
  shotsFired: number; // interceptors launched
  endOfRoundCash: number[]; // cash at each round-clear, indexed by round (1..)
  cashFloor: number; // min end-of-round cash
  cashPeak: number; // max end-of-round cash
  finalCash: number;
  score: number;
  wallMs: number;
}

export interface RunOptions {
  onPhaseChange?: (state: GameState, from: string, to: string) => void;
}

const DT = 1 / 60;

// Auto-interception: lead each warhead by the interceptor's flight time along its
// deterministic arc (converges in a few iterations), one shot per warhead. Lifted
// verbatim from the original smoke auto-player.
function interceptAim(s: GameState, w: Warhead): THREE.Vector3 | null {
  let aim = w.pos.clone();
  for (let k = 0; k < 4; k++) {
    const battery = pickBattery(s, aim);
    if (!battery) return null;
    const flight = battery.pos.distanceTo(aim) / batteryTier(battery).speed;
    const tf = Math.min(0.98, w.t + flight / w.duration);
    warheadPointAt(w, tf, aim);
  }
  return aim.y >= 15 ? aim : null; // proximity inhibit — too late for this one
}

/** Run one full headless game under `strategy` and return its report. A game
 *  over is a valid RESULT, not an error — this never throws on a loss; it only
 *  throws on a genuine harness fault (sim hang / NaN). */
export function runAutoPlay(strategy: Strategy, opts: RunOptions = {}): ScenarioReport {
  // Every run starts from a pristine RNG stream so scenarios are order-independent
  // and a tuning change in one tower can't reshuffle another scenario's enemies.
  seedRng();
  const state = createGameState();
  const queue = strategy.buildQueue.slice(); // consumed via shift — don't mutate the caller's array
  const targeted = new Set<number>();
  let shotsFired = 0;
  let towersBuilt = 0;

  function autoBuild(): void {
    if (queue.length > 0) {
      const [defId, x, z] = queue[0];
      if (state.cash >= TOWER_DEFS[defId].cost) {
        state.cash -= TOWER_DEFS[defId].cost;
        state.towers.push({
          id: state.nextId++, defId, tier: 0,
          pos: new THREE.Vector3(x, 0, z),
          cooldown: 0, priority: "first", alive: true,
          battery: defId === "battery" ? { ammo: 0, reloadLeft: 0, inFlight: 0 } : undefined,
        });
        queue.shift();
        towersBuilt++;
        return;
      }
    }
    if (!strategy.allowUpgrades) return;
    // queue done / unaffordable: upgrade the cheapest upgradable tower when cash is comfortable
    let best: { id: number; cost: number } | null = null;
    for (const t of state.towers) {
      if (!t.alive) continue;
      const cost = upgradeCost(t);
      if (cost !== null && (best === null || cost < best.cost)) best = { id: t.id, cost };
    }
    if (best && state.cash >= best.cost + strategy.upgradeReserve) upgradeTower(state, best.id);
  }

  function autoIntercept(): void {
    for (const id of targeted) {
      if (!state.warheads.some((w) => w.id === id)) targeted.delete(id);
    }
    for (const w of state.warheads) {
      if (targeted.has(w.id)) continue;
      const aim = interceptAim(state, w);
      if (aim && fireInterceptor(state, aim)) {
        targeted.add(w.id);
        shotsFired++;
        return; // at most one launch per tick
      }
    }
  }

  const endOfRoundCash: number[] = [];
  const coresLostAt: number[] = [];
  let prevCores = coresAlive(state);
  let lastPhase: string = state.phase;
  let stalled = false;
  const t0 = Date.now();

  while (state.round < WAVE_COUNT || state.phase === "combat") {
    if (state.phase === "build") {
      autoBuild();
      if (!startRound(state)) break;
    }
    if (state.phase === "gameover") break;

    simTick(state, DT);

    // Capture end-of-round surplus the instant a round clears — after income is
    // credited (inside simTick) but before the auto-player spends it again.
    if (lastPhase === "combat" && state.phase === "build") {
      endOfRoundCash[state.round] = state.cash;
    }

    autoBuild(); // mid-round building is allowed (§3)
    if (strategy.intercept) autoIntercept();

    const now = coresAlive(state);
    if (now < prevCores) {
      for (let i = 0; i < prevCores - now; i++) coresLostAt.push(state.round);
      prevCores = now;
    }

    if (state.phase !== lastPhase) {
      opts.onPhaseChange?.(state, lastPhase, state.phase);
      lastPhase = state.phase;
    }

    // Sim-hang guard (kept per scenario, per the smoke test): 60 sim-minutes on a
    // single round means a strategy that can never clear it (e.g. a control-only
    // tower that just lifts enemies forever). That's a valid degenerate RESULT,
    // not a harness fault — record it and stop cleanly. The NaN guard below stays
    // a hard throw: that IS a genuine sim/harness fault.
    if (state.simTime > 3600) { stalled = true; break; }
    if (Number.isNaN(state.cash) || Number.isNaN(state.simTime)) throw new Error(`NaN in state in "${strategy.name}"`);
  }

  const alive = state.towers.filter((t) => t.alive);
  const roundCashValues = endOfRoundCash.filter((c) => c !== undefined);
  return {
    name: strategy.name,
    furthestWave: state.round,
    reachedGoal: state.round === WAVE_COUNT && state.phase !== "gameover" && !stalled,
    stalled,
    finalPhase: state.phase,
    coresRemaining: coresAlive(state),
    coresLostAt,
    towersBuilt,
    towersLost: towersBuilt + 1 - alive.length, // +1 = the free pre-placed battery
    towersAlive: alive.length,
    aliveTiers: alive.map((t) => t.tier + 1),
    shotsFired,
    endOfRoundCash,
    cashFloor: roundCashValues.length ? Math.min(...roundCashValues) : state.cash,
    cashPeak: roundCashValues.length ? Math.max(...roundCashValues) : state.cash,
    finalCash: state.cash,
    score: state.score,
    wallMs: Date.now() - t0,
  };
}

/** Generate a sensible ring/grid of placements for a single tower type,
 *  clustered around the six cores (closest-first). Positions are pushed directly
 *  like smoke — the sim's placement-validity rules are a UI concern. */
export function monoPlacements(defId: string, max = 24): Placement[] {
  const pts: Array<{ x: number; z: number; d: number }> = [];
  for (let x = -80; x <= 80; x += 20) {
    for (let z = -80; z <= 80; z += 20) {
      let d = Infinity;
      for (const [cx, cz] of CORE_POSITIONS) d = Math.min(d, Math.hypot(x - cx, z - cz));
      if (d < 14) continue; // don't sit on top of a core cluster
      pts.push({ x, z, d });
    }
  }
  pts.sort((a, b) => a.d - b.d); // hug the cores first
  return pts.slice(0, max).map((p) => [defId, p.x, p.z] as Placement);
}

// The existing smoke mixed build — the baseline "current build" strategy. Kept
// here so smoke.ts and scenarios.ts share one source of truth for it.
export const BASELINE_QUEUE: Placement[] = [
  ["gun", 0, -30],
  ["flak", 0, 15],
  ["gun", -35, 25],
  ["flak", 30, -15],
  ["flak", -45, -20],
  ["gun", 45, 30],
  ["flak", 0, 50],
  ["gun", 0, -55],
  ["flak", -30, 55],
  ["flak", 55, 0],
  ["battery", -55, 5],
  ["battery", 55, 5],
  ["napalm", 20, 32],
  ["hack", 62, 32],
  ["napalm", -20, -60],
  ["blockade", -15, 55],
  ["flak", -80, -80],
  ["gun", -45, -80],
  ["flak", 45, -80],
  ["gun", 80, -80],
  ["flak", -85, -5],
  ["gun", -45, 5],
  ["gun", 45, 5],
  ["flak", 85, -5],
  ["gun", -85, 60],
  ["flak", -35, 70],
  ["flak", 35, 70],
  ["gun", 85, 60],
  ["flak", -15, -82],
  ["flak", 15, -82],
];

/** The baseline mixed strategy (== the original smoke auto-player). */
export function baselineStrategy(): Strategy {
  return {
    name: "baseline (smoke build)",
    buildQueue: BASELINE_QUEUE,
    allowUpgrades: true,
    upgradeReserve: 200,
    intercept: true,
  };
}
