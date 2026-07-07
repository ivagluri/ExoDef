import * as THREE from "three";
import { SIM_HZ } from "./balance";
import { OrbitInput } from "./input/orbit";
import { PlacementInput } from "./input/placement";
import { IsoCamera } from "./render/cameras";
import { CoordinateView } from "./render/coordview";
import { createWorld } from "./render/scene";
import { RenderSync } from "./render/sync";
import { cyclePriority, sellTower, upgradeTower } from "./sim/actions";
import { simTick, startRound, triggerTestBoss, triggerTestMissiles } from "./sim/game";
import { coresAlive, createGameState } from "./sim/state";
import { createHud } from "./ui/hud";
import { createRadar } from "./ui/radar";
import { AudioSystem } from "./ui/siren";

const SETTINGS_KEY = "exodef.settings";
const HIGH_SCORE_KEY = "exodef.highScore";

interface StoredSettings {
  volume: number;
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<StoredSettings> : {};
    return {
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : 0.7,
    };
  } catch {
    return { volume: 0.7 };
  }
}

function loadHighScore(): number {
  const value = Number(localStorage.getItem(HIGH_SCORE_KEY));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const world = createWorld();
const iso = new IsoCamera(window.innerWidth / window.innerHeight);
const orbit = new OrbitInput(renderer.domElement, iso);
const state = createGameState();
const sync = new RenderSync(world.scene, world.cores);
const placement = new PlacementInput(renderer.domElement, iso.camera, world.scene, state);
const settings = { ...loadSettings(), open: false };
let highScore = loadHighScore();
const audio = new AudioSystem(settings.volume);
const coordView = new CoordinateView(world.scene, iso.camera);
renderer.domElement.addEventListener("pointerdown", (ev) => coordView.onPointerDown(ev, state));

function saveSettings(): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: settings.volume }));
}

function setVolume(volume: number): void {
  settings.volume = Math.max(0, Math.min(1, volume));
  audio.setVolume(settings.volume);
  saveSettings();
}

function updateHighScore(): void {
  if (state.score <= highScore) return;
  highScore = state.score;
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
}

const hud = createHud({
  onStart: () => {
    audio.unlock();
    startRound(state);
  },
  onSelect: (id) => {
    audio.unlock();
    placement.select(placement.selection === id ? null : id);
  },
  onUpgrade: () => {
    audio.unlock();
    if (placement.selectedTowerId !== null) upgradeTower(state, placement.selectedTowerId);
  },
  onSell: () => {
    audio.unlock();
    if (placement.selectedTowerId !== null) {
      sellTower(state, placement.selectedTowerId);
      placement.selectedTowerId = null;
    }
  },
  onPriority: () => {
    audio.unlock();
    if (placement.selectedTowerId !== null) cyclePriority(state, placement.selectedTowerId);
  },
  onBanner: () => {
    audio.unlock();
    coordView.enter(state);
  },
  onSpeed: () => {
    audio.unlock();
    toggleSpeed();
  },
  onSettings: () => {
    audio.unlock();
    settings.open = !settings.open;
  },
  onSpeedValue: (speed) => {
    audio.unlock();
    simSpeed = speed;
  },
  onVolume: (volume) => {
    audio.unlock();
    setVolume(volume);
  },
  onTestMissiles: () => {
    audio.unlock();
    triggerTestMissiles(state);
  },
  onTestBoss: () => {
    audio.unlock();
    triggerTestBoss(state);
  },
});

// 3× fast-forward (playtest QoL 2026-07-07): scales how many fixed-size sim
// ticks run per frame — never the tick size, so the sim stays deterministic.
let simSpeed = 1;
function toggleSpeed(): void {
  simSpeed = simSpeed === 1 ? 3 : 1;
}
// AFTER createHud — the HUD build wipes #hud's children, and the radar canvas
// lives inside #hud (was created first once; drew to a detached canvas forever)
const radar = createRadar();
const radarRight = new THREE.Vector3();

// siren on volley start (§6.2) — watch for the sim-side transition
let volleyWasActive = false;
let lastCoreHp = state.cores.reduce((sum, core) => sum + core.hp, 0);
let lastPhase = state.phase;
const heardTracers = new Set<object>();
const heardBlastEffects = new Set<object>();
const heardInterceptBlasts = new Set<object>();
const heardShells = new Set<number>();
const heardInterceptors = new Set<number>();
const heardEnemies = new Set<number>();

