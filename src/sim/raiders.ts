import * as THREE from "three";
import { BOMBER, DIVER, ENEMY_DEFS, UFO } from "../content/enemies";
import { detonateAt } from "./enemies";
import { pick, rand, randRange } from "./rng";
import type { Enemy, EnemyAI, GameState } from "./state";

// Individually-moving enemies (GAME-DESIGN.md §5):
//   bomber — seeks a city/tower, hovers above it, drops bombs
//   diver  — cruises briefly at HIGH, then plunges kamikaze-style
//   ufo    — harmless high-altitude cash piñata transit

function makeEnemy(state: GameState, defId: string, pos: THREE.Vector3, ai: EnemyAI): Enemy {
  const enemy: Enemy = {
    id: state.nextId++,
    defId,
    hp: ENEMY_DEFS[defId].hp,
    pos,
    alive: true,
    groupId: null,
    ai,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnBomber(state: GameState): void {
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
  });
}

export function spawnDiver(state: GameState): void {
  const pos = new THREE.Vector3(randRange(-70, 70), DIVER.spawnY, randRange(-70, 70));
  makeEnemy(state, "diver", pos, {
    mode: "cruise",
    timer: DIVER.cruiseTime + rand() * 2,
    vel: new THREE.Vector3(randRange(-1, 1), 0, randRange(-1, 1)).normalize().multiplyScalar(DIVER.cruiseSpeed),
    target: new THREE.Vector3(),
  });
}

export function spawnUfo(state: GameState): void {
  const dir = rand() < 0.5 ? 1 : -1;
  const pos = new THREE.Vector3(-UFO.edgeX * dir, UFO.altitude, randRange(-60, 60));
  makeEnemy(state, "ufo", pos, {
    mode: "transit",
    timer: 0,
    vel: new THREE.Vector3(UFO.speed * dir, 0, 0),
    target: new THREE.Vector3(),
  });
}

/** Pick a structure target; returns false if nothing is left to attack. */
function acquireTarget(state: GameState, ai: EnemyAI, cityChance: number): boolean {
  const cities = state.cities.filter((c) => c.hp > 0);
  const towers = state.towers.filter((t) => t.alive);
  const wantCity = rand() < cityChance ? cities.length > 0 : cities.length > 0 && towers.length === 0;
  if (wantCity) {
    const city = pick(cities);
    ai.targetKind = "city";
    ai.targetId = city.index;
    ai.target.copy(city.pos);
    return true;
  }
  if (towers.length > 0) {
    const tower = pick(towers);
    ai.targetKind = "tower";
    ai.targetId = tower.id;
    ai.target.copy(tower.pos);
    return true;
  }
  if (cities.length > 0) {
    const city = pick(cities);
    ai.targetKind = "city";
    ai.targetId = city.index;
    ai.target.copy(city.pos);
    return true;
  }
  return false;
}

function targetAlive(state: GameState, ai: EnemyAI): boolean {
  if (ai.targetKind === "city") return state.cities[ai.targetId!]?.hp > 0;
  if (ai.targetKind === "tower") return state.towers.find((t) => t.id === ai.targetId)?.alive === true;
  return false;
}

function updateBomber(state: GameState, enemy: Enemy, dt: number): void {
  const ai = enemy.ai!;
  if (ai.mode !== "approach" && !targetAlive(state, ai)) ai.mode = "approach";

  if (ai.mode === "approach") {
    if (!targetAlive(state, ai) && !acquireTarget(state, ai, BOMBER.cityTargetChance)) {
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

export function updateRaiders(state: GameState, dt: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.ai) continue;
    if (enemy.defId === "bomber") updateBomber(state, enemy, dt);
    else if (enemy.defId === "diver") updateDiver(state, enemy, dt);
    else if (enemy.defId === "ufo") updateUfo(enemy, dt);
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
