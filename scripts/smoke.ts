// Headless sim smoke test (no browser, no rendering): a simple auto-player builds
// and upgrades a defense and runs the sim through all authored waves.
// Run with:  npm run smoke
// Extend this as phases add systems — it's the fast regression check for agents.
import * as THREE from "three";
import { upgradeCost, upgradeTower } from "../src/sim/actions";
import { simTick, startRound } from "../src/sim/game";
import { batteryTier, fireInterceptor, pickBattery, warheadPointAt } from "../src/sim/missiles";
import { citiesAlive, createGameState, type GameState, type Warhead } from "../src/sim/state";
import { WAVE_COUNT } from "../src/sim/waves";
import { TOWER_DEFS } from "../src/content/towers";

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
];

function autoBuild(s: GameState): void {
  if (buildQueue.length > 0) {
    const [defId, x, z] = buildQueue[0];
    if (s.cash >= TOWER_DEFS[defId].cost) {
      s.cash -= TOWER_DEFS[defId].cost;
      s.towers.push({
        id: s.nextId++, defId, tier: 0,
        pos: new THREE.Vector3(x, 0, z),
        cooldown: 0, priority: "first", alive: true,
      });
      buildQueue.shift();
    }
    return;
  }
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
      `  cash=$${state.cash}  score=${state.score}  cities=${citiesAlive(state)}` +
      `  towers=${state.towers.filter((t) => t.alive).length}  enemies=${state.enemies.length}`,
    );
    lastPhase = state.phase;
  }
  if (state.simTime > 3600) throw new Error("sim hang: 60 sim-minutes without finishing");
  if (Number.isNaN(state.cash) || Number.isNaN(state.simTime)) throw new Error("NaN in state");
}

const towers = state.towers.filter((t) => t.alive);
console.log(`\nDONE round=${state.round} phase=${state.phase} score=${state.score} cash=$${state.cash}`);
console.log(`cities=${citiesAlive(state)}/6 towers=${towers.length} (tiers: ${towers.map((t) => t.tier + 1).join(",")}) interceptors fired=${shotsFired} wall=${Date.now() - t0}ms`);
if (state.phase === "gameover") throw new Error("auto-player lost all cities");
if (state.round !== WAVE_COUNT) throw new Error(`stopped at round ${state.round}, expected ${WAVE_COUNT}`);
if (shotsFired === 0) throw new Error("volleys ran but no interceptors were fired — missile sim broken?");
console.log("SMOKE TEST PASS");
