import { WAVE_GOAL } from "../balance";
import { BUILDABLE, TOWER_DEFS, type TowerTier } from "../content/towers";
import type { CoordHudInfo } from "../render/coordview";
import { sellRefund, towerById, upgradeCost } from "../sim/actions";
import { aliveBatteries, batteryTier, inboundCount } from "../sim/missiles";
import { coresAlive, type GameState } from "../sim/state";
import { waveDef } from "../sim/waves";

// HTML overlay HUD (GAME-DESIGN.md §11.1): top bar, build bar, start button,
// toast, tower panel (upgrade/sell/priority), game-over overlay.

export interface Hud {
  update(state: GameState, selection: string | null, selectedTowerId: number | null, coord: CoordHudInfo, settings: HudSettings): void;
}

export interface HudSettings {
  open: boolean;
  simSpeed: number;
  volume: number;
  highScore: number;
}

export function createHud(handlers: {
  onStart: () => void;
  onSelect: (id: string | null) => void;
  onUpgrade: () => void;
  onSell: () => void;
  onPriority: () => void;
  onBanner: () => void;
  onSpeed: () => void;
  onSettings: () => void;
  onSpeedValue: (speed: number) => void;
  onVolume: (volume: number) => void;
  onTestMissiles: () => void;
  onTestBoss: () => void;
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
      #hud .victory {
        position: absolute; inset: 0; display: none; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px;
        background: #070b1899; font-size: 34px; letter-spacing: 0.22em;
        color: #35e0e8; text-align: center; pointer-events: none;
        text-shadow: 0 1px 5px #000;
      }
      #hud .victory small { font-size: 14px; color: #d7dce8; letter-spacing: 0.1em; }
      #hud .alert {
        position: absolute; bottom: 108px; left: 0; right: 0; display: none;
        flex-direction: column; align-items: center; gap: 2px;
        pointer-events: none;
      }
      #hud .alert button {
        border-color: #ff5a5a; color: #ff8a8a; background: #30101adf;
        font-size: 15px; letter-spacing: 0.12em; animation: alertpulse 1.1s infinite;
      }
      #hud .alert small { font-size: 11px; letter-spacing: 0.1em; color: #ff8a8a; opacity: 0.8; }
      @keyframes alertpulse { 50% { border-color: #ffb0b0; } }
      #hud .coordbar {
        position: absolute; top: 0; left: 0; right: 0; display: none;
        justify-content: center; gap: 26px; padding: 9px 12px;
        font-size: 13px; letter-spacing: 0.1em; color: #9fe8ee;
        background: #0a1224cc; border-bottom: 1px solid #35e0e844;
      }
      #hud .coorddiv {
        position: absolute; top: 70%; left: 0; right: 0; height: 2px;
        background: #35e0e855; display: none;
      }
      /* coordinate view: map chrome yields to the §11.3 HUD */
      #hud.coord .bar, #hud.coord .alert, #hud.coord .panel { display: none !important; }
      #hud.coord .coordbar { display: flex; }
      #hud.coord .coorddiv { display: block; }
      #hud .tag { position: absolute; left: 12px; bottom: 54px; font-size: 11px; opacity: 0.6; }
      /* the arcade playfield mark (§12 vibe): the game name lives on screen */
      #hud .tag b { color: #35e0e8; font-weight: normal; letter-spacing: 0.14em; }
      #hud .panel {
        position: absolute; right: 14px; bottom: 60px; display: flex;
        flex-direction: column; gap: 6px; padding: 10px 12px; max-width: 286px;
        background: #141b31d9; border: 1px solid #3a4568; border-radius: 6px;
        font-size: 13px;
      }
      #hud .stats {
        color: #b9c3e2; font-size: 11px; line-height: 1.45; letter-spacing: 0.04em;
        white-space: normal;
      }
      #hud .stats b { color: #35e0e8; font-weight: normal; }
      #hud .settingspanel {
        position: absolute; right: 14px; bottom: 112px; display: none;
        flex-direction: column; gap: 8px; padding: 10px 12px; min-width: 230px;
        background: #141b31e8; border: 1px solid #3a4568; border-radius: 6px;
        font-size: 12px; letter-spacing: 0.06em; pointer-events: auto;
      }
      #hud.coord .settingspanel { display: none !important; }
      #hud .settingrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      #hud .seg { display: flex; gap: 4px; }
      #hud .seg button { padding: 5px 8px; font-size: 11px; }
      #hud .testrow { border-top: 1px solid #3a456855; padding-top: 8px; }
      #hud .testrow button {
        padding: 5px 7px; font-size: 10px; color: #b9c3e2;
        border-color: #4a5578; background: #101729cc; opacity: 0.82;
      }
      #hud input[type="range"] { width: 118px; accent-color: #35e0e8; }
    </style>
    <div class="bar top">
      <span data-el="cash"></span>
      <span data-el="round"></span>
      <span data-el="right"></span>
    </div>
    <div class="bar bottom">
      <div class="build" data-el="build"></div>
      <div class="build">
        <button data-el="speed" title="fast-forward [X]">▶▶ 3×</button>
        <button data-el="settings" title="settings">⚙</button>
        <button class="start" data-el="start">▶ START ROUND 1</button>
      </div>
    </div>
    <div class="toast" data-el="toast"></div>
    <div class="alert" data-el="alert">
      <button data-el="alertbtn">⚠ MISSILE LAUNCH ⚠</button>
      <small>[TAB] OR CLICK TO INTERCEPT</small>
    </div>
    <div class="coordbar" data-el="coordbar"></div>
    <div class="coorddiv"></div>
    <div class="panel" data-el="panel" style="display:none">
      <div data-el="ptitle" style="letter-spacing:0.1em"></div>
      <div class="stats" data-el="pstats"></div>
      <button data-el="pupgrade"></button>
      <button data-el="psell"></button>
      <button data-el="ppriority"></button>
    </div>
    <div class="settingspanel" data-el="settingspanel">
      <div class="settingrow">
        <span>SPEED</span>
        <span class="seg">
          <button data-el="speed1">1×</button>
          <button data-el="speed3">3×</button>
        </span>
      </div>
      <div class="settingrow">
        <span>VOLUME</span>
        <input data-el="volume" type="range" min="0" max="100" step="1" />
      </div>
      <div class="settingrow testrow">
        <span>TEST</span>
        <span class="seg">
          <button data-el="testMissiles">TEST MISSILES</button>
          <button data-el="testBoss">TEST BOSS</button>
        </span>
      </div>
    </div>
    <div class="gameover" data-el="gameover">
      ALL CORES LOST
      <small data-el="finalscore"></small>
      <small>reload the page to try again</small>
    </div>
    <div class="victory" data-el="victory">
      EXODEF HELD
      <small>WAVE 50 CLEAR</small>
      <small data-el="victoryscore"></small>
      <small>FREEPLAY UNLOCKED</small>
    </div>
    <div class="tag"><b>EXODEF COMMAND</b> · 1/2/3 build · X 3× speed · TAB intercept · Q/E rotate · scroll zoom · ENTER start</div>
  `;

  const el = (name: string) => hud.querySelector<HTMLElement>(`[data-el="${name}"]`)!;

  // HUD buttons fire on pointerdown, not click: the game canvas acts on
  // pointerdown, and a click (down+up on the same element) was too easy to
  // cancel with a 1px drag mid-press (playtest: "buttons take several tries").
  const press = (element: HTMLElement, handler: () => void) => {
    element.addEventListener("pointerdown", (ev) => {
      ev.preventDefault(); // keep focus/selection quirks out of it
      if (!(element as HTMLButtonElement).disabled) handler();
    });
  };
  // Mutating the DOM only on actual change is the other half of the fix — an
  // every-frame textContent rewrite can eat a press that straddles the frame.
  const setText = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  const setDisplay = (element: HTMLElement, value: string) => {
    if (element.style.display !== value) element.style.display = value;
  };
  const setDisabled = (button: HTMLButtonElement, disabled: boolean) => {
    if (button.disabled !== disabled) button.disabled = disabled;
  };

  const buildBar = el("build");
  const buttons = new Map<string, HTMLButtonElement>();
  for (const id of BUILDABLE) {
    const def = TOWER_DEFS[id];
    const btn = document.createElement("button");
    btn.textContent = `[${def.hotkey}] ${def.name} $${def.cost}`;
    press(btn, () => handlers.onSelect(id));
    buildBar.appendChild(btn);
    buttons.set(id, btn);
  }
  const startBtn = el("start") as HTMLButtonElement;
  press(startBtn, () => handlers.onStart());
  press(el("pupgrade"), () => handlers.onUpgrade());
  press(el("psell"), () => handlers.onSell());
  press(el("ppriority"), () => handlers.onPriority());
  press(el("alertbtn"), () => handlers.onBanner());
  press(el("speed"), () => handlers.onSpeed());
  press(el("settings"), () => handlers.onSettings());
  press(el("speed1"), () => handlers.onSpeedValue(1));
  press(el("speed3"), () => handlers.onSpeedValue(3));
  press(el("testMissiles"), () => handlers.onTestMissiles());
  press(el("testBoss"), () => handlers.onTestBoss());
  const volumeInput = el("volume") as HTMLInputElement;
  volumeInput.addEventListener("input", () => handlers.onVolume(Number(volumeInput.value) / 100));

  return {
    update(state: GameState, selection: string | null, selectedTowerId: number | null, coord: CoordHudInfo, settings: HudSettings): void {
      hud.classList.toggle("coord", coord.active);
      const speedBtn = el("speed") as HTMLButtonElement;
      speedBtn.classList.toggle("sel", settings.simSpeed > 1);
      setText(speedBtn, settings.simSpeed > 1 ? `▶▶ ${settings.simSpeed}× ON` : "▶▶ 3×");
      setDisplay(el("settingspanel"), settings.open ? "flex" : "none");
      (el("speed1") as HTMLButtonElement).classList.toggle("sel", settings.simSpeed === 1);
      (el("speed3") as HTMLButtonElement).classList.toggle("sel", settings.simSpeed === 3);
      const volumeValue = String(Math.round(settings.volume * 100));
      if (volumeInput.value !== volumeValue) volumeInput.value = volumeValue;
      setDisabled(el("testMissiles") as HTMLButtonElement, state.phase === "gameover" || state.volley !== null);
      setDisabled(el("testBoss") as HTMLButtonElement, state.phase === "gameover");
      const bestScore = Math.max(settings.highScore ?? 0, state.score);
      if (coord.active) {
        // §11.3: ammo pips, auto-pick flight time, inbound count, click-pair readiness
        const pips = aliveBatteries(state).map((b, i) => {
          const bs = b.battery!;
          const cap = batteryTier(b).ammoPerVolley;
          const state_ = bs.reloadLeft > 0 ? " RELOADING" : "";
          return `◈${i + 1} ${"▪".repeat(bs.ammo)}${"▫".repeat(Math.max(0, cap - bs.ammo))}${state_}`;
        }).join("  ");
        const flight = coord.previewSeconds !== null ? `FLIGHT ${coord.previewSeconds.toFixed(1)}s` : "NO BATTERY READY";
        const plot = `SHOT — SIDE ${coord.needSide ? "○" : "●"} TOP ${coord.needTop ? "○" : "●"}`;
        setText(el("coordbar"), `⚠ ${inboundCount(state)} INBOUND  ·  ${pips || "NO BATTERIES"}  ·  ${flight}  ·  ${plot}  ·  [TAB] MAP`);
      }
      setText(el("cash"), `$${state.cash}`);
      setText(el("round"), state.round === 0 ? "PLACE YOUR DEFENSES" : `ROUND ${state.round}`);
      setText(el("right"), `◆ ${coresAlive(state)}/6 · SCORE ${state.score} · BEST ${bestScore}`);
      for (const [id, btn] of buttons) {
        btn.classList.toggle("sel", selection === id);
        setDisabled(btn, state.cash < TOWER_DEFS[id].cost && selection !== id);
      }
      setDisplay(startBtn, state.phase === "build" ? "" : "none");
      const nextMissiles = waveDef(state.round + 1)?.missiles;
      const startLabel = state.round >= WAVE_GOAL ? `▶ FREEPLAY ROUND ${state.round + 1}` : `▶ START ROUND ${state.round + 1}`;
      setText(startBtn, `${startLabel}${nextMissiles ? " ⚠ MISSILES" : ""}`);
      const toastEl = el("toast");
      setText(toastEl, state.message);
      const toastOpacity = state.messageTtl > 0 ? "1" : "0";
      if (toastEl.style.opacity !== toastOpacity) toastEl.style.opacity = toastOpacity;

      // missile alert banner (§6.2) — shown during a volley, in map view
      const volleyOn = state.volley !== null;
      setDisplay(el("alert"), volleyOn ? "flex" : "none");
      if (volleyOn) {
        setText(el("alertbtn"), `⚠ MISSILE LAUNCH — ${inboundCount(state)} INBOUND ⚠`);
      }

      // tower panel
      const tower = selectedTowerId !== null ? towerById(state, selectedTowerId) : undefined;
      setDisplay(el("panel"), tower ? "flex" : "none");
      if (tower) {
        const def = TOWER_DEFS[tower.defId];
        const ammo = tower.battery && volleyOn ? ` · AMMO ${tower.battery.ammo}` : "";
        setText(el("ptitle"), `${def.name} T${tower.tier + 1}${ammo}`);
        el("pstats").innerHTML = formatTowerStats(tower.defId, tower.tier);
        const upBtn = el("pupgrade") as HTMLButtonElement;
        const cost = upgradeCost(tower);
        setText(upBtn, cost === null ? "MAX TIER" : `UPGRADE $${cost}`);
        setDisabled(upBtn, cost === null || state.cash < cost);
        setDisplay(el("psell"), tower.noSell ? "none" : "");
        setText(el("psell"), `SELL +$${sellRefund(tower)}`);
        // batteries never auto-target (§6.5) — hide the priority cycler
        setDisplay(el("ppriority"), tower.defId === "battery" ? "none" : "");
        setText(el("ppriority"), `TARGET: ${tower.priority.toUpperCase()}`);
      }

      if (state.phase === "gameover") {
        setDisplay(el("gameover"), "flex");
        setText(el("finalscore"), `FINAL SCORE ${state.score} — BEST ${bestScore} — REACHED ROUND ${state.round}`);
      }
      setText(el("victoryscore"), `SCORE ${state.score} — BEST ${bestScore}`);
      setDisplay(el("victory"), state.won && state.phase === "build" && state.round === WAVE_GOAL ? "flex" : "none");
    },
  };
}

function formatTowerStats(defId: string, tierIndex: number): string {
  const def = TOWER_DEFS[defId];
  const current = def.tiers[tierIndex];
  const next = def.tiers[tierIndex + 1];
  const lines = [`<b>NOW</b> ${tierSummary(current, defId)}`];
  lines.push(next ? `<b>NEXT</b> ${tierSummary(next, defId, current)}` : "<b>NEXT</b> MAX TIER");
  return lines.join("<br>");
}

function tierSummary(tier: TowerTier, defId: string, prev?: TowerTier): string {
  const parts: string[] = [];
  if (tier.shot) {
    parts.push(delta("DPS", Math.round(tier.shot.damage / tier.shot.period), prev?.shot && Math.round(prev.shot.damage / prev.shot.period)));
    parts.push(delta("RNG", tier.rangeRadius, prev?.rangeRadius));
    parts.push(delta("ALT", tier.maxAltitude, prev?.maxAltitude));
  } else if (tier.burst) {
    parts.push(delta("DMG", tier.burst.damage, prev?.burst?.damage));
    parts.push(delta("RATE", Number((1 / tier.burst.period).toFixed(1)), prev?.burst && Number((1 / prev.burst.period).toFixed(1))));
    parts.push(delta("AOE", tier.burst.aoeRadius, prev?.burst?.aoeRadius));
    parts.push(delta("ALT", tier.maxAltitude, prev?.maxAltitude));
  } else if (tier.interceptor) {
    parts.push(delta("SPD", tier.interceptor.speed, prev?.interceptor?.speed));
    parts.push(delta("RLD", tier.interceptor.reload, prev?.interceptor?.reload));
    parts.push(delta("BLAST", tier.interceptor.blastRadius, prev?.interceptor?.blastRadius));
    parts.push(delta("AMMO", tier.interceptor.ammoPerVolley, prev?.interceptor?.ammoPerVolley));
    if (defId === "battery" || tier.interceptor.silos > 1) parts.push(delta("SILOS", tier.interceptor.silos, prev?.interceptor?.silos));
  }
  return parts.join(" · ");
}

function delta(label: string, value: number, prev?: number): string {
  if (prev === undefined || value === prev) return `${label} ${value}`;
  const change = Number((value - prev).toFixed(1));
  const signed = change > 0 ? `+${change}` : String(change);
  return `${label} ${value} (${signed})`;
}
