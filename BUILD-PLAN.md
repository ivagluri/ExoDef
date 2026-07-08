# EXODEF — Build Plan

*(Retitled from SKYFALL 2026-07-07.)*

Companion to `GAME-DESIGN.md` (the spec — read it first; section references below are to it).
This file is the **phase tracker**. Rules for any agent working on this project:

1. Work ONE phase at a time, in order. Do not start a phase until the previous is checked off.
2. When a phase is done: verify its Definition of Done, check its boxes, update the **Status** line and **Session log**, commit.
3. Core balance/scaling numbers live in `src/balance.ts`; tower/enemy per-unit definitions live in `src/content/`. Keep new tunables centralized in those files, not scattered through systems.
4. Keep the architecture: fixed-timestep sim (never pauses for view changes), data-driven content defs, plain entity arrays. See GAME-DESIGN.md §13.
5. The user is a non-programmer who playtests in the browser (`npm run dev`). Every phase must end in a runnable state.

**Status: Phase 8 BUILT — ten-tower roster complete; user has declared the roster done and the BALANCE PASS is the agreed next phase** (updated 2026-07-07)

> **Resume here (fresh context):** read `GAME-DESIGN.md` first, then this section. The current build: complete wave-50/freeplay arc, boss stages, audio/settings/high score, plotted-only missile interception, **ten-tower roster** (Phase 7: Napalm Clouder + Aerial Hack Array; Phase 8: Blockade Launcher + one-shot Nuke), **seven enemy types** (Phase 7: Splitter + Swarm Cluster, debuting waves 12/14 and in the 16+ formula), and paid damaged-core repair. The user explicitly closed roster expansion ("let's build two more then we can settle in for the fun balancing part") — the next phase is the balance pass: economy generosity, stronger-enemy volume, and per-tower tuning from the backlog notes. Playtest of Phases 7–8 may surface fixes first.

### Next Agent Checklist

- Start from clean `main`; expected latest commit is `9912d35 Fix Phase 6 playtest feedback` unless the user has made newer changes.
- Use `npm run dev` for browser playtest, `npm run build` after TypeScript/render changes, and `npm run smoke` after sim/gameplay changes. `npm run smoke` may need elevated execution because `tsx` opens an IPC pipe.
- Keep enemy warheads purely player-fought; AA Missile towers must never target warheads.
- Keep “core” language everywhere. These are energy cores on an orbital defence platform, not cities.
- Balance tuning is backlog until the user explicitly wants it; the roster was intentionally stabilized first.

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

## Phase 5 — Full arc & polish ✅ (2026-07-07)

- [x] Formula waves 16–50 + authored wave-50 finale + victory screen; freeplay 51+ (§9)
- [x] Spawn-spread parameter: delivery gets irregular/staggered as waves rise, same volume (§9, playtest 2026-07-07) — may retroactively loosen waves ~10–15
- [x] **Boss stages** (§5 mothership, §9): mega enemy at waves 15/30/45 that descends slowly and emits grunts/divers, escalating per appearance; wave 50 finale = boss + max volley. Note: wave 15's current grunt/bomber composition in `src/sim/waves.ts` gets replaced by the boss. (User idea, added 2026-07-07)
- [x] Bonus cores at every ×10 milestone
- [x] Audio: WebAudio synth cues — siren (the star), gun/flak/launch/blast/core-drone/round-sting/UFO warble (§12)
- [x] Art pass: palette compliance, warhead ribbon trails, blast icosphere, damaged-core states, UFO model
- [x] Settings panel (game speed; volume; visual test buttons)
- [x] localStorage high score
- [x] Upgrade preview: tower panel shows what the next tier actually changes (dps/range/alt deltas) — playtest feedback 2026-07-07, backburnered from Phase 3
- [x] Close Phase 5 cut-line: beam/radar towers moved to backlog; persistent HUD radar already covers the v1 radar/readability need

**DoD:** complete game per design doc, playable start → wave 50 → freeplay.

## Phase 6 — Roster expansion & core repair ✅ (2026-07-07)

