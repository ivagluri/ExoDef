import * as THREE from "three";
import type { GameState } from "../sim/state";
import { makeBlastModel, makeBombModel, makeEnemyModel, makeInterceptorModel, makeShellModel, makeTowerModel, makeWarheadModel, MODEL_COLORS } from "./models";

// Reconciles sim entity arrays with Three.js objects each frame (§13).
// The sim owns truth; this module only mirrors it.

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
  private trails = new Map<number, { line: THREE.Line; points: THREE.Vector3[] }>();
  private tracerMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.tracer,
    transparent: true,
    opacity: 0.9,
  });
  private warheadTrailMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.warheadTrail,
    transparent: true,
    opacity: 0.85,
  });
  private interceptorTrailMat = new THREE.LineBasicMaterial({
    color: MODEL_COLORS.interceptorTrail,
    transparent: true,
    opacity: 0.6,
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
        obj.rotation.y += 0.01; // idle spin, reads as "alive"
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
        this.growTrail(w.id, w.pos, this.warheadTrailMat, 26);
      },
    );
    this.reconcile(
      this.interceptorObjs,
      state.interceptors.filter((i) => i.alive),
      (i) => i.id,
      () => makeInterceptorModel(),
      (i, obj) => {
        obj.position.copy(i.pos);
        this.growTrail(i.id, i.pos, this.interceptorTrailMat, 14);
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
  }

  /** Ribbon trail (§12): a polyline of recent positions, capped per entity. */
  private growTrail(id: number, pos: THREE.Vector3, mat: THREE.LineBasicMaterial, cap: number): void {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = { line: new THREE.Line(new THREE.BufferGeometry(), mat), points: [] };
      this.trails.set(id, trail);
      this.scene.add(trail.line);
    }
    const last = trail.points[trail.points.length - 1];
    if (!last || last.distanceToSquared(pos) > 1.5) {
      trail.points.push(pos.clone());
      if (trail.points.length > cap) trail.points.shift();
      trail.line.geometry.setFromPoints(trail.points);
    }
  }

  private pruneTrails(state: GameState): void {
    const live = new Set<number>();
    for (const w of state.warheads) if (w.alive) live.add(w.id);
    for (const i of state.interceptors) if (i.alive) live.add(i.id);
    for (const [id, trail] of this.trails) {
      if (!live.has(id)) {
        this.scene.remove(trail.line);
        trail.line.geometry.dispose();
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
        mesh = makeBlastModel();
        this.blastObjs.set(blast, mesh);
        this.scene.add(mesh);
      }
      const progress = 1 - blast.ttl / blast.maxTtl;
      mesh.position.copy(blast.pos);
      mesh.scale.setScalar(Math.max(0.01, blast.radius * progress));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - progress);
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
        mesh = makeBlastModel();
        map.set(blast, mesh);
        this.scene.add(mesh);
      }
      const progress = 1 - blast.ttl / blast.maxTtl;
      mesh.position.copy(blast.pos);
      mesh.scale.setScalar(blast.radius * Math.min(1, progress * 4 + 0.15));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - progress) + 0.15;
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

  /** City damage states (§8): full → half the blocks → rubble (none). */
  private refreshCities(state: GameState): void {
    for (const city of state.cities) {
      const group = this.cityGroups[city.index];
      const blocks = group.children;
      const visible =
        city.hp >= 2 ? blocks.length :
        city.hp === 1 ? Math.ceil(blocks.length / 2) :
        0;
      blocks.forEach((block, i) => (block.visible = i < visible));
    }
  }
}
