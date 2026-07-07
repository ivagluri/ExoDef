import { MOTHERSHIP } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { killEnemy } from "./enemies";
import type { Enemy, GameState, Tower } from "./state";

// Auto-fire (GAME-DESIGN.md §3: pure TD — the player never aims towers).

const MUZZLE_HEIGHT = 6;

function pickTarget(state: GameState, tower: Tower, range: number, maxAlt: number): Enemy | null {
  let best: Enemy | null = null;
  let bestKey = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const hull = enemy.defId === "mothership" ? MOTHERSHIP.hullRadius : 0;
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
