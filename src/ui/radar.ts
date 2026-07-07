import * as THREE from "three";
import { BANDS } from "../balance";
import type { GameState } from "../sim/state";

// Persistent radar overlay (GAME-DESIGN.md §11.4, 2026-07-07 playtest review):
// the fixed camera pitch makes altitude hard to read, so a small corner plot
// shows every airborne threat as a dot — X = lateral position relative to the
// CURRENT camera heading (matches the screen even while orbiting; in the
// coordinate view this is the volley frame's lateral axis), Y = altitude with
// band ticks. Low dot = urgent. Loudness ∝ threat: warheads loudest, grunts a
// faint texture.

const WIDTH = 232;
const HEIGHT = 148;
const ALT_MAX = 170;
const U_HALF = 130; // lateral world-units shown either side of center

const DOT_STYLE: Record<string, { r: number; color: string }> = {
  grunt: { r: 1.4, color: "#8a3a80" }, // dim — swarm reads as texture
  bomber: { r: 2.6, color: "#54e05a" },
  diver: { r: 2.4, color: "#ff5a5a" },
  ufo: { r: 2.6, color: "#c8ccd8" },
};

export interface Radar {
  draw(state: GameState, right: THREE.Vector3): void;
}

export function createRadar(): Radar {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.cssText = `
    position: absolute; right: 14px; top: 46px;
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: #070b18c0; border: 1px solid #3a4568; border-radius: 4px;
  `;
  document.getElementById("hud")!.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const toX = (u: number) => ((u + U_HALF) / (2 * U_HALF)) * WIDTH;
  const toY = (alt: number) => HEIGHT - (alt / ALT_MAX) * HEIGHT;

  function dot(u: number, alt: number, r: number, color: string): void {
    const x = toX(u);
    if (x < 1 || x > WIDTH - 1) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, toY(alt), r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    draw(state: GameState, right: THREE.Vector3): void {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // altitude band ticks (§2)
      ctx.strokeStyle = "#3a456866";
      ctx.fillStyle = "#7f8fc599";
      ctx.font = "8px Menlo, monospace";
      ctx.lineWidth = 1;
      for (const alt of [BANDS.landingTop, BANDS.lowTop, BANDS.midTop, BANDS.highTop, BANDS.entryTop]) {
        const y = toY(alt);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
        ctx.fillText(String(alt), 3, y + 8);
      }
      ctx.fillText("RADAR", WIDTH - 34, 10);

      // grunts first (background texture), raiders, then warheads on top
      const sorted = [...state.enemies].sort((a, b) => (a.defId === "grunt" ? -1 : 1) - (b.defId === "grunt" ? -1 : 1));
      for (const enemy of sorted) {
        if (!enemy.alive) continue;
        const style = DOT_STYLE[enemy.defId] ?? { r: 3, color: "#ffffff" };
        dot(enemy.pos.dot(right), enemy.pos.y, style.r, style.color);
      }
      for (const w of state.warheads) {
        if (!w.alive) continue;
        const u = w.pos.dot(right);
        dot(u, w.pos.y, 3.4, "#ff2b2b");
        dot(u, w.pos.y, 1.4, "#ffffff");
      }
    },
  };
}
