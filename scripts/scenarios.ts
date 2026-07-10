// Balance scenario harness (BUILD-PLAN.md Phase 9, first checkbox).
//
// A headless runner that reuses the smoke auto-player (scripts/lib/autoplayer.ts)
// but parameterizes the STRATEGY, so balance changes can be sanity-checked in
// seconds without playing. This is measurement tooling only — it changes no
// balance numbers, tower/enemy defs, or sim behavior.
//
//   npm run scenarios
//
// A game over is a valid scenario RESULT, not a harness error: losing scenarios
// terminate cleanly and report the wave they died on.
import {
  baselineStrategy,
  BASELINE_QUEUE,
  monoPlacements,
  runAutoPlay,
  type ScenarioReport,
  type Strategy,
} from "./lib/autoplayer";
import { WAVE_COUNT } from "../src/sim/waves";
import { TOWER_DEFS } from "../src/content/towers";

// The 8 combat/support towers a mono run can specialize in (everything except
// the free battery and the one-shot nuke).
const MONO_TOWERS = ["gun", "flak", "repulsor", "aaMissile", "drone", "napalm", "hack", "blockade"] as const;

function monoStrategy(defId: string): Strategy {
  return {
    name: `mono ${defId}`,
    buildQueue: monoPlacements(defId),
    allowUpgrades: true, // the honest "only this tower" version also upgrades
    upgradeReserve: 200,
    intercept: true, // interception is still auto-played
  };
}

function noUpgradesStrategy(): Strategy {
  return {
    name: "no-upgrades (T1 only)",
    buildQueue: BASELINE_QUEUE,
    allowUpgrades: false,
    upgradeReserve: 200,
    intercept: true,
  };
}

function noInterceptStrategy(): Strategy {
  return {
    name: "no-interception",
    buildQueue: BASELINE_QUEUE,
    allowUpgrades: true,
    upgradeReserve: 200,
    intercept: false,
  };
}

const strategies: Strategy[] = [
  baselineStrategy(),
  noUpgradesStrategy(),
  noInterceptStrategy(),
  ...MONO_TOWERS.map(monoStrategy),
];

function result(r: ScenarioReport): string {
  if (r.reachedGoal) return `WON w${WAVE_COUNT}`;
  if (r.stalled) return `STALL w${r.furthestWave}`; // never clears a round (e.g. pure control)
  return `DIED w${r.furthestWave}`;
}

/** e.g. "w5, w9(x2)" — compress the cores-lost list into wave+count pairs. */
function coresLostSummary(r: ScenarioReport): string {
  if (r.coresLostAt.length === 0) return "-";
  const counts = new Map<number, number>();
  for (const w of r.coresLostAt) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, n]) => (n > 1 ? `w${w}(x${n})` : `w${w}`))
    .join(" ");
}

function padL(s: string | number, w: number): string {
  return String(s).padStart(w);
}

function printComparisonTable(reports: ScenarioReport[]): void {
  // [header, left-align?, accessor]. Column widths are computed to fit content.
  const cols: Array<[string, boolean, (r: ScenarioReport) => string]> = [
    ["SCENARIO", true, (r) => r.name],
    ["RESULT", false, (r) => result(r)],
    ["WAVE", false, (r) => String(r.furthestWave)],
    ["CORES", false, (r) => `${r.coresRemaining}/6`],
    ["CORES LOST @", true, (r) => coresLostSummary(r)],
    ["TWR B/L", false, (r) => `${r.towersBuilt}/${r.towersLost}`],
    ["SHOTS", false, (r) => String(r.shotsFired)],
    ["$FLOOR", false, (r) => String(r.cashFloor)],
    ["$PEAK", false, (r) => String(r.cashPeak)],
    ["$END", false, (r) => String(r.finalCash)],
    ["SCORE", false, (r) => String(r.score)],
    ["ms", false, (r) => String(r.wallMs)],
  ];
  const widths = cols.map(([h, , f]) => Math.max(h.length, ...reports.map((r) => f(r).length)));
  const cell = (v: string, i: number) => (cols[i][1] ? v.padEnd(widths[i]) : padL(v, widths[i]));
  const header = cols.map(([h], i) => cell(h, i)).join("  ");
  console.log("\n" + "=".repeat(header.length));
  console.log("BALANCE SCENARIO COMPARISON");
  console.log("=".repeat(header.length));
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of reports) {
    console.log(cols.map(([, , f], i) => cell(f(r), i)).join("  "));
  }
  console.log("=".repeat(header.length));
  console.log(
    "B/L = towers built / lost (excludes the free battery from 'built'; a lost free battery still counts in 'lost').",
  );
  console.log("$FLOOR/$PEAK = min/max end-of-round cash. A rising floor across a survived run = economy too generous.");
}

/** Economy probe: dump the baseline's per-round end-of-round cash so "the
 *  economy is too generous" becomes a number. */
function printEconomyProbe(baseline: ScenarioReport): void {
  console.log("\n" + "-".repeat(60));
  console.log(`ECONOMY PROBE — end-of-round cash (baseline: ${baseline.name})`);
  console.log("-".repeat(60));
  const rows: string[] = [];
  let total = 0;
  for (let round = 1; round <= baseline.furthestWave; round++) {
    const cash = baseline.endOfRoundCash[round];
    if (cash === undefined) continue;
    total += cash;
    rows.push(`w${padL(round, 2)}:$${padL(cash, 6)}`);
  }
  // 5 columns per line
  for (let i = 0; i < rows.length; i += 5) {
    console.log("  " + rows.slice(i, i + 5).join("   "));
  }
  console.log("-".repeat(60));
  console.log(
    `cash floor=$${baseline.cashFloor}  peak=$${baseline.cashPeak}  ` +
    `final=$${baseline.finalCash}  total end-of-round surplus=$${total}`,
  );
}

console.log(`Running ${strategies.length} balance scenarios (target: clear wave ${WAVE_COUNT})...\n`);

const reports: ScenarioReport[] = [];
for (const strategy of strategies) {
  const r = runAutoPlay(strategy); // no per-phase logging — keep the suite terse
  reports.push(r);
  const lost = r.coresLostAt.length ? ` cores-lost@[${coresLostSummary(r)}]` : "";
  console.log(
    `  ${r.name.padEnd(22)} ${result(r).padEnd(9)} cores=${r.coresRemaining}/6 ` +
    `towers=${r.towersAlive} shots=${r.shotsFired} wall=${r.wallMs}ms${lost}`,
  );
}

printComparisonTable(reports);

const baseline = reports[0];
printEconomyProbe(baseline);

// Report (do NOT assert-fail) any mono strategy that cruises to the goal — that
// degenerate dominance is exactly the signal this harness exists to surface.
const cruisers = reports.filter((r) => r.name.startsWith("mono ") && r.reachedGoal);
console.log("\n" + "=".repeat(60));
if (cruisers.length > 0) {
  console.log("!! SIGNAL: a mono strategy cruised to the goal (expected: none should):");
  for (const r of cruisers) {
    const def = TOWER_DEFS[r.name.replace("mono ", "")];
    console.log(`   - ${r.name} (${def.name}) cleared wave ${WAVE_COUNT} with ${r.coresRemaining}/6 cores`);
  }
  console.log("   Investigate: this tower is likely over-tuned for a solo defense.");
} else {
  console.log("OK: no mono strategy cruised to the goal (each combat/support tower has a visible failure mode).");
}
console.log("=".repeat(60));
console.log("\nSCENARIOS COMPLETE (a game over is a valid result, not a failure).");
