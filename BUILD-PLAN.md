# EXODEF — Build Plan

*(Retitled from SKYFALL 2026-07-07.)*

Companion to `GAME-DESIGN.md` (the spec — read it first; section references below are to it).
This file is the **phase tracker**. Rules for any agent working on this project:

1. Work ONE phase at a time, in order. Do not start a phase until the previous is checked off.
2. When a phase is done: verify its Definition of Done, check its boxes, update the **Status** line and **Session log**, commit.
3. All balance numbers live in `src/balance.ts` and come from GAME-DESIGN.md §4/§5/§8/§9. Don't scatter constants.
4. Keep the architecture: fixed-timestep sim (never pauses for view changes), data-driven content defs, plain entity arrays. See GAME-DESIGN.md §13.
5. The user is a non-programmer who playtests in the browser (`npm run dev`). Every phase must end in a runnable state.

**Status: Phase 5 IN PROGRESS — plotted-only interception after playtest; optional beam/radar towers remain deferred** (updated 2026-07-07)

> **Resume here (fresh context):** read GAME-DESIGN.md first. Waves 16–50/freeplay/victory, bonus cores, mothership boss stages, WebAudio cues, settings, local high score, upgrade preview, art/readability pass, core/platform terminology, and plotted-only interception are implemented. Verify with `npm run build` + `npm run smoke` after sim changes; the user playtests with `npm run dev`. Game is titled **EXODEF**. Still open from §15: Phase 6 tuning items.

---

## Phase 1 — Scaffold & world render ✅ (2026-07-07)

The Spectre-style defence-platform diorama, rotating. No gameplay.

- [x] Vite + TypeScript + Three.js project scaffold (`npm run dev` / `npm run build`)
- [x] Scene per §12: pale flat ground (200×200), near-black navy sky, hard horizon, sparse stars, subtle grid, directional + ambient light
- [x] 6 cores at fixed positions (§2), white/cyan flat-shaded box clusters
- [x] Isometric camera: fixed ~40° pitch, whole-map fit at any rotation/aspect, free 360° orbit (Q/E + right-drag), 2-step scroll zoom (§10)
- [x] Fixed-timestep sim loop (60 Hz accumulator) decoupled from render, in place from day one
- [x] Minimal HUD shell (build-tag/controls hint)

**DoD:** `npm run dev` → browser shows the barren world with 6 cores; camera orbits smoothly; `npm run build` passes with no type errors.

## Phase 2 — TD core loop ✅ (2026-07-07)

Playable tower defense vs grunts, waves 1–4.

- [x] Data-driven defs: `src/content/towers.ts`, `src/content/enemies.ts` (§4/§5 schemas)
- [x] Placement: build bar (hotkeys 1/2), ghost + range dome preview, validity rules (§11.2)
- [x] Gun + flak towers: auto-fire, targeting priority (First/Strongest/Closest), tracers/shells, flak AoE
- [x] Grunt behavior: group spawn at ENTRY, organic meander descent, landing detonation (§5 — movement made organic per user playtest, doc updated)
- [x] Damage rules: tower 1 HP, core 2 HP with damaged visual state
- [x] Economy: cash, bounties, core income per round (§8)
- [x] Round flow: START ROUND button, mid-round building, wave-clear detection, early-start bonus
- [x] HUD: cash, core count, round number, score, toast, game-over overlay
- [x] Waves 1–4 authored (§9) — wave 4's bomber deferred to Phase 3 (extra grunts stand in)

**DoD:** user can place guns/flak, start rounds 1–4, kill grunts, earn cash, lose towers/cores to landings.

## Phase 3 — Full ground game ✅ (2026-07-07)

Waves 1–15 minus missiles; upgrades; win/lose framing.

- [x] Bomber (seek + hover + bomb drops), diver (plunge), bonus UFO (high transit) per §5 — `src/sim/raiders.ts`
- [x] Tower upgrades (tier 2/3), sell at 70%, targeting-priority UI on tower panel (§4) — `src/sim/actions.ts`, HUD panel
- [x] Waves 1–15 authored table (§9); volley waves spawn their ground portion, missiles stubbed with a warning banner + ⚠ on the start button
- [x] Bonus-core milestone at wave 10 (§8)
- [x] Game over (last core dies) + score screen; score accounting (§3)

