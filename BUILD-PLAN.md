# SKYFALL — Build Plan

Companion to `GAME-DESIGN.md` (the spec — read it first; section references below are to it).
This file is the **phase tracker**. Rules for any agent working on this project:

1. Work ONE phase at a time, in order. Do not start a phase until the previous is checked off.
2. When a phase is done: verify its Definition of Done, check its boxes, update the **Status** line and **Session log**, commit.
3. All balance numbers live in `src/balance.ts` and come from GAME-DESIGN.md §4/§5/§8/§9. Don't scatter constants.
4. Keep the architecture: fixed-timestep sim (never pauses for view changes), data-driven content defs, plain entity arrays. See GAME-DESIGN.md §13.
5. The user is a non-programmer who playtests in the browser (`npm run dev`). Every phase must end in a runnable state.

**Status: Phase 3 COMPLETE — Phase 4 (missile interception, the signature mechanic) is next** (updated 2026-07-07)

---

## Phase 1 — Scaffold & world render ✅ (2026-07-07)

The Spectre-style diorama, rotating. No gameplay.

- [x] Vite + TypeScript + Three.js project scaffold (`npm run dev` / `npm run build`)
- [x] Scene per §12: pale flat ground (200×200), near-black navy sky, hard horizon, sparse stars, subtle grid, directional + ambient light
- [x] 6 cities at fixed positions (§2), white/cyan flat-shaded box clusters
- [x] Isometric camera: fixed ~40° pitch, whole-map fit at any rotation/aspect, free 360° orbit (Q/E + right-drag), 2-step scroll zoom (§10)
- [x] Fixed-timestep sim loop (60 Hz accumulator) decoupled from render, in place from day one
- [x] Minimal HUD shell (build-tag/controls hint)

**DoD:** `npm run dev` → browser shows the barren world with 6 cities; camera orbits smoothly; `npm run build` passes with no type errors.

## Phase 2 — TD core loop ✅ (2026-07-07)

Playable tower defense vs grunts, waves 1–4.

- [x] Data-driven defs: `src/content/towers.ts`, `src/content/enemies.ts` (§4/§5 schemas)
- [x] Placement: build bar (hotkeys 1/2), ghost + range dome preview, validity rules (§11.2)
- [x] Gun + flak towers: auto-fire, targeting priority (First/Strongest/Closest), tracers/shells, flak AoE
- [x] Grunt behavior: group spawn at ENTRY, organic meander descent, landing detonation (§5 — movement made organic per user playtest, doc updated)
- [x] Damage rules: tower 1 HP, city 2 HP with damaged visual state
- [x] Economy: cash, bounties, city income per round (§8)
- [x] Round flow: START ROUND button, mid-round building, wave-clear detection, early-start bonus
- [x] HUD: cash, city count, round number, score, toast, game-over overlay
- [x] Waves 1–4 authored (§9) — wave 4's bomber deferred to Phase 3 (extra grunts stand in)

**DoD:** user can place guns/flak, start rounds 1–4, kill grunts, earn cash, lose towers/cities to landings.

## Phase 3 — Full ground game ✅ (2026-07-07)

Waves 1–15 minus missiles; upgrades; win/lose framing.

- [x] Bomber (seek + hover + bomb drops), diver (plunge), bonus UFO (high transit) per §5 — `src/sim/raiders.ts`
- [x] Tower upgrades (tier 2/3), sell at 70%, targeting-priority UI on tower panel (§4) — `src/sim/actions.ts`, HUD panel
- [x] Waves 1–15 authored table (§9); volley waves spawn their ground portion, missiles stubbed with a warning banner + ⚠ on the start button
- [x] Bonus-city milestone at wave 10 (§8)
- [x] Game over (last city dies) + score screen; score accounting (§3)

**DoD:** waves 1–15 playable end-to-end (missiles stubbed); losing and winning states work.

## Phase 4 — Missile volleys & interception (the signature)

Everything in GAME-DESIGN.md §6/§7.

- [ ] Missile battery tower: placement (first free, must place before round 1), tiers, ammo/reload/silos
- [ ] Warheads: over-horizon bézier arcs, per-volley heading, staggered launches, city + counterforce targeting
- [ ] Alert flow: siren stub, banner, grace period, round-preview ⚠ warnings
- [ ] Coordinate view: dual ortho viewports (side 70% / top 30%, lateral axes aligned), volley frame math (§7.1), 0.6s camera transition, TAB free toggle, auto-return
- [ ] Aiming: shared 3D crosshair + ghost mirror, Scheme A (plotted shot) + Scheme B (plot+commit), settings toggle, proximity inhibit y≥15
- [ ] Auto-pick battery with preview line + flight time (§7.2); interceptor flight; expanding blast spheres; warhead kill check (§7.3)
- [ ] Warhead impacts (city killed outright, tower + splash); intercept bounty
- [ ] Sim continues during coordinate view (verify explicitly)