Roster stabilization before serious balance tuning. Adds low-risk tower concepts from the preserved backlog plus an explicit damaged-core repair action.

- [x] Repulsor Beam tower: applies an upward-retreat debuff to normal invaders, then retargets after a cooldown; upgrades improve cooldown/duration/lift; no warhead or boss effect
- [x] AA Missile tower: automatic slow guided anti-invader missiles with long reach; never targets enemy warheads
- [x] Drone Launcher tower: persistent reusable drones; tier upgrades increase active drone cap and flexible DPS
- [x] Paid core repair: click a surviving damaged core and spend $300 to restore it to full; destroyed cores still require milestone rebuilds
- [x] Six-tower build bar with reused tower-model previews; static by default, rotate on hover/selection

**DoD:** new towers are buildable/upgradable, repair works during combat, enemy warhead interception remains purely player-plotted, and `npm run build` + `npm run smoke` pass. User browser playtest decides follow-up fixes.

**Live playtest status:** looking good after AA Missile Strongest default, drone separation, and missile-orientation fixes. No blocking Phase 6 issue is currently recorded.

## Phase 7 — Roster expansion II: area denial & conversion

Design interview 2026-07-07 (user direction: **towers lead, enemies designed as threats those towers answer**; scope split into two phases to keep changes small).

- [x] Napalm Clouder tower: auto-lobbed canister → lingering chip-damage cloud (~6–8s, tier-scaled radius/DPS/rate); never affects warheads
- [x] Aerial Hack Array tower: converts one invader (never mothership) into a one-run kamikaze vs the closest other invader; self-destructs if alone; hacked unit pays no bounty, its kills pay normal bounty; defaults to Strongest targeting; holds fire unless ≥2 targets
- [x] Splitter enemy: weaving solo descender; bursts into 4 fast-falling fragments on kill OR at y≈20 intact (fragment phase never skippable)
- [x] Swarm Cluster enemy: 12–16 swarmlings on the grunt group system with denser/faster params; tower kills as usual, cores take 1 hit per 3 nearby landings (pips above core; charge resets at round end)
- [x] Wave integration: splitter debut wave 12, swarm debut wave 14, both in the 16–50 formula mix and freeplay
- [x] Eight-slot build bar (hotkeys 7/8), upgrade-preview deltas for cloud/hack, TEST SPLITTER / TEST SWARM settings buttons
- [x] Smoke: Phase 7 mechanic assertions + auto-player buys napalm/hack; full run clears wave 50 with 6/6 cores

**DoD:** new towers buildable/upgradable, new enemies spawn in their debut waves and formula mix, warhead interception remains purely player-plotted, `npm run build` + `npm run smoke` pass. **User browser playtest decides follow-up fixes.**

## Phase 8 — Roster finale: blockade & the fool's gold nuke

