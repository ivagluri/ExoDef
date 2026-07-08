# EXODEF (formerly SKYFALL — retitled 2026-07-07)

**Missile Command × Space Invaders × Tower Defense**

A 3D tower defense on a single rotating orbital defence platform. Alien waves descend from space toward your energy cores; your towers auto-fire upward. Periodically, enemy missile volleys arc in from over the horizon and the player swings into a dual-viewport "coordinate view" to plot interceptor shots in full 3D — while the ground war keeps running.

This document is the buildable spec. It encodes every decision from the design interview and live playtest passes on 2026-07-07. Numbers marked **[tunable]** are starting values expected to change in playtesting; everything else is a locked design decision. Builder agents should implement from this doc without re-deriving choices.

**Current implementation snapshot:** EXODEF is playable through wave 50 and freeplay with ten tower types, seven enemy types plus the mothership boss, plotted missile interception, persistent radar, WebAudio cues, local high score, and paid damaged-core repair. Phase 7 added Napalm Clouder + Aerial Hack Array towers and Splitter + Swarm Cluster enemies; Phase 8 added Blockade Launcher + Nuke. The balance pass is the agreed next phase (user, 2026-07-07).

---

## 1. Vision & pillars

**Pitch:** They are coming from space. You build the platform defense that shoots up at them — and when the missiles launch, you personally step into the war room and plot every interception, knowing the invasion above your platform never pauses.

**Pillars — when in doubt, decide in favor of these:**

1. **The camera switch is the drama.** One continuous battlefield, two ways of seeing it. The swing from isometric map to coordinate view (and the risky peek back) is the signature moment. Never separate levels, never a paused minigame.
2. **Deliberate plotting, not twitch.** Interception is a two-input 3D firing solution with no aim assists. Volleys are therefore slow, sparse, and heavy — few warheads, each one deadly.
3. **The two halves are one game.** Interceptors launch from towers you placed and paid for with TD economy. Enemy missiles hunt the cores your towers defend — and sometimes the batteries themselves.
4. **Spectre minimalism.** Flat-shaded polygons, bright saturated colors, barren terrain, hard horizon. Nothing on the map but things that matter.

---

## 2. The world

Coordinate convention (Three.js): **Y is up**, ground is the XZ plane, origin at map center. Units are abstract "world units" (u).

- Platform deck: flat 200×200 u plane. Barren — no decoration, no occluders taller than a core (readability rule: the game must read fully from any camera angle).
- Sky: threats spawn at the top of the ENTRY band and descend.

### Cores — 6, fixed authored positions

```
top view (200×200 ground, N up)

        ┌──────────────────────────┐
        │            ◆C5           │   C1 (-60, -40)   C2 ( 60, -40)
        │   ◆C3              ◆C4   │   C3 (-70,  30)   C4 ( 70,  30)
        │                          │   C5 (  0,  70)   C6 (  0, -75)
        │        (open ground      │
        │         = build area)    │   ◈ = the free starting battery,
        │   ◆C1      ◈       ◆C2   │       pre-placed at map center
        │            ◆C6           │
        └──────────────────────────┘
```

Positions are (x, z). The center is deliberately open: the free starting battery sits there from the first frame (central placement minimizes worst-case interceptor flight time), visibly dormant until the first volley — a standing promise of what's coming. *(Changed from player-placed per 2026-07-07 playtest review.)* Additional batteries are placed freely like any tower.

### Altitude bands

