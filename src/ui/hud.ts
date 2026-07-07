import { BUILDABLE, TOWER_DEFS } from "../content/towers";
import { sellRefund, towerById, upgradeCost } from "../sim/actions";
import { citiesAlive, type GameState } from "../sim/state";
import { waveDef } from "../sim/waves";

// HTML overlay HUD (GAME-DESIGN.md §11.1): top bar, build bar, start button,
// toast, tower panel (upgrade/sell/priority), game-over overlay.

export interface Hud {
  update(state: GameState, selection: string | null, selectedTowerId: number | null): void;
}

export function createHud(handlers: {
  onStart: () => void;
  onSelect: (id: string | null) => void;
  onUpgrade: () => void;
  onSell: () => void;
  onPriority: () => void;
}): Hud {
  const hud = document.getElementById("hud")!;
  hud.innerHTML = `
    <style>
      #hud .bar {
        position: absolute; left: 0; right: 0; display: flex;
        justify-content: space-between; align-items: center;
        padding: 10px 16px; font-size: 14px; letter-spacing: 0.06em;
      }
      #hud .top { top: 0; text-shadow: 0 1px 3px #000a; }
      #hud .bottom { bottom: 0; align-items: flex-end; }
      #hud button {
        pointer-events: auto; font: inherit; color: #d7dce8;
        background: #141b31d9; border: 1px solid #3a4568; border-radius: 4px;
        padding: 8px 14px; cursor: pointer; letter-spacing: 0.06em;
      }
      #hud button:hover { border-color: #7f8fc5; }
      #hud button.sel { border-color: #35e0e8; color: #35e0e8; }
      #hud button.start { border-color: #7dff8a88; }
      #hud button:disabled { opacity: 0.4; cursor: default; }
      #hud .build { display: flex; gap: 8px; }
      #hud .toast {
        position: absolute; top: 18%; left: 0; right: 0; text-align: center;
        font-size: 17px; letter-spacing: 0.14em; color: #ffd9a0;
        text-shadow: 0 1px 4px #000c; transition: opacity 0.3s;
      }
      #hud .gameover {
        position: absolute; inset: 0; display: none; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px;
        background: #070b18cc; font-size: 30px; letter-spacing: 0.2em;
        color: #ff5a5a; text-align: center;
      }
      #hud .gameover small { font-size: 14px; color: #d7dce8; letter-spacing: 0.08em; }
      #hud .tag { position: absolute; left: 12px; bottom: 54px; font-size: 11px; opacity: 0.45; }
      #hud .panel {
        position: absolute; right: 14px; bottom: 60px; display: flex;
        flex-direction: column; gap: 6px; padding: 10px 12px;
        background: #141b31d9; border: 1px solid #3a4568; border-radius: 6px;
        font-size: 13px;
      }
    </style>
    <div class="bar top">
      <span data-el="cash"></span>
      <span data-el="round"></span>
      <span data-el="right"></span>
    </div>
    <div class="bar bottom">
      <div class="build" data-el="build"></div>
      <button class="start" data-el="start">▶ START ROUND 1</button>
    </div>
    <div class="toast" data-el="toast"></div>
    <div class="panel" data-el="panel" style="display:none">
      <div data-el="ptitle" style="letter-spacing:0.1em"></div>
      <button data-el="pupgrade"></button>
      <button data-el="psell"></button>
      <button data-el="ppriority"></button>
    </div>
    <div class="gameover" data-el="gameover">
      ALL CITIES LOST
      <small data-el="finalscore"></small>
      <small>reload the page to try again</small>
    </div>
    <div class="tag">SKYFALL dev · phase 3 · 1/2 build · click tower: panel · Q/E rotate · scroll zoom · Enter: start</div>
  `;

  const el = (name: string) => hud.querySelector<HTMLElement>(`[data-el="${name}"]`)!;
  const buildBar = el("build");
  const buttons = new Map<string, HTMLButtonElement>();
  for (const id of BUILDABLE) {
    const def = TOWER_DEFS[id];
    const btn = document.createElement("button");
    btn.textContent = `[${def.hotkey}] ${def.name} $${def.cost}`;
    btn.addEventListener("click", () => handlers.onSelect(id));
    buildBar.appendChild(btn);
    buttons.set(id, btn);
  }
  const startBtn = el("start") as HTMLButtonElement;
  startBtn.addEventListener("click", () => handlers.onStart());
  el("pupgrade").addEventListener("click", () => handlers.onUpgrade());
  el("psell").addEventListener("click", () => handlers.onSell());
  el("ppriority").addEventListener("click", () => handlers.onPriority());

  return {
    update(state: GameState, selection: string | null, selectedTowerId: number | null): void {
      el("cash").textContent = `$${state.cash}`;
      el("round").textContent = state.round === 0 ? "PLACE YOUR DEFENSES" : `ROUND ${state.round}`;
      el("right").textContent = `⌂ ${citiesAlive(state)}/6 · SCORE ${state.score}`;
      for (const [id, btn] of buttons) {
        btn.classList.toggle("sel", selection === id);
        btn.disabled = state.cash < TOWER_DEFS[id].cost && selection !== id;
      }
      startBtn.style.display = state.phase === "build" ? "" : "none";
      const nextMissiles = waveDef(state.round + 1)?.missiles;
      startBtn.textContent = `▶ START ROUND ${state.round + 1}${nextMissiles ? " ⚠ MISSILES" : ""}`;
      const toastEl = el("toast");
      toastEl.textContent = state.message;
      toastEl.style.opacity = state.messageTtl > 0 ? "1" : "0";

      // tower panel
      const tower = selectedTowerId !== null ? towerById(state, selectedTowerId) : undefined;
      el("panel").style.display = tower ? "flex" : "none";
      if (tower) {
        const def = TOWER_DEFS[tower.defId];
        el("ptitle").textContent = `${def.name} T${tower.tier + 1}`;
        const upBtn = el("pupgrade") as HTMLButtonElement;
        const cost = upgradeCost(tower);
        upBtn.textContent = cost === null ? "MAX TIER" : `UPGRADE $${cost}`;
        upBtn.disabled = cost === null || state.cash < cost;
        el("psell").textContent = `SELL +$${sellRefund(tower)}`;
        el("ppriority").textContent = `TARGET: ${tower.priority.toUpperCase()}`;
      }

      if (state.phase === "gameover") {
        el("gameover").style.display = "flex";
        el("finalscore").textContent = `FINAL SCORE ${state.score} — REACHED ROUND ${state.round}`;
      }
    },
  };
}