**DoD:** waves 1–15 playable end-to-end (missiles stubbed); losing and winning states work.

## Phase 4 — Missile volleys & interception (the signature) ✅ (2026-07-07)

Everything in GAME-DESIGN.md §6/§7, plus the 2026-07-07 playtest-review additions (radar §11.4, pre-placed battery, bonus removal).

- [x] Remove early-start bonus (playtest: unnecessary) — `balance.ts`, `game.ts`, docs
- [x] Fix HUD button responsiveness (pointerdown firing + change-guarded DOM writes)
- [x] Missile battery tower: free T1 **pre-placed at map center** (dormant until first siren, unsellable), additional at $600, tiers, ammo/reload/silos — `src/sim/missiles.ts`, `src/content/towers.ts`
- [x] Warheads: over-horizon bézier arcs, per-volley heading, staggered launches, core + counterforce targeting
- [x] Alert flow: siren stub (`src/ui/siren.ts`), banner, grace (emergent from 30s arcs), round-preview ⚠ warnings
- [x] Coordinate view: dual ortho viewports (side 70% / top 30%, lateral axes aligned), volley frame math (§7.1), 0.6s camera transition, TAB free toggle, auto-return — `src/render/coordview.ts`
- [x] Aiming: shared 3D crosshair (one object serves both viewports as its own ghost), plotted side+top click pair, proximity inhibit y≥15
- [x] Auto-pick battery with preview line + flight time (§7.2); interceptor flight; expanding blast spheres; warhead kill check (§7.3)
- [x] Warhead impacts (core killed outright, tower + 12u splash); intercept bounty $30
- [x] Persistent radar overlay (§11.4): corner canvas in both views, camera-relative lateral × altitude — `src/ui/radar.ts`
- [x] Sim continues during coordinate view — by construction: `main.ts` runs `simTick` before any view logic; the coordinate view touches only camera/render/input. Confirm the feel in browser playtest.

**DoD:** waves 1–15 fully playable including real volleys at 5/9/12/15; counterforce at 15 threatens batteries; plotted side+top click aiming works. *(Verified headless — auto-player leads + intercepts all 12 warheads, 6/6 cores — and user-playtested 2026-07-07; the radar and top-view findings from that playtest are fixed, see session log.)*

## Phase 5 — Full arc & polish

- [x] Formula waves 16–50 + authored wave-50 finale + victory screen; freeplay 51+ (§9)
- [x] Spawn-spread parameter: delivery gets irregular/staggered as waves rise, same volume (§9, playtest 2026-07-07) — may retroactively loosen waves ~10–15
- [x] **Boss stages** (§5 mothership, §9): mega enemy at waves 15/30/45 that descends slowly and emits grunts/divers, escalating per appearance; wave 50 finale = boss + max volley. Note: wave 15's current grunt/bomber composition in `src/sim/waves.ts` gets replaced by the boss. (User idea, added 2026-07-07)
- [x] Bonus cores at every ×10 milestone
- [x] Audio: WebAudio synth cues — siren (the star), gun/flak/launch/blast/core-drone/round-sting/UFO warble (§12)
- [x] Art pass: palette compliance, warhead ribbon trails, blast icosphere, damaged-core states, UFO model
- [x] Settings panel (game speed; volume; visual test buttons)
- [x] localStorage high score
- [x] Upgrade preview: tower panel shows what the next tier actually changes (dps/range/alt deltas) — playtest feedback 2026-07-07, backburnered from Phase 3
- [ ] Beam + radar towers IF budget allows (else backlog, §14)

**DoD:** complete game per design doc, playable start → wave 50 → freeplay.

## Phase 6 — Balance & playtest pass

Driven by user playtests against GAME-DESIGN.md §15's open questions. No new systems — tuning `balance.ts` and fixing feel issues.

