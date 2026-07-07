import * as THREE from "three";
import { PALETTE } from "../balance";

// Flat-shaded primitive models per the Spectre art bible (GAME-DESIGN.md §12).
// Gun = yellow, flak = orange, grunt = magenta. ≤150 tris each.

export const MODEL_COLORS = {
  gun: 0xf7d23e,
  flak: 0xf78c3e,
  battery: 0x35e0e8,
  repulsor: 0x8fd8ff,
  repulsorCore: 0xfff6c0,
  aaMissile: 0xff5a5a,
  aaMissileFin: 0xffd9a0,
  drone: 0x7dff8a,
  droneCore: 0x35e0e8,
  batteryDormant: 0x1a4a54, // status light before the first siren (§3)
  grunt: 0xe040c8,
  bomber: 0x54e05a,
  diver: 0xff5a5a,
  ufo: 0xc8ccd8,
  ufoDome: 0x8fd8ff,
  mothership: 0x8f8cff,
  mothershipCore: 0xff5a5a,
  bossBayFlash: 0xffd9a0,
  bomb: 0xff7a2d,
  bombCore: 0x3a2430,
  shell: 0xffd9a0,
  tracer: 0xfff6c0,
  repulsorBeam: 0x8fd8ff,
  droneBeam: 0x7dff8a,
  blast: 0xe8fdff,
  flakBlast: 0xffd9a0,
  impactBlast: 0xff6a2a,
  warhead: 0xffffff,
  warheadTrail: 0xff2b2b, // the Missile Command signature (§12)
  interceptor: 0xe8fdff,
  interceptorTrail: 0x9fe8ee,
  rangeDome: PALETTE.coreCyan,
} as const;

export type BlastVisual = "intercept" | "flak" | "impact" | "bossBay";

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function makeTowerModel(defId: string): THREE.Group {
  const group = new THREE.Group();
  if (defId === "gun") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), lambert(MODEL_COLORS.gun));
    base.position.y = 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 7, 6), lambert(MODEL_COLORS.gun));
    barrel.position.set(0, 6, 0);
    barrel.rotation.z = Math.PI / 7;
    group.add(base, barrel);
  } else if (defId === "flak") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 4, 8), lambert(MODEL_COLORS.flak));
    base.position.y = 2;
    const gun = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 6), lambert(MODEL_COLORS.flak));
    gun.position.y = 6.5;
    group.add(base, gun);
  } else if (defId === "battery") {
    // cyan launch platform: low slab + two angled silo tubes + status light.
    // The light material lives in userData so RenderSync can flip it when the
    // battery "wakes" at the first siren.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 9), lambert(MODEL_COLORS.battery));
    slab.position.y = 1.25;
    const siloA = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 8, 7), lambert(MODEL_COLORS.battery));
    siloA.position.set(-2, 5.5, 0);
    siloA.rotation.z = 0.16;
    const siloB = siloA.clone();
    siloB.position.x = 2;
    siloB.rotation.z = -0.16;
    const lightMat = new THREE.MeshBasicMaterial({ color: MODEL_COLORS.batteryDormant });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lightMat);
    light.position.set(0, 3.4, 4.2);
    group.add(slab, siloA, siloB, light);
    group.userData.lightMat = lightMat;
  } else if (defId === "repulsor") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 3, 8), lambert(MODEL_COLORS.repulsor));
    base.position.y = 1.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 8, 7), lambert(MODEL_COLORS.repulsor));
    mast.position.y = 6;
    const dish = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.2, 8), lambert(MODEL_COLORS.repulsorCore));
    dish.position.y = 11;
    dish.rotation.x = Math.PI;
    group.add(base, mast, dish);
  } else if (defId === "aaMissile") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.8, 7.5), lambert(MODEL_COLORS.aaMissileFin));
    base.position.y = 1.4;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 9), lambert(MODEL_COLORS.aaMissileFin));
    rail.position.set(0, 4.2, 0);
    rail.rotation.x = -0.35;
    const rocket = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 7), lambert(MODEL_COLORS.aaMissile));
    rocket.position.set(0, 6.3, -1.2);
    rocket.rotation.x = -Math.PI / 2 - 0.35;
    group.add(base, rail, rocket);
  } else if (defId === "drone") {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 2.2, 8), lambert(MODEL_COLORS.droneCore));
    pad.position.y = 1.1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 5, 7), lambert(MODEL_COLORS.droneCore));
    mast.position.y = 4.4;
    const hub = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), lambert(MODEL_COLORS.drone));
    hub.position.y = 8;
    const armA = new THREE.Mesh(new THREE.BoxGeometry(8, 0.9, 0.9), lambert(MODEL_COLORS.drone));
    armA.position.y = 8;
    const armB = armA.clone();
    armB.rotation.y = Math.PI / 2;
    group.add(pad, mast, hub, armA, armB);
  } else {
    // fallback: unmistakable placeholder
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 6), lambert(0xff00ff));
    box.position.y = 4;
    group.add(box);
  }
  return group;
}