| Band    | Altitude (y) | What lives here |
|---------|--------------|-----------------|
| ENTRY   | 120–160      | Spawn zone. Missile trails become visible here (siren). AA Missile, Repulsor upgrades, and radar visibility can reach into this band. |
| HIGH    | 80–120       | UFO cruises at ~100. Flak upgrades, AA Missile, drones, and Repulsor all interact here. Missile arcs pass through. |
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
│    income: +$25 per surviving core  →  loop
└─────────┘
```

- **Wave 50 is "the goal."** Clearing it = victory screen. Play continues into endless freeplay escalation for score.
- One map. Death = last core destroyed → final score, restart.
- Score = sum of bounties earned + 100 × wave on each clear + 500 per surviving core at wave 50 **[tunable]**.

### Starting state

- Cash: **$650 [tunable]**.
- One **free Missile Battery (T1) pre-placed at map center**, dormant ("asleep") until the first volley's siren. It cannot be sold (it was free — no cash-out), but upgrades and dies like any tower. *(Was player-placed-before-round-1; changed per 2026-07-07 playtest review — the sleeping battery foreshadows the missile waves.)*
- All 6 cores alive.

---

## 4. Towers

All towers are **data-driven** — adding a tower is adding a data entry + a model, no new systems. The current playable roster is ten towers: the original gun/flak/battery set, Phase 6 repulsor/AA missile/drone, Phase 7 napalm clouder + aerial hack array, and Phase 8 blockade launcher + nuke.

Towers occupy a circular footprint (radius 6 u), placed freely on open ground (§ placement rules in 11.2). Every tower has **1 HP** — any bomb/warhead/landing that touches it destroys it; rebuild costs full price. Range is a **sphere** (dome above ground) centered on the tower.

### Current roster

| Tower | Cost | Range radius | Altitude reach | Damage | Notes |
|---|---|---|---|---|---|
| **Gun turret** | $150 | 80 | ≤90 (near formation band) | 2 dmg × 4/s = 8 DPS, single target | Long reach, weak hits — chip coverage. *(Rebalanced after 2026-07-07 playtest: original short-range version left minutes of dead time before contact.)* |
| **Flak cannon** | $300 | 60 | MID (≤80) | 15 dmg burst / 1.5s, 8 u AoE radius | The kill power vs. grouped grunts — shorter reach than gun, way harder hits |
| **Missile battery** | $500 (first free, pre-placed at center, unsellable) | interception only | any (via missile view) | blast kills warheads | See §6. Does NOT auto-fire at invaders |
| **Repulsor Beam** | $250 | 76 | ≤120 | control debuff | Applies a temporary upward-retreat debuff to normal invaders, then retargets after cooldown. No warhead/boss effect. |
| **AA Missile** | $450 | near-global | ENTRY/HIGH | slow guided anti-invader missile | Automatic anti-invader only. Enemy warheads remain purely player-fought. |
| **Drone Launcher** | $350 | broad | HIGH | persistent drone DPS | Maintains reusable drones; tier upgrades increase active drone cap. |
| **Napalm Clouder** | $350 | 70 | LOW/MID (≤60) | 12 DPS chip field | *(Phase 7)* Auto-lobs a canister that bursts into a lingering cloud (~6s, 14 u); chip damage to everything inside. Area denial vs lingerers: swarm clusters, splitter fragments, the slow-sinking boss. Never affects warheads. |
| **Aerial Hack Array** | $500 | 90 | ≤130 | conversion | *(Phase 7)* Converts one invader into a kamikaze that rams the closest other invader and detonates (small AoE); self-destructs harmlessly if alone. Mothership immune. The hacked unit pays no bounty; its kills pay normal bounty. Holds fire unless ≥2 targets exist. |
| **Blockade Launcher** | $400 | 60 | barrier hovers ~y=10 | none (defensive) | *(Phase 8)* Launches a translucent hex barrier over the nearest core in range (else over itself). Descending impacts — landings, plunges, falling bombs — consume 1 charge each (3 at T1); shattered barriers rebuild slowly. Bosses crush past; warheads pass through (interception stays player-plotted). |
| **Nuke** | $250 (fool's gold — deliberately cheap) | global | all | one-shot wipe | *(Phase 8)* Player-fired from the tower panel, never automatic. Vaporizes every non-boss invader (NO bounties) and falling bombs, deals heavy damage to a mothership — and levels every tower except batteries, silo included. Cores and enemy warheads untouched. The real price is your defense grid. |

### Upgrade tiers (each tower: 2 upgrade tiers, applied per-tower)

| Tower | Tier 2 | Tier 3 |
|---|---|---|
| Gun | $120 → 16 DPS, range 90, reach ≤100 | $250 → 24 DPS, range 100, reach ≤110 |
| Flak | $250 → burst / 1.1s, AoE 10 | $450 → 25 dmg, reach ≤95 (clips HIGH) |
| Battery | $400 → reload 2s, blast r16, speed 80, ammo 8 | $700 → twin silo (2 interceptors in flight), blast r20, speed 100, ammo 10 |
| Repulsor | $260 → shorter cooldown, longer/stronger lift | $520 → faster cooldown, longer/stronger lift, more reach |
| AA Missile | $380 → faster/stronger guided missiles | $700 → faster fire, stronger missiles, higher speed |
| Drone | $330 → 2 active drones | $620 → 3 active drones, stronger/faster coverage |
| Napalm | $300 → bigger/longer/hotter clouds, faster lob | $560 → 22 DPS, radius 20, ~8s clouds |
| Hack Array | $420 → shorter cooldown, stronger blast | $760 → 5.5s cooldown, 130 dmg, wider AoE |
| Blockade | $320 → 4 charges, faster rebuild, more reach | $600 → 5 charges, 2 simultaneous barriers |
| Nuke | — (single tier: one shot, no upgrades) | — |

Additional batteries: **$600** each **[tunable]**. All numbers **[tunable]**.

Targeting priority (per tower, cycle on click): First (lowest altitude) / Strongest / Closest. Default: First, except AA Missile and Hack Array default to Strongest so their slow/precious shots seek meaningful targets immediately.

### Data schema (builder reference)

```ts
interface TowerDef {
  id: string;                    // "gun", "flak", "battery", "repulsor", "aaMissile", "drone", "napalm", "hack", "blockade", "nuke"
  cost: number;
  footprintRadius: number;       // 6
  tiers: TowerTier[];            // index 0 = base
  role: "direct" | "aoe" | "interceptor" | "support" | "control";
}
interface TowerTier {
  upgradeCost: number;           // 0 for base tier
  rangeRadius: number;
  maxAltitude: number;
  dps?: number;                  // direct
  burst?: { damage: number; period: number; aoeRadius: number }; // aoe
  interceptor?: { speed: number; reload: number; blastRadius: number;
                  ammoPerVolley: number; silos: number };        // battery
  repulsor?: { cooldown: number; duration: number; liftSpeed: number };
  guided?: { damage: number; period: number; speed: number };    // AA missile
  drone?: { count: number; damage: number; period: number;
            speed: number; attackRange: number };
  cloud?: { period: number; shellSpeed: number; dps: number;
            cloudRadius: number; cloudDuration: number };       // napalm
  hack?: { cooldown: number; kamikazeSpeed: number;
           damage: number; aoeRadius: number };                 // hack array
  barrier?: { hp: number; rebuildTime: number;
              radius: number; count: number };                  // blockade
  nuke?: { bossDamage: number };                                // nuke (one-shot)
}
```

---

## 5. Enemies

Loosely Space-Invaders-inspired: the essence is *descent from above*, not a faithful formation march. Data-driven like towers.

Cores have **2 HP**. Bomb hit = 1, grunt landing = 1, missile warhead = 2 (instant kill). Towers always die to 1 hit.

| Enemy | HP | Bounty | Behavior |
|---|---|---|---|
| **Grunt** ▼ | 20 | $8 | Wave filler. Spawns in loose groups of 5–9 at ENTRY. The group dives quickly to the formation band (~y=100), then **meanders organically**: anchor wanders on a serpentine heading (steering back when it strays off-map) while sinking continuously with a gentle swell; each member bobs on its own phase. *(Changed from axis-locked drift + discrete step-downs after 2026-07-07 playtest — the literal Space Invaders march read as rigid in 3D.)* On reaching y=0: detonates, destroying towers within 8 u and dealing 1 hit to a core within 8 u. |
| **Bomber** ◆ | 60 | $25 | Picks a target (core 70% / tower 30%), flies to hover ~30 u above it, drops a bomb every 4s (bomb falls straight down, 1 hit to whatever's beneath, 6 u splash vs towers). Re-targets after destroying its target. The priority kill. |
| **Diver** ↓ | 15 | $15 | Spawns at HIGH, cruises 3s, then plunges at 40 u/s straight at a random structure. Impact = same as grunt landing. Tests low-altitude reaction coverage. |
| **Bonus UFO** ◑ | 80 | $150 | Rare (see wave table). Crosses the map at y≈100 (HIGH) at 25 u/s, on screen ~8–10s, harms nothing. Cash piñata and high-altitude coverage check for flak upgrades, AA Missile, drones, and Repulsor. |
| **Mothership (boss)** ⬢ | ~1500 [tunable] | $500 | **Boss stages** (added 2026-07-07, user idea): waves 15/30/45 are boss waves. One mega enemy — a huge slow hulk that descends gradually while **periodically emitting small enemies** (grunt clusters, occasional divers) from its underside. Long fight but not a bullet sponge: big hull = every tower connects, so time-to-kill stays reasonable [tunable in playtest]. Killing it ends the emission stream; if it reaches low altitude it becomes a slow roaming disaster (heavy bomb drops) rather than instantly detonating. Escalates per appearance (HP, emission rate). Wave 50 finale = mothership + max volley simultaneously. |
| **Splitter** ◈ | 80 | $30 | *(Phase 7)* Solo descender with a weaving drift. **Bursts into 4 fragments on kill OR on reaching y≈20 intact** — the fragment phase is never skippable, only relocatable: kill it high and fragments scatter with cleanup time; ignore it and they pop out low. Fragments (10 HP, $4) scatter outward, fall fast, and land like grunts. Punishes single-target focus; napalm/hack food. |
| **Swarm cluster** ⁙ | 6 each | $3 each | *(Phase 7)* Tight formation of ~12–16 swarmlings riding the grunt group system with faster, denser params. A landing destroys towers as usual, but a core only takes **1 hit per 3 nearby landings** (charge pips shown above the core; charge resets at round end [tunable]). Too many targets for single-shot towers — napalm's home turf, and a feast for hack kamikazes. |

Grunt descent speed and group HP scale with wave number (§9). All numbers **[tunable]**.

```ts
interface EnemyDef {
  id: "grunt" | "bomber" | "diver" | "ufo" | "splitter" | "fragment" | "swarmling";  // extensible
  hp: number; bounty: number;
  behavior: "formationDrift" | "seekAndBomb" | "plunge" | "transit" | "boss" | "splitter" | "fragment";
  params: Record<string, number>;            // speeds, periods, radii
}
```

---

## 6. Missile volleys & interception (the signature mechanic)

### 6.1 Fiction & trajectory model

Warheads are ballistic — launched from beyond the horizon, they arc **over the map edge and descend** toward targets. Each volley:

- Comes from one random compass direction (the volley's **heading**).
- Consists of N warheads (§ composition below), staggered 1.5–3s apart, each targeting a specific structure: **cores**, or in a **counterforce volley** (wave 15+, 25% of volleys) the player's **batteries**.
- Warhead flight: enters at ENTRY top (y=160) on a shallow arc, total time overhead **~30s [tunable]** — slow, visible, heavy. Speed increases modestly with wave (§9). Entry depth is fixed **just beyond the platform edge** on the approach side (~140 u out [tunable]), not a fixed distance behind each target — so the coordinate view's top viewport (which extends further on the approach side than the far side) has every warhead in frame from launch. *(Changed per 2026-07-07 playtest: spawns 260 u behind targets were invisible in the top view for half their flight.)*
- A warhead that reaches its target: core −2 HP (destroyed), tower destroyed, 12 u splash destroys adjacent towers.

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
│   ◆──▲──◈──◆───◆──  ground strip           │
├────────────────────────────────────────────┤
│  TOP VIEW (30% height)                     │   camera: straight down;
│      ·    ×     ·      ← warheads (plan)   │   sees lateral (u) ×
│   ◆    ⊙◈    ◆    ◆                        │   depth (v)
└────────────────────────────────────────────┘
   ⊕/⊙ = the two crosshairs (one 3D point)      HUD: ammo ▪▪▪▪▪▫, battery list
```

