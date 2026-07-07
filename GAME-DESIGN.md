# SKYFALL (working title — name undecided)

**Missile Command × Space Invaders × Tower Defense**

A 3D tower defense on a single rotating isometric map. Alien waves descend from space toward your cities; your towers auto-fire upward. Periodically, enemy missile volleys arc in from over the horizon and the player swings into a dual-viewport "coordinate view" to plot interceptor shots in full 3D — while the ground war keeps running.

This document is the buildable spec. It encodes every decision from the design interview (2026-07-07). Numbers marked **[tunable]** are starting values expected to change in playtesting; everything else is a locked design decision. Builder agents should implement from this doc without re-deriving choices.

---

## 1. Vision & pillars

**Pitch:** They are coming from space. You build the ground defense that shoots up at them — and when the missiles launch, you personally step into the war room and plot every interception, knowing the invasion above your map never pauses.

**Pillars — when in doubt, decide in favor of these:**

1. **The camera switch is the drama.** One continuous battlefield, two ways of seeing it. The swing from isometric map to coordinate view (and the risky peek back) is the signature moment. Never separate levels, never a paused minigame.
2. **Deliberate plotting, not twitch.** Interception is a two-input 3D firing solution with no aim assists. Volleys are therefore slow, sparse, and heavy — few warheads, each one deadly.
3. **The two halves are one game.** Interceptors launch from towers you placed and paid for with TD economy. Enemy missiles hunt the cities your towers defend — and sometimes the batteries themselves.
4. **Spectre minimalism.** Flat-shaded polygons, bright saturated colors, barren terrain, hard horizon. Nothing on the map but things that matter.

---

## 2. The world

Coordinate convention (Three.js): **Y is up**, ground is the XZ plane, origin at map center. Units are abstract "world units" (u).

- Ground: flat 200×200 u plane. Barren — no decoration, no occluders taller than a city (readability rule: the game must read fully from any camera angle).
- Sky: threats spawn at the top of the ENTRY band and descend.

### Cities — 6, fixed authored positions

```
top view (200×200 ground, N up)

        ┌──────────────────────────┐
        │            ⌂C5           │   C1 (-60, -40)   C2 ( 60, -40)
        │   ⌂C3              ⌂C4   │   C3 (-70,  30)   C4 ( 70,  30)
        │                          │   C5 (  0,  70)   C6 (  0, -75)
        │        (open ground      │
        │         = build area)    │   ◈ = the free starting battery,
        │   ⌂C1      ◈       ⌂C2   │       pre-placed at map center
        │            ⌂C6           │
        └──────────────────────────┘
```

Positions are (x, z). The center is deliberately open: the free starting battery sits there from the first frame (central placement minimizes worst-case interceptor flight time), visibly dormant until the first volley — a standing promise of what's coming. *(Changed from player-placed per 2026-07-07 playtest review.)* Additional batteries are placed freely like any tower.

### Altitude bands

| Band    | Altitude (y) | What lives here |
|---------|--------------|-----------------|
| ENTRY   | 120–160      | Spawn zone. Missile trails become visible here (siren). Nothing can shoot this high except nothing — radar (expansion) *sees* here. |
| HIGH    | 80–120       | UFO cruises at ~100. Beam tower (expansion) reaches here. Missile arcs pass through. |
| MID     | 40–80        | Flak's domain. Grunt waves spend most of their descent here. |
| LOW     | 10–40        | Gun turret's domain. Bombers do their bombing runs at ~30. Last chance before landing. |
| LANDING | 0–10         | Grunts that reach 0 detonate on the ground. Interceptor blasts below y=15 are proximity-inhibited (see §6). |

Band edges **[tunable]**.

---

## 3. Core loop & session structure

**During rounds the player never aims towers.** Towers auto-fire. Player verbs: place, upgrade, sell, set targeting priority, manage cash — plus entering missile view when the siren sounds.

### Round flow (Bloons rhythm)

```
┌──► build/upgrade freely (no time limit)
│         │
│    [START ROUND n]  ── no early-start bonus (cut per 2026-07-07
│         │              playtest: unnecessary, economy already generous)
│    enemies spawn & descend · towers fire · build allowed mid-round
│         │
│    (some rounds: ⚠ MISSILE LAUNCH event, see §6 — round continues)
│         │
│    last enemy dead/landed → round clear
│         │
│    income: +$25 per surviving city  →  loop
└─────────┘
```

