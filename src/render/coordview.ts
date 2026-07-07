import * as THREE from "three";
import { VOLLEY } from "../balance";
import { batteryTier, fireInterceptor, pickBattery } from "../sim/missiles";
import { toast, type GameState } from "../sim/state";

// The coordinate view (GAME-DESIGN.md §6.3/§6.4/§7.1): two orthographic
// viewports of the LIVE scene — side (lateral × altitude, 70%) over top
// (lateral × depth, 30%) — with the lateral axis aligned 1:1. One shared 3D
// crosshair C = (u, v, y); each viewport's click sets its two axes. The sim
// never pauses in here; that's the whole point.

export type FireScheme = "plotted" | "commit";
type Mode = "map" | "entering" | "coord" | "exiting";

const TRANSITION = 0.6; // §6.2 camera swing
const SIDE_FRACTION = 0.7; // side viewport height share
const Y_CENTER = 82; // side view vertical center (shows y ≈ -8..172)
const Y_HALF = 90;
const V_HALF = 115; // top view depth half-extent (compressed to fit the map)
const SCHEME_KEY = "skyfall.fireScheme";

export interface CoordHudInfo {
  active: boolean;
  scheme: FireScheme;
  previewSeconds: number | null;
  needSide: boolean; // scheme A: which views still need a fresh click
  needTop: boolean;
}

export class CoordinateView {
  mode: Mode = "map";
  scheme: FireScheme;

  private fwd = new THREE.Vector3(1, 0, 0); // volley frame (§7.1)
  private right = new THREE.Vector3(0, 0, 1);
  private C = { u: 0, v: 0, y: 60 };
  private freshSide = false;
  private freshTop = false;