**DoD:** waves 1–15 fully playable including real volleys at 5/9/12/15; counterforce at 15 threatens batteries; both input schemes work.

## Phase 5 — Full arc & polish

- [ ] Formula waves 16–50 + authored wave-50 finale + victory screen; freeplay 51+ (§9)
- [ ] **Boss stages** (§5 mothership, §9): mega enemy at waves 15/30/45 that descends slowly and emits grunts/divers, escalating per appearance; wave 50 finale = boss + max volley. Note: wave 15's current grunt/bomber composition in `src/sim/waves.ts` gets replaced by the boss. (User idea, added 2026-07-07)
- [ ] Bonus cities at every ×10 milestone
- [ ] Audio: WebAudio synth cues — siren (the star), gun/flak/launch/blast/city-drone/round-sting/UFO warble (§12)
- [ ] Art pass: palette compliance, warhead ribbon trails, blast icosphere, damaged-city states, UFO model
- [ ] Settings panel (fire scheme toggle, volume); localStorage high score
- [ ] Upgrade preview: tower panel shows what the next tier actually changes (dps/range/alt deltas) — playtest feedback 2026-07-07, backburnered from Phase 3
- [ ] Beam + radar towers IF budget allows (else backlog, §14)

**DoD:** complete game per design doc, playable start → wave 50 → freeplay.

## Phase 6 — Balance & playtest pass

Driven by user playtests against GAME-DESIGN.md §15's open questions. No new systems — tuning `balance.ts`, fixing feel issues, choosing the default fire scheme.

---

## Known issues (fix in next session before/with Phase 4)

- **HUD buttons unresponsive** (user playtest 2026-07-07): clicking START ROUND / upgrade panel buttons often takes multiple attempts. Suspects to check, in order: (1) `hud.update()` runs every animation frame and rewrites button `textContent`/`disabled` — a mid-click DOM mutation or a transient `disabled=true` flicker eats the click; (2) buttons react to `click` (needs pointerdown+up on the same element) while the game canvas acts on `pointerdown` — a slight cursor drag during the press cancels the button click; consider firing HUD buttons on `pointerdown` instead; (3) pointer-events layering of `#hud` (container is `pointer-events:none`, buttons re-enable it). Only mutate DOM in `hud.update()` when values actually changed.

## Session log

- **2026-07-07** — Design doc completed and approved. Build plan created. Phase 1 started.
- **2026-07-07** — Phase 1 complete: scaffold, world render, orbit camera, sim loop. `npm run build` clean, dev server verified. Note: Node.js was installed via Homebrew this session (machine had none). Files: `src/{main,balance}.ts`, `src/render/{scene,cameras}.ts`, `src/input/orbit.ts`, `src/sim/state.ts`, `src/ui/hud.ts`. Await user playtest of the diorama before/while starting Phase 2.
- **2026-07-07** — Phase 2 complete: sim entities + game orchestration (`src/sim/{game,waves,enemies,towers}.ts`), placement input, render sync, full HUD. Headless smoke test added (`npm run smoke`, uses tsx) — run it after sim changes. **User playtest feedback applied:** grunt movement felt rigid (axis-locked Space Invaders march) → replaced with organic meander (wandering heading + continuous swelling sink + per-member bob); GAME-DESIGN.md §5 updated to match. Also: grunts fast-dive from ENTRY to y=100 before meandering (pacing — literal spec meant minutes of dead time).
- **2026-07-07 (later)** — Phase 4 NOT started: an agent was launched for it but stopped almost immediately (user's usage budget ran out mid-session). No Phase 4 code exists. User playtested Phase 3: "looks surprisingly good"; one item backburnered to Phase 5 (upgrade preview in tower panel, see Phase 5 list). **Resume here: implement Phase 4 per the checklist above and GAME-DESIGN.md §6/§7.**
- **2026-07-07** — Phase 3 complete: bomber/diver/UFO (`src/sim/raiders.ts` + bombs), upgrade/sell/priority via tower panel (`src/sim/actions.ts`), waves 1–15 (volleys stubbed as warnings), bonus city at wave 10, shared RNG (`src/sim/rng.ts`). **Second playtest feedback applied:** gun rebalanced to long-range/weak (range 80/alt 90, 8 dps T1) vs flak short-range/heavy — user found original gun range left ~1 min dead time; GAME-DESIGN.md §4 updated. Smoke test is now an auto-player that clears all 15 waves (6/6 cities, score ~15k). Session paused here at user request (usage budget). **Next agent: Phase 4 = GAME-DESIGN.md §6/§7, the dual-viewport interception.** Watch for: sim must keep running during coordinate view; battery placement required before round 1 (currently not enforced — add when battery exists).