- **Wave 50 is "the goal."** Clearing it = victory screen. Play continues into endless freeplay escalation for score.
- One map. Death = last city destroyed → final score, restart.
- Score = sum of bounties earned + 100 × wave on each clear + 500 per surviving city at wave 50 **[tunable]**.

### Starting state

- Cash: **$650 [tunable]**.
- One **free Missile Battery (T1) pre-placed at map center**, dormant ("asleep") until the first volley's siren. It cannot be sold (it was free — no cash-out), but upgrades and dies like any tower. *(Was player-placed-before-round-1; changed per 2026-07-07 playtest review — the sleeping battery foreshadows the missile waves.)*
- All 6 cities alive.

---

## 4. Towers

All towers are **data-driven** — adding a tower is adding a data entry + a model, no new systems. v1 ships three; beam and radar are the first expansions (§14).

Towers occupy a circular footprint (radius 6 u), placed freely on open ground (§ placement rules in 11.2). Every tower has **1 HP** — any bomb/warhead/landing that touches it destroys it; rebuild costs full price. Range is a **sphere** (dome above ground) centered on the tower.

### v1 roster

| Tower | Cost | Range radius | Altitude reach | Damage | Notes |
|---|---|---|---|---|---|
| **Gun turret** | $150 | 80 | ≤90 (near formation band) | 2 dmg × 4/s = 8 DPS, single target | Long reach, weak hits — chip coverage. *(Rebalanced after 2026-07-07 playtest: original short-range version left minutes of dead time before contact.)* |
| **Flak cannon** | $300 | 60 | MID (≤80) | 15 dmg burst / 1.5s, 8 u AoE radius | The kill power vs. grouped grunts — shorter reach than gun, way harder hits |
| **Missile battery** | $500 (first free, pre-placed at center, unsellable) | interception only | any (via missile view) | blast kills warheads | See §6. Does NOT auto-fire at invaders |

### Upgrade tiers (each tower: 2 upgrade tiers, applied per-tower)

| Tower | Tier 2 | Tier 3 |
|---|---|---|
| Gun | $120 → 16 DPS, range 90, reach ≤100 | $250 → 24 DPS, range 100, reach ≤110 |
| Flak | $250 → burst / 1.1s, AoE 10 | $450 → 25 dmg, reach ≤95 (clips HIGH) |
| Battery | $400 → reload 2s, blast r16, speed 80, ammo 8 | $700 → twin silo (2 interceptors in flight), blast r20, speed 100, ammo 10 |

Additional batteries: **$600** each **[tunable]**. All numbers **[tunable]**.

Targeting priority (per tower, cycle on click): First (lowest altitude) / Strongest / Closest. Default: First.

### Data schema (builder reference)

```ts
interface TowerDef {
  id: string;                    // "gun", "flak", "battery", later "beam", "radar"
  cost: number;
  footprintRadius: number;       // 6
  tiers: TowerTier[];            // index 0 = base
  role: "direct" | "aoe" | "interceptor" | "support";
}
interface TowerTier {
  upgradeCost: number;           // 0 for base tier
  rangeRadius: number;
  maxAltitude: number;
  dps?: number;                  // direct
  burst?: { damage: number; period: number; aoeRadius: number }; // aoe
  interceptor?: { speed: number; reload: number; blastRadius: number;
                  ammoPerVolley: number; silos: number };        // battery
}
```

---

## 5. Enemies

Loosely Space-Invaders-inspired: the essence is *descent from above*, not a faithful formation march. Data-driven like towers.

Cities have **2 HP**. Bomb hit = 1, grunt landing = 1, missile warhead = 2 (instant kill). Towers always die to 1 hit.