function syncAudioEvents(): void {
  for (const tracer of state.effects.tracers) {
    if (!heardTracers.has(tracer)) {
      heardTracers.add(tracer);
      audio.gun();
    }
  }
  for (const effect of state.effects.blasts) {
    if (!heardBlastEffects.has(effect)) {
      heardBlastEffects.add(effect);
      if (effect.kind !== "bossBay") audio.blast(effect.kind === "impact" ? 0.9 : 0.75);
    }
  }
  for (const blast of state.interceptBlasts) {
    if (!heardInterceptBlasts.has(blast)) {
      heardInterceptBlasts.add(blast);
      audio.blast(1.25);
    }
  }
  for (const shell of state.shells) {
    if (!heardShells.has(shell.id)) {
      heardShells.add(shell.id);
      audio.flak();
    }
  }
  for (const interceptor of state.interceptors) {
    if (!heardInterceptors.has(interceptor.id)) {
      heardInterceptors.add(interceptor.id);
      audio.launch();
    }
  }
  for (const enemy of state.enemies) {
    if (!heardEnemies.has(enemy.id)) {
      heardEnemies.add(enemy.id);
      if (enemy.defId === "ufo") audio.ufo();
    }
  }

  const coreHp = state.cores.reduce((sum, core) => sum + core.hp, 0);
  if (coreHp < lastCoreHp) audio.coreHit(coresAlive(state) < Math.ceil(lastCoreHp / 2));
  lastCoreHp = coreHp;

  if (lastPhase === "combat" && state.phase === "build") audio.roundClear();
  lastPhase = state.phase;

  pruneObjectSet(heardTracers, state.effects.tracers);
  pruneObjectSet(heardBlastEffects, state.effects.blasts);
  pruneObjectSet(heardInterceptBlasts, state.interceptBlasts);
}

function pruneObjectSet<T extends object>(set: Set<T>, live: T[]): void {
  const liveSet = new Set(live);
  for (const item of set) {
    if (!liveSet.has(item)) set.delete(item);
  }
}

window.addEventListener("keydown", (ev) => {
  if (["Enter", "Tab", "KeyX"].includes(ev.code)) audio.unlock();
  if (ev.code === "Enter") startRound(state);
  if (ev.code === "Tab") {
    ev.preventDefault(); // TAB toggles views (§10), never moves browser focus
    coordView.toggle(state);
  }
  if (ev.code === "KeyX") toggleSpeed();
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

  accumulator += frameDt * simSpeed;
  while (accumulator >= SIM_DT) {
    simTick(state, SIM_DT);
    accumulator -= SIM_DT;
  }
  updateHighScore();

  const volleyOn = state.volley !== null;
  if (volleyOn && !volleyWasActive) {
    audio.siren();
    simSpeed = 1; // missiles are the drama — never let them arrive at 3×
  }
  volleyWasActive = volleyOn;
  syncAudioEvents();

  // map mode: orbit camera as usual. Coordinate mode: the view owns the
  // camera (and clicks aim instead of placing) — but the SIM NEVER PAUSES.
  const azimuth = orbit.take(frameDt);
  placement.enabled = coordView.isMapMode();
  if (coordView.isMapMode()) iso.update(frameDt, azimuth);
  coordView.update(frameDt, state);

  sync.sync(state);
  hud.update(state, placement.selection, placement.selectedTowerId, coordView.hudInfo(state), {
    open: settings.open,
    simSpeed,
    volume: settings.volume,
    highScore,
  });

  // radar lateral axis: volley frame in coordinate view, else screen-right
  const frameRight = coordView.lateralRight();
  if (frameRight) radarRight.copy(frameRight);
  else radarRight.setFromMatrixColumn(iso.camera.matrixWorld, 0).setY(0).normalize();
  radar.draw(state, radarRight);

  if (coordView.isMapMode()) renderer.render(world.scene, iso.camera);
  else coordView.render(renderer, world.scene);
}
requestAnimationFrame(frame);