  private sideCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  private topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);

  private crosshair: THREE.Group;
  private dropLine: THREE.Line;
  private previewLine: THREE.Line;
  private previewSeconds: number | null = null;

  // camera tween state
  private t = 1;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private toPos = new THREE.Vector3();
  private toQuat = new THREE.Quaternion();
  private mapPos = new THREE.Vector3(); // pose to restore on exit
  private mapQuat = new THREE.Quaternion();

  constructor(
    scene: THREE.Scene,
    private isoCam: THREE.PerspectiveCamera,
  ) {
    this.scheme = localStorage.getItem(SCHEME_KEY) === "commit" ? "commit" : "plotted";

    const mat = new THREE.LineBasicMaterial({ color: 0x35e0e8 });
    this.crosshair = new THREE.Group();
    const arm = 7;
    for (const dir of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-arm),
        dir.clone().multiplyScalar(arm),
      ]);
      this.crosshair.add(new THREE.Line(geo, mat));
    }
    this.crosshair.visible = false;
    scene.add(this.crosshair);

    const dropMat = new THREE.LineBasicMaterial({ color: 0x35e0e8, transparent: true, opacity: 0.3 });
    this.dropLine = new THREE.Line(new THREE.BufferGeometry(), dropMat);
    this.dropLine.visible = false;
    scene.add(this.dropLine);

    const prevMat = new THREE.LineBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.45 });
    this.previewLine = new THREE.Line(new THREE.BufferGeometry(), prevMat);
    this.previewLine.visible = false;
    scene.add(this.previewLine);
  }

  isMapMode(): boolean {
    return this.mode === "map";
  }

  /** Radar lateral axis (§11.4): the volley frame's right while this view is
   *  active; null in map mode (radar then follows the orbit camera). */
  lateralRight(): THREE.Vector3 | null {
    return this.mode === "map" ? null : this.right;
  }

  toggle(state: GameState): void {
    if (this.mode === "map" || this.mode === "exiting") {
      if (state.volley) this.enter(state);
    } else {
      this.exit();
    }
  }

  enter(state: GameState): void {
    if (!state.volley || this.mode === "coord" || this.mode === "entering") return;
    // volley frame (§7.1): fixed for the volley so the view never swims
    this.fwd.copy(state.volley.heading).setY(0).normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    if (this.mode === "map") {
      this.mapPos.copy(this.isoCam.position);
      this.mapQuat.copy(this.isoCam.quaternion);
    }
    this.C = { u: 0, v: 0, y: 60 };
    this.freshSide = this.freshTop = false;
    // align the crosshair arms with the volley frame (right / up / fwd)
    this.crosshair.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(this.right, new THREE.Vector3(0, 1, 0), this.fwd),
    );
    this.refreshCameras();

    // swing the live perspective camera to the side-view pose, then split
    const dist = 250;
    const pose = new THREE.Object3D();
    pose.position.set(-this.fwd.x * dist, Y_CENTER, -this.fwd.z * dist);
    pose.lookAt(0, Y_CENTER, 0);
    this.beginTween(pose.position, pose.quaternion);
    this.mode = "entering";
  }

  exit(): void {
    if (this.mode === "map" || this.mode === "exiting") return;
    this.beginTween(this.mapPos, this.mapQuat);
    this.mode = "exiting";
    this.crosshair.visible = this.dropLine.visible = this.previewLine.visible = false;
  }

  private beginTween(toPos: THREE.Vector3, toQuat: THREE.Quaternion): void {
    this.fromPos.copy(this.isoCam.position);
    this.fromQuat.copy(this.isoCam.quaternion);
    this.toPos.copy(toPos);
    this.toQuat.copy(toQuat);
    this.t = 0;
  }

  toggleScheme(): void {
    this.scheme = this.scheme === "plotted" ? "commit" : "plotted";
    this.freshSide = this.freshTop = false;
    localStorage.setItem(SCHEME_KEY, this.scheme);
  }

  crosshairWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out
      .set(0, 0, 0)
      .addScaledVector(this.right, this.C.u)
      .addScaledVector(this.fwd, this.C.v)
      .setY(this.C.y);
  }

  update(dt: number, state: GameState): void {
    // volley over → auto-return (§6.2)
    if ((this.mode === "coord" || this.mode === "entering") && !state.volley) this.exit();

    if (this.mode === "entering" || this.mode === "exiting") {
      this.t = Math.min(1, this.t + dt / TRANSITION);
      const e = this.t < 0.5 ? 2 * this.t * this.t : 1 - (1 - this.t) * (1 - this.t) * 2; // ease in-out
      this.isoCam.position.lerpVectors(this.fromPos, this.toPos, e);
      this.isoCam.quaternion.slerpQuaternions(this.fromQuat, this.toQuat, e);
      if (this.t >= 1) this.mode = this.mode === "entering" ? "coord" : "map";
    }

    if (this.mode === "coord") {
      const world = this.crosshairWorld();
      this.crosshair.position.copy(world);
      this.crosshair.visible = true;
      this.dropLine.geometry.setFromPoints([world, world.clone().setY(0)]);
      this.dropLine.visible = true;

      // §7.2 auto-pick preview: faint battery→C line with flight time
      const battery = pickBattery(state, world);
      if (battery) {
        this.previewLine.geometry.setFromPoints([battery.pos.clone().setY(6), world]);
        this.previewLine.visible = true;
        this.previewSeconds = battery.pos.distanceTo(world) / batteryTier(battery).speed;
      } else {
        this.previewLine.visible = false;
        this.previewSeconds = null;
      }
    }
  }

  /** Left-click aim (§6.4). Returns true if the click was consumed. */
  onPointerDown(ev: PointerEvent, state: GameState): boolean {
    if (this.mode !== "coord" || ev.button !== 0) return this.mode !== "map";
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sideH = H * SIDE_FRACTION;
    const nx = (ev.clientX / W) * 2 - 1;
    const inSide = ev.clientY < sideH;
    const p = new THREE.Vector3();
    if (inSide) {
      const ny = 1 - 2 * (ev.clientY / sideH);
      p.set(nx, ny, 0).unproject(this.sideCam);
      this.C.u = p.dot(this.right);
      this.C.y = Math.max(VOLLEY.proximityInhibitY, p.y); // §6.5 proximity inhibit
      this.freshSide = true;
    } else {
      const ny = 1 - 2 * ((ev.clientY - sideH) / (H - sideH));
      p.set(nx, ny, 0).unproject(this.topCam);
      this.C.u = p.dot(this.right);
      this.C.v = THREE.MathUtils.clamp(p.dot(this.fwd), -V_HALF, V_HALF);
      this.freshTop = true;
    }
    if (this.scheme === "plotted" && this.freshSide && this.freshTop) {
      this.fire(state);
      this.freshSide = this.freshTop = false;
    }
    return true;
  }

  /** SPACE in scheme B (§6.4). */
  onCommit(state: GameState): void {
    if (this.mode === "coord" && this.scheme === "commit") this.fire(state);
  }

  private fire(state: GameState): void {
    if (!fireInterceptor(state, this.crosshairWorld())) toast(state, "NO BATTERY READY", 1.5);
  }

  hudInfo(state: GameState): CoordHudInfo {
    void state;
    return {
      active: this.mode === "coord",
      scheme: this.scheme,
      previewSeconds: this.previewSeconds,
      needSide: this.scheme === "plotted" && !this.freshSide,
      needTop: this.scheme === "plotted" && !this.freshTop,
    };
  }

  /** Frustums from window size; lateral scale identical in both views (§6.3). */
  refreshCameras(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sideH = H * SIDE_FRACTION;
    const uHalf = Y_HALF * (W / sideH); // square pixels in the side view

    const side = this.sideCam;
    side.left = -uHalf;
    side.right = uHalf;
    side.top = Y_HALF;
    side.bottom = -Y_HALF;
    side.position.set(-this.fwd.x * 500, Y_CENTER, -this.fwd.z * 500);
    side.lookAt(0, Y_CENTER, 0);
    side.updateProjectionMatrix();

    const top = this.topCam;
    top.left = -uHalf;
    top.right = uHalf;
    top.top = V_HALF; // depth is compressed; only the lateral axis is 1:1
    top.bottom = -V_HALF;
    top.up.copy(this.fwd); // screen-x = frame.right in both views (§7.1)
    top.position.set(0, 500, 0);
    top.lookAt(0, 0, 0);
    top.updateProjectionMatrix();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (this.mode !== "coord") {
      renderer.render(scene, this.isoCam); // transition frames: full-viewport swing
      return;
    }
    const topH = Math.round(H * (1 - SIDE_FRACTION));
    renderer.setScissorTest(true);
    renderer.setViewport(0, topH, W, H - topH);
    renderer.setScissor(0, topH, W, H - topH);
    renderer.render(scene, this.sideCam);
    renderer.setViewport(0, 0, W, topH);
    renderer.setScissor(0, 0, W, topH);
    renderer.render(scene, this.topCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }
}
