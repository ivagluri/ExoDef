import { ECONOMY, SCORE } from "../balance";
import { spawnGruntGroup, updateGroups } from "./enemies";
import { citiesAlive, toast, type GameState } from "./state";
import { updateShells, updateTowers } from "./towers";
import { WAVE_COUNT, waveSpawns } from "./waves";

// Round flow (GAME-DESIGN.md §3): build freely → START ROUND → combat (building
// still allowed) → wave clear → city income → build. Player-paced.

export function startRound(state: GameState): boolean {
  if (state.phase !== "build") return false;
  if (state.round >= WAVE_COUNT) {
    toast(state, `PHASE 2 CONTENT ENDS AT WAVE ${WAVE_COUNT} — MORE IN PHASE 3`);
    return false;
  }
  if (state.round > 0 && state.simTime - state.roundClearedAt <= ECONOMY.earlyStartWindow) {
    state.cash += ECONOMY.earlyStartBonus;
    toast(state, `QUICK START +$${ECONOMY.earlyStartBonus}`);
  }
  state.round++;
  state.roundTime = 0;
  state.pending = waveSpawns(state.round);
  state.phase = "combat";
  return true;
}

function spawnPending(state: GameState): void {
  while (state.pending.length > 0 && state.pending[0].at <= state.roundTime) {
    const entry = state.pending.shift()!;
    if (entry.enemy === "grunt") spawnGruntGroup(state, entry.count);
  }
}

function checkRoundClear(state: GameState): void {
  if (state.pending.length > 0 || state.enemies.length > 0) return;
  state.phase = "build";
  state.roundClearedAt = state.simTime;
  const income = citiesAlive(state) * ECONOMY.cityIncome;
  state.cash += income;
  state.score += SCORE.roundClearPerWave * state.round;
  toast(state, `ROUND ${state.round} CLEAR — INCOME +$${income}`);
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
  updateTowers(state, dt);
  updateShells(state, dt);
  checkRoundClear(state);
}
