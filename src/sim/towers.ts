import * as THREE from "three";
import { MOTHERSHIP } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { killEnemy } from "./enemies";
import type { Enemy, GameState, Tower } from "./state";

// Auto-fire (GAME-DESIGN.md §3: pure TD — the player never aims towers).

const MUZZLE_HEIGHT = 6;
const DRONE_IDLE_HEIGHT = 9;
const DRONE_SEPARATION = 4.2;

function enemyHull(enemy: Enemy): number {
  return enemy.defId === "mothership" ? MOTHERSHIP.hullRadius : 0;
}

function pickTarget(
  state: GameState,
  tower: Tower,
  range: number,
  maxAlt: number,
  predicate: (enemy: Enemy) => boolean = () => true,
): Enemy | null {
  let best: Enemy | null = null;
  let bestKey = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.hacked) continue; // hacked units fight for us now
    if (!predicate(enemy)) continue;
    const hull = enemyHull(enemy);
    if (enemy.pos.y - hull > maxAlt) continue;
    const dist = Math.max(0, tower.pos.distanceTo(enemy.pos) - hull);
    if (dist > range) continue;
    const key =
      tower.priority === "first" ? enemy.pos.y :
      tower.priority === "strong" ? -enemy.hp :
      dist;
    if (key < bestKey) {
      bestKey = key;
      best = enemy;
    }
  }
  return best;
}

function targetById(state: GameState, id: number): Enemy | null {
  return state.enemies.find((e) => e.id === id && e.alive) ?? null;
}

function enemyRepulsed(state: GameState, enemy: Enemy): boolean {
  if (enemy.groupId !== null) {
    return (state.groups.find((g) => g.id === enemy.groupId)?.repulse?.ttl ?? 0) > 0;
  }
  return (enemy.repulse?.ttl ?? 0) > 0;
}

function applyRepulse(state: GameState, tower: Tower, enemy: Enemy, duration: number, liftSpeed: number): void {
  if (enemy.groupId !== null) {
    const group = state.groups.find((g) => g.id === enemy.groupId);
    if (group) group.repulse = { ttl: duration, liftSpeed };
  } else {
    enemy.repulse = { ttl: duration, liftSpeed };
    if (enemy.defId === "bomber" && enemy.ai?.mode === "bombing") {
      enemy.ai.mode = "approach";
      enemy.ai.timer = 0;
    }
  }
  state.effects.repulseBeams.push({
    towerId: tower.id,
    enemyId: enemy.id,
    ttl: duration,
    maxTtl: duration,
  });
}

