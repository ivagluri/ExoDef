import * as THREE from "three";
import { SIM_HZ } from "./balance";
import { OrbitInput } from "./input/orbit";
import { PlacementInput } from "./input/placement";
import { IsoCamera } from "./render/cameras";
import { createWorld } from "./render/scene";
import { RenderSync } from "./render/sync";
import { simTick, startRound } from "./sim/game";
import { createGameState } from "./sim/state";
import { createHud } from "./ui/hud";

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const world = createWorld();
const iso = new IsoCamera(window.innerWidth / window.innerHeight);
const orbit = new OrbitInput(renderer.domElement, iso);
const state = createGameState();
const sync = new RenderSync(world.scene, world.cities);
const placement = new PlacementInput(renderer.domElement, iso.camera, world.scene, state);

const hud = createHud({
  onStart: () => startRound(state),
  onSelect: (id) => placement.select(placement.selection === id ? null : id),
});
window.addEventListener("keydown", (ev) => {
  if (ev.code === "Enter") startRound(state);
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  iso.setAspect(window.innerWidth / window.innerHeight);
});

// Fixed-timestep sim, variable-rate render (GAME-DESIGN.md §13)
const SIM_DT = 1 / SIM_HZ;
const MAX_FRAME = 0.25; // avoid spiral of death after tab-away
let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  accumulator += frameDt;
  while (accumulator >= SIM_DT) {
    simTick(state, SIM_DT);
    accumulator -= SIM_DT;
  }

  iso.update(frameDt, orbit.take(frameDt));
  sync.sync(state);
  hud.update(state, placement.selection);
  renderer.render(world.scene, iso.camera);
}
requestAnimationFrame(frame);
