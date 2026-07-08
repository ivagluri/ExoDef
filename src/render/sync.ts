import * as THREE from "three";
import { SWARM } from "../content/enemies";
import type { BlastKind, GameState } from "../sim/state";
import { makeAAMissileModel, makeBarrierModel, makeBlastModel, makeBombModel, makeDroneModel, makeEnemyModel, makeInterceptorModel, makeShellModel, makeTowerModel, makeWarheadModel, MODEL_COLORS, type BlastVisual } from "./models";

// Reconciles sim entity arrays with Three.js objects each frame (§13).
// The sim owns truth; this module only mirrors it.

type TrailKind = "warhead" | "interceptor";

interface TrailRecord {
  group: THREE.Group;
  points: THREE.Vector3[];
  kind: TrailKind;
}

const TRAIL_UP = new THREE.Vector3(0, 1, 0);
const MISSILE_FORWARD = new THREE.Vector3(0, 0, 1);

export class RenderSync {
  private towerObjs = new Map<number, THREE.Object3D>();
  private enemyObjs = new Map<number, THREE.Object3D>();
  private shellObjs = new Map<number, THREE.Object3D>();
  private aaMissileObjs = new Map<number, THREE.Object3D>();
  private droneObjs = new Map<number, THREE.Object3D>();
  private barrierObjs = new Map<number, THREE.Object3D>();
  private bombObjs = new Map<number, THREE.Object3D>();
  private warheadObjs = new Map<number, THREE.Object3D>();
  private interceptorObjs = new Map<number, THREE.Object3D>();
  private blastObjs = new Map<object, THREE.Mesh>();
  private interceptBlastObjs = new Map<object, THREE.Mesh>();
  private cloudObjs = new Map<object, THREE.Mesh>();
  private tracerObjs = new Map<object, THREE.Line>();
  private trails = new Map<number, TrailRecord>();
  private tracerMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.tracer,
    transparent: true,
    opacity: 0.9,
  });
  private repulseBeamObjs = new Map<object, THREE.Mesh>();
  // Wifi-signal cone: narrow at the dish, flaring toward the lifted enemy.
  // Unit height, open-ended; scaled/oriented per frame. +Y is the enemy end.
  private repulseBeamGeo = new THREE.CylinderGeometry(3.0, 0.4, 1, 8, 1, true);
  private hackBeamObjs = new Map<object, { group: THREE.Group; lines: THREE.Line[]; mats: THREE.LineBasicMaterial[]; bucket: number }>();
  private droneMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.droneBeam,
    transparent: true,
    opacity: 0.78,
  });
  private warheadTrailMat = new THREE.MeshBasicMaterial({
    color: MODEL_COLORS.warheadTrail,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  private interceptorTrailMat = new THREE.MeshBasicMaterial({
    color: MODEL_COLORS.interceptorTrail,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  constructor(
    private scene: THREE.Scene,
    private coreGroups: THREE.Group[],
  ) {}

  sync(state: GameState): void {
    this.reconcile(
      this.towerObjs,
      state.towers.filter((t) => t.alive),
      (t) => t.id,
      (t) => makeTowerModel(t.defId),
      (t, obj) => {
        obj.position.copy(t.pos);
        // battery status light: dormant until the first siren (§3)
        const lightMat = obj.userData.lightMat as THREE.MeshBasicMaterial | undefined;
        if (lightMat) {
          const awake = state.batteryAwake;
          const blink = state.volley !== null && Math.sin(state.simTime * 8) > 0;
          lightMat.color.setHex(
            !awake ? MODEL_COLORS.batteryDormant :
            blink ? 0xffffff : MODEL_COLORS.battery,
          );
        }
      },
    );
    this.reconcile(
      this.enemyObjs,
      state.enemies.filter((e) => e.alive),
      (e) => e.id,
      (e) => makeEnemyModel(e.defId),
      (e, obj) => {
        obj.position.copy(e.pos);
        if (e.defId === "mothership") obj.rotation.y = 0;
        else obj.rotation.y += e.hacked ? 0.06 : 0.01; // idle spin, reads as "alive"
        // hack-array conversion: converted units flip to friendly cyan once
        if (e.hacked && !obj.userData.hackTinted) {
          obj.userData.hackTinted = true;
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
              child.material.color.setHex(MODEL_COLORS.hackedTint);
            }
          });
        }
      },
    );
    this.reconcile(
      this.shellObjs,
      state.shells.filter((s) => s.alive),
      (s) => s.id,
      () => makeShellModel(),
      (s, obj) => obj.position.copy(s.pos),
    );
    this.reconcile(
      this.aaMissileObjs,
      state.aaMissiles.filter((m) => m.alive),
      (m) => m.id,
      () => makeAAMissileModel(),
      (m, obj) => {
        obj.position.copy(m.pos);
        const target = state.enemies.find((e) => e.id === m.targetId && e.alive);
        if (target) {
          const dir = target.pos.clone().sub(m.pos);
          if (dir.lengthSq() > 0.001) {
            obj.quaternion.setFromUnitVectors(MISSILE_FORWARD, dir.normalize());
          }
        }
      },
    );
    this.reconcile(
      this.droneObjs,
      state.drones.filter((d) => d.alive),
      (d) => d.id,
      () => makeDroneModel(),
      (d, obj) => {
        obj.position.copy(d.pos);
        obj.rotation.y += 0.12;
      },
    );
    this.reconcile(
      this.barrierObjs,
      state.barriers.filter((b) => b.alive),
      (b) => b.id,
      () => makeBarrierModel(),
      (b, obj) => {
        obj.position.copy(b.pos);
        obj.position.y = b.pos.y + Math.sin(state.simTime * 1.4 + b.id) * 0.5; // gentle hover
        obj.scale.set(b.radius, 1, b.radius);
        obj.rotation.y += 0.004;
        const mesh = obj as THREE.Mesh;
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.34 * (b.hp / b.maxHp);
      },
    );
    this.reconcile(
      this.bombObjs,
      state.bombs.filter((b) => b.alive),
      (b) => b.id,
      () => makeBombModel(),
      (b, obj) => obj.position.copy(b.pos),
    );
    this.reconcile(
      this.warheadObjs,
      state.warheads.filter((w) => w.alive),
      (w) => w.id,
      () => makeWarheadModel(),
      (w, obj) => {
        obj.position.copy(w.pos);
        this.growTrail(w.id, w.pos, "warhead", 30);
      },
    );
    this.reconcile(
      this.interceptorObjs,
      state.interceptors.filter((i) => i.alive),
      (i) => i.id,
      () => makeInterceptorModel(),
      (i, obj) => {
        obj.position.copy(i.pos);
        this.growTrail(i.id, i.pos, "interceptor", 13);
      },
    );
    this.pruneTrails(state);
    this.syncBlasts(state);
    this.syncSpheres(state.interceptBlasts, this.interceptBlastObjs);
    this.syncClouds(state);
    this.syncTracers(state);
    this.syncRepulseBeams(state);
    this.syncHackBeams(state);
    if (state.coresDirty) {
      this.refreshCores(state);
      state.coresDirty = false;
    }
    this.syncCoreGlow(state);
    this.syncSwarmPips(state);
  }

  /** Solid ribbon trail (§12): recent positions rebuilt as capped low-poly segments. */
  private growTrail(id: number, pos: THREE.Vector3, kind: TrailKind, cap: number): void {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = { group: new THREE.Group(), points: [], kind };
      this.trails.set(id, trail);
      this.scene.add(trail.group);
    }
    const last = trail.points[trail.points.length - 1];
    if (!last || last.distanceToSquared(pos) > 1.5) {
      trail.points.push(pos.clone());
      if (trail.points.length > cap) trail.points.shift();
      this.rebuildTrail(trail);
    }
  }

  private rebuildTrail(trail: TrailRecord): void {
    this.clearTrailMeshes(trail);
    const radius = trail.kind === "warhead" ? 0.9 : 0.34;
    const radial = trail.kind === "warhead" ? 8 : 6;
    const mat = trail.kind === "warhead" ? this.warheadTrailMat : this.interceptorTrailMat;
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1];
      const b = trail.points[i];
      const delta = b.clone().sub(a);
      const len = delta.length();
      if (len < 0.05) continue;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial, 1, false), mat);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(TRAIL_UP, delta.normalize());
      seg.renderOrder = trail.kind === "warhead" ? 8 : 4;
      trail.group.add(seg);
    }
  }

  private clearTrailMeshes(trail: TrailRecord): void {
    for (const child of trail.group.children) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    trail.group.clear();
  }

  private pruneTrails(state: GameState): void {
    const live = new Set<number>();
    for (const w of state.warheads) if (w.alive) live.add(w.id);
    for (const i of state.interceptors) if (i.alive) live.add(i.id);
    for (const [id, trail] of this.trails) {
      if (!live.has(id)) {
        this.clearTrailMeshes(trail);
        this.scene.remove(trail.group);
        this.trails.delete(id);
      }
    }
  }

  private reconcile<T>(
    map: Map<number, THREE.Object3D>,
    items: T[],
    idOf: (item: T) => number,
    make: (item: T) => THREE.Object3D,
    update: (item: T, obj: THREE.Object3D) => void,
  ): void {
    const seen = new Set<number>();
    for (const item of items) {
      const id = idOf(item);
      seen.add(id);
      let obj = map.get(id);
      if (!obj) {
        obj = make(item);
        map.set(id, obj);
        this.scene.add(obj);
      }
      update(item, obj);
    }
    for (const [id, obj] of map) {
      if (!seen.has(id)) {
        this.scene.remove(obj);
        map.delete(id);
      }
    }
  }

  private syncBlasts(state: GameState): void {
    const live = new Set<object>(state.effects.blasts);
    for (const blast of state.effects.blasts) {
      let mesh = this.blastObjs.get(blast);
      if (!mesh) {
        mesh = makeBlastModel(this.blastVisual(blast.kind));
        this.blastObjs.set(blast, mesh);
        this.scene.add(mesh);
      }
      const progress = 1 - blast.ttl / blast.maxTtl;
      const kind = blast.kind ?? "flak";
      const pop = kind === "bossBay" ? Math.min(1, progress * 3 + 0.25) : progress;
      const maxOpacity =
        kind === "bossBay" ? 0.85 :
        kind === "impact" ? 0.62 :
        0.55;
      mesh.position.copy(blast.pos);
      mesh.scale.setScalar(Math.max(0.01, blast.radius * pop));
      (mesh.material as THREE.MeshBasicMaterial).opacity = maxOpacity * (1 - progress);
    }
    for (const [key, mesh] of this.blastObjs) {
      if (!live.has(key)) {
        this.scene.remove(mesh);
        this.blastObjs.delete(key);
      }
    }
  }

  /** Interceptor blast spheres: pop to kill radius fast, hang, fade (§6.5). */
  private syncSpheres(
    blasts: { pos: THREE.Vector3; radius: number; ttl: number; maxTtl: number }[],
    map: Map<object, THREE.Mesh>,
  ): void {
    const live = new Set<object>(blasts);
    for (const blast of blasts) {
      let mesh = map.get(blast);
      if (!mesh) {
        mesh = makeBlastModel("intercept");
        map.set(blast, mesh);
        this.scene.add(mesh);
      }
      const progress = 1 - blast.ttl / blast.maxTtl;
      mesh.position.copy(blast.pos);
      mesh.scale.setScalar(blast.radius * Math.min(1, progress * 4 + 0.15));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.48 * (1 - progress) + 0.12;
    }
    for (const [key, mesh] of map) {
      if (!live.has(key)) {
        this.scene.remove(mesh);
        map.delete(key);
      }
    }
  }

  private syncTracers(state: GameState): void {
    const live = new Set<object>(state.effects.tracers);
    for (const tracer of state.effects.tracers) {
      if (!this.tracerObjs.has(tracer)) {
        const geo = new THREE.BufferGeometry().setFromPoints([tracer.from, tracer.to]);
        const mat = tracer.kind === "drone" ? this.droneMat : this.tracerMat;
        const line = new THREE.Line(geo, mat);
        this.tracerObjs.set(tracer, line);
        this.scene.add(line);
      }
    }
    for (const [key, line] of this.tracerObjs) {
      if (!live.has(key)) {
        this.scene.remove(line);
        line.geometry.dispose();
        this.tracerObjs.delete(key);
      }
    }
  }

  /** Napalm clouds (§4): translucent ember blobs that flare in, simmer, fade out. */
  private syncClouds(state: GameState): void {
    const live = new Set<object>(state.clouds);
    for (const cloud of state.clouds) {
      let mesh = this.cloudObjs.get(cloud);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            color: MODEL_COLORS.napalmCloud,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
          }),
        );
        mesh.renderOrder = 3;
        mesh.position.copy(cloud.pos);
        this.cloudObjs.set(cloud, mesh);
        this.scene.add(mesh);
      }
      const age = cloud.maxTtl - cloud.ttl;
      const ignite = Math.min(1, age * 3.5); // flare to full size fast
      mesh.scale.setScalar(Math.max(0.01, cloud.radius * ignite));
      const fade = Math.min(1, cloud.ttl / 1.2);
      const simmer = 0.26 + 0.07 * Math.sin(state.simTime * 5 + cloud.maxTtl * 7);
      (mesh.material as THREE.MeshBasicMaterial).opacity = simmer * fade + 0.08;
    }
    for (const [key, mesh] of this.cloudObjs) {
      if (!live.has(key)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.cloudObjs.delete(key);
      }
    }
  }

  /** Swarm-charge pips (§5): small ember dots above a core, one per absorbed landing. */
  private syncSwarmPips(state: GameState): void {
    for (const core of state.cores) {
      const group = this.coreGroups[core.index];
      let pips = group.userData.swarmPips as THREE.Mesh[] | undefined;
      if (!pips) {
        pips = [];
        for (let i = 0; i < SWARM.landingsPerCoreHit - 1; i++) {
          const pip = new THREE.Mesh(
            new THREE.SphereGeometry(1.05, 6, 5),
            new THREE.MeshBasicMaterial({ color: MODEL_COLORS.impactBlast }),
          );
          pip.position.set((i - (SWARM.landingsPerCoreHit - 2) / 2) * 3.4, 14, 0);
          pip.visible = false;
          group.add(pip);
          pips.push(pip);
        }
        group.userData.swarmPips = pips;
      }
      pips.forEach((pip, i) => {
        const on = core.hp > 0 && core.swarmCharge > i;
        if (pip.visible !== on) pip.visible = on;
      });
    }
  }

  /** Hack-array conversion crackle: three jagged electric arcs from the antenna
   *  tips to the converted unit, re-jittered ~24×/s so they flicker. Deliberately
   *  unlike the repulsor's smooth cone — this reads as static, not a push. */
  private syncHackBeams(state: GameState): void {
    const TIPS = [
      new THREE.Vector3(-2.2, 11.2, -2.2),
      new THREE.Vector3(2.2, 10.2, -1.4),
      new THREE.Vector3(0, 13.2, 2.2),
    ]; // hack tower antenna tips (models.ts)
    const ARC_POINTS = 8;
    const live = new Set<object>();
    for (const beam of state.effects.hackBeams) {
      const tower = state.towers.find((t) => t.id === beam.towerId && t.alive);
      const enemy = state.enemies.find((e) => e.id === beam.enemyId && e.alive);
      if (!tower || !enemy) continue;
      live.add(beam);
      let rec = this.hackBeamObjs.get(beam);
      if (!rec) {
        const group = new THREE.Group();
        const lines: THREE.Line[] = [];
        const mats: THREE.LineBasicMaterial[] = [];
        for (let i = 0; i < TIPS.length; i++) {
          const mat = new THREE.LineBasicMaterial({
            color: i === 1 ? MODEL_COLORS.hackArray : MODEL_COLORS.hackTip,
            transparent: true,
            opacity: 0.9,
          });
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
          const line = new THREE.Line(geo, mat);
          line.renderOrder = 6;
          group.add(line);
          lines.push(line);
          mats.push(mat);
        }
        rec = { group, lines, mats, bucket: -1 };
        this.hackBeamObjs.set(beam, rec);
        this.scene.add(group);
      }
      // re-jitter on a ~24 Hz bucket so the crackle reads even at high fps
      const bucket = Math.floor(state.simTime * 24);
      const fade = Math.min(1, beam.ttl / 0.2);
      if (bucket !== rec.bucket) {
        rec.bucket = bucket;
        for (let i = 0; i < rec.lines.length; i++) {
          const from = tower.pos.clone().add(TIPS[i]);
          const to = enemy.pos;
          const amp = 1.2 + from.distanceTo(to) * 0.03;
          const attr = rec.lines[i].geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let p = 0; p < ARC_POINTS; p++) {
            const t = p / (ARC_POINTS - 1);
            const envelope = Math.sin(Math.PI * t) * amp; // pinned at both ends
            attr.setXYZ(
              p,
              from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 2 * envelope,
              from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 2 * envelope,
              from.z + (to.z - from.z) * t + (Math.random() - 0.5) * 2 * envelope,
            );
          }
          attr.needsUpdate = true;
          rec.lines[i].geometry.computeBoundingSphere();
          // per-arc flicker: mostly bright, occasionally winks out
          rec.mats[i].opacity = (Math.random() < 0.18 ? 0.08 : 0.55 + Math.random() * 0.45) * fade;
        }
      }
    }
    for (const [key, rec] of this.hackBeamObjs) {
      if (!live.has(key)) {
        this.scene.remove(rec.group);
        for (const line of rec.lines) line.geometry.dispose();
        for (const mat of rec.mats) mat.dispose();
        this.hackBeamObjs.delete(key);
      }
    }
  }

  /** Repulsor cone beam: dish → lifted enemy, pulsing while the debuff holds. */
  private syncRepulseBeams(state: GameState): void {
    const live = new Set<object>();
    for (const beam of state.effects.repulseBeams) {
      const tower = state.towers.find((t) => t.id === beam.towerId && t.alive);
      const enemy = state.enemies.find((e) => e.id === beam.enemyId && e.alive);
      if (!tower || !enemy) continue;
      live.add(beam);
      let mesh = this.repulseBeamObjs.get(beam);
      if (!mesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: MODEL_COLORS.repulsorBeam,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(this.repulseBeamGeo, mat);
        mesh.renderOrder = 5;
        this.repulseBeamObjs.set(beam, mesh);
        this.scene.add(mesh);
      }
      const from = tower.pos.clone().setY(12.5); // top of the repulsor dish
      const delta = enemy.pos.clone().sub(from);
      const len = Math.max(delta.length(), 0.01);
      mesh.position.copy(from).addScaledVector(delta, 0.5);
      mesh.quaternion.setFromUnitVectors(TRAIL_UP, delta.normalize());
      mesh.scale.set(1, len, 1);
      const fadeIn = Math.min(1, (beam.maxTtl - beam.ttl) * 6 + 0.2);
      const fadeOut = Math.min(1, beam.ttl / 0.45);
      const pulse = 0.3 + 0.14 * Math.sin(state.simTime * 14);
      (mesh.material as THREE.MeshBasicMaterial).opacity = pulse * fadeIn * fadeOut;
    }
    for (const [key, mesh] of this.repulseBeamObjs) {
      if (!live.has(key)) {
        this.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        this.repulseBeamObjs.delete(key);
      }
    }
  }

  private blastVisual(kind?: BlastKind): BlastVisual {
    if (kind === "impact") return "impact";
    if (kind === "bossBay") return "bossBay";
    return "flak";
  }

  /** Core damage states (§8): full → half the blocks → rubble (none). */
  private refreshCores(state: GameState): void {
    for (const core of state.cores) {
      const group = this.coreGroups[core.index];
      const blocks = (group.userData.blocks as THREE.Object3D[] | undefined) ?? group.children;
      const visible =
        core.hp >= 2 ? blocks.length :
        core.hp === 1 ? Math.ceil(blocks.length / 2) :
        0;
      blocks.forEach((block, i) => (block.visible = i < visible));
    }
  }

  private syncCoreGlow(state: GameState): void {
    for (const core of state.cores) {
      const group = this.coreGroups[core.index];
      const glow = group.userData.glow as THREE.Mesh | undefined;
      const mat = group.userData.glowMat as THREE.MeshBasicMaterial | undefined;
      if (!glow || !mat) continue;
      glow.visible = core.hp > 0;
      if (core.hp >= 2) {
        const pulse = 0.5 + 0.5 * Math.sin(state.simTime * 2.2 + core.index * 0.7);
        this.tintCoreBlocks(group, null);
        mat.color.setHex(MODEL_COLORS.rangeDome);
        mat.opacity = 0.09 + pulse * 0.05;
        glow.scale.set(1 + pulse * 0.07, 0.22, 1 + pulse * 0.07);
      } else if (core.hp === 1) {
        const flicker = 0.5 + 0.5 * Math.sin(state.simTime * 14 + core.index * 3.1);
        this.tintCoreBlocks(group, flicker > 0.45 ? 0xff5a5a : MODEL_COLORS.impactBlast);
        mat.color.setHex(MODEL_COLORS.impactBlast);
        mat.opacity = 0.04 + flicker * 0.05;
        glow.scale.set(0.92 + flicker * 0.05, 0.2, 0.92 + flicker * 0.05);
      } else {
        this.tintCoreBlocks(group, null);
      }
    }
  }

  private tintCoreBlocks(group: THREE.Group, color: number | null): void {
    const blocks = group.userData.blocks as THREE.Mesh[] | undefined;
    if (!blocks) return;
    const baseColors = group.userData.baseColors as number[] | undefined;
    blocks.forEach((block, index) => {
      if (!block.visible) return;
      const mat = block.material instanceof THREE.MeshLambertMaterial ? block.material : null;
      if (!mat) return;
      mat.color.setHex(color ?? baseColors?.[index] ?? MODEL_COLORS.rangeDome);
    });
  }
}