The **volley-aligned frame**: right = lateral **u**, forward (toward camera depth) = **v**, up = **y**. Side view shows (u, y); top view shows (u, v). Frame is fixed per volley (computed from average warhead heading at launch) so the view never swims.

### 6.4 Aiming — two inputs, full 3D, no assists

One shared 3D crosshair point **C = (u, v, y)**. A click in a viewport sets that viewport's two axes of C (side click sets u & y; top click sets u & v; the shared lateral axis u: **last click wins**). Ghost crosshair in the other viewport mirrors C live, so the full 3D point is always visible before firing.

Firing uses the plotted two-click flow:

- A shot requires a *fresh* click in each view (either order).
- The second fresh click fires immediately at C and resets both "fresh" flags.
- 2 clicks = 1 shot, always.
- The removed plot+commit/SPACE scheme was cut after playtest: base-speed gameplay is too quick for a separate confirm step, while the multi-pane click flow becomes smooth once learned.

State machines:

```
IDLE ──click view X──► HALF(X) ──click view Y≠X──► FIRE → IDLE
                         HALF(X) ──click view X────► HALF(X) (re-aim)
```

### 6.5 Batteries & interceptors

- **Auto-pick:** the shot launches from the ready battery (has ammo, not reloading, silo free) with the **soonest arrival time** at C. While aiming, a faint line battery→C with its flight time (`◈₁ ┄ 1.2s`) previews the pick. No manual battery selection (arcade-style per-silo keys rejected — input budget is spent).
- Interceptor flies straight battery→C at tier speed; on arrival, detonates: an expanding blast sphere (tier radius, active **1.5s [tunable]**). Any warhead whose position enters an active blast sphere is destroyed (+$30 bounty each).
- **Proximity inhibit:** C is clamped to y ≥ 15 — no ground-level detonations (friendly blasts never damage own structures; the inhibit exists so this never looks wrong) **[tunable]**.
- Ammo is **per-volley**: each battery brings `ammoPerVolley` interceptors to a volley; ammo refills automatically when the volley ends. Reload time gates rate of fire; T3's twin silo allows 2 in flight.
- Batteries are physical towers: a counterforce warhead or bomber can destroy them, taking their ammo with them. No batteries alive = no interception. (A "hybrid free baseline launcher" was explicitly rejected — defend your defenses.)

