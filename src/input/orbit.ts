import { CAMERA } from "../balance";
import type { IsoCamera } from "../render/cameras";

// Map-view camera input: Q/E or right/middle-drag to orbit, scroll for zoom steps.
// Rotation is a viewing affordance only — no mechanic may require it (§10).
export class OrbitInput {
  private keys = { q: false, e: false };
  private dragging = false;
  private dragDelta = 0;

  constructor(el: HTMLElement, private iso: IsoCamera) {
    window.addEventListener("keydown", (ev) => this.setKey(ev.code, true));
    window.addEventListener("keyup", (ev) => this.setKey(ev.code, false));
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button === 2 || ev.button === 1) {
        this.dragging = true;
        el.setPointerCapture(ev.pointerId);
      }
    });
    el.addEventListener("pointerup", () => (this.dragging = false));
    el.addEventListener("pointermove", (ev) => {
      if (this.dragging) this.dragDelta -= ev.movementX * CAMERA.dragRadPerPixel;
    });
    el.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      this.iso.zoomIndex = ev.deltaY < 0 ? 1 : 0; // scroll up = lean in
    }, { passive: false });
  }

  private setKey(code: string, down: boolean): void {
    if (code === "KeyQ") this.keys.q = down;
    if (code === "KeyE") this.keys.e = down;
  }

  /** Consume accumulated rotation for this frame (radians). */
  take(dt: number): number {
    let delta = this.dragDelta;
    this.dragDelta = 0;
    if (this.keys.q) delta += CAMERA.orbitSpeedRad * dt;
    if (this.keys.e) delta -= CAMERA.orbitSpeedRad * dt;
    return delta;
  }
}
