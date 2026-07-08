import { CORE_HP, ECONOMY } from "../balance";
import { TOWER_DEFS } from "../content/towers";
import { killEnemy } from "./enemies";
import { toast, type GameState, type Priority, type Tower } from "./state";

// Player actions on placed towers (GAME-DESIGN.md §4/§11.2): upgrade, sell,
// cycle targeting priority. Allowed any time except after game over.

const PRIORITY_ORDER: Priority[] = ["first", "strong", "close"];

export function towerById(state: GameState, id: number): Tower | undefined {
  return state.towers.find((t) => t.id === id && t.alive);
}

export function upgradeCost(tower: Tower): number | null {
  const next = TOWER_DEFS[tower.defId].tiers[tower.tier + 1];
  return next ? next.upgradeCost : null;
}

export function investedValue(tower: Tower): number {
  const def = TOWER_DEFS[tower.defId];
  let value = def.cost;
  for (let t = 1; t <= tower.tier; t++) value += def.tiers[t].upgradeCost;
  return value;
}

export function sellRefund(tower: Tower): number {
  return Math.floor(investedValue(tower) * ECONOMY.sellRefund);
}

export function upgradeTower(state: GameState, id: number): void {
  const tower = towerById(state, id);
  if (!tower || state.phase === "gameover") return;
  const cost = upgradeCost(tower);
  if (cost === null) return;
  if (state.cash < cost) {
    toast(state, "NOT ENOUGH CASH");
    return;
  }
  state.cash -= cost;
  tower.tier++;
  toast(state, `${TOWER_DEFS[tower.defId].name} UPGRADED TO T${tower.tier + 1}`);
}

export function sellTower(state: GameState, id: number): void {
  const tower = towerById(state, id);
  if (!tower || state.phase === "gameover") return;
  if (tower.noSell) {
    toast(state, "THE CENTRAL BATTERY CANNOT BE SOLD");
    return;
  }
  state.cash += sellRefund(tower);
  tower.alive = false;
  toast(state, `SOLD +$${sellRefund(tower)}`);
}

export function cyclePriority(state: GameState, id: number): void {
  const tower = towerById(state, id);
  if (!tower) return;
  tower.priority = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(tower.priority) + 1) % PRIORITY_ORDER.length];
}

/** The fool's gold button (§4): one shot, fired from the tower panel. Vaporizes
 *  every non-boss invader (no bounties) and falling bombs, heavily damages a
 *  mothership, and levels every tower except batteries — including the silo.
 *  Cores and enemy warheads are untouched (interception stays player-plotted). */
export function fireNuke(state: GameState, id: number): void {
  const tower = towerById(state, id);
  if (!tower || state.phase === "gameover") return;
  if (!TOWER_DEFS[tower.defId].tiers[tower.tier].nuke) return;
  const bossDamage = TOWER_DEFS[tower.defId].tiers[tower.tier].nuke!.bossDamage;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.defId === "mothership") {
      enemy.hp -= bossDamage;
      if (enemy.hp <= 0) killEnemy(state, enemy); // a boss kill still pays
    } else {
      enemy.alive = false; // vaporized: no bounty, no splitter burst
    }
  }
  state.enemies = state.enemies.filter((e) => e.alive);
  state.bombs = [];
  for (const t of state.towers) {
    if (t.alive && TOWER_DEFS[t.defId].role !== "interceptor") t.alive = false;
  }
  state.effects.blasts.push(
    { pos: tower.pos.clone().setY(30), radius: 150, ttl: 1.4, maxTtl: 1.4, kind: "impact" },
    { pos: tower.pos.clone().setY(30), radius: 90, ttl: 0.9, maxTtl: 0.9, kind: "bossBay" },
  );
  toast(state, "☢ NUKE — SKIES CLEARED, DEFENSE GRID LOST", 6);
}

export function repairCore(state: GameState, index: number): void {
  if (state.phase === "gameover") return;
  const core = state.cores[index];
  if (!core || core.hp <= 0) {
    toast(state, "CORE OFFLINE — REBUILD ONLY");
    return;
  }
  if (core.hp >= CORE_HP) {
    toast(state, "CORE ALREADY STABLE");
    return;
  }
  if (state.cash < ECONOMY.coreRepairCost) {
    toast(state, "NOT ENOUGH CASH");
    return;
  }
  state.cash -= ECONOMY.coreRepairCost;
  core.hp = CORE_HP;
  state.coresDirty = true;
  toast(state, `CORE ${index + 1} REPAIRED -$${ECONOMY.coreRepairCost}`);
}