| Enemy | HP | Bounty | Behavior |
|---|---|---|---|
| **Grunt** ▼ | 20 | $8 | Wave filler. Spawns in loose groups of 5–9 at ENTRY. The group dives quickly to the formation band (~y=100), then **meanders organically**: anchor wanders on a serpentine heading (steering back when it strays off-map) while sinking continuously with a gentle swell; each member bobs on its own phase. *(Changed from axis-locked drift + discrete step-downs after 2026-07-07 playtest — the literal Space Invaders march read as rigid in 3D.)* On reaching y=0: detonates, destroying towers within 8 u and dealing 1 hit to a city within 8 u. |
| **Bomber** ◆ | 60 | $25 | Picks a target (city 70% / tower 30%), flies to hover ~30 u above it, drops a bomb every 4s (bomb falls straight down, 1 hit to whatever's beneath, 6 u splash vs towers). Re-targets after destroying its target. The priority kill. |
| **Diver** ↓ | 15 | $15 | Spawns at HIGH, cruises 3s, then plunges at 40 u/s straight at a random structure. Impact = same as grunt landing. Tests low-altitude reaction coverage. |
| **Bonus UFO** ◑ | 80 | $150 | Rare (see wave table). Crosses the map at y≈100 (HIGH) at 25 u/s, on screen ~8–10s, harms nothing. Cash piñata — in v1 only T3 flak clips it; it mainly advertises the beam tower expansion. |
| **Mothership (boss)** ⬢ | ~1500 [tunable] | $500 | **Boss stages** (added 2026-07-07, user idea): waves 15/30/45 are boss waves. One mega enemy — a huge slow hulk that descends gradually while **periodically emitting small enemies** (grunt clusters, occasional divers) from its underside. Long fight but not a bullet sponge: big hull = every tower connects, so time-to-kill stays reasonable [tunable in playtest]. Killing it ends the emission stream; if it reaches low altitude it becomes a slow roaming disaster (heavy bomb drops) rather than instantly detonating. Escalates per appearance (HP, emission rate). Wave 50 finale = mothership + max volley simultaneously. |

Grunt descent speed and group HP scale with wave number (§9). All numbers **[tunable]**.

```ts
interface EnemyDef {
  id: "grunt" | "bomber" | "diver" | "ufo";  // extensible
  hp: number; bounty: number;
  behavior: "formationDrift" | "seekAndBomb" | "plunge" | "transit";
  params: Record<string, number>;            // speeds, periods, radii
}
```

---

## 6. Missile volleys & interception (the signature mechanic)

### 6.1 Fiction & trajectory model

Warheads are ballistic — launched from beyond the horizon, they arc **over the map edge and descend** toward targets. Each volley:

- Comes from one random compass direction (the volley's **heading**).
- Consists of N warheads (§ composition below), staggered 1.5–3s apart, each targeting a specific structure: **cities**, or in a **counterforce volley** (wave 15+, 25% of volleys) the player's **batteries**.
- Warhead flight: enters at ENTRY top (y=160) on a shallow arc, total time overhead **~30s [tunable]** — slow, visible, heavy. Speed increases modestly with wave (§9).
- A warhead that reaches its target: city −2 HP (destroyed), tower destroyed, 12 u splash destroys adjacent towers.

### 6.2 Alert & mode transition

```
launch detected ──► SIREN + red banner "⚠ MISSILE LAUNCH — 4 INBOUND ⚠"
                    trails visible at ENTRY altitude on the main map
                    grace: warheads are too high to matter for ~8s [tunable]
        │
[TAB] ──► camera swings (0.6s ease) into COORDINATE VIEW (dual viewport)
        │       ...plot & fire interceptors (TD sim KEEPS RUNNING)...
[TAB] ◄─┴─► free toggle back to map view mid-volley (the risky peek)
        │
last warhead intercepted or landed ──► auto-return to map view (0.6s)
```

- Entry is **never forced** — the player presses TAB (or clicks the banner). Ignoring a volley is allowed and catastrophic.
- Missile events are **pre-announced** in the round preview: `ROUND 12  ⚠ MISSILES`.

### 6.3 Coordinate view layout

Two orthographic viewports of the live scene, stacked, with the **lateral axis aligned 1:1** between them (a click's x-position means the same lateral coordinate in both):

```
┌────────────────────────────────────────────┐
│  SIDE VIEW (70% height)                    │   camera: horizontal, looking
│      ╲   ╲    ╲                            │   perpendicular to volley
│       ╲ ⊕ ╲    ╲      ← warhead arcs       │   heading; sees lateral (u)
│        ╲   ╲    ╲                          │   × altitude (y)
│   ⌂──▲──◈──⌂───⌂──  ground strip           │
├────────────────────────────────────────────┤
│  TOP VIEW (30% height)                     │   camera: straight down;
│      ·    ×     ·      ← warheads (plan)   │   sees lateral (u) ×
│   ⌂    ⊙◈    ⌂    ⌂                        │   depth (v)
└────────────────────────────────────────────┘
   ⊕/⊙ = the two crosshairs (one 3D point)      HUD: ammo ▪▪▪▪▪▫, battery list
```

The **volley-aligned frame**: right = lateral **u**, forward (toward camera depth) = **v**, up = **y**. Side view shows (u, y); top view shows (u, v). Frame is fixed per volley (computed from average warhead heading at launch) so the view never swims.

### 6.4 Aiming — two inputs, full 3D, no assists

One shared 3D crosshair point **C = (u, v, y)**. A click in a viewport sets that viewport's two axes of C (side click sets u & y; top click sets u & v; the shared lateral axis u: **last click wins**). Ghost crosshair in the other viewport mirrors C live, so the full 3D point is always visible before commitment.

Two firing schemes, **toggleable in settings** (playtest picks the default, §15):

- **Scheme A — Plotted shot:** a shot requires a *fresh* click in each view (either order). The second click fires immediately at C and resets both "fresh" flags. 2 clicks = 1 shot, always.
- **Scheme B — Plot + commit:** clicks only move C (adjust as often as you like); **SPACE** fires at current C. Repeated SPACE re-fires at the same point (reload permitting).

State machines:

```
Scheme A:  IDLE ──click view X──► HALF(X) ──click view Y≠X──► FIRE → IDLE
                                  HALF(X) ──click view X────► HALF(X) (re-aim)
Scheme B:  clicks: C ← merge(C, click)     SPACE: if batteryReady → FIRE at C
```

### 6.5 Batteries & interceptors

- **Auto-pick:** the shot launches from the ready battery (has ammo, not reloading, silo free) with the **soonest arrival time** at C. While aiming, a faint line battery→C with its flight time (`◈₁ ┄ 1.2s`) previews the pick. No manual battery selection (arcade-style per-silo keys rejected — input budget is spent).
- Interceptor flies straight battery→C at tier speed; on arrival, detonates: an expanding blast sphere (tier radius, active **1.5s [tunable]**). Any warhead whose position enters an active blast sphere is destroyed (+$30 bounty each).
- **Proximity inhibit:** C is clamped to y ≥ 15 — no ground-level detonations (friendly blasts never damage own structures; the inhibit exists so this never looks wrong) **[tunable]**.
- Ammo is **per-volley**: each battery brings `ammoPerVolley` interceptors to a volley; ammo refills automatically when the volley ends. Reload time gates rate of fire; T3's twin silo allows 2 in flight.
- Batteries are physical towers: a counterforce warhead or bomber can destroy them, taking their ammo with them. No batteries alive = no interception. (A "hybrid free baseline launcher" was explicitly rejected — defend your defenses.)

### 6.6 Volley composition

- First volley: **wave 5** (2 warheads, cities only — the tutorial volley).
- Warheads per volley: `2 + floor((wave − 5) / 4)`, capped at **8 [tunable]**.
- Volleys occur on scheduled waves (§9 table; roughly every 3–4 waves).
- Counterforce volleys (target batteries instead of cities): from wave 15, 25% chance per volley **[tunable]**.

---

## 7. Interception math appendix (builder reference)

### 7.1 Volley frame & click resolution

```ts
// Once per volley:
const heading = averageXZVelocity(warheads).normalize();   // volley direction, XZ
const frame = {
  origin: new THREE.Vector3(0, 0, 0),
  fwd: heading.clone(),                                    // +v axis (depth)
  right: new THREE.Vector3(-heading.z, 0, heading.x),      // +u axis (lateral)
};
// Side camera: orthographic, positioned at origin - fwd * D, looking along +fwd.
// Top camera:  orthographic, above map, looking down -Y, rotated so screen-x = frame.right.
// Both cameras use the SAME lateral world-units-per-pixel scale (axis alignment).

// Click → crosshair C = {u, v, y} (volley-frame coords):
function onClick(view: "side" | "top", ndc: THREE.Vector2, cam: THREE.OrthographicCamera) {
  const p = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam); // point on cam plane
  const u = p.clone().sub(frame.origin).dot(frame.right);
  if (view === "side") { C.u = u; C.y = Math.max(15, p.y); }   // proximity inhibit
  else                 { C.u = u; C.v = p.clone().sub(frame.origin).dot(frame.fwd); }
}
function crosshairWorld(): THREE.Vector3 {                      // C → world space
  return frame.origin.clone()
    .addScaledVector(frame.right, C.u)
    .addScaledVector(frame.fwd, C.v)
    .setY(C.y);
}
```

### 7.2 Battery auto-pick & flight time

```ts
function pickBattery(target: THREE.Vector3): Battery | null {
  const ready = batteries.filter(b => b.alive && b.ammo > 0 && b.siloFree());
  return minBy(ready, b => b.pos.distanceTo(target) / b.tier.speed + b.remainingReload());
}
// Interceptor: straight-line lerp battery.pos → target at tier.speed.
// On arrival: spawn Blast { center: target, r: tier.blastRadius, ttl: 1.5 }.
```

### 7.3 Warhead kill check (per sim tick)

```ts
for (const w of warheads)
  for (const b of activeBlasts)
    if (w.pos.distanceToSquared(b.center) <= b.r * b.r) destroyWarhead(w); // +$30
```

Warhead trajectories are deterministic arcs (precomputed control points, e.g. a quadratic bézier from entry point over the horizon down to the target), so leading a shot is learnable.

---

## 8. Damage & economy model

### Damage rules (consolidated)

| Event | Effect |
|---|---|
| Invader bomb / grunt landing / diver impact | 1 hit to city beneath (cities have 2 HP); destroys towers in splash |
| Missile warhead impact | City destroyed outright (2 hits); tower destroyed + 12 u splash |
| Tower destroyed | Gone; rebuild at full price. No salvage from destruction (sell alive = 70% back) |
| City destroyed | Lasting scar: −$25/round income, closer to game over |
| **Bonus city** | At waves 10/20/30/40/50: one destroyed city is rebuilt (if any) **[tunable]** — Missile Command's mercy rule; prevents death spirals across the 50-wave run |
| All cities destroyed | Game over |

### Economy (starting numbers, all **[tunable]**)

| Source | Amount |
|---|---|
| Starting cash | $650 (+ free T1 battery pre-placed at center) |
| City income | $25 / city / round |
| Grunt / Diver / Bomber / UFO | $8 / $15 / $25 / $150 |
| Intercepted warhead | $30 |

*(The early-start bonus was cut per 2026-07-07 playtest: unnecessary. Same playtest flagged the economy as **too generous overall** — tighten in the Phase 6 balance pass.)*

Sanity check: round 1–3 income (~30 grunts ≈ $240 + $450 city income) affords the second tower by round 2 and ~$1000 by round 5's first volley — enough for a battery T2 upgrade OR a saved cushion. Builder agents: keep this doc's table as the single source; put numbers in one `balance.ts`.

---

## 9. Wave design

### Authored waves 1–15

| Wave | Composition | Events / notes |
|---|---|---|
| 1 | 6 grunts | placement done, first blood |
| 2 | 10 grunts | |
| 3 | 14 grunts (2 groups, different edges) | teaches split attention |
| 4 | 12 grunts + 1 bomber | bomber intro |
| 5 | 8 grunts | **☄ first volley: 2 warheads** (light ground wave on purpose) |
| 6 | 16 grunts + 2 bombers | UFO possible from here (10%/wave) |
| 7 | 14 grunts + 1 bomber + 2 divers | diver intro |
| 8 | 20 grunts + 2 bombers + 2 divers | |
| 9 | 12 grunts + 1 bomber | **☄ 3 warheads** |
| 10 | 24 grunts + 3 bombers + 3 divers | **milestone: bonus city** |
| 11 | 20 grunts + 2 bombers + 4 divers | |
| 12 | 18 grunts + 3 bombers | **☄ 3 warheads** |
| 13 | 28 grunts + 4 bombers + 4 divers | |
| 14 | 24 grunts + 4 bombers + 6 divers | pressure peak before… |
| 15 | **BOSS: mothership** (emits grunts/divers; replaces the normal ground wave) | **☄ 4 warheads — counterforce debut (targets batteries)** — boss + counterforce volley together is the intended intensity spike; if playtest says it's too much, move counterforce debut to 16 |

### Waves 16–50 (formula, hand-tuned exceptions allowed)

- Enemy HP × `1.04^(wave−15)`; group counts +8% / wave (rounded); grunt descent speed +1% / wave **[tunable]**.
- **Spawn delivery loosens with wave** (2026-07-07 playtest): early waves arrive in tight batches (good), but later waves should feel irregular and "random attack"-like — same volume, spread-out staggered timing. Implement as a spawn-jitter/spread parameter in the formula generator that scales with wave number (it may retroactively loosen waves ~10–15 too).
- Volley every 3–4 waves; warheads `2 + floor((wave−5)/4)` cap 8; counterforce chance 25%.
- Bonus city at each ×10 milestone.
- **Boss stages at 15/30/45**: mothership replaces the normal ground wave, escalating each time (HP, emission rate, emitted enemy mix).
- Wave 50: authored finale — **mothership + max volley** (8, mixed counterforce) simultaneously. Victory screen after.

### Freeplay (51+)

HP × `1.06^(wave−50)`, counts +10%/wave, volley every 2–3 waves, warhead cap lifted to 12. Pure score chase; death expected.

---

## 10. Camera & controls

### Main map camera

- Isometric-style perspective camera (FOV ~35°), pitch locked at **~40° [tunable]**, distance fixed so the full 200×200 map + LOW band fits at all rotations. No panning.
- **Free 360° orbit** around map center: drag with right/middle mouse, or Q/E (smooth, ~120°/s). Two zoom steps (scroll): "table" and "lean in" **[tunable]**.
- Rotation is a *viewing* affordance only. Hard design rule: **no mechanic may require a specific camera angle**; all critical info also exists in HUD (offscreen threat arrows not needed since the whole map is always in frame).

### Mode transition

- TAB (or clicking the alert banner): main camera animates 0.6s (ease-in-out) to the side-view pose while the viewport splits and the top view fades in below. Reverse on exit. Sim never pauses.

### Keybindings

| Input | Action |
|---|---|
| Left click | Map: select / place / upgrade UI. Coordinate view: aim (per scheme §6.4) |
| SPACE | Scheme B fire (unused in scheme A) |
| TAB | Toggle map ⇄ coordinate view (only while a volley is active) |
| Q / E, or right-drag | Orbit map camera |
| Scroll | Zoom step |
| 1 / 2 / 3 | Select tower type for placement (gun / flak / battery) |
| ESC | Cancel placement / close panel |
| ENTER | Start next round |

Gamepad: out of scope v1 (backlog §14).

---

## 11. UI

### 11.1 Map-mode HUD

```
┌──────────────────────────────────────────────────────┐
│ $1,240   ⌂⌂⌂⌂⌂░ 5/6   ROUND 11        score 18,450  │ ← top bar
│                                                      │
│                 [ 3D map viewport ]                  │
│                                                      │
│              ⚠ MISSILE LAUNCH — 3 INBOUND ⚠          │ ← alert banner
│                    [TAB] to intercept                │    (only during volley)
│ ┌────┐┌────┐┌────┐                                   │
│ │▲gun││✱flk││◈bty│   ▶ START ROUND 12  ⚠ MISSILES    │ ← build bar + round
│ │$150││$300││$600│      ▦ radar (§11.4)              │    preview w/ warning
│ └────┘└────┘└────┘                                   │
└──────────────────────────────────────────────────────┘
```

### 11.2 Build & upgrade flow

- Click build-bar tower (or 1/2/3) → ghost follows cursor with **range dome** (translucent sphere cap showing radius + altitude ceiling). Green = valid, red = invalid. Click to place, ESC cancels.
- Placement invalid: overlapping city, tower, or map edge. Everything else is open ground (free placement — layout is the strategy).
- Click a placed tower → panel: tier, upgrade button + cost, sell (70%), targeting priority cycle.

### 11.3 Coordinate-view HUD

Per §6.3 wireframe, plus: per-battery ammo pips (`◈₁ ▪▪▪▪▫▫  ◈₂ ▪▪ RELOADING`), auto-pick preview line with flight time, warhead count remaining, scheme indicator (`PLOTTED SHOT` / `PLOT+COMMIT`), and the persistent radar overlay (§11.4), which supersedes the earlier "thin map-status strip" idea as the glanceable ground-war readout (the full peek still costs a TAB).

### 11.4 Radar overlay (persistent) — added 2026-07-07 playtest review

The fixed ~40° camera pitch makes altitude hard to read at a glance. A small always-on **corner radar** fixes that in both views (and answers §15 Q3, the peek problem):

```
ALT                       axes: X = lateral position relative to the
160 ┤            · ·            CURRENT camera heading (dots correspond
120 ┤     ·                     left/right with the screen, even while
 80 ┤  ··   ···                 orbiting); Y = altitude 0–160 with
 40 ┤          ◆                band tick marks (§2)
  0 ┴─────────────────    in coordinate view the lateral axis follows
    ← matches screen →    the volley frame (§7.1) — same convention
```

- **Contents: everything airborne, loudness ∝ threat.** Warheads = brightest/largest (red), bomber/diver/UFO/boss in their palette colors (§12), grunts = small dim dots so a swarm reads as a texture, not clutter. Bombs/shells/interceptors are omitted.
- Low dot = urgent. A glance answers "is anything about to land?" without leaving either view.
- Plain HTML canvas overlay, part of the HUD layer (§13 — no 3D pass needed).

---

## 12. Art & audio direction

**Reference: Spectre (1991, Mac).** Flat-shaded simple polygons, bright saturated colors, spartan borderline-barren world, hard horizon. **Not** bloom/wireframe neon — solid faces, `THREE.MeshLambertMaterial`-grade shading, one directional light + ambient.

| Element | Look |
|---|---|
| Ground | Single flat pale sand-gray plane; thin darker grid lines acceptable if readability wants them |
| Sky | Near-black navy, hard horizon line, sparse white star points |
| Cities | White/cyan block clusters (3–6 boxes each); damaged = half the boxes gone |
| Towers | Bright primaries: gun = yellow, flak = orange, battery = cyan; ≤ 150 triangles each |
| Enemies | Grunt = magenta octahedron-ish; bomber = green wedge; diver = red dart; UFO = classic silver disc |
| Warheads / trails | White point + solid red ribbon trail (the Missile Command signature); interceptor trails white |
| Blasts | Expanding flat-shaded icosphere, white→cyan, no particles needed |

Rule: if an object doesn't carry gameplay information, it doesn't exist.

**Audio** (minimal retro synth, WebAudio-generated or tiny samples): the **siren is the star** — a proper rising air-raid wail owns the mode switch. Plus: gun tick, flak thump, launch whoosh, blast boom (pitch scales with kills in one blast), city-death low drone, round-clear sting, UFO warble (the homage). No music in v1 beyond a menu drone **[tunable]**.

---

## 13. Tech plan

- **TypeScript + Three.js + Vite.** Static page deliverable; dev loop is `npm run dev` → localhost, user playtests in browser. No backend; high score in `localStorage`.
- **One scene, three cameras** (iso perspective, side ortho, top ortho). Mode switch = camera swap + dual-viewport render:

```ts
renderer.setScissorTest(true);
// coordinate view:
setViewport(renderer, 0, 0.3, 1.0, 0.7); renderer.render(scene, sideCam);
setViewport(renderer, 0, 0.0, 1.0, 0.3); renderer.render(scene, topCam);
// map view: single full-frame render with isoCam.
```

- **Fixed-timestep simulation** (60 Hz accumulator) decoupled from render — the sim must be identical whether the player is in map or coordinate view (pillar 1 depends on it).
- Architecture: plain entity lists (`towers[]`, `enemies[]`, `projectiles[]`, `warheads[]`, `blasts[]`) updated by systems; **all content from data defs** (§4, §5 schemas) in `src/content/*.ts`; all balance numbers in one `balance.ts`.
- **Object pooling** for projectiles/trail segments (guns fire 4/s × N towers). Trails: `THREE.Line` ring buffers.
- HUD: plain HTML/CSS overlay (no UI framework needed at this scope).
- Suggested layout: `src/{main,sim,render,input,ui,content}/`, `GAME-DESIGN.md` at repo root.

---

## 14. v1 scope cut-line & expansion backlog

**v1 (first playable) includes:** the one map, 3 towers with tiers, 4 enemies, missile volleys with both input schemes + settings toggle, dual-view interception, waves 1–15 authored + formula to 50 + freeplay, full damage/economy model, Spectre art pass, audio cues, local high score.

**Backlog (explicitly NOT v1):**
- Beam tower (high-alt sniper, the UFO answer) & Radar tower (+range aura, +grace seconds, volley detail preview) — first additions, schemas already support them
- More enemies: shielded tank, splitter (mothership/boss stages were promoted into core v1 — see §5/§9)
- MIRV warheads (split at MID — interception triage drama)
- Gamepad support (twin-stick aiming maps beautifully to the two-viewport scheme)
- Campaign / multiple maps, meta-progression
- Real name (SKYFALL is a placeholder)
- **Orbital-platform reframe + bypass lives** (2026-07-07, user): the battlefield is an orbital platform — the "cities" are support pillars / energy cores. Losing all of them isn't instant death: a Bloons-TD-style lives pool where only a certain number of enemies can bypass before it's over. Changes the loss condition (§3/§8); needs its own design pass.

**Weapon ideas from the 2026-07-07 playtest (backlog; curate 2–3 winners after Phase 4 ships — notes preserved verbatim):**
- **Frag bomb** — (no further notes yet)
- **Unlimited-range missile tower** — slow but one-shots a basic enemy. (Context note: "machine guns can't reach spawn heights, missile can but very slow.")
- **"Napalm clouder"** — leaves a chip-damage field, not across full x/y but a set volume that increases with upgrade (but never full x/y).
- **Orbital mine launcher** — launches magnetic mine, exact mechanics tbd.
- **Repulsor beam** — makes an enemy retreat for a set amount of time.
- **Aerial hack array** — "converts" enemy to become kamikaze unit that attacks other invaders; closest unit for simplicity, or self-destruct if alone; damage scaling tbd.
- **Blockade launcher** — purely defensive unit, slowly builds and launches physical barriers, not very high up but can soak 2–3 basic enemy impacts. Might be tricky to balance.
- **Drone launcher** — drones can reach anywhere but less damage than basic gun; can swarm, and concentrated on one unit can equal or surpass the basic gun (max ~2×, needs balancing). Unsure if destroyed by enemy or limited life (lives X shots) — not the final design decision.
- **Nuke** — not automatic; can wipe all but bosses, but wipes player towers as well, except the missile battery.

---

## 15. Open questions → answer via playtest

1. **Default fire scheme:** A (plotted shot) vs B (plot + commit). Ship both, watch which the user keeps.
2. **Volley density & pace:** warhead count curve, 30s flight time, 8s grace — tune until volleys are tense but plottable.
3. ~~**The peek problem:** is TAB-peeking at the map mid-volley enough, or does the coordinate view need the thin map-status strip upgraded to a mini radar?~~ **Answered 2026-07-07:** yes — and further: the radar is a persistent overlay in *both* views (§11.4), because altitude is hard to read at the fixed pitch at all times, not just during volleys.
4. **Difficulty numbers:** everything marked [tunable], especially economy pacing around wave 5 (first volley must be survivable with the free battery alone). 2026-07-07 playtest inputs for the Phase 6 pass: economy too generous overall; stronger-enemy volume too low as stages progress (big grunt swarms stay too easy — composition vs. strength vs. economy lever undecided).
5. **Shared-axis clicks:** does "last click wins u" ever feel like fighting the controls? If so, consider per-view u memory.
6. **Camera orbit:** does anyone actually rotate? If not, that's fine (it's a toy) — but check it never *hurts* readability.
7. **Battery upgrade direction** (2026-07-07): bigger blast radius (current tiers, the Missile Command "spread" feel) vs. a fan-shot (one launch → 2–3 interceptors around the plotted point)? User undecided — playtest the current tiers first, revisit after real volleys.
