import { ECONOMY } from "../balance";
import { TOWER_DEFS } from "../content/towers";
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