### 6.6 Volley composition

- First volley: **wave 5** (2 warheads, cores only — the tutorial volley).
- Warheads per volley: `2 + floor((wave − 5) / 4)`, capped at **8 [tunable]**.
- Volleys occur on scheduled waves (§9 table; roughly every 3–4 waves).
- Counterforce volleys (target batteries instead of cores): from wave 15, 25% chance per volley **[tunable]**.

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
| Invader bomb / grunt landing / diver impact | 1 hit to core beneath (cores have 2 HP); destroys towers in splash |
| Missile warhead impact | Core destroyed outright (2 hits); tower destroyed + 12 u splash |
| Tower destroyed | Gone; rebuild at full price. No salvage from destruction (sell alive = 70% back) |
| Core destroyed | Lasting scar: −$25/round income, closer to game over |
| **Bonus core** | At waves 10/20/30/40/50: one destroyed core is rebuilt (if any) **[tunable]** — Missile Command's mercy rule; prevents death spirals across the 50-wave run |
| **Paid core repair** | A surviving damaged core (1 HP) can be selected and repaired to full for $300 **[tunable]** at any time. Destroyed cores cannot be cash-repaired. |
| All cores destroyed | Game over |

### Economy (starting numbers, all **[tunable]**)

| Source | Amount |
|---|---|
| Starting cash | $650 (+ free T1 battery pre-placed at center) |
| Core income | $25 / core / round |
| Damaged-core repair | $300 |
| Grunt / Diver / Bomber / UFO | $8 / $15 / $25 / $150 |
| Intercepted warhead | $30 |

