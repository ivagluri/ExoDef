// Headless sim smoke test (no browser, no rendering): a simple auto-player builds
// and upgrades a defense and runs the sim through the wave-50 victory goal.
// Run with:  npm run smoke
// Extend this as phases add systems — it's the fast regression check for agents.
import * as THREE from "three";
import { fireNuke, repairCore } from "../src/sim/actions";
import { killEnemy, spawnSwarmGroup, updateGroups } from "../src/sim/enemies";
import { spawnSplitter, updateRaiders } from "../src/sim/raiders";
import { coresAlive, createGameState } from "../src/sim/state";
import { updateBarriers, updateClouds, updateDrones, updateShells, updateTowers } from "../src/sim/towers";
import { WAVE_COUNT } from "../src/sim/waves";
import { ENEMY_DEFS, SPLITTER, SWARM } from "../src/content/enemies";
import { baselineStrategy, runAutoPlay } from "./lib/autoplayer";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runPhase6Checks(): void {
  const repair = createGameState();
  repair.cash = 300;
  repair.cores[0].hp = 1;
  repairCore(repair, 0);
  assert(repair.cores[0].hp === 2, "repair did not restore a damaged core");
  assert(repair.cash === 0, "repair did not spend cash");
  repair.cash = 1000;
  repair.cores[0].hp = 0;
  repairCore(repair, 0);
  assert(repair.cores[0].hp === 0 && repair.cash === 1000, "destroyed core was cash-repaired");

  const repulsor = createGameState();
  repulsor.phase = "combat";
  repulsor.towers.push({
    id: repulsor.nextId++, defId: "repulsor", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  repulsor.enemies.push({
    id: repulsor.nextId++, defId: "bomber", hp: 60,
    pos: new THREE.Vector3(12, 52, 0),
    alive: true, groupId: null,
    ai: { mode: "approach", timer: 0, vel: new THREE.Vector3(), target: new THREE.Vector3() },
  });
  updateTowers(repulsor, 1 / 60);
  assert((repulsor.enemies[0].repulse?.ttl ?? 0) > 0, "repulsor did not apply debuff");

  const missile = createGameState();
  missile.phase = "combat";
  missile.towers.push({
    id: missile.nextId++, defId: "aaMissile", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "strong", alive: true,
  });
  missile.enemies.push({
    id: missile.nextId++, defId: "grunt", hp: 20,
    pos: new THREE.Vector3(20, 90, 0),
    alive: true, groupId: null,
  });
  updateTowers(missile, 1 / 60);
  assert(missile.aaMissiles.length === 1, "AA missile tower did not launch at invader");

  const drones = createGameState();
  drones.towers.push({
    id: drones.nextId++, defId: "drone", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  updateDrones(drones, 1 / 60);
  assert(drones.drones.length === 1, "T1 drone tower did not maintain one drone");
  drones.towers[drones.towers.length - 1].tier = 1;
  updateDrones(drones, 1 / 60);
  assert(drones.drones.length === 2, "T2 drone tower did not maintain two drones");

  console.log("PHASE 6 CHECKS PASS");
}

function runPhase7Checks(): void {
  // napalm: canister → lingering cloud → chip damage
  const napalm = createGameState();
  napalm.phase = "combat";
  napalm.towers.push({
    id: napalm.nextId++, defId: "napalm", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "first", alive: true,
  });
  napalm.enemies.push({
    id: napalm.nextId++, defId: "grunt", hp: 20,
    pos: new THREE.Vector3(10, 20, 0),
    alive: true, groupId: null,
  });
  updateTowers(napalm, 1 / 60);
  assert(napalm.shells.length === 1 && napalm.shells[0].cloud !== undefined, "napalm did not lob a canister");
  for (let i = 0; i < 120 && napalm.clouds.length === 0; i++) updateShells(napalm, 1 / 60);
  assert(napalm.clouds.length === 1, "napalm canister did not ignite a cloud");
  const hpBefore = napalm.enemies[0].hp;
  updateClouds(napalm, 1);
  assert(napalm.enemies[0].hp < hpBefore, "napalm cloud did not chip-damage the enemy inside");

  // hack array: convert → kamikaze run → victim bounty only
  const hack = createGameState();
  hack.phase = "combat";
  hack.towers.push({
    id: hack.nextId++, defId: "hack", tier: 0,
    pos: new THREE.Vector3(0, 0, 0),
    cooldown: 0, priority: "strong", alive: true,
  });
  for (const x of [10, 18]) {
    hack.enemies.push({
      id: hack.nextId++, defId: "grunt", hp: 20,
      pos: new THREE.Vector3(x, 40, 0),
      alive: true, groupId: null,
    });
  }
  updateTowers(hack, 1 / 60);
  assert(hack.enemies.some((e) => e.hacked), "hack array did not convert an invader");
  const cashBefore = hack.cash;
  for (let i = 0; i < 600 && hack.enemies.length > 0; i++) updateRaiders(hack, 1 / 60);
  assert(hack.enemies.length === 0, "hack kamikaze run did not resolve");
  assert(hack.cash === cashBefore + ENEMY_DEFS.grunt.bounty, "kamikaze bounty wrong: victim pays, hacked unit does not");

  // splitter: fragments on kill AND on low-altitude auto-split
  const splitKill = createGameState();
  splitKill.phase = "combat";
  spawnSplitter(splitKill, 1);
  killEnemy(splitKill, splitKill.enemies.find((e) => e.defId === "splitter")!);
  assert(
    splitKill.enemies.filter((e) => e.alive && e.defId === "fragment").length === SPLITTER.fragmentCount,
    "killed splitter did not burst into fragments",
  );
  const splitLow = createGameState();
  splitLow.phase = "combat";
  spawnSplitter(splitLow, 1);
  splitLow.enemies.find((e) => e.defId === "splitter")!.pos.y = SPLITTER.splitY + 0.01;
  updateRaiders(splitLow, 1 / 60);
  assert(
    !splitLow.enemies.some((e) => e.defId === "splitter") &&
    splitLow.enemies.filter((e) => e.defId === "fragment").length === SPLITTER.fragmentCount,
    "intact splitter did not auto-split at low altitude",
  );

  // swarm: landings charge a core; every 3rd charge = 1 hit
  const swarm = createGameState();
  swarm.phase = "combat";
  const core = swarm.cores[0];
  spawnSwarmGroup(swarm, SWARM.landingsPerCoreHit, 1, 1, core.pos.clone().setY(5));
  swarm.groups[0].y = 0; // force the landing this tick
  updateGroups(swarm, 1 / 60);
  assert(core.hp === 1, "3 swarm landings did not deal exactly 1 core hit");
  assert(core.swarmCharge === 0, "swarm charge did not reset after triggering a hit");

  console.log("PHASE 7 CHECKS PASS");
}

function runPhase8Checks(): void {
  // blockade: barrier deploys over the nearest core and soaks a descending impact
  const block = createGameState();
  block.phase = "combat";
  const core = block.cores[0]; // (-60, -40)
  block.towers.push({
    id: block.nextId++, defId: "blockade", tier: 0,
    pos: core.pos.clone().add(new THREE.Vector3(0, 0, 15)).setY(0),
    cooldown: 0, priority: "first", alive: true,
  });
  updateBarriers(block, 1 / 60);
  assert(block.barriers.length === 1, "blockade did not deploy a barrier");
  assert(
    Math.hypot(block.barriers[0].pos.x - core.pos.x, block.barriers[0].pos.z - core.pos.z) < 1,
    "barrier did not deploy over the nearest core",
  );
  block.enemies.push({
    id: block.nextId++, defId: "grunt", hp: 20,
    pos: core.pos.clone().setY(8), // descending through the plate
    alive: true, groupId: null,
  });
  updateBarriers(block, 1 / 60);
  assert(block.enemies.length === 0, "barrier did not soak the descending enemy");
  assert(block.barriers[0].hp === 2, "barrier soak did not consume exactly one charge");
  assert(core.hp === 2, "core took damage despite the barrier");

  // nuke: wipes invaders (no bounty) and all towers except batteries; cores untouched
  const nuke = createGameState();
  nuke.phase = "combat";
  const silo = { id: nuke.nextId++, defId: "nuke", tier: 0, pos: new THREE.Vector3(20, 0, 0), cooldown: 0, priority: "first" as const, alive: true };
  const gun = { id: nuke.nextId++, defId: "gun", tier: 0, pos: new THREE.Vector3(-20, 0, 0), cooldown: 0, priority: "first" as const, alive: true };
  nuke.towers.push(silo, gun);
  for (let i = 0; i < 5; i++) {
    nuke.enemies.push({
      id: nuke.nextId++, defId: "grunt", hp: 20,
      pos: new THREE.Vector3(i * 10, 60, 0),
      alive: true, groupId: null,
    });
  }
  const cashBefore = nuke.cash;
  fireNuke(nuke, silo.id);
  assert(nuke.enemies.length === 0, "nuke did not wipe the invaders");
  assert(nuke.cash === cashBefore, "nuked invaders paid bounty — they should not");
  assert(!gun.alive && !silo.alive, "nuke spared a non-battery tower");
  assert(nuke.towers.find((t) => t.defId === "battery")!.alive, "nuke destroyed the hardened battery");
  assert(coresAlive(nuke) === 6, "nuke damaged cores");

  console.log("PHASE 8 CHECKS PASS");
}

runPhase6Checks();
runPhase7Checks();
runPhase8Checks();

// Full auto-player run over the baseline mixed build (the shared machinery now
// lives in scripts/lib/autoplayer.ts, reused by the balance scenario harness).
const report = runAutoPlay(baselineStrategy(), {
  onPhaseChange: (s, from, to) => {
    console.log(
      `t=${s.simTime.toFixed(1)}s  ${from}→${to}  round=${s.round}` +
      `  cash=$${s.cash}  score=${s.score}  cores=${coresAlive(s)}` +
      `  towers=${s.towers.filter((t) => t.alive).length}  enemies=${s.enemies.length}`,
    );
  },
});

console.log(`\nDONE round=${report.furthestWave} phase=${report.finalPhase} score=${report.score} cash=$${report.finalCash}`);
console.log(`cores=${report.coresRemaining}/6 towers=${report.towersAlive} (tiers: ${report.aliveTiers.join(",")}) interceptors fired=${report.shotsFired} wall=${report.wallMs}ms`);
if (report.stalled) throw new Error("sim hang: 60 sim-minutes without finishing");
if (report.finalPhase === "gameover") throw new Error("auto-player lost all cores");
if (report.furthestWave !== WAVE_COUNT) throw new Error(`stopped at round ${report.furthestWave}, expected ${WAVE_COUNT}`);
if (report.shotsFired === 0) throw new Error("volleys ran but no interceptors were fired — missile sim broken?");
console.log("SMOKE TEST PASS");