User direction 2026-07-07: two more towers (hotkeys 9/0), then balance. Orbital mine deferred (overlaps napalm's niche); tower-hunter drone enemy cut (duplicates the dive bomber).

- [x] Blockade Launcher ($400): launches a hovering hex barrier over the nearest core in range (else over itself); descending impacts (landings, plunges, bombs) consume 1 charge each (3/4/5 by tier, T3 runs 2 barriers); shattered barriers rebuild slowly; bosses crush past, warheads pass through
- [x] Nuke ($250, deliberately cheap — "fool's gold"): one-shot silo fired via ☢ FIRE NUKE on the tower panel; vaporizes all non-boss invaders (no bounties) + falling bombs, 600 dmg to a mothership, levels every tower except batteries (silo included); cores and warheads untouched
- [x] Ten-slot build bar (hotkeys 9/0), tier previews for barrier/nuke, priority cycler hidden for non-targeting towers
- [x] Smoke: barrier deploy/soak assertions, nuke wipe/bounty/battery-survival assertions, auto-player buys a blockade; full run clears wave 50 with 6/6 cores

**DoD:** both towers buildable, barrier visibly protects a core, nuke fires from the panel with its trade-off intact, `npm run build` + `npm run smoke` pass. **User browser playtest decides follow-up fixes; the balance pass is next.**

---

## Known issues

- No current blocking issues recorded.

## Recently Fixed

- ~~**Hack array had no visible firing effect** (user playtest 2026-07-07)~~ **FIXED 2026-07-07**: added a conversion crackle — three jagged electric arcs (cyan + violet) from the antenna tips to the converted unit, re-jittered at ~24 Hz with per-arc flicker/wink-out, ~0.7s (`effects.hackBeams`). Deliberately unlike the repulsor's smooth cone per user direction.
- ~~**Repulsor tower had no visible effect** (user playtest 2026-07-07)~~ **FIXED 2026-07-07**: the old visual was a 1px line for 0.22s, invisible among gun tracers. Replaced with a sustained transparent cone beam (wifi-signal shape, narrow at dish → flaring at target) that tracks the lifted enemy for the full debuff duration, with an opacity pulse.
- ~~**HUD buttons unresponsive** (user playtest 2026-07-07)~~ **FIXED 2026-07-07** with Phase 4: HUD buttons now fire on `pointerdown` and `hud.update()` only mutates the DOM when values actually change.
- ~~**AA Missile felt weak by default**~~ **FIXED 2026-07-07**: new AA Missile towers default to Strongest targeting while remaining toggleable.
- ~~**Drones visually stack**~~ **FIXED 2026-07-07**: simple drone separation keeps capped drones from sitting inside each other.
- ~~**AA missile model tumbles**~~ **FIXED 2026-07-07**: missile models orient nose-first toward their live target.

## Backlog notes

- Economy is too generous — tighten income/bounties/costs together after the expanded roster stabilizes.
- Stronger-enemy volume too low as stages progress; decide later between composition, enemy strength, and economy levers.
- Battery upgrade direction: bigger blast radius vs. fan-shot/persistent blast/cluster warhead; defer until roster playtest.
- Radar tower is not active scope because the persistent HUD radar satisfies the readability need.
- Possible future phases: balance pass, enemy/warhead variety, additional weapons from §14, or UX/readability cleanup. Pick one only after user direction.

## Session log

Historical notes below are preserved for context. Any old "resume here" text inside this log has been superseded by the top-level Resume section.

- **2026-07-07** — Design doc completed and approved. Build plan created. Phase 1 started.
- **2026-07-07** — Phase 1 complete: scaffold, world render, orbit camera, sim loop. `npm run build` clean, dev server verified. Note: Node.js was installed via Homebrew this session (machine had none). Files: `src/{main,balance}.ts`, `src/render/{scene,cameras}.ts`, `src/input/orbit.ts`, `src/sim/state.ts`, `src/ui/hud.ts`. Await user playtest of the diorama before/while starting Phase 2.
- **2026-07-07** — Phase 2 complete: sim entities + game orchestration (`src/sim/{game,waves,enemies,towers}.ts`), placement input, render sync, full HUD. Headless smoke test added (`npm run smoke`, uses tsx) — run it after sim changes. **User playtest feedback applied:** grunt movement felt rigid (axis-locked Space Invaders march) → replaced with organic meander (wandering heading + continuous swelling sink + per-member bob); GAME-DESIGN.md §5 updated to match. Also: grunts fast-dive from ENTRY to y=100 before meandering (pacing — literal spec meant minutes of dead time).
- **2026-07-07 (later, historical)** — Phase 4 had not started at that moment; an agent was launched but stopped almost immediately when usage budget ran out. User playtested Phase 3: "looks surprisingly good"; upgrade preview was backburnered to Phase 5. This note is preserved only as history; Phase 4 is now complete.
- **2026-07-07 (historical)** — Phase 3 complete: bomber/diver/UFO (`src/sim/raiders.ts` + bombs), upgrade/sell/priority via tower panel (`src/sim/actions.ts`), waves 1–15 (volleys stubbed as warnings), bonus core at wave 10, shared RNG (`src/sim/rng.ts`). **Second playtest feedback applied:** gun rebalanced to long-range/weak (range 80/alt 90, 8 dps T1) vs flak short-range/heavy — user found original gun range left ~1 min dead time; GAME-DESIGN.md §4 updated. Smoke test was an auto-player that cleared all 15 waves (6/6 cores, score ~15k). Battery placement notes from this point were superseded by the pre-placed central battery.
- **2026-07-07** — Playtest-notes review (`playtestnotes.md`) via design interview before Phase 4. Decisions: 9 weapon ideas → §14 backlog (curate 2–3 after Phase 4); persistent radar overlay added to Phase 4 scope (new §11.4 — answers §15 Q3); free battery now **pre-placed at map center**, dormant + unsellable (user idea mid-review); early-start bonus cut; battery "spread" = blast radius (already in tiers), direction question logged as §15 Q7; spawn-spread → Phase 5; economy + stronger-enemy-volume tuning → Phase 6. Both docs amended.
- **2026-07-07** — Phase 4 complete: missile sim (`src/sim/missiles.ts` — volleys, bézier warheads, batteries, interceptors, blast kill check), coordinate view (`src/render/coordview.ts` — dual ortho viewports, volley frame, 0.6s swing, plotted side+top click aiming), radar overlay (`src/ui/radar.ts`), siren stub (`src/ui/siren.ts`), alert banner + coord HUD strip in `hud.ts`. Central battery pre-placed with wake light. Smoke auto-player now leads shots along warhead arcs: waves 1–15 clear 6/6 cores, all 12 warheads intercepted, counterforce at 15 included. `npm run build` clean.
- **2026-07-07 (playtest + wrap)** — User playtested Phase 4 live; all findings fixed in-session: **radar invisible** (canvas was created before `createHud()`'s innerHTML rebuild → drew to a detached element; also brightened band grid + window-scaled panel/labels 1×–1.6×); **top view empty for half of each volley** (entry moved from 260u-behind-target to fixed depth just past the platform edge, top viewport made asymmetric — V_BACK 165 / V_FRONT 115, §6.1 updated). Added **3× fast-forward** ([X]/HUD button; auto-resets to 1× at volley launch — keeps the siren moment honest). **Retitled EXODEF** with an EXODEF COMMAND playfield mark (arcade-style, HUD tag). Backlog grew: orbital-platform reframe + Bloons-style bypass lives, converging multi-heading volleys, branding (resolved). Phase 5 work was planned from this point and is now complete.
- **2026-07-07 (Phase 5 chunk 1)** — Implemented deterministic formula waves 16–50 plus freeplay generation, scaling HP/speed spawn metadata, generated missile scheduling, wave-50 victory/freeplay overlay, and wave-50 survivor score bonus. Extended smoke auto-player to spend late-game cash on more towers and backup batteries. Not done yet: mothership bosses, authored boss+max-volley finale, audio/art/settings/upgrade-preview work. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 2)** — Implemented mothership boss as a normal targetable enemy (`mothership` def + flat-shaded model + radar dot): large hull targeting, slow descent/roam, grunt/diver emissions from underside, low-altitude bomb drops, and escalating HP for waves 15/30/45/50. Wave 15 now replaces the old normal composition with boss + counterforce volley; wave 50 is boss + max volley. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 3)** — Implemented WebAudio pass and settings panel. Siren is a harsh stacked sawtooth/bandpass wail per user direction; repeated cues use lower-gain sine/square synths (gun, flak, interceptor launch, blasts, core hit/death, round clear, UFO warble). Settings panel now controls current game speed and volume; volume persists in localStorage. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 chunk 4)** — Implemented localStorage high score and tower upgrade preview. HUD top bar and end overlays show BEST score; the tower panel now summarizes current tier and next-tier deltas from `TOWER_DEFS` (DPS/range/alt, flak rate/AoE, battery speed/reload/blast/ammo/silos). Hot-reload guard added so BEST never renders `undefined` during dev. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 5 art/readability pass)** — Implemented focused gameplay-readability polish: warheads now use larger white points plus solid red mesh ribbon trails; interceptors use shorter cyan-white trails and cyan blasts; ground/warhead impacts use warm red-orange blast spheres; core clusters have healthy cyan pulse and damaged red flicker while destroyed clusters remain dark; mothership emissions moved to visible side bays with brief flashes; bombs and mothership side bays got silhouette/readability tweaks; radar/crosshair/preview contrast tuned. Added secondary HUD settings buttons for `TEST MISSILES` and `TEST BOSS`; test threats run through normal sim damage/bounties without advancing round progression or granting round-clear income.
- **2026-07-07 (core terminology cleanup)** — Standardized the project around the orbital defence platform / energy core fiction. User-facing HUD, toasts, docs, balance constants, sim state, targeting, render sync, placement rules, smoke output, and audio cue names now use core terminology. The temporary damaged-core debug start was removed after user verification.
- **2026-07-07 (aiming simplification)** — Removed the plot+commit/SPACE firing scheme after user playtest found base-speed gameplay too quick for a separate confirm step. Coordinate view now always uses plotted side+top click pairs; settings/localStorage no longer carry a fire scheme; HUD/docs updated.
- **2026-07-07 (Phase 6 roster expansion)** — Closed Phase 5 cut-line and moved balance tuning to backlog until the roster stabilizes. Added Repulsor Beam (upward-retreat debuff applicator), AA Missile (automatic anti-invader guided missiles, never warheads), Drone Launcher (persistent capped drones), paid damaged-core repair ($300, surviving cores only), six-tower build bar, and hover-rotating tower-model picker previews. Expanded smoke with Phase 6 mechanic assertions. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 6 playtest fixes)** — AA Missile towers now default to Strongest targeting while remaining toggleable; drones get simple visual separation so capped drone groups do not stack inside each other; AA missile models orient nose-first toward targets instead of tumbling.
- **2026-07-07 (repulsor beam visibility)** — User playtest: game plays well overall; balance tweaks are the acknowledged next area, but first the repulsor tower had no visible effect. Replaced the old 0.22s 1px tracer line with a sim-tracked `effects.repulseBeams` entry (towerId/enemyId/ttl) rendered as a sustained transparent cone beam (per user direction: "wifi signal" look) from dish to lifted enemy for the full debuff duration, pulsing, with fade in/out; beam drops if the tower or target dies. Phase 6 marked ✅. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores.
- **2026-07-07 (Phase 8 roster finale)** — User feedback: hack crackle looks good; tower-hunter enemy cut (dupes dive bomber); orbital mine deferred (overlaps napalm); build Blockade Launcher + Nuke, then settle into balancing. Design decisions via interview: barriers = umbrellas over the nearest core in range (3 soak charges, slow rebuild, bosses/warheads unaffected); nuke = cheap one-shot silo ("fool's gold" — $250, the real cost is losing every non-battery tower), panel-fired, no bounties, cores/warheads untouched. Implemented: `state.barriers` + `updateBarriers` in `towers.ts`, `fireNuke` in `actions.ts`, barrier plate/silo models, ☢ FIRE NUKE panel button, 10-slot build bar. Smoke Phase 8 assertions added; wave-50 run passes 6/6. Awaiting playtest, then the balance pass.
- **2026-07-07 (Phase 7 roster expansion II)** — Grill-me design interview set direction (towers lead; two-phase split; napalm+hack first, mines+blockade to Phase 8) then implemented: napalm clouds (`Shell.cloud` payload → `state.clouds`, `updateClouds` in `towers.ts`), hack kamikazes (`Enemy.hacked`, driven in `raiders.ts`, bounty rules in `killEnemy`), splitter/fragments (`raiders.ts` + `spawnFragments` in `enemies.ts`), swarm clusters (grunt group system parameterized by `variant`, swarm landings charge cores — `Core.swarmCharge`, reset at round end), waves 12/14 debuts + formula weights in `balance.ts`/`waves.ts`, models/cloud blobs/hacked cyan tint/core pips in render, 8-slot build bar, TEST SPLITTER/SWARM buttons, smoke Phase 7 assertions. `npm run build` clean; `npm run smoke` clears wave 50 with 6/6 cores. Awaiting user playtest.
