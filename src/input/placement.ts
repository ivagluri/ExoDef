import * as THREE from "three";
import { CORE_POSITIONS, CORE_RADIUS, PLACEMENT } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { makeGhost, makeRangeDome } from "../render/models";
import { toast, type GameState, type Tower } from "../sim/state";

// Tower placement (GAME-DESIGN.md §11.2): pick from build bar → ghost + range dome
// follows cursor, green/red validity → left-click places, ESC/right-click cancels.
// Clicking a placed tower (no build selection active) opens its upgrade panel.

export class PlacementInput {
  selection: string | null = null;
  selectedTowerId: number | null = null;
  selectedCoreIndex: number | null = null;
  /** false while the coordinate view owns clicks (aiming, not placing) */
  enabled = true;
  private ghost: { object: THREE.Group; setValid: (v: boolean) => void } | null = null;
  private dome: THREE.Mesh | null = null;
  private groundPoint = new THREE.Vector3();
  private pointerOnGround = false;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  onSelectionChange: (id: string | null) => void = () => {};

  constructor(
    dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    private state: GameState,
  ) {
    dom.addEventListener("pointermove", (ev) => this.updatePointer(ev, dom));
    dom.addEventListener("pointerdown", (ev) => {
      if (ev.button === 0) this.click();
      if (ev.button === 2 && this.selection) this.select(null);
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.code === "Escape") {
        this.select(null);
        this.selectedTowerId = null;
        this.selectedCoreIndex = null;
      }
      for (const def of Object.values(TOWER_DEFS)) {
        if (ev.key === def.hotkey) this.select(this.selection === def.id ? null : def.id);
      }
    });
  }

  select(defId: string | null): void {
    if (defId && !TOWER_DEFS[defId]) return;
    this.selection = defId;
    if (defId) {
      this.selectedTowerId = null;
      this.selectedCoreIndex = null;
    }
    this.clearGhost();
    if (defId) {
      this.ghost = makeGhost(defId);
      this.scene.add(this.ghost.object);
      // batteries have no auto-fire range — no dome to preview (§6.5)
      const range = TOWER_DEFS[defId].tiers[0].rangeRadius;
      if (range > 0) {
        this.dome = makeRangeDome(range);
        this.scene.add(this.dome);
      }
      this.ghost.object.visible = this.pointerOnGround;
      if (this.dome) this.dome.visible = this.pointerOnGround;
    }
    this.onSelectionChange(this.selection);
  }

  private clearGhost(): void {
    if (this.ghost) this.scene.remove(this.ghost.object);
    if (this.dome) this.scene.remove(this.dome);
    this.ghost = null;
    this.dome = null;
  }

  private updatePointer(ev: PointerEvent, dom: HTMLElement): void {
    const rect = dom.getBoundingClientRect();
    this.ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    if (Math.abs(direction.y) < 1e-6) {
      this.pointerOnGround = false;
    } else {
      const t = -origin.y / direction.y;
      this.pointerOnGround = t > 0;
      if (this.pointerOnGround) this.groundPoint.copy(origin).addScaledVector(direction, t);
    }
    if (this.ghost) {
      const visible = this.pointerOnGround;
      this.ghost.object.visible = visible;
      if (this.dome) this.dome.visible = visible;
      if (visible) {
        this.ghost.object.position.copy(this.groundPoint).setY(0);
        if (this.dome) this.dome.position.copy(this.groundPoint).setY(0);
        this.ghost.setValid(this.isValid());
      }
    }
  }

  private isValid(): boolean {
    const p = this.groundPoint;
    if (Math.abs(p.x) > PLACEMENT.buildableHalf || Math.abs(p.z) > PLACEMENT.buildableHalf) return false;
    for (const [cx, cz] of CORE_POSITIONS) {
      if (Math.hypot(p.x - cx, p.z - cz) < PLACEMENT.coreClearance) return false;
    }
    for (const tower of this.state.towers) {
      if (tower.alive && Math.hypot(p.x - tower.pos.x, p.z - tower.pos.z) < PLACEMENT.minTowerGap) return false;
    }
    return true;
  }

  private click(): void {
    if (!this.enabled || !this.pointerOnGround || this.state.phase === "gameover") return;

    if (this.selection) {
      const def = TOWER_DEFS[this.selection];
      if (!this.isValid()) return;
      if (this.state.cash < def.cost) {
        toast(this.state, "NOT ENOUGH CASH");
        return;
      }
      this.state.cash -= def.cost;
      const tower: Tower = {
        id: this.state.nextId++,
        defId: def.id,
        tier: 0,
        pos: this.groundPoint.clone().setY(0),
        cooldown: 0,
        priority: def.id === "aaMissile" ? "strong" : "first",
        alive: true,
      };
      if (def.role === "interceptor") {
        // built mid-volley: joins the fight with a full ammo load (§6.5)
        const ammo = this.state.volley ? def.tiers[0].interceptor!.ammoPerVolley : 0;
        tower.battery = { ammo, reloadLeft: 0, inFlight: 0 };
      }
      this.state.towers.push(tower);
      this.selectedTowerId = tower.id;
      this.selectedCoreIndex = null;
      return;
    }

    // no build selection: click near a tower/core opens its panel, empty ground closes it
    for (const tower of this.state.towers) {
      if (tower.alive && Math.hypot(this.groundPoint.x - tower.pos.x, this.groundPoint.z - tower.pos.z) < 8) {
        this.selectedTowerId = tower.id;
        this.selectedCoreIndex = null;
        return;
      }
    }
    for (const core of this.state.cores) {
      if (core.hp > 0 && Math.hypot(this.groundPoint.x - core.pos.x, this.groundPoint.z - core.pos.z) < CORE_RADIUS + 7) {
        this.selectedCoreIndex = core.index;
        this.selectedTowerId = null;
        return;
      }
    }
    this.selectedTowerId = null;
    this.selectedCoreIndex = null;
  }
}
