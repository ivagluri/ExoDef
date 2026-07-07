import * as THREE from "three";
import type { BlastKind, GameState } from "../sim/state";
import { makeBlastModel, makeBombModel, makeEnemyModel, makeInterceptorModel, makeShellModel, makeTowerModel, makeWarheadModel, MODEL_COLORS, type BlastVisual } from "./models";

// Reconciles sim entity arrays with Three.js objects each frame (§13).
// The sim owns truth; this module only mirrors it.

type TrailKind = "warhead" | "interceptor";

interface TrailRecord {
  group: THREE.Group;
  points: THREE.Vector3[];
  kind: TrailKind;
}

const TRAIL_UP = new THREE.Vector3(0, 1, 0);

export class RenderSync {
  private towerObjs = new Map<number, THREE.Object3D>();
  private enemyObjs = new Map<number, THREE.Object3D>();
  private shellObjs = new Map<number, THREE.Object3D>();
  private bombObjs = new Map<number, THREE.Object3D>();
  private warheadObjs = new Map<number, THREE.Object3D>();
  private interceptorObjs = new Map<number, THREE.Object3D>();
  private blastObjs = new Map<object, THREE.Mesh>();
  private interceptBlastObjs = new Map<object, THREE.Mesh>();
  private tracerObjs = new Map<object, THREE.Line>();
  private trails = new Map<number, TrailRecord>();
  private tracerMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.tracer,
    transparent: true,
    opacity: 0.9,
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
    private cityGroups: THREE.Group[],
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
        else obj.rotation.y += 0.01; // idle spin, reads as "alive"
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
    this.syncTracers(state);
    if (state.citiesDirty) {
      this.refreshCities(state);
      state.citiesDirty = false;
    }
    this.syncCityGlow(state);
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
        const line = new THREE.Line(geo, this.tracerMat);
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

  private blastVisual(kind?: BlastKind): BlastVisual {
    if (kind === "impact") return "impact";
    if (kind === "bossBay") return "bossBay";
    return "flak";
  }

  /** City damage states (§8): full → half the blocks → rubble (none). */
  private refreshCities(state: GameState): void {
    for (const city of state.cities) {
      const group = this.cityGroups[city.index];
      const blocks = (group.userData.blocks as THREE.Object3D[] | undefined) ?? group.children;
      const visible =
        city.hp >= 2 ? blocks.length :
        city.hp === 1 ? Math.ceil(blocks.length / 2) :
        0;
      blocks.forEach((block, i) => (block.visible = i < visible));
    }
  }

  private syncCityGlow(state: GameState): void {
    for (const city of state.cities) {
      const group = this.cityGroups[city.index];
      const glow = group.userData.glow as THREE.Mesh | undefined;
      const mat = group.userData.glowMat as THREE.MeshBasicMaterial | undefined;
      if (!glow || !mat) continue;
      glow.visible = city.hp > 0;
      if (city.hp >= 2) {
        const pulse = 0.5 + 0.5 * Math.sin(state.simTime * 2.2 + city.index * 0.7);
        mat.color.setHex(MODEL_COLORS.rangeDome);
        mat.opacity = 0.09 + pulse * 0.05;
        glow.scale.set(1 + pulse * 0.07, 0.22, 1 + pulse * 0.07);
      } else if (city.hp === 1) {
        const flicker = 0.5 + 0.5 * Math.sin(state.simTime * 14 + city.index * 3.1);
        mat.color.setHex(MODEL_COLORS.impactBlast);
        mat.opacity = 0.04 + flicker * 0.05;
        glow.scale.set(0.92 + flicker * 0.05, 0.2, 0.92 + flicker * 0.05);
      }
    }
  }
}