*(The early-start bonus was cut per 2026-07-07 playtest: unnecessary. Same playtest flagged the economy as **too generous overall** — defer full tightening until the expanded tower roster settles.)*

Sanity check: round 1–3 income (~30 grunts ≈ $240 + $450 core income) affords the second tower by round 2 and ~$1000 by round 5's first volley — enough for a battery T2 upgrade OR a saved cushion. Builder agents: keep this doc's table as the single source; put numbers in one `balance.ts`.

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
| 10 | 24 grunts + 3 bombers + 3 divers | **milestone: bonus core** |
| 11 | 20 grunts + 2 bombers + 4 divers | |
| 12 | 18 grunts + 3 bombers + 2 splitters | **☄ 3 warheads** · **splitter debut** (Phase 7) |
| 13 | 28 grunts + 4 bombers + 4 divers | |
| 14 | 24 grunts + 4 bombers + 6 divers + swarm cluster (14) | pressure peak before… · **swarm debut** (Phase 7) |
| 15 | **BOSS: mothership** (emits grunts/divers; replaces the normal ground wave) | **☄ 4 warheads — counterforce debut (targets batteries)** — boss + counterforce volley together is the intended intensity spike; if playtest says it's too much, move counterforce debut to 16 |

### Waves 16–50 (formula, hand-tuned exceptions allowed)