export function updateTowers(state: GameState, dt: number): void {
  for (const tower of state.towers) {
    if (!tower.alive) continue;
    const tier = TOWER_DEFS[tower.defId].tiers[tower.tier];
    if (tier.barrier || tier.nuke) continue; // support towers don't auto-fire
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    const target = pickTarget(state, tower, tier.rangeRadius, tier.maxAltitude);
    if (!target) continue;

    if (tier.shot) {
      // direct fire: instant hit + tracer visual
      tower.cooldown = tier.shot.period;
      target.hp -= tier.shot.damage;
      state.effects.tracers.push({
        from: tower.pos.clone().setY(MUZZLE_HEIGHT),
        to: target.pos.clone(),
        ttl: 0.09,
      });
      if (target.hp <= 0) killEnemy(state, target);
    } else if (tier.burst) {
      // aoe: shell travels to the target's current position, bursts on arrival
      tower.cooldown = tier.burst.period;
      state.shells.push({
        id: state.nextId++,
        pos: tower.pos.clone().setY(MUZZLE_HEIGHT),
        target: target.pos.clone(),
        speed: tier.burst.shellSpeed,
        damage: tier.burst.damage,
        aoeRadius: tier.burst.aoeRadius,
        alive: true,
      });
    } else if (tier.repulsor) {
      const repulseTarget = pickTarget(
        state,
        tower,
        tier.rangeRadius,
        tier.maxAltitude,
        (enemy) => enemy.defId !== "mothership" && !enemyRepulsed(state, enemy),
      );
      if (!repulseTarget) continue;
      tower.cooldown = tier.repulsor.cooldown;
      applyRepulse(state, tower, repulseTarget, tier.repulsor.duration, tier.repulsor.liftSpeed);
    } else if (tier.guided) {
      tower.cooldown = tier.guided.period;
      state.aaMissiles.push({
        id: state.nextId++,
        pos: tower.pos.clone().setY(MUZZLE_HEIGHT + 1),
        targetId: target.id,
        speed: tier.guided.speed,
        damage: tier.guided.damage,
        alive: true,
      });
    } else if (tier.cloud) {
      // napalm: lobbed canister → lingering chip-damage cloud at the target point
      tower.cooldown = tier.cloud.period;
      state.shells.push({
        id: state.nextId++,
        pos: tower.pos.clone().setY(MUZZLE_HEIGHT),
        target: target.pos.clone(),
        speed: tier.cloud.shellSpeed,
        damage: 0,
        aoeRadius: 0,
        alive: true,
        cloud: { radius: tier.cloud.cloudRadius, duration: tier.cloud.cloudDuration, dps: tier.cloud.dps },
      });
    } else if (tier.hack) {
      // hack array: convert one invader into a one-run kamikaze (§4/§5).
      // Needs a second enemy to ram — don't waste the cooldown on a lone target.
      const others = state.enemies.filter((e) => e.alive && !e.hacked).length;
      if (others < 2) continue;
      const hackTarget = pickTarget(
        state,
        tower,
        tier.rangeRadius,
        tier.maxAltitude,
        (enemy) => enemy.defId !== "mothership",
      );
      if (!hackTarget) continue;
      tower.cooldown = tier.hack.cooldown;
      hackTarget.hacked = {
        targetId: null,
        speed: tier.hack.kamikazeSpeed,
        damage: tier.hack.damage,
        aoeRadius: tier.hack.aoeRadius,
      };
      // grouped grunts leave their formation when converted
      if (hackTarget.groupId !== null) {
        const group = state.groups.find((g) => g.id === hackTarget.groupId);
        if (group) group.members = group.members.filter((m) => m.enemyId !== hackTarget.id);
        hackTarget.groupId = null;
      }
      state.effects.blasts.push({ pos: hackTarget.pos.clone(), radius: 5, ttl: 0.3, maxTtl: 0.3, kind: "bossBay" });
      state.effects.hackBeams.push({ towerId: tower.id, enemyId: hackTarget.id, ttl: 0.7, maxTtl: 0.7 });
    }
  }
}

const BARRIER_HEIGHT = 10;

/** Blockade barriers (§4): deploy over the nearest uncovered live core in range
 *  (or over the tower), then soak descending impacts — landings, plunges, falling
 *  bombs — one charge each. Warheads pass through (interception stays player-plotted). */
export function updateBarriers(state: GameState, dt: number): void {
  // maintain: each blockade tower builds toward its barrier cap
  for (const tower of state.towers) {
    if (!tower.alive) continue;
    const spec = TOWER_DEFS[tower.defId].tiers[tower.tier].barrier;
    if (!spec) continue;
    const owned = state.barriers.filter((b) => b.alive && b.towerId === tower.id);
    if (owned.length >= spec.count) {
      tower.barrierTimer = spec.rebuildTime; // next one is ready the moment a slot opens
      continue;
    }
    tower.barrierTimer = (tower.barrierTimer ?? spec.rebuildTime) + dt;
    if (tower.barrierTimer < spec.rebuildTime) continue;
    tower.barrierTimer = 0;
    // nearest live core in range without one of this tower's barriers already overhead
    const spot = state.cores
      .filter((c) => c.hp > 0 && c.pos.distanceTo(tower.pos) <= TOWER_DEFS[tower.defId].tiers[tower.tier].rangeRadius)
      .filter((c) => !owned.some((b) => Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z) < 2))
      .sort((a, b) => a.pos.distanceTo(tower.pos) - b.pos.distanceTo(tower.pos))[0]?.pos ?? tower.pos;
    state.barriers.push({
      id: state.nextId++,
      towerId: tower.id,
      pos: spot.clone().setY(BARRIER_HEIGHT),
      hp: spec.hp,
      maxHp: spec.hp,
      radius: spec.radius,
      alive: true,
    });
  }

  // orphans die with their tower
  for (const barrier of state.barriers) {
    if (barrier.alive && !state.towers.some((t) => t.id === barrier.towerId && t.alive)) barrier.alive = false;
  }

  // soak: anything descending through the plate is absorbed (no bounty — it
  // wasn't shot down). Hacked units are ours and pass through. Warheads never checked.
  for (const barrier of state.barriers) {
    if (!barrier.alive) continue;
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.hacked) continue;
      if (enemy.defId === "mothership") continue; // the hulk crushes past, barriers don't stop bosses
      if (enemy.pos.y > barrier.pos.y) continue;
      if (Math.hypot(enemy.pos.x - barrier.pos.x, enemy.pos.z - barrier.pos.z) > barrier.radius) continue;
      enemy.alive = false;
      barrier.hp--;
      state.effects.blasts.push({ pos: enemy.pos.clone(), radius: 4, ttl: 0.3, maxTtl: 0.3, kind: "flak" });
      if (barrier.hp <= 0) break;
    }
    if (barrier.hp > 0) {
      for (const bomb of state.bombs) {
        if (!bomb.alive || bomb.pos.y > barrier.pos.y) continue;
        if (Math.hypot(bomb.pos.x - barrier.pos.x, bomb.pos.z - barrier.pos.z) > barrier.radius) continue;
        bomb.alive = false;
        barrier.hp--;
        state.effects.blasts.push({ pos: bomb.pos.clone(), radius: 4, ttl: 0.3, maxTtl: 0.3, kind: "flak" });
        if (barrier.hp <= 0) break;
      }
    }
    if (barrier.hp <= 0) {
      barrier.alive = false;
      state.effects.blasts.push({ pos: barrier.pos.clone(), radius: barrier.radius, ttl: 0.5, maxTtl: 0.5, kind: "impact" });
    }
  }
  state.barriers = state.barriers.filter((b) => b.alive);
  state.bombs = state.bombs.filter((b) => b.alive);
  state.enemies = state.enemies.filter((e) => e.alive);
}