Queued from the 2026-07-07 playtest (user deferred all three here deliberately):
- Economy is too generous — tighten income/bounties/costs together
- Stronger-enemy volume too low as stages progress (grunt swarms stay too easy); lever undecided: wave composition vs. enemy strength vs. economy
- Battery upgrade direction: bigger blast radius vs. fan-shot (§15 Q7).  further ideas: first upgrade, "persist" blast (couple seconds burn zone so accuracy is less critical), second upgrade, "cluster warhead", explodes in a 3-d triangular diamond shape, 4 blast points, costly upgrade as it would greatly decrease accuracy requirement.

---

## Known issues

- ~~**HUD buttons unresponsive** (user playtest 2026-07-07)~~ **FIXED 2026-07-07** with Phase 4: HUD buttons now fire on `pointerdown` (canvas parity, drag-during-press can't cancel) and `hud.update()` only mutates the DOM when values actually change. Confirm in next browser playtest.

## Backlog notes

- Should cores become repairable later? Defer to Phase 6+ balance discussion; not part of the Phase 5 readability pass.

## Session log

- **2026-07-07** — Design doc completed and approved. Build plan created. Phase 1 started.
- **2026-07-07** — Phase 1 complete: scaffold, world render, orbit camera, sim loop. `npm run build` clean, dev server verified. Note: Node.js was installed via Homebrew this session (machine had none). Files: `src/{main,balance}.ts`, `src/render/{scene,cameras}.ts`, `src/input/orbit.ts`, `src/sim/state.ts`, `src/ui/hud.ts`. Await user playtest of the diorama before/while starting Phase 2.
- **2026-07-07** — Phase 2 complete: sim entities + game orchestration (`src/sim/{game,waves,enemies,towers}.ts`), placement input, render sync, full HUD. Headless smoke test added (`npm run smoke`, uses tsx) — run it after sim changes. **User playtest feedback applied:** grunt movement felt rigid (axis-locked Space Invaders march) → replaced with organic meander (wandering heading + continuous swelling sink + per-member bob); GAME-DESIGN.md §5 updated to match. Also: grunts fast-dive from ENTRY to y=100 before meandering (pacing — literal spec meant minutes of dead time).
- **2026-07-07 (later)** — Phase 4 NOT started: an agent was launched for it but stopped almost immediately (user's usage budget ran out mid-session). No Phase 4 code exists. User playtested Phase 3: "looks surprisingly good"; one item backburnered to Phase 5 (upgrade preview in tower panel, see Phase 5 list). **Resume here: implement Phase 4 per the checklist above and GAME-DESIGN.md §6/§7.**
- **2026-07-07** — Phase 3 complete: bomber/diver/UFO (`src/sim/raiders.ts` + bombs), upgrade/sell/priority via tower panel (`src/sim/actions.ts`), waves 1–15 (volleys stubbed as warnings), bonus core at wave 10, shared RNG (`src/sim/rng.ts`). **Second playtest feedback applied:** gun rebalanced to long-range/weak (range 80/alt 90, 8 dps T1) vs flak short-range/heavy — user found original gun range left ~1 min dead time; GAME-DESIGN.md §4 updated. Smoke test is now an auto-player that clears all 15 waves (6/6 cores, score ~15k). Session paused here at user request (usage budget). **Next agent: Phase 4 = GAME-DESIGN.md §6/§7, the dual-viewport interception.** Watch for: sim must keep running during coordinate view; battery placement required before round 1 (currently not enforced — add when battery exists). *(Superseded 2026-07-07 review: battery is now pre-placed, no placement gate.)*
- **2026-07-07** — Playtest-notes review (`playtestnotes.md`) via design interview before Phase 4. Decisions: 9 weapon ideas → §14 backlog (curate 2–3 after Phase 4); persistent radar overlay added to Phase 4 scope (new §11.4 — answers §15 Q3); free battery now **pre-placed at map center**, dormant + unsellable (user idea mid-review); early-start bonus cut; battery "spread" = blast radius (already in tiers), direction question logged as §15 Q7; spawn-spread → Phase 5; economy + stronger-enemy-volume tuning → Phase 6. Both docs amended.
- **2026-07-07** — Phase 4 complete: missile sim (`src/sim/missiles.ts` — volleys, bézier warheads, batteries, interceptors, blast kill check), coordinate view (`src/render/coordview.ts` — dual ortho viewports, volley frame, 0.6s swing, plotted side+top click aiming), radar overlay (`src/ui/radar.ts`), siren stub (`src/ui/siren.ts`), alert banner + coord HUD strip in `hud.ts`. Central battery pre-placed with wake light. Smoke auto-player now leads shots along warhead arcs: waves 1–15 clear 6/6 cores, all 12 warheads intercepted, counterforce at 15 included. `npm run build` clean.
- **2026-07-07 (playtest + wrap)** — User playtested Phase 4 live; all findings fixed in-session: **radar invisible** (canvas was created before `createHud()`'s innerHTML rebuild → drew to a detached element; also brightened band grid + window-scaled panel/labels 1×–1.6×); **top view empty for half of each volley** (entry moved from 260u-behind-target to fixed depth just past the platform edge, top viewport made asymmetric — V_BACK 165 / V_FRONT 115, §6.1 updated). Added **3× fast-forward** ([X]/HUD button; auto-resets to 1× at volley launch — keeps the siren moment honest). **Retitled EXODEF** with an EXODEF COMMAND playfield mark (arcade-style, HUD tag). Backlog grew: orbital-platform reframe + Bloons-style bypass lives, converging multi-heading volleys, branding (resolved). **Next agent: Phase 5** — waves 16–50 formula + spawn-spread, mothership boss (replaces wave 15's current composition), wave-50 finale + victory, audio pass (real siren), art pass, settings panel (absorb the [X] toggle), upgrade preview. Watch: boss at 15/30/45 escalation.
- **2026-07-07 (Phase 5 chunk 1)** — Implemented deterministic formula waves 16–50 plus freeplay generation, scaling HP/speed spawn metadata, generated missile scheduling, wave-50 victory/freeplay overlay, and wave-50 survivor score bonus. Extended smoke auto-player to spend late-game cash on more towers and backup batteries. Not done yet: mothership bosses, authored boss+max-volley finale, audio/art/settings/upgrade-preview work. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 2)** — Implemented mothership boss as a normal targetable enemy (`mothership` def + flat-shaded model + radar dot): large hull targeting, slow descent/roam, grunt/diver emissions from underside, low-altitude bomb drops, and escalating HP for waves 15/30/45/50. Wave 15 now replaces the old normal composition with boss + counterforce volley; wave 50 is boss + max volley. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 3)** — Implemented WebAudio pass and settings panel. Siren is a harsh stacked sawtooth/bandpass wail per user direction; repeated cues use lower-gain sine/square synths (gun, flak, interceptor launch, blasts, core hit/death, round clear, UFO warble). Settings panel now controls current game speed and volume; volume persists in localStorage. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 4)** — Implemented localStorage high score and tower upgrade preview. HUD top bar and end overlays show BEST score; the tower panel now summarizes current tier and next-tier deltas from `TOWER_DEFS` (DPS/range/alt, flak rate/AoE, battery speed/reload/blast/ammo/silos). Hot-reload guard added so BEST never renders `undefined` during dev. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 art/readability pass)** — Implemented focused gameplay-readability polish: warheads now use larger white points plus solid red mesh ribbon trails; interceptors use shorter cyan-white trails and cyan blasts; ground/warhead impacts use warm red-orange blast spheres; core clusters have healthy cyan pulse and damaged red flicker while destroyed clusters remain dark; mothership emissions moved to visible side bays with brief flashes; bombs and mothership side bays got silhouette/readability tweaks; radar/crosshair/preview contrast tuned. Added secondary HUD settings buttons for `TEST MISSILES` and `TEST BOSS`; test threats run through normal sim damage/bounties without advancing round progression or granting round-clear income.
- **2026-07-07 (core terminology cleanup)** — Standardized the project around the orbital defence platform / energy core fiction. User-facing HUD, toasts, docs, balance constants, sim state, targeting, render sync, placement rules, smoke output, and audio cue names now use core terminology. The temporary damaged-core debug start was removed after user verification.
- **2026-07-07 (aiming simplification)** — Removed the plot+commit/SPACE firing scheme after user playtest found base-speed gameplay too quick for a separate confirm step. Coordinate view now always uses plotted side+top click pairs; settings/localStorage no longer carry a fire scheme; HUD/docs updated.