- Enemy HP × `1.04^(wave−15)`; group counts +8% / wave (rounded); grunt descent speed +1% / wave **[tunable]**.
- **Phase 7 roster in the mix [tunable]:** splitters every formula wave (1 + one more per 6 waves past 15); swarm clusters on alternating waves from 17 (size 12 growing to a 20 cap, extra group per 12 waves). Both continue growing into freeplay.
- **Spawn delivery loosens with wave** (2026-07-07 playtest): early waves arrive in tight batches (good), but later waves should feel irregular and "random attack"-like — same volume, spread-out staggered timing. Implement as a spawn-jitter/spread parameter in the formula generator that scales with wave number (it may retroactively loosen waves ~10–15 too).
- Volley every 3–4 waves; warheads `2 + floor((wave−5)/4)` cap 8; counterforce chance 25%.
- Bonus core at each ×10 milestone.
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
| Left click | Map: select / place / upgrade UI. Coordinate view: aim/fire via side+top plotted clicks (§6.4) |
| TAB | Toggle map ⇄ coordinate view (only while a volley is active) |
| Q / E, or right-drag | Orbit map camera |
| Scroll | Zoom step |
| 1–0 | Select tower type for placement (gun / flak / battery / repulsor / AA missile / drone / napalm / hack array / blockade / nuke) |
| ESC, or right-click | Full deselect: cancel placement + close the tower/core panel (2026-07-07 UX pass) |
| ENTER | Start next round |
| X (or HUD button) | Toggle 3× fast-forward **[tunable]** (2026-07-07 playtest QoL; auto-resets to 1× when a volley launches — the siren moment is never fast-forwarded) |

Gamepad: out of scope v1 (backlog §14).

---

## 11. UI

### 11.1 Map-mode HUD

```
┌──────────────────────────────────────────────────────┐
│ $1,240   ◆◆◆◆◆░ 5/6   ROUND 11        score 18,450  │ ← top bar
│                                                      │
│                 [ 3D map viewport ]                  │
│                                                      │
│              ⚠ MISSILE LAUNCH — 3 INBOUND ⚠          │ ← alert banner
│                    [TAB] to intercept                │    (only during volley)
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                │
│ │▲gun││✱flk││◈bty││⇑rep││⌁mis││◇drn│ ▶ START ROUND 12│ ← build bar + round
│ │$150││$300││$600││$250││$450││$350│  ⚠ MISSILES     │    preview w/ warning
│ └────┘└────┘└────┘└────┘└────┘└────┘                │
└──────────────────────────────────────────────────────┘
```

### 11.2 Build & upgrade flow

- Click build-bar tower (or 1–0) → ghost follows cursor with **range dome** (translucent sphere cap showing radius + altitude ceiling). Green = valid, red = invalid. Click to place, ESC/right-click/✕ CANCEL button cancels.
- **Small-screen behavior (2026-07-07 UX pass):** the build bar collapses via a ▲/▼ BUILD toggle and auto-hides while placing (a red ✕ CANCEL button stands in); the bottom bar is two pinned lines (picker above, controls anchored below); the tower/core panel pops over the radar at the top on ≤640px screens; placement mode and the info panel are mutually exclusive.
- Placement invalid: overlapping core, tower, or map edge. Everything else is open ground (free placement — layout is the strategy).
- Click a placed tower → panel: tier, upgrade button + cost, sell (70%), targeting priority cycle.
- Click a surviving core → panel: status/HP and repair button. Repair costs $300 and only works on damaged cores (1 HP), not destroyed cores.

