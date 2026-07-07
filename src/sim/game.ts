import { CITY_HP, ECONOMY, SCORE } from "../balance";
import { UFO } from "../content/enemies";
import { spawnGruntGroup, updateGroups } from "./enemies";
import { spawnBomber, spawnDiver, spawnUfo, updateBombs, updateRaiders } from "./raiders";
import { rand } from "./rng";
import { citiesAlive, toast, type GameState } from "./state";
import { updateShells, updateTowers } from "./towers";
import { WAVE_COUNT, waveDef, waveSpawns } from "./waves";

// Round flow (GAME-DESIGN.md §3): build freely → START ROUND → combat (building
// still allowed) → wave clear → city income → build. Player-paced.

export function startRound(state: GameState): boolean {
  if (state.phase !== "build") return false;
  if (state.round >= WAVE_COUNT) {
    toast(state, `PHASE 3 CONTENT ENDS AT WAVE ${WAVE_COUNT} — WAVES 16–50 ARRIVE IN PHASE 5`);
    return false;
  }
  state.round++;
  state.roundTime = 0;
  state.pending = waveSpawns(state.round);

  // bonus UFO chance (§9)
  if (state.round >= UFO.firstRound && rand() < UFO.chancePerRound) {
    state.pending.push({ at: 8 + rand() * 15, enemy: "ufo", count: 1 });
    state.pending.sort((a, b) => a.at - b.at);
  }

  // Phase 4 will launch real volleys here; until then the warning is a stub
  if (waveDef(state.round)?.missiles) {
    toast(state, "⚠ MISSILE LAUNCH DETECTED — INTERCEPTION SYSTEMS OFFLINE (PHASE 4) ⚠", 6);
  }
  state.phase = "combat";
  return true;
}

function spawnPending(state: GameState): void {
  while (state.pending.length > 0 && state.pending[0].at <= state.roundTime) {
    const entry = state.pending.shift()!;
    if (entry.enemy === "grunt") spawnGruntGroup(state, entry.count);
    else if (entry.enemy === "bomber") for (let i = 0; i < entry.count; i++) spawnBomber(state);
    else if (entry.enemy === "diver") for (let i = 0; i < entry.count; i++) spawnDiver(state);
    else if (entry.enemy === "ufo") spawnUfo(state);
  }
}

function checkRoundClear(state: GameState): void {
  if (state.pending.length > 0 || state.enemies.length > 0 || state.bombs.length > 0) return;
  state.phase = "build";
  const income = citiesAlive(state) * ECONOMY.cityIncome;
  state.cash += income;
  state.score += SCORE.roundClearPerWave * state.round;
  toast(state, `ROUND ${state.round} CLEAR — INCOME +$${income}`);

  // bonus city at milestones (§8: Missile Command's mercy rule)
  if (state.round % 10 === 0) {
    const ruin = state.cities.find((c) => c.hp <= 0);
    if (ruin) {
      ruin.hp = CITY_HP;
      state.citiesDirty = true;
      toast(state, "REINFORCEMENTS — CITY REBUILT", 5);
    }
  }
}

function ageEffects(state: GameState, dt: number): void {
  for (const t of state.effects.tracers) t.ttl -= dt;
  for (const b of state.effects.blasts) b.ttl -= dt;
  state.effects.tracers = state.effects.tracers.filter((t) => t.ttl > 0);
  state.effects.blasts = state.effects.blasts.filter((b) => b.ttl > 0);
}

export function simTick(state: GameState, dt: number): void {
  state.simTime += dt;
  state.tick++;
  if (state.messageTtl > 0) state.messageTtl -= dt;
  ageEffects(state, dt);
  if (state.phase !== "combat") return;

  state.roundTime += dt;
  spawnPending(state);
  updateGroups(state, dt);
  updateRaiders(state, dt);
  updateBombs(state, dt);
  updateTowers(state, dt);
  updateShells(state, dt);
  checkRoundClear(state);
}
