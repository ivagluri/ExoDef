import * as THREE from "three";
import { MOTHERSHIP } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { killEnemy } from "./enemies";
import type { Enemy, GameState, Tower } from "./state";

// Auto-fire (GAME-DESIGN.md §3: pure TD — the player never aims towers).

const MUZZLE_HEIGHT = 6;
const DRONE_IDLE_HEIGHT = 9;

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
    if (!enemy.alive) continue;
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
  state.effects.tracers.push({
    from: tower.pos.clone().setY(MUZZLE_HEIGHT + 3),
    to: enemy.pos.clone(),
    ttl: 0.22,
    kind: "repulsor",
  });
}

export function updateTowers(state: GameState, dt: number): void {
  for (const tower of state.towers) {
    if (!tower.alive) continue;
    const tier = TOWER_DEFS[tower.defId].tiers[tower.tier];
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
    }
  }
}

export function updateShells(state: GameState, dt: number): void {
  for (const shell of state.shells) {
    if (!shell.alive) continue;
    const toTarget = shell.target.clone().sub(shell.pos);
    const step = shell.speed * dt;
    if (toTarget.length() <= step) {
      shell.alive = false;
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
  state.drones = state.drones.filter((d) => d.alive);
  state.enemies = state.enemies.filter((e) => e.alive);
}
