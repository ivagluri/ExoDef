import * as THREE from "three";
import { VOLLEY } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { damageCore, detonateAt } from "./enemies";
import { pick, rand, randRange } from "./rng";
import { toast, type GameState, type Tower, type Warhead } from "./state";

// Missile volleys & interception (GAME-DESIGN.md §6/§7) — the signature.
// Warheads fly deterministic bézier arcs from over the horizon; the player
// plots interceptor shots in the coordinate view. Batteries never auto-fire.

export function batteryTier(tower: Tower) {
  return TOWER_DEFS.battery.tiers[tower.tier].interceptor!;
}

export function aliveBatteries(state: GameState): Tower[] {
  return state.towers.filter((t) => t.alive && t.defId === "battery");
}

/** Volley is "active" (alert on, coordinate view available) while launches
 *  remain or warheads fly. */
export function volleyActive(state: GameState): boolean {
  return state.volley !== null;
}

export function inboundCount(state: GameState): number {
  return (state.volley?.pending.length ?? 0) + state.warheads.length;
}

/** Called by startRound for waves with a missiles entry (§9). */
export function launchVolley(state: GameState, warheads: number, counterforce: boolean, firstAt: number = VOLLEY.firstLaunchDelay): void {
  const angle = rand() * Math.PI * 2; // one random compass direction per volley
  const heading = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

  // Stagger the launches; each warhead picks its target at launch time so
  // late warheads aim at what's still standing.
  const pending: { at: number }[] = [];
  let at = firstAt;
  for (let i = 0; i < warheads; i++) {
    pending.push({ at });
    at += randRange(VOLLEY.staggerMin, VOLLEY.staggerMax);
  }
  state.volley = { heading, pending, total: warheads, counterforce };

  // give every battery its per-volley ammo (§6.5)
  for (const battery of aliveBatteries(state)) {
    battery.battery = { ammo: batteryTier(battery).ammoPerVolley, reloadLeft: 0, inFlight: 0 };
  }
  if (!state.batteryAwake) {
    state.batteryAwake = true;
    toast(state, "◈ MISSILE BATTERY ONLINE", 5);
  }
}

/** Counterforce volleys hunt batteries; everything else hunts cores (§6.1).
 *  Falls back to the other kind when the preferred targets are all dead. */
function resolveTarget(state: GameState, counterforce: boolean): { kind: "core" | "tower"; id: number; pos: THREE.Vector3 } | null {
  const cores = state.cores.filter((c) => c.hp > 0);
  const batteries = aliveBatteries(state);
  if (counterforce && batteries.length > 0) {
    const b = pick(batteries);
    return { kind: "tower", id: b.id, pos: b.pos };
  }
  if (cores.length > 0) {
    const c = pick(cores);
    return { kind: "core", id: c.index, pos: c.pos };
  }
  if (batteries.length > 0) {
    const b = pick(batteries);
    return { kind: "tower", id: b.id, pos: b.pos };
  }
  return null; // nothing left worth a warhead
}

function launchWarhead(state: GameState): void {
  const volley = state.volley!;
  const target = resolveTarget(state, volley.counterforce);
  if (!target) return;

  const heading = volley.heading;
  const lateral = new THREE.Vector3(-heading.z, 0, heading.x);
  const p2 = target.pos.clone().setY(0);
  // Entry at a fixed depth just past the platform edge (volley frame v =
  // -entryOffset), not a fixed distance behind the target — keeps every
  // warhead inside the top view's approach corridor from launch.
  const targetU = p2.dot(lateral);
  const targetV = p2.dot(heading);
  const entryV = Math.min(-VOLLEY.entryOffset, targetV - VOLLEY.minApproach);
  const p0 = new THREE.Vector3()
    .addScaledVector(lateral, targetU + randRange(-VOLLEY.entryLateralJitter, VOLLEY.entryLateralJitter))
    .addScaledVector(heading, entryV)
    .setY(VOLLEY.entryY);
  const p1 = p0.clone().lerp(p2, 0.55).setY(VOLLEY.arcPeakY);
  // ~flightTime for a full crossing, proportionally less for closer targets,
  // modest speed-up with wave (§9)
  const base = Math.max(
    VOLLEY.flightTimeMin,
    VOLLEY.flightTime - VOLLEY.flightTimeDropPerWave * Math.max(0, state.round - 5),
  );
  const duration = Math.max(VOLLEY.flightTimeMin, base * Math.min(1, (targetV - entryV) / 200));
  state.warheads.push({
    id: state.nextId++,
    pos: p0.clone(),
    p0, p1, p2,
    t: 0,
    duration,
    targetKind: target.kind,
    targetId: target.id,
    alive: true,
  });
}

/** Sample a warhead's deterministic arc at progress t (0..1). Exported for
 *  anything that leads a shot — the smoke-test auto-player, preview lines. */