### 11.3 Coordinate-view HUD

Per §6.3 wireframe, plus: per-battery ammo pips (`◈₁ ▪▪▪▪▫▫  ◈₂ ▪▪ RELOADING`), auto-pick preview line with flight time, warhead count remaining, plotted-shot side/top readiness, and the persistent radar overlay (§11.4), which supersedes the earlier "thin map-status strip" idea as the glanceable ground-war readout (the full peek still costs a TAB).

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
| Cores | White/cyan energy-core clusters (3–6 blocks each); damaged = half the blocks gone plus red flicker |
| Towers | Bright primaries/simple silhouettes: gun = yellow, flak = orange, battery = cyan, repulsor = pale blue, AA missile = red/orange, drone = green/cyan; keep models low-poly and readable |
| Enemies | Grunt = magenta octahedron-ish; bomber = green wedge; diver = red dart; UFO = classic silver disc |
| Warheads / trails | White point + solid red ribbon trail (the Missile Command signature); interceptor trails white |
| Blasts | Expanding flat-shaded icosphere, white→cyan, no particles needed |

Rule: if an object doesn't carry gameplay information, it doesn't exist.

**Audio** (minimal retro synth, WebAudio-generated or tiny samples): the **siren is the star** — a proper rising air-raid wail owns the mode switch. Plus: gun tick, flak thump, launch whoosh, blast boom (pitch scales with kills in one blast), core-death low drone, round-clear sting, UFO warble (the homage). No music in v1 beyond a menu drone **[tunable]**.

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
- Architecture: plain entity lists (`towers[]`, `enemies[]`, `shells[]`, `aaMissiles[]`, `drones[]`, `warheads[]`, `interceptors[]`, `blasts[]`) updated by systems; **all content from data defs** (§4, §5 schemas) in `src/content/*.ts`; shared balance/scaling numbers live in `src/balance.ts`.
- **Object pooling** for projectiles/trail segments (guns fire 4/s × N towers). Trails: `THREE.Line` ring buffers.
- HUD: plain HTML/CSS overlay (no UI framework needed at this scope).
- Suggested layout: `src/{main,sim,render,input,ui,content}/`, `GAME-DESIGN.md` at repo root.

---

## 14. Current cut-line & expansion backlog

**Current playable includes:** the one map, 6 towers with tiers, 4 enemies plus mothership, missile volleys with plotted side+top click interception, dual-view interception, waves 1–15 authored + formula to 50 + freeplay, full damage/economy model, Spectre art pass, audio cues, local high score, and paid damaged-core repair.

