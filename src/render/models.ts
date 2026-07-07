import * as THREE from "three";
import { PALETTE } from "../balance";

// Flat-shaded primitive models per the Spectre art bible (GAME-DESIGN.md §12).
// Gun = yellow, flak = orange, grunt = magenta. ≤150 tris each.

export const MODEL_COLORS = {
  gun: 0xf7d23e,
  flak: 0xf78c3e,
  grunt: 0xe040c8,
  shell: 0xffd9a0,
  tracer: 0xfff6c0,
  blast: 0xe8fdff,
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
  return new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), lambert(0xff00ff));
}

export function makeShellModel(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), lambert(MODEL_COLORS.shell));
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
