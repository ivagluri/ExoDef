import * as THREE from "three";
import { CORE_RADIUS, GRUNT } from "../balance";
import { ENEMY_DEFS, SPLITTER, SWARM } from "../content/enemies";
import { rand } from "./rng";
import { coresAlive, toast, type Enemy, type GameState, type GruntGroup } from "./state";

// Grunt swarm behavior (GAME-DESIGN.md §5): loose group dives to the formation
// band, then meanders organically while sinking. Landing = ground detonation.
// Phase 7: swarm clusters reuse the same group machinery with SWARM params.

interface GroupParams {
  defId: string;
  spawnY: number;
  formationTop: number;
  entryDiveSpeed: number;
  driftSpeed: number;
  sinkSpeed: number;
  sinkSwell: number;
  wanderTurn: number;
  boundRadius: number;
  spacing: number;
  bobAmp: number;
  bobFreq: number;
}

const GROUP_PARAMS: Record<GruntGroup["variant"], GroupParams> = {
  grunt: { defId: "grunt", ...GRUNT },
  swarm: { defId: "swarmling", ...SWARM },
};

function spawnGroup(state: GameState, variant: GruntGroup["variant"], count: number, hpScale: number, speedScale: number, origin?: THREE.Vector3): void {
  const params = GROUP_PARAMS[variant];
  const def = ENEMY_DEFS[params.defId];
  const groupId = state.nextId++;
  const cols = Math.min(count, variant === "swarm" ? 4 : 5);
  const anchorX = origin?.x ?? (rand() * 2 - 1) * 40;
  const anchorZ = origin?.z ?? (rand() * 2 - 1) * 65;
  const y = origin?.y ?? params.spawnY;
  const group: GruntGroup = {
    id: groupId,
    variant,
    y,
    anchorX,
    anchorZ,
    heading: rand() * Math.PI * 2,
    wanderSeed: rand() * Math.PI * 2,
    speedScale,
    repulse: undefined,
    members: [],
  };
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = (col - (cols - 1) / 2) * params.spacing + (rand() - 0.5) * 3;
    const dz = (row - Math.floor((count - 1) / cols) / 2) * params.spacing + (rand() - 0.5) * 3;
    const enemy: Enemy = {
      id: state.nextId++,
      defId: def.id,
      hp: Math.ceil(def.hp * hpScale),
      pos: new THREE.Vector3(anchorX + dx, y, anchorZ + dz),
      alive: true,
      groupId,
    };
    state.enemies.push(enemy);
    group.members.push({ enemyId: enemy.id, dx, dz, phase: rand() * Math.PI * 2 });
  }
  state.groups.push(group);
}

export function spawnGruntGroup(state: GameState, count: number, hpScale = 1, speedScale = 1, origin?: THREE.Vector3): void {
  spawnGroup(state, "grunt", count, hpScale, speedScale, origin);
}

export function spawnSwarmGroup(state: GameState, count: number, hpScale = 1, speedScale = 1, origin?: THREE.Vector3): void {
  spawnGroup(state, "swarm", count, hpScale, speedScale, origin);
}

/** Splitter burst (§5): fragments scatter outward and keep descending. */
export function spawnFragments(state: GameState, pos: THREE.Vector3, hpScale = 1): void {
  for (let i = 0; i < SPLITTER.fragmentCount; i++) {
    const angle = (i / SPLITTER.fragmentCount) * Math.PI * 2 + rand() * 0.8;
    state.enemies.push({
      id: state.nextId++,
      defId: "fragment",
      hp: Math.ceil(ENEMY_DEFS.fragment.hp * hpScale),
      pos: pos.clone().add(new THREE.Vector3(0, 1, 0)),
      alive: true,
      groupId: null,
      ai: {
        mode: "fragment",
        timer: 0,
        vel: new THREE.Vector3(
          Math.cos(angle) * SPLITTER.fragmentScatterSpeed,
          -SPLITTER.fragmentFallSpeed,
          Math.sin(angle) * SPLITTER.fragmentScatterSpeed,
        ),
        target: new THREE.Vector3(),
      },
    });
  }
}

export function killEnemy(state: GameState, enemy: Enemy): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  // splitters always burst — killing one just picks where (§5)
  if (enemy.defId === "splitter") spawnFragments(state, enemy.pos, enemy.ai?.hpScale ?? 1);
  if (enemy.hacked) return; // spent as hack-array ammo — no bounty
  const def = ENEMY_DEFS[enemy.defId];
  state.cash += def.bounty;
  state.score += def.bounty;
}