export function warheadPointAt(w: Warhead, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = 1 - t;
  return out
    .copy(w.p0).multiplyScalar(s * s)
    .addScaledVector(w.p1, 2 * s * t)
    .addScaledVector(w.p2, t * t);
}

function warheadImpact(state: GameState, w: Warhead): void {
  w.alive = false;
  state.effects.blasts.push({ pos: w.p2.clone().setY(2), radius: VOLLEY.warheadSplash, ttl: 0.7, maxTtl: 0.7, kind: "impact" });
  // §8: direct core target destroyed outright; splash destroys towers and
  // deals a normal 1-hit to any other core caught in it.
  if (w.targetKind === "core") damageCore(state, w.targetId, 2);
  detonateAt(state, w.p2, VOLLEY.warheadSplash, false);
}

/** Launch pending warheads, advance arcs, land impacts. Combat phase only. */
export function updateWarheads(state: GameState, dt: number): void {
  const volley = state.volley;
  if (volley) {
    while (volley.pending.length > 0 && volley.pending[0].at <= state.roundTime) {
      volley.pending.shift();
      launchWarhead(state);
    }
  }
  for (const w of state.warheads) {
    w.t += dt / w.duration;
    if (w.t >= 1) warheadImpact(state, w);
    else warheadPointAt(w, w.t, w.pos);
  }
  state.warheads = state.warheads.filter((w) => w.alive);

  // volley over → ammo refills automatically (§6.5), alert clears
  if (volley && volley.pending.length === 0 && state.warheads.length === 0) {
    state.volley = null;
    for (const battery of aliveBatteries(state)) {
      battery.battery = { ammo: batteryTier(battery).ammoPerVolley, reloadLeft: 0, inFlight: 0 };
    }
  }
}

/** §7.2 — ready = has ammo, not reloading, silo free; pick soonest arrival at C. */
export function pickBattery(state: GameState, target: THREE.Vector3): Tower | null {
  let best: Tower | null = null;
  let bestTime = Infinity;
  for (const b of aliveBatteries(state)) {
    const bs = b.battery;
    const tier = batteryTier(b);
    if (!bs || bs.ammo <= 0 || bs.reloadLeft > 0 || bs.inFlight >= tier.silos) continue;
    const time = b.pos.distanceTo(target) / tier.speed;
    if (time < bestTime) {
      bestTime = time;
      best = b;
    }
  }
  return best;
}

/** Fire at the plotted point C (already proximity-clamped by the input layer). */
export function fireInterceptor(state: GameState, target: THREE.Vector3): boolean {
  const battery = pickBattery(state, target);
  if (!battery) return false;
  const tier = batteryTier(battery);
  const bs = battery.battery!;
  bs.ammo--;
  bs.reloadLeft = tier.reload;
  bs.inFlight++;
  state.interceptors.push({
    id: state.nextId++,
    pos: battery.pos.clone().setY(6),
    target: target.clone(),
    speed: tier.speed,
    blastRadius: tier.blastRadius,
    batteryId: battery.id,
    alive: true,
  });
  return true;
}

/** Interceptor flight, blast spheres, warhead kill check (§7.3).
 *  Runs every tick regardless of phase so leftovers resolve after round clear. */
export function updateInterceptors(state: GameState, dt: number): void {
  for (const battery of aliveBatteries(state)) {
    if (battery.battery && battery.battery.reloadLeft > 0) battery.battery.reloadLeft -= dt;
  }

  for (const i of state.interceptors) {
    const toTarget = i.target.clone().sub(i.pos);
    const step = i.speed * dt;
    if (toTarget.length() <= step) {
      i.alive = false;
      state.interceptBlasts.push({ pos: i.target.clone(), radius: i.blastRadius, ttl: VOLLEY.blastTtl, maxTtl: VOLLEY.blastTtl });
      const battery = state.towers.find((t) => t.id === i.batteryId);
      if (battery?.battery) battery.battery.inFlight = Math.max(0, battery.battery.inFlight - 1);
    } else {
      i.pos.addScaledVector(toTarget.normalize(), step);
    }
  }
  state.interceptors = state.interceptors.filter((i) => i.alive);

  for (const b of state.interceptBlasts) b.ttl -= dt;
  let killed = 0;
  for (const w of state.warheads) {
    for (const b of state.interceptBlasts) {
      if (b.ttl > 0 && w.alive && w.pos.distanceToSquared(b.pos) <= b.radius * b.radius) {
        w.alive = false;
        killed++;
      }
    }
  }
  if (killed > 0) {
    state.cash += VOLLEY.interceptBounty * killed;
    state.score += VOLLEY.interceptBounty * killed;
    toast(state, killed > 1 ? `${killed} WARHEADS INTERCEPTED +$${VOLLEY.interceptBounty * killed}` : `WARHEAD INTERCEPTED +$${VOLLEY.interceptBounty}`);
    state.warheads = state.warheads.filter((w) => w.alive);
  }
  state.interceptBlasts = state.interceptBlasts.filter((b) => b.ttl > 0);
}
