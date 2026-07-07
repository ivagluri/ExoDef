import * as THREE from "three";
import { CAMERA } from "../balance";

// Main map camera: fixed-pitch isometric orbit around map center (GAME-DESIGN.md §10).
// Whole map must fit at any rotation and aspect ratio — distance is computed from
// the fit sphere, not hand-tuned.
export class IsoCamera {
  readonly camera: THREE.PerspectiveCamera;
  azimuth = Math.PI * 0.25;
  zoomIndex = 0;
  private distance = 0;
  private readonly target = new THREE.Vector3(0, CAMERA.targetY, 0);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, aspect, 1, 3000);
    this.distance = this.fitDistance() * CAMERA.zoomSteps[this.zoomIndex];
    this.apply();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private fitDistance(): number {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const halfMin = Math.min(vFov, hFov) / 2;
    return CAMERA.fitRadius / Math.sin(halfMin);
  }

  update(dt: number, azimuthDelta: number): void {
    this.azimuth += azimuthDelta;
    const targetDist = this.fitDistance() * CAMERA.zoomSteps[this.zoomIndex];
    this.distance = THREE.MathUtils.damp(this.distance, targetDist, CAMERA.distanceLerp, dt);
    this.apply();
  }

  private apply(): void {
    const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
    const horiz = Math.cos(pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * horiz,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(this.azimuth) * horiz,
    );
    this.camera.lookAt(this.target);
  }
}
