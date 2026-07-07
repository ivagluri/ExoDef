import * as THREE from "three";
import { SIM_HZ } from "./balance";
import { OrbitInput } from "./input/orbit";
import { PlacementInput } from "./input/placement";
import { IsoCamera } from "./render/cameras";
import { CoordinateView } from "./render/coordview";
import { createWorld } from "./render/scene";
import { RenderSync } from "./render/sync";
import { cyclePriority, sellTower, upgradeTower } from "./sim/actions";
import { simTick, startRound } from "./sim/game";
import { createGameState } from "./sim/state";
import { createHud } from "./ui/hud";
import { createRadar } from "./ui/radar";
import { siren } from "./ui/siren";

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
const coordView = new CoordinateView(world.scene, iso.camera);
renderer.domElement.addEventListener("pointerdown", (ev) => coordView.onPointerDown(ev, state));

const hud = createHud({
  onStart: () => startRound(state),
  onSelect: (id) => placement.select(placement.selection === id ? null : id),
  onUpgrade: () => placement.selectedTowerId !== null && upgradeTower(state, placement.selectedTowerId),
  onSell: () => {
    if (placement.selectedTowerId !== null) {
      sellTower(state, placement.selectedTowerId);
      placement.selectedTowerId = null;
    }
  },
  onPriority: () => placement.selectedTowerId !== null && cyclePriority(state, placement.selectedTowerId),
  onBanner: () => coordView.enter(state),
});
// AFTER createHud — the HUD build wipes #hud's children, and the radar canvas
// lives inside #hud (was created first once; drew to a detached canvas forever)
const radar = createRadar();
const radarRight = new THREE.Vector3();

// siren on volley start (§6.2) — watch for the sim-side transition
let volleyWasActive = false;
window.addEventListener("keydown", (ev) => {
  if (ev.code === "Enter") startRound(state);
  if (ev.code === "Tab") {
    ev.preventDefault(); // TAB toggles views (§10), never moves browser focus
    coordView.toggle(state);
  }
  if (ev.code === "Space") {
    if (!coordView.isMapMode()) ev.preventDefault();
    coordView.onCommit(state);
  }
  if (ev.code === "KeyF" && !coordView.isMapMode()) coordView.toggleScheme();
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  iso.setAspect(window.innerWidth / window.innerHeight);
  coordView.refreshCameras();
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

  const volleyOn = state.volley !== null;
  if (volleyOn && !volleyWasActive) siren();
  volleyWasActive = volleyOn;

  // map mode: orbit camera as usual. Coordinate mode: the view owns the
  // camera (and clicks aim instead of placing) — but the SIM NEVER PAUSES.
  const azimuth = orbit.take(frameDt);
  placement.enabled = coordView.isMapMode();
  if (coordView.isMapMode()) iso.update(frameDt, azimuth);
  coordView.update(frameDt, state);

  sync.sync(state);
  hud.update(state, placement.selection, placement.selectedTowerId, coordView.hudInfo(state));

  // radar lateral axis: volley frame in coordinate view, else screen-right
  const frameRight = coordView.lateralRight();
  if (frameRight) radarRight.copy(frameRight);
  else radarRight.setFromMatrixColumn(iso.camera.matrixWorld, 0).setY(0).normalize();
  radar.draw(state, radarRight);

  if (coordView.isMapMode()) renderer.render(world.scene, iso.camera);
  else coordView.render(renderer, world.scene);
}
requestAnimationFrame(frame);