**Backlog (explicitly not current active scope):**
- Radar tower is not active scope; the persistent HUD radar already solves the v1 readability problem. Any future radar tower would need a distinct support role.
- High-alt sniper tower remains a possible future concept, but "Beam" now means the Repulsor Beam control tower.
- More enemies: shielded tank. ~~Tower-hunter drone~~ **CUT 2026-07-07 (user)**: with bombers already targeting towers 30% of the time and divers plunging at structures, it would duplicate the dive bomber's niche. ~~Splitter~~ **PROMOTED 2026-07-07 into Phase 7** — see §5. (Mothership/boss stages were promoted into core v1 earlier — see §5/§9.)
- MIRV warheads (split at MID — interception triage drama)
- **Converging volleys — multiple headings in one volley** (2026-07-07, user): warheads closing on the cores from several compass directions simultaneously. Today every volley already comes from a random direction, but all warheads *within* a volley share it — the coordinate view's whole frame (§7.1) and the top view's approach-side overage assume one heading. Multi-heading needs a view rethink: per-heading sub-volleys the player cycles between, or a symmetric top view with a rotating frame. Good candidate for a late-game/freeplay escalation once the basic plotting loop is proven.
- Gamepad support (twin-stick aiming maps beautifully to the two-viewport scheme)
- Campaign / multiple maps, meta-progression
- **Bypass lives / platform integrity** (2026-07-07, user): now that the battlefield is an orbital defence platform, a later design pass could replace "all cores destroyed = death" with a Bloons-TD-style lives pool where only a certain number of enemies can bypass before it's over. Changes the loss condition (§3/§8); not part of v1.
- ~~Branding to match the reframe~~ **DONE 2026-07-07**: retitled **EXODEF** (user's pick, distilled from "Exosphere Defence"); the playfield carries an **EXODEF COMMAND** mark vector-arcade style (HUD tag, bottom-left). Core/platform language is now the standard fiction.

**Weapon ideas from the 2026-07-07 playtest (backlog; promoted ideas marked):**
- **Frag bomb** — (no further notes yet)
- ~~**Unlimited-range missile tower**~~ — **PROMOTED 2026-07-07 as AA Missile tower.** Slow guided anti-invader shots; never targets warheads.
- ~~**"Napalm clouder"**~~ — **PROMOTED 2026-07-07 into Phase 7 as Napalm Clouder.** Lobbed canister → lingering chip-damage cloud; volume grows with upgrade, never full x/y.
- **Orbital mine launcher** — launches magnetic mine, exact mechanics tbd. **DEFERRED 2026-07-07 (user)**: its parked-area-damage niche overlaps napalm for now; revisit after the balance pass if a gap appears.
- ~~**Repulsor beam**~~ — **PROMOTED 2026-07-07 as Repulsor Beam tower.** Applies upward-retreat debuffs on a cooldown.
- ~~**Aerial hack array**~~ — **PROMOTED 2026-07-07 into Phase 7 as Aerial Hack Array.** One-run kamikaze conversion, closest-unit targeting, self-destruct if alone.
- ~~**Blockade launcher**~~ — **PROMOTED 2026-07-07 into Phase 8 as Blockade Launcher.** Hovering umbrella barriers over the nearest core; 3 soak charges, slow rebuild.
- ~~**Drone launcher**~~ — **PROMOTED 2026-07-07 as Drone Launcher tower.** Persistent reusable drones with tiered active-drone caps.
- ~~**Nuke**~~ — **PROMOTED 2026-07-07 into Phase 8 as Nuke.** One-shot cheap silo ("fool's gold" per user), fired from the tower panel; wipes non-boss invaders bounty-free and levels all towers except batteries.

---

## 15. Remaining playtest questions / next-phase candidates

1. ~~**Default fire scheme:** A (plotted shot) vs B (plot + commit).~~ **Answered 2026-07-07:** plotted side+top click stays; plot+commit/SPACE was too slow for live gameplay and has been removed.
2. **Volley density & pace:** warhead count curve, 30s flight time, 8s grace — tune until volleys are tense but plottable.
3. ~~**The peek problem:** is TAB-peeking at the map mid-volley enough, or does the coordinate view need the thin map-status strip upgraded to a mini radar?~~ **Answered 2026-07-07:** yes — and further: the radar is a persistent overlay in *both* views (§11.4), because altitude is hard to read at the fixed pitch at all times, not just during volleys.
4. **Roster feel:** Phase 6 live playtest is positive so far after AA Missile Strongest default, drone separation, and missile-orientation fixes. Continue collecting notes on Repulsor usefulness, AA Missile value, drone readability, and repair cost before changing balance.
5. **Difficulty numbers:** everything marked [tunable], especially economy pacing around wave 5 (first volley must be survivable with the free battery alone). 2026-07-07 playtest inputs remain: economy too generous overall; stronger-enemy volume too low as stages progress. Full balance is deferred until the user explicitly chooses a balance phase.
6. **Shared-axis clicks:** does "last click wins u" ever feel like fighting the controls? If so, consider per-view u memory.
7. **Camera orbit:** does anyone actually rotate? If not, that's fine (it's a toy) — but check it never *hurts* readability.
8. **Battery upgrade direction** (2026-07-07): bigger blast radius (current tiers, the Missile Command "spread" feel) vs. fan-shot/persistent blast/cluster-warhead ideas. User undecided — defer until the expanded roster has been playtested.
