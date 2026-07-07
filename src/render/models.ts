import * as THREE from "three";
import { PALETTE } from "../balance";

// Flat-shaded primitive models per the Spectre art bible (GAME-DESIGN.md §12).
// Gun = yellow, flak = orange, grunt = magenta. ≤150 tris each.

export const MODEL_COLORS = {
  gun: 0xf7d23e,
  flak: 0xf78c3e,
  battery: 0x35e0e8,
  batteryDormant: 0x1a4a54, // status light before the first siren (§3)
  grunt: 0xe040c8,
  bomber: 0x54e05a,
  diver: 0xff5a5a,
  ufo: 0xc8ccd8,
  ufoDome: 0x8fd8ff,
  bomb: 0x3a2430,
  shell: 0xffd9a0,
  tracer: 0xfff6c0,
  blast: 0xe8fdff,
  warhead: 0xffffff,
  warheadTrail: 0xff2b2b, // the Missile Command signature (§12)
  interceptorTrail: 0xf2f6ff,
  rangeDome: PALETTE.cityCyan,
} as const;

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
  return new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), lambert(0xff00ff));
}

export function makeBombModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 5), lambert(MODEL_COLORS.bomb));
}

export function makeShellModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), lambert(MODEL_COLORS.shell));
}

export function makeWarheadModel(): THREE.Mesh {
  // white point per §12; the red ribbon trail is drawn by RenderSync
  return new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ color: MODEL_COLORS.warhead }));
}

export function makeInterceptorModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), new THREE.MeshBasicMaterial({ color: MODEL_COLORS.warhead }));
}

export function makeBlastModel(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: MODEL_COLORS.blast, transparent: true, opacity: 0.8 }),
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
