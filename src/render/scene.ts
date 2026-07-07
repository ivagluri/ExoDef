import * as THREE from "three";
import { CITY_POSITIONS, MAP_SIZE, PALETTE } from "../balance";

export interface World {
  scene: THREE.Scene;
  cities: THREE.Group[];
}

// Deterministic pseudo-random for city layouts (stable across sessions)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCity(index: number): THREE.Group {
  const rand = mulberry32(1000 + index * 77);
  const group = new THREE.Group();
  const blocks: THREE.Mesh[] = [];
  const blockCount = 3 + Math.floor(rand() * 4); // 3–6 boxes per city
  for (let i = 0; i < blockCount; i++) {
    const w = 4 + rand() * 5;
    const d = 4 + rand() * 5;
    const h = 6 + rand() * 9;
    // one cyan accent block per city, rest white
    const color = i === 0 ? PALETTE.cityCyan : PALETTE.cityWhite;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    const angle = rand() * Math.PI * 2;
    const r = rand() * 7;
    mesh.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
    group.add(mesh);
    blocks.push(mesh);
  }
  const glowMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cityCyan,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), glowMat);
  glow.scale.y = 0.22;
  glow.position.y = 2.6;
  group.add(glow);
  group.userData.blocks = blocks;
  group.userData.glow = glow;
  group.userData.glowMat = glowMat;
  return group;
}

function buildStars(): THREE.Points {
  const rand = mulberry32(42);
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // upper hemisphere shell, far away
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI * 0.48; // keep off the horizon line
    const r = 900;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: PALETTE.star,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.Points(geo, mat);
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);

  // Lighting: one sun + ambient, per §12 (flat, bright, simple)
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(120, 220, 80);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  // Ground: pale flat plane with a hard edge (the horizon)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Subtle grid for spatial readability (§12: acceptable if readability wants it)
  const grid = new THREE.GridHelper(MAP_SIZE, 20, PALETTE.grid, PALETTE.grid);
  grid.position.y = 0.05;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);

  scene.add(buildStars());

  const cities: THREE.Group[] = [];
  CITY_POSITIONS.forEach(([x, z], i) => {
    const city = buildCity(i);
    city.position.set(x, 0, z);
    scene.add(city);
    cities.push(city);
  });

  return { scene, cities };
}
