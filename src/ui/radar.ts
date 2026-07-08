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
  grunt: { r: 1.25, color: "#74336c" }, // dim — swarm reads as texture
  bomber: { r: 2.7, color: "#54e05a" },
  diver: { r: 3.0, color: "#ff5a5a" },
  ufo: { r: 2.7, color: "#c8ccd8" },
  mothership: { r: 5.4, color: "#8f8cff" },
  splitter: { r: 3.2, color: "#ffb03c" },
  fragment: { r: 1.6, color: "#d98a2c" },
  swarmling: { r: 1.1, color: "#8a9a2e" }, // dim — cluster reads as texture
};

export interface Radar {
  draw(state: GameState, right: THREE.Vector3): void;
}

export function createRadar(): Radar {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `
    position: absolute; right: 14px; top: 46px;
    background: #070b18c0; border: 1px solid #3a4568; border-radius: 4px;
  `;
  document.getElementById("hud")!.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  // Scale with the window so labels stay readable on large displays (playtest:
  // tiny at WQHD) without growing past 1× on small ones. Drawing code works in
  // logical WIDTH×HEIGHT units; the transform handles the rest.
  function resize(): void {
    const scale = Math.min(1.6, Math.max(1, window.innerHeight / 900));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(WIDTH * scale * dpr);
    canvas.height = Math.round(HEIGHT * scale * dpr);
    canvas.style.width = `${Math.round(WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(HEIGHT * scale)}px`;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

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

      // altitude band ticks (§2) — bright enough to read over the dark bg
      // (playtest 2026-07-07: original 40%-alpha lines were invisible)
      ctx.font = "9.5px Menlo, monospace";
      ctx.lineWidth = 1;
      for (const alt of [BANDS.landingTop, BANDS.lowTop, BANDS.midTop, BANDS.highTop, BANDS.entryTop]) {
        const y = toY(alt) + 0.5; // crisp 1px line
        ctx.strokeStyle = "#55639a";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
        ctx.fillStyle = "#a9b6e0";
        ctx.fillText(String(alt), 3, y + 8);
      }
      // ground line
      ctx.strokeStyle = "#8b96c4";
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT - 0.5);
      ctx.lineTo(WIDTH, HEIGHT - 0.5);
      ctx.stroke();
      ctx.fillStyle = "#a9b6e0";
      ctx.fillText("RADAR", WIDTH - 34, 10);

      // grunts first (background texture), raiders/bombs, then warheads on top
      const sorted = [...state.enemies].sort((a, b) => (a.defId === "grunt" ? -1 : 1) - (b.defId === "grunt" ? -1 : 1));
      for (const enemy of sorted) {
        if (!enemy.alive) continue;
        const style = DOT_STYLE[enemy.defId] ?? { r: 3, color: "#ffffff" };
        dot(enemy.pos.dot(right), enemy.pos.y, style.r, style.color);
      }
      for (const bomb of state.bombs) {
        if (!bomb.alive) continue;
        const u = bomb.pos.dot(right);
        dot(u, bomb.pos.y, 2.4, "#ff7a2d");
        dot(u, bomb.pos.y, 0.9, "#3a2430");
      }
      for (const w of state.warheads) {
        if (!w.alive) continue;
        const u = w.pos.dot(right);
        dot(u, w.pos.y, 4.2, "#ff2b2b");
        dot(u, w.pos.y, 1.7, "#ffffff");
      }
    },
  };
}
