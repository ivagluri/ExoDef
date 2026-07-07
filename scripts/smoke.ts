// Headless sim smoke test (no browser, no rendering): builds a basic defense and
// runs the sim through all authored waves. Run with:  npm run smoke
// Extend this as phases add systems — it's the fast regression check for agents.
import * as THREE from "three";
import { simTick, startRound } from "../src/sim/game";
import { citiesAlive, createGameState } from "../src/sim/state";
import { WAVE_COUNT } from "../src/sim/waves";

const state = createGameState();
const layout: Array<[string, number, number]> = [
  ["gun", 0, -30],
  ["gun", -35, 25],
  ["flak", 0, 15],
  ["flak", 30, -15],
];
for (const [defId, x, z] of layout) {
  state.towers.push({
    id: state.nextId++, defId, tier: 0,
    pos: new THREE.Vector3(x, 0, z),
    cooldown: 0, priority: "first", alive: true,
  });
}

const DT = 1 / 60;
let lastPhase: string = state.phase;
const t0 = Date.now();

while (state.round < WAVE_COUNT || state.phase === "combat") {
  if (state.phase === "build" && !startRound(state)) break;
  if (state.phase === "gameover") break;
  simTick(state, DT);
  if (state.phase !== lastPhase) {
    console.log(
      `t=${state.simTime.toFixed(1)}s  ${lastPhase}→${state.phase}  round=${state.round}` +
      `  cash=$${state.cash}  score=${state.score}  cities=${citiesAlive(state)}` +
      `  towers=${state.towers.filter((t) => t.alive).length}  enemies=${state.enemies.length}`,
    );
    lastPhase = state.phase;
  }
  if (state.simTime > 1800) throw new Error("sim hang: 30 sim-minutes without finishing");
  if (Number.isNaN(state.cash) || Number.isNaN(state.simTime)) throw new Error("NaN in state");
}

console.log(`\nDONE round=${state.round} phase=${state.phase} score=${state.score} cash=$${state.cash} cities=${citiesAlive(state)}/6 wall=${Date.now() - t0}ms`);
if (state.round !== WAVE_COUNT || state.phase === "gameover") throw new Error("did not survive all authored waves");
console.log("SMOKE TEST PASS");
