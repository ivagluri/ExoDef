// HTML overlay HUD (GAME-DESIGN.md §11). Phase 1: just the dev tag + controls hint.

export function createHud(): void {
  const hud = document.getElementById("hud")!;
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = "SKYFALL dev · phase 1 · Q/E or right-drag: rotate · scroll: zoom";
  hud.appendChild(tag);
}