/** Napalm clouds (§4): chip DPS to every invader inside; warheads untouched
 *  by construction (clouds only ever scan state.enemies). */
export function updateClouds(state: GameState, dt: number): void {
  for (const cloud of state.clouds) {
    cloud.ttl -= dt;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dist = Math.max(0, cloud.pos.distanceTo(enemy.pos) - enemyHull(enemy));
      if (dist > cloud.radius) continue;
      enemy.hp -= cloud.dps * dt;
      if (enemy.hp <= 0) killEnemy(state, enemy);
    }
  }
  state.clouds = state.clouds.filter((c) => c.ttl > 0);
  state.enemies = state.enemies.filter((e) => e.alive);
}

export function updateShells(state: GameState, dt: number): void {
  for (const shell of state.shells) {
    if (!shell.alive) continue;
    const toTarget = shell.target.clone().sub(shell.pos);
    const step = shell.speed * dt;
    if (toTarget.length() <= step) {
      shell.alive = false;
      if (shell.cloud) {
        // napalm canister: ignite a lingering cloud instead of an instant blast
        state.clouds.push({
          pos: shell.target.clone(),
          radius: shell.cloud.radius,
          ttl: shell.cloud.duration,
          maxTtl: shell.cloud.duration,
          dps: shell.cloud.dps,
        });
        continue;
      }
      state.effects.blasts.push({
        pos: shell.target.clone(),
        radius: shell.aoeRadius,
        ttl: 0.5,
        maxTtl: 0.5,
        kind: "flak",
      });
      for (const enemy of state.enemies) {
        if (enemy.alive && enemy.pos.distanceTo(shell.target) <= shell.aoeRadius) {
          enemy.hp -= shell.damage;
          if (enemy.hp <= 0) killEnemy(state, enemy);
        }
      }
      state.enemies = state.enemies.filter((e) => e.alive);
    } else {
      shell.pos.addScaledVector(toTarget.normalize(), step);
    }
  }
  state.shells = state.shells.filter((s) => s.alive);
}

export function updateAAMissiles(state: GameState, dt: number): void {
  for (const missile of state.aaMissiles) {
    if (!missile.alive) continue;
    const target = targetById(state, missile.targetId);
    if (!target) {
      missile.alive = false;
      continue;
    }
    const toTarget = target.pos.clone().sub(missile.pos);
    const hitRadius = enemyHull(target) + 3;
    const step = missile.speed * dt;
    if (toTarget.length() <= step + hitRadius) {
      missile.alive = false;
      target.hp -= missile.damage;
      state.effects.blasts.push({
        pos: target.pos.clone(),
        radius: target.defId === "mothership" ? 8 : 4,
        ttl: 0.28,
        maxTtl: 0.28,
        kind: "flak",
      });
      if (target.hp <= 0) killEnemy(state, target);
    } else {
      missile.pos.addScaledVector(toTarget.normalize(), step);
    }
  }
  state.aaMissiles = state.aaMissiles.filter((m) => m.alive);
  state.enemies = state.enemies.filter((e) => e.alive);
}

