// Headless sim smoke test (no browser, no rendering): a simple auto-player builds
// and upgrades a defense and runs the sim through the wave-50 victory goal.
// Run with:  npm run smoke
// Extend this as phases add systems — it's the fast regression check for agents.
import * as THREE from "three";
import { repairCore, upgradeCost, upgradeTower } from "../src/sim/actions";
import { simTick, startRound } from "../src/sim/game";
import { batteryTier, fireInterceptor, pickBattery, warheadPointAt } from "../src/sim/missiles";
import { coresAlive, createGameState, type GameState, type Warhead } from "../src/sim/state";
import { updateDrones, updateTowers } from "../src/sim/towers";
import { WAVE_COUNT } from "../src/sim/waves";
import { TOWER_DEFS } from "../src/content/towers";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runPhase6Checks(): void {
  const repair = createGameState();
  repair.cash = 300;
  repair.cores[0].hp = 1;
  repairCore(repair, 0);
  assert(repair.cores[0].hp === 2, "repair did not restore a damaged core");
  assert(repair.cash === 0, "repair did not spend cash");
  repair.cash = 1000;
  repair.cores[0].hp = 0;
  repairCore(repair, 0);
  assert(repair.cores[0].hp === 0 && repair.cash === 1000, "destroyed core was cash-repaired");

  const repulsor = createGameState();
  repulsor.phase = "combat";
  repulsor.towers.push({
    id: repulsor.nextId++, defId: "repulsor", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  repulsor.enemies.push({
    id: repulsor.nextId++, defId: "bomber", hp: 60,
    pos: new THREE.Vector3(12, 52, 0),
    alive: true, groupId: null,
    ai: { mode: "approach", timer: 0, vel: new THREE.Vector3(), target: new THREE.Vector3() },
  });
  updateTowers(repulsor, 1 / 60);
  assert((repulsor.enemies[0].repulse?.ttl ?? 0) > 0, "repulsor did not apply debuff");

  const missile = createGameState();
  missile.phase = "combat";
  missile.towers.push({
    id: missile.nextId++, defId: "aaMissile", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "strong", alive: true,
  });
  missile.enemies.push({
    id: missile.nextId++, defId: "grunt", hp: 20,
    pos: new THREE.Vector3(20, 90, 0),
    alive: true, groupId: null,
  });
  updateTowers(missile, 1 / 60);
  assert(missile.aaMissiles.length === 1, "AA missile tower did not launch at invader");

  const drones = createGameState();
  drones.towers.push({
    id: drones.nextId++, defId: "drone", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  updateDrones(drones, 1 / 60);
  assert(drones.drones.length === 1, "T1 drone tower did not maintain one drone");
  drones.towers[drones.towers.length - 1].tier = 1;
  updateDrones(drones, 1 / 60);
  assert(drones.drones.length === 2, "T2 drone tower did not maintain two drones");

  console.log("PHASE 6 CHECKS PASS");
}

runPhase6Checks();

const state = createGameState();

// build order the auto-player works through as cash allows
const buildQueue: Array<[string, number, number]> = [
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

function tryBuildNext(s: GameState): boolean {
  if (buildQueue.length === 0) return false;
  const [defId, x, z] = buildQueue[0];
  if (s.cash < TOWER_DEFS[defId].cost) return false;
  s.cash -= TOWER_DEFS[defId].cost;
  s.towers.push({
    id: s.nextId++, defId, tier: 0,
    pos: new THREE.Vector3(x, 0, z),
    cooldown: 0, priority: "first", alive: true,
    battery: defId === "battery" ? { ammo: 0, reloadLeft: 0, inFlight: 0 } : undefined,
  });
  buildQueue.shift();
  return true;
}

function autoBuild(s: GameState): void {
  if (tryBuildNext(s)) return;
  // queue done: upgrade the cheapest upgradable tower when cash is comfortable
  let best: { id: number; cost: number } | null = null;
  for (const t of s.towers) {
    if (!t.alive) continue;
    const cost = upgradeCost(t);
    if (cost !== null && (best === null || cost < best.cost)) best = { id: t.id, cost };
  }
  if (best && s.cash >= best.cost + 200) upgradeTower(s, best.id);
}

// Auto-interception: lead each warhead by the interceptor's flight time along
// its deterministic arc (converges in a few iterations), one shot per warhead.
const targeted = new Set<number>();
let shotsFired = 0;

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

function autoIntercept(s: GameState): void {
  for (const id of targeted) {
    if (!s.warheads.some((w) => w.id === id)) targeted.delete(id);
  }
  for (const w of s.warheads) {
    if (targeted.has(w.id)) continue;
    const aim = interceptAim(s, w);
    if (aim && fireInterceptor(s, aim)) {
      targeted.add(w.id);
      shotsFired++;
      return; // at most one launch per tick
    }
  }
}

const DT = 1 / 60;
let lastPhase: string = state.phase;
const t0 = Date.now();

while (state.round < WAVE_COUNT || state.phase === "combat") {
  if (state.phase === "build") {
    autoBuild(state);
    if (!startRound(state)) break;
  }
  if (state.phase === "gameover") break;
  simTick(state, DT);
  autoBuild(state); // mid-round building is allowed (§3)
  autoIntercept(state);
  if (state.phase !== lastPhase) {
    console.log(
      `t=${state.simTime.toFixed(1)}s  ${lastPhase}→${state.phase}  round=${state.round}` +
      `  cash=$${state.cash}  score=${state.score}  cores=${coresAlive(state)}` +
      `  towers=${state.towers.filter((t) => t.alive).length}  enemies=${state.enemies.length}`,
    );
    lastPhase = state.phase;
  }
  if (state.simTime > 3600) throw new Error("sim hang: 60 sim-minutes without finishing");
  if (Number.isNaN(state.cash) || Number.isNaN(state.simTime)) throw new Error("NaN in state");
}

const towers = state.towers.filter((t) => t.alive);
console.log(`\nDONE round=${state.round} phase=${state.phase} score=${state.score} cash=$${state.cash}`);
console.log(`cores=${coresAlive(state)}/6 towers=${towers.length} (tiers: ${towers.map((t) => t.tier + 1).join(",")}) interceptors fired=${shotsFired} wall=${Date.now() - t0}ms`);
if (state.phase === "gameover") throw new Error("auto-player lost all cores");
if (state.round !== WAVE_COUNT) throw new Error(`stopped at round ${state.round}, expected ${WAVE_COUNT}`);
if (shotsFired === 0) throw new Error("volleys ran but no interceptors were fired — missile sim broken?");
console.log("SMOKE TEST PASS");
