import * as THREE from "three";
import { MOTHERSHIP } from "../balance";
import { BOMBER, DIVER, ENEMY_DEFS, UFO } from "../content/enemies";
import { detonateAt, spawnGruntGroup } from "./enemies";
import { pick, rand, randRange } from "./rng";
import type { Enemy, EnemyAI, GameState } from "./state";

// Individually-moving enemies (GAME-DESIGN.md §5):
//   bomber — seeks a core/tower, hovers above it, drops bombs
//   diver  — cruises briefly at HIGH, then plunges kamikaze-style
//   ufo    — harmless high-altitude cash piñata transit

function makeEnemy(state: GameState, defId: string, pos: THREE.Vector3, ai: EnemyAI, hpScale = 1): Enemy {
  const enemy: Enemy = {
    id: state.nextId++,
    defId,
    hp: Math.ceil(ENEMY_DEFS[defId].hp * hpScale),
    pos,
    alive: true,
    groupId: null,
    ai,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnBomber(state: GameState, hpScale = 1): void {
  const angle = rand() * Math.PI * 2;
  const pos = new THREE.Vector3(
    Math.cos(angle) * BOMBER.spawnRadius,
    BOMBER.spawnY,
    Math.sin(angle) * BOMBER.spawnRadius,
  );
  makeEnemy(state, "bomber", pos, {
    mode: "approach",
    timer: 0,
    vel: new THREE.Vector3(),
    target: new THREE.Vector3(),
  }, hpScale);
}

export function spawnDiver(state: GameState, hpScale = 1, origin?: THREE.Vector3): void {
  const pos = origin?.clone() ?? new THREE.Vector3(randRange(-70, 70), DIVER.spawnY, randRange(-70, 70));
  makeEnemy(state, "diver", pos, {
    mode: "cruise",
    timer: DIVER.cruiseTime + rand() * 2,
    vel: new THREE.Vector3(randRange(-1, 1), 0, randRange(-1, 1)).normalize().multiplyScalar(DIVER.cruiseSpeed),
    target: new THREE.Vector3(),
  }, hpScale);
}

export function spawnUfo(state: GameState, hpScale = 1): void {
  const dir = rand() < 0.5 ? 1 : -1;
  const pos = new THREE.Vector3(-UFO.edgeX * dir, UFO.altitude, randRange(-60, 60));
  makeEnemy(state, "ufo", pos, {
    mode: "transit",
    timer: 0,
    vel: new THREE.Vector3(UFO.speed * dir, 0, 0),
    target: new THREE.Vector3(),
  }, hpScale);
}

export function spawnMothership(state: GameState, hpScale = 1): void {
  const pos = new THREE.Vector3(0, MOTHERSHIP.spawnY, 0);
  makeEnemy(state, "mothership", pos, {
    mode: "boss",
    timer: 0,
    vel: new THREE.Vector3(randRange(-1, 1), 0, randRange(-1, 1)).normalize().multiplyScalar(MOTHERSHIP.driftSpeed),
    target: new THREE.Vector3(),
    emitTimer: MOTHERSHIP.emitFirstDelay,
    emitCount: 0,
    bombTimer: MOTHERSHIP.bombPeriod,
    hpScale,
  }, hpScale);
}

/** Pick a structure target; returns false if nothing is left to attack. */
function acquireTarget(state: GameState, ai: EnemyAI, coreChance: number): boolean {
  const cores = state.cores.filter((c) => c.hp > 0);
  const towers = state.towers.filter((t) => t.alive);
  const wantCore = rand() < coreChance ? cores.length > 0 : cores.length > 0 && towers.length === 0;
  if (wantCore) {
    const core = pick(cores);
    ai.targetKind = "core";
    ai.targetId = core.index;
    ai.target.copy(core.pos);
    return true;
  }
  if (towers.length > 0) {
    const tower = pick(towers);
    ai.targetKind = "tower";
    ai.targetId = tower.id;
    ai.target.copy(tower.pos);
    return true;
  }
  if (cores.length > 0) {
    const core = pick(cores);
    ai.targetKind = "core";
    ai.targetId = core.index;
    ai.target.copy(core.pos);
    return true;
  }
  return false;
}

function targetAlive(state: GameState, ai: EnemyAI): boolean {
  if (ai.targetKind === "core") return state.cores[ai.targetId!]?.hp > 0;
  if (ai.targetKind === "tower") return state.towers.find((t) => t.id === ai.targetId)?.alive === true;
  return false;
}

function updateBomber(state: GameState, enemy: Enemy, dt: number): void {
  const ai = enemy.ai!;
  if (ai.mode !== "approach" && !targetAlive(state, ai)) ai.mode = "approach";

  if (ai.mode === "approach") {
    if (!targetAlive(state, ai) && !acquireTarget(state, ai, BOMBER.coreTargetChance)) {
      return; // nothing left to bomb; drift until the round resolves
    }
    const hover = ai.target.clone().setY(BOMBER.hoverAltitude);
    const to = hover.sub(enemy.pos);
    const step = BOMBER.speed * dt;
    if (to.length() <= step + 1) {
      ai.mode = "bombing";
      ai.timer = BOMBER.bombPeriod * 0.5; // first bomb comes quickly
    } else {
      enemy.pos.addScaledVector(to.normalize(), step);
    }
  } else if (ai.mode === "bombing") {
    enemy.pos.y = BOMBER.hoverAltitude + Math.sin(state.simTime * 1.3 + enemy.id) * 1.5;
    ai.timer -= dt;
    if (ai.timer <= 0) {
      ai.timer = BOMBER.bombPeriod;
      state.bombs.push({ id: state.nextId++, pos: enemy.pos.clone(), alive: true });
    }
  }
}

function updateDiver(state: GameState, enemy: Enemy, dt: number): void {
  const ai = enemy.ai!;
  if (ai.mode === "cruise") {
    enemy.pos.addScaledVector(ai.vel, dt);
    ai.timer -= dt;
    if (ai.timer <= 0) {
      if (!acquireTarget(state, ai, 0.5)) return;
      ai.vel = ai.target.clone().setY(0).sub(enemy.pos).normalize().multiplyScalar(DIVER.plungeSpeed);
      ai.mode = "plunge";
    }
  } else {
    enemy.pos.addScaledVector(ai.vel, dt);
    if (enemy.pos.y <= 1) {
      enemy.alive = false; // no bounty for impacts
      detonateAt(state, enemy.pos.setY(0), DIVER.blastRadius);
    }
  }
}

function updateUfo(enemy: Enemy, dt: number): void {
  const ai = enemy.ai!;
  enemy.pos.addScaledVector(ai.vel, dt);
  enemy.pos.y = UFO.altitude + Math.sin(enemy.pos.x * 0.08) * 2;
  if (Math.abs(enemy.pos.x) > UFO.edgeX) enemy.alive = false; // escaped, no bounty
}

function randomLiveStructure(state: GameState): THREE.Vector3 | null {
  const cores = state.cores.filter((c) => c.hp > 0).map((c) => c.pos);
  const towers = state.towers.filter((t) => t.alive).map((t) => t.pos);
  const targets = [...cores, ...towers];
  return targets.length > 0 ? pick(targets) : null;
}

function emitFromBoss(state: GameState, enemy: Enemy): void {
  const ai = enemy.ai!;
  const scale = ai.hpScale ?? 1;
  ai.emitCount = (ai.emitCount ?? 0) + 1;
  const side = ai.emitCount % 2 === 0 ? -1 : 1;
  const origin = enemy.pos.clone().add(new THREE.Vector3(side * 22, -3, randRange(-5, 5)));
  state.effects.blasts.push({ pos: origin.clone(), radius: 6, ttl: 0.22, maxTtl: 0.22, kind: "bossBay" });
  const grunts = MOTHERSHIP.emitGrunts + Math.floor((scale - 1) * MOTHERSHIP.emitGruntGrowth);
  spawnGruntGroup(
    state,
    grunts,
    Math.max(1, scale * MOTHERSHIP.emittedHpScale),
    MOTHERSHIP.emittedSpeedScale,
    origin,
  );
  if (ai.emitCount % MOTHERSHIP.emitDiverEvery === 0) {
    spawnDiver(state, Math.max(1, scale * MOTHERSHIP.emittedHpScale), origin.clone().setY(Math.max(70, enemy.pos.y - 12)));
  }
  toastBoss(state, `${grunts}${ai.emitCount % MOTHERSHIP.emitDiverEvery === 0 ? "+1" : ""} RAIDERS LAUNCHED`);
}

function toastBoss(state: GameState, text: string): void {
  if (state.messageTtl <= 0.2 || !state.message.includes("MISSILE")) {
    state.message = `MOTHERSHIP — ${text}`;
    state.messageTtl = 2.5;
  }
}

function updateMothership(state: GameState, enemy: Enemy, dt: number): void {
  const ai = enemy.ai!;
  const dist = Math.hypot(enemy.pos.x, enemy.pos.z);
  if (dist > MOTHERSHIP.homeRadius) {
    ai.vel.set(-enemy.pos.x, 0, -enemy.pos.z).normalize().multiplyScalar(MOTHERSHIP.driftSpeed);
  } else if (state.tick % 180 === 0) {
    ai.vel.set(randRange(-1, 1), 0, randRange(-1, 1)).normalize().multiplyScalar(MOTHERSHIP.driftSpeed);
  }
  enemy.pos.addScaledVector(ai.vel, dt);
  enemy.pos.y = Math.max(MOTHERSHIP.floorY, enemy.pos.y - MOTHERSHIP.descentSpeed * dt);

  ai.emitTimer = (ai.emitTimer ?? MOTHERSHIP.emitPeriod) - dt;
  if (ai.emitTimer <= 0) {
    const scale = ai.hpScale ?? 1;
    ai.emitTimer = Math.max(MOTHERSHIP.emitPeriodMin, MOTHERSHIP.emitPeriod / Math.sqrt(scale));
    emitFromBoss(state, enemy);
  }

  if (enemy.pos.y <= MOTHERSHIP.bombAltitude) {
    ai.bombTimer = (ai.bombTimer ?? MOTHERSHIP.bombPeriod) - dt;
    if (ai.bombTimer <= 0) {
      ai.bombTimer = MOTHERSHIP.bombPeriod;
      const target = randomLiveStructure(state);
      if (target) state.bombs.push({ id: state.nextId++, pos: target.clone().setY(enemy.pos.y - 8), alive: true });
    }
  }
}

export function updateRaiders(state: GameState, dt: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.ai) continue;
    if (enemy.defId === "bomber") updateBomber(state, enemy, dt);
    else if (enemy.defId === "diver") updateDiver(state, enemy, dt);
    else if (enemy.defId === "ufo") updateUfo(enemy, dt);
    else if (enemy.defId === "mothership") updateMothership(state, enemy, dt);
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}

export function updateBombs(state: GameState, dt: number): void {
  for (const bomb of state.bombs) {
    bomb.pos.y -= BOMBER.bombFallSpeed * dt;
    if (bomb.pos.y <= 0) {
      bomb.alive = false;
      detonateAt(state, bomb.pos.setY(0), BOMBER.bombSplash);
    }
  }
  state.bombs = state.bombs.filter((b) => b.alive);
}
