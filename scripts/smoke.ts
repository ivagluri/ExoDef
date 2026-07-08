// Headless sim smoke test (no browser, no rendering): a simple auto-player builds
// and upgrades a defense and runs the sim through the wave-50 victory goal.
// Run with:  npm run smoke
// Extend this as phases add systems — it's the fast regression check for agents.
import * as THREE from "three";
import { repairCore, upgradeCost, upgradeTower } from "../src/sim/actions";
import { killEnemy, spawnSwarmGroup, updateGroups } from "../src/sim/enemies";
import { simTick, startRound } from "../src/sim/game";
import { batteryTier, fireInterceptor, pickBattery, warheadPointAt } from "../src/sim/missiles";
import { spawnSplitter, updateRaiders } from "../src/sim/raiders";
import { coresAlive, createGameState, type GameState, type Warhead } from "../src/sim/state";
import { updateClouds, updateDrones, updateShells, updateTowers } from "../src/sim/towers";
import { WAVE_COUNT } from "../src/sim/waves";
import { ENEMY_DEFS, SPLITTER, SWARM } from "../src/content/enemies";
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

function runPhase7Checks(): void {
  // napalm: canister → lingering cloud → chip damage
  const napalm = createGameState();
  napalm.phase = "combat";
  napalm.towers.push({
    id: napalm.nextId++, defId: "napalm", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  napalm.enemies.push({
    id: napalm.nextId++, defId: "grunt", hp: 20,
    pos: new THREE.Vector3(10, 20, 0),
    alive: true, groupId: null,
  });
  updateTowers(napalm, 1 / 60);
  assert(napalm.shells.length === 1 && napalm.shells[0].cloud !== undefined, "napalm did not lob a canister");
  for (let i = 0; i < 120 && napalm.clouds.length === 0; i++) updateShells(napalm, 1 / 60);
  assert(napalm.clouds.length === 1, "napalm canister did not ignite a cloud");
  const hpBefore = napalm.enemies[0].hp;
  updateClouds(napalm, 1);
  assert(napalm.enemies[0].hp < hpBefore, "napalm cloud did not chip-damage the enemy inside");

  // hack array: convert → kamikaze run → victim bounty only
  const hack = createGameState();
  hack.phase = "combat";
  hack.towers.push({
    id: hack.nextId++, defId: "hack", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "strong", alive: true,
  });
  for (const x of [10, 18]) {
    hack.enemies.push({
      id: hack.nextId++, defId: "grunt", hp: 20,
      pos: new THREE.Vector3(x, 40, 0),
      alive: true, groupId: null,
    });
  }
  updateTowers(hack, 1 / 60);
  assert(hack.enemies.some((e) => e.hacked), "hack array did not convert an invader");
  const cashBefore = hack.cash;
  for (let i = 0; i < 600 && hack.enemies.length > 0; i++) updateRaiders(hack, 1 / 60);
  assert(hack.enemies.length === 0, "hack kamikaze run did not resolve");
  assert(hack.cash === cashBefore + ENEMY_DEFS.grunt.bounty, "kamikaze bounty wrong: victim pays, hacked unit does not");

  // splitter: fragments on kill AND on low-altitude auto-split
  const splitKill = createGameState();
  splitKill.phase = "combat";
  spawnSplitter(splitKill, 1);
  killEnemy(splitKill, splitKill.enemies.find((e) => e.defId === "splitter")!);
  assert(
    splitKill.enemies.filter((e) => e.alive && e.defId === "fragment").length === SPLITTER.fragmentCount,
    "killed splitter did not burst into fragments",
  );
  const splitLow = createGameState();
  splitLow.phase = "combat";
  spawnSplitter(splitLow, 1);
  splitLow.enemies.find((e) => e.defId === "splitter")!.pos.y = SPLITTER.splitY + 0.01;
  updateRaiders(splitLow, 1 / 60);
  assert(
    !splitLow.enemies.some((e) => e.defId === "splitter") &&
    splitLow.enemies.filter((e) => e.defId === "fragment").length === SPLITTER.fragmentCount,
    "intact splitter did not auto-split at low altitude",
  );

  // swarm: landings charge a core; every 3rd charge = 1 hit
  const swarm = createGameState();
  swarm.phase = "combat";
  const core = swarm.cores[0];
  spawnSwarmGroup(swarm, SWARM.landingsPerCoreHit, 1, 1, core.pos.clone().setY(5));
  swarm.groups[0].y = 0; // force the landing this tick
  updateGroups(swarm, 1 / 60);
  assert(core.hp === 1, "3 swarm landings did not deal exactly 1 core hit");
  assert(core.swarmCharge === 0, "swarm charge did not reset after triggering a hit");

  console.log("PHASE 7 CHECKS PASS");
}

runPhase6Checks();
runPhase7Checks();

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
  ["napalm", 20, 32],
  ["hack", 62, 32],
  ["napalm", -20, -60],
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