export function makeEnemyModel(defId: string): THREE.Object3D {
  if (defId === "grunt") {
    return new THREE.Mesh(new THREE.OctahedronGeometry(3), lambert(MODEL_COLORS.grunt));
  }
  if (defId === "bomber") {
    // green wedge
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 4.5, 3.5, 3), lambert(MODEL_COLORS.bomber));
    mesh.rotation.y = Math.PI / 6;
    return mesh;
  }
  if (defId === "diver") {
    // red dart, apex down
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6, 5), lambert(MODEL_COLORS.diver));
    mesh.rotation.x = Math.PI;
    return mesh;
  }
  if (defId === "ufo") {
    // classic silver disc
    const group = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 1.6, 12), lambert(MODEL_COLORS.ufo));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(MODEL_COLORS.ufoDome));
    dome.position.y = 0.8;
    group.add(disc, dome);
    return group;
  }
  if (defId === "mothership") {
    const group = new THREE.Group();
    const hullMat = lambert(MODEL_COLORS.mothership);
    const bayMat = lambert(MODEL_COLORS.mothershipCore);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(18, 24, 9, 8), hullMat);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 11), lambert(MODEL_COLORS.mothership));
    bridge.position.y = 6;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 0), bayMat);
    core.position.y = 8;
    const podA = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 10, 6), hullMat);
    podA.rotation.z = Math.PI / 2;
    podA.position.set(-23, -1.5, 0);
    const podB = podA.clone();
    podB.position.x = 23;
    const bayA = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 7), bayMat);
    bayA.position.set(-28, -1.5, 0);
    const bayB = bayA.clone();
    bayB.position.x = 28;
    group.add(hull, bridge, core, podA, podB, bayA, bayB);
    return group;
  }
  return new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), lambert(0xff00ff));
}

export function makeBombModel(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.2, 6), lambert(MODEL_COLORS.bomb));
  body.rotation.x = Math.PI;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), lambert(MODEL_COLORS.bombCore));
  core.position.y = 1.5;
  group.add(body, core);
  return group;
}

export function makeShellModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), lambert(MODEL_COLORS.shell));
}

export function makeAAMissileModel(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.2, 7), lambert(MODEL_COLORS.aaMissile));
  body.rotation.x = Math.PI / 2;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 1.2), lambert(MODEL_COLORS.aaMissileFin));
  fin.position.z = -1.8;
  group.add(body, fin);
  return group;
}

export function makeDroneModel(): THREE.Object3D {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.35), lambert(MODEL_COLORS.drone));
  const armA = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 0.42), lambert(MODEL_COLORS.droneCore));
  const armB = armA.clone();
  armB.rotation.y = Math.PI / 2;
  group.add(core, armA, armB);
  return group;
}

export function makeWarheadModel(): THREE.Mesh {
  // white point per §12; the red ribbon trail is drawn by RenderSync
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.75, 8, 6),
    new THREE.MeshBasicMaterial({ color: MODEL_COLORS.warhead, depthTest: false }),
  );
  mesh.renderOrder = 10;
  return mesh;
}

export function makeInterceptorModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.95, 6, 5), new THREE.MeshBasicMaterial({ color: MODEL_COLORS.interceptor }));
}

export function makeBlastModel(kind: BlastVisual = "intercept"): THREE.Mesh {
  const color =
    kind === "impact" ? MODEL_COLORS.impactBlast :
    kind === "flak" ? MODEL_COLORS.flakBlast :
    kind === "bossBay" ? MODEL_COLORS.bossBayFlash :
    MODEL_COLORS.blast;
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false }),
  );
}

export function makeRangeDome(radius: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({
      color: MODEL_COLORS.rangeDome,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
}

/** Ghost placement preview: collect materials so validity can tint them. */
export function makeGhost(defId: string): { object: THREE.Group; setValid: (v: boolean) => void } {
  const object = makeTowerModel(defId);
  const materials: THREE.MeshLambertMaterial[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = (child.material as THREE.MeshLambertMaterial).clone();
      mat.transparent = true;
      mat.opacity = 0.55;
      child.material = mat;
      materials.push(mat);
    }
  });
  const setValid = (v: boolean) => {
    for (const mat of materials) mat.color.set(v ? 0x7dff8a : 0xff5a5a);
  };
  return { object, setValid };
}