function droneTower(state: GameState, towerId: number): Tower | null {
  const tower = state.towers.find((t) => t.id === towerId && t.alive && TOWER_DEFS[t.defId].tiers[t.tier].drone);
  return tower ?? null;
}

function maintainDrones(state: GameState): void {
  for (const tower of state.towers) {
    if (!tower.alive) continue;
    const tier = TOWER_DEFS[tower.defId].tiers[tower.tier];
    if (!tier.drone) continue;
    const owned = state.drones.filter((d) => d.alive && d.towerId === tower.id);
    while (owned.length < tier.drone.count) {
      const angle = (owned.length / Math.max(1, tier.drone.count)) * Math.PI * 2;
      const pos = tower.pos.clone().add(new THREE.Vector3(Math.cos(angle) * 5, DRONE_IDLE_HEIGHT, Math.sin(angle) * 5));
      const drone = { id: state.nextId++, towerId: tower.id, pos, targetId: null, cooldown: 0, alive: true };
      state.drones.push(drone);
      owned.push(drone);
    }
    for (let i = tier.drone.count; i < owned.length; i++) owned[i].alive = false;
  }
  for (const drone of state.drones) {
    if (!droneTower(state, drone.towerId)) drone.alive = false;
  }
}

function acquireDroneTarget(state: GameState, tower: Tower): Enemy | null {
  const tier = TOWER_DEFS[tower.defId].tiers[tower.tier];
  if (!tier.drone) return null;
  return pickTarget(state, tower, tier.rangeRadius, tier.maxAltitude);
}

function separateDrones(state: GameState): void {
  const minDist = DRONE_SEPARATION;
  for (let i = 0; i < state.drones.length; i++) {
    const a = state.drones[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < state.drones.length; j++) {
      const b = state.drones[j];
      if (!b.alive) continue;
      const delta = a.pos.clone().sub(b.pos);
      let dist = delta.length();
      if (dist >= minDist) continue;
      if (dist < 0.001) {
        delta.set(Math.cos(a.id + b.id), 0.2, Math.sin(a.id - b.id));
        dist = delta.length();
      }
      const push = (minDist - dist) * 0.5;
      delta.multiplyScalar(push / dist);
      a.pos.add(delta);
      b.pos.sub(delta);
    }
  }
}

export function updateDrones(state: GameState, dt: number): void {
  maintainDrones(state);
  for (const drone of state.drones) {
    if (!drone.alive) continue;
    const tower = droneTower(state, drone.towerId);
    if (!tower) {
      drone.alive = false;
      continue;
    }
    const tier = TOWER_DEFS[tower.defId].tiers[tower.tier];
    const spec = tier.drone!;
    let target = drone.targetId === null ? null : targetById(state, drone.targetId);
    if (!target || tower.pos.distanceTo(target.pos) > tier.rangeRadius + enemyHull(target) || target.pos.y > tier.maxAltitude + enemyHull(target)) {
      target = acquireDroneTarget(state, tower);
      drone.targetId = target?.id ?? null;
    }

    if (target) {
      const toTarget = target.pos.clone().sub(drone.pos);
      if (toTarget.length() > spec.attackRange) {
        drone.pos.addScaledVector(toTarget.normalize(), Math.min(spec.speed * dt, toTarget.length()));
      } else {
        drone.cooldown -= dt;
        if (drone.cooldown <= 0) {
          drone.cooldown = spec.period;
          target.hp -= spec.damage;
          state.effects.tracers.push({ from: drone.pos.clone(), to: target.pos.clone(), ttl: 0.08, kind: "drone" });
          if (target.hp <= 0) {
            killEnemy(state, target);
            drone.targetId = null;
          }
        }
      }
    } else {
      const idleAngle = state.simTime * 0.9 + drone.id;
      const idle = tower.pos.clone().add(new THREE.Vector3(Math.cos(idleAngle) * 7, DRONE_IDLE_HEIGHT, Math.sin(idleAngle) * 7));
      const toIdle = idle.sub(drone.pos);
      drone.pos.addScaledVector(toIdle.normalize(), Math.min(spec.speed * dt, toIdle.length()));
      drone.cooldown = Math.max(0, drone.cooldown - dt);
    }
  }
  separateDrones(state);
  state.drones = state.drones.filter((d) => d.alive);
  state.enemies = state.enemies.filter((e) => e.alive);
}