/** Ground detonation: destroys towers in radius, deals 1 hit to cores in radius. */
export function detonateAt(state: GameState, pos: THREE.Vector3, radius: number = GRUNT.detonateRadius, showEffect = true): void {
  if (showEffect) {
    state.effects.blasts.push({ pos: pos.clone().setY(2), radius, ttl: 0.55, maxTtl: 0.55, kind: "impact" });
  }
  for (const tower of state.towers) {
    if (tower.alive && tower.pos.distanceTo(pos) <= radius + 4) {
      tower.alive = false;
      toast(state, "TOWER DESTROYED");
    }
  }
  for (const core of state.cores) {
    if (core.hp > 0 && core.pos.distanceTo(pos) <= radius + CORE_RADIUS) {
      damageCore(state, core.index, 1);
    }
  }
}

export function damageCore(state: GameState, coreIndex: number, hits: number): void {
  const core = state.cores[coreIndex];
  if (core.hp <= 0) return;
  core.hp = Math.max(0, core.hp - hits);
  state.coresDirty = true;
  toast(state, core.hp > 0 ? "CORE HIT" : "CORE DESTROYED", 3.5);
  if (coresAlive(state) === 0) {
    state.phase = "gameover";
  }
}

// Organic swarm motion (playtest feedback): the group anchor meanders on a
// serpentine heading, steering home when it strays off-map; descent is a
// continuous swell rather than discrete steps; each member bobs on its own phase.
export function updateGroups(state: GameState, dt: number): void {
  const enemyById = new Map(state.enemies.map((e) => [e.id, e]));
  const t = state.simTime;
  for (const group of state.groups) {
    const p = GROUP_PARAMS[group.variant];
    group.members = group.members.filter((m) => enemyById.get(m.enemyId)?.alive);
    if (group.members.length === 0) continue;

    // serpentine wander, overridden by a steer toward center when out of bounds
    const dist = Math.hypot(group.anchorX, group.anchorZ);
    if (dist > p.boundRadius) {
      const home = Math.atan2(-group.anchorZ, -group.anchorX);
      let diff = home - group.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      group.heading += Math.sign(diff) * Math.min(Math.abs(diff), p.wanderTurn * 2 * dt);
    } else {
      group.heading += Math.sin(t * 0.35 + group.wanderSeed) * p.wanderTurn * dt;
    }
    group.anchorX += Math.cos(group.heading) * p.driftSpeed * dt;
    group.anchorZ += Math.sin(group.heading) * p.driftSpeed * dt;

    // Repulsor debuff: lift the formation briefly, then let normal descent resume.
    if (group.repulse && group.repulse.ttl > 0) {
      group.y = Math.min(p.formationTop, group.y + group.repulse.liftSpeed * dt);
      group.repulse.ttl -= dt;
    } else {
      group.repulse = undefined;
    }

    // descent: fast entry dive, then a slow sink whose rate swells and eases
    if (!group.repulse && group.y > p.formationTop) {
      group.y = Math.max(p.formationTop, group.y - p.entryDiveSpeed * group.speedScale * dt);
    } else if (!group.repulse) {
      const swell = 1 + p.sinkSwell * Math.sin(t * 0.4 + group.wanderSeed * 2);
      group.y -= p.sinkSpeed * group.speedScale * swell * dt;
    }

    const landed = group.y <= 0;
    if (landed) group.y = 0;
    for (const m of group.members) {
      const enemy = enemyById.get(m.enemyId)!;
      const wob = t * p.bobFreq + m.phase;
      enemy.pos.set(
        group.anchorX + m.dx + Math.sin(wob) * p.bobAmp,
        Math.max(0, group.y + Math.sin(wob * 1.4) * p.bobAmp * 0.8),
        group.anchorZ + m.dz + Math.cos(wob * 0.8) * p.bobAmp,
      );
      if (landed) {
        enemy.alive = false; // no bounty for landings
        if (group.variant === "swarm") swarmLandingAt(state, enemy.pos);
        else detonateAt(state, enemy.pos);
      }
    }
    if (landed) group.members = [];
  }
  state.groups = state.groups.filter((g) => g.members.length > 0);
  state.enemies = state.enemies.filter((e) => e.alive);
}

/** Swarm landing (§5): towers die as usual, but cores only take a charge —
 *  every SWARM.landingsPerCoreHit-th landing near a core deals 1 hit. */
function swarmLandingAt(state: GameState, pos: THREE.Vector3): void {
  state.effects.blasts.push({ pos: pos.clone().setY(1.5), radius: SWARM.detonateRadius, ttl: 0.4, maxTtl: 0.4, kind: "impact" });
  for (const tower of state.towers) {
    if (tower.alive && tower.pos.distanceTo(pos) <= SWARM.detonateRadius + 4) {
      tower.alive = false;
      toast(state, "TOWER DESTROYED");
    }
  }
  for (const core of state.cores) {
    if (core.hp > 0 && core.pos.distanceTo(pos) <= SWARM.detonateRadius + CORE_RADIUS) {
      core.swarmCharge++;
      if (core.swarmCharge >= SWARM.landingsPerCoreHit) {
        core.swarmCharge = 0;
        damageCore(state, core.index, 1);
      }
    }
  }
}
