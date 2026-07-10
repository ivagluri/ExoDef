// Shared sim RNG — deterministic per run, which keeps the headless smoke test
// reproducible. The stream is module-global, so headless tooling that runs
// several games in one process (scripts/scenarios.ts) must call seedRng()
// before each run — otherwise every run's enemy sequence depends on how many
// draws earlier runs consumed, and results stop being attributable.
const DEFAULT_SEED = 987654321;
let s = DEFAULT_SEED;

/** Reset the stream (nonzero seed below 2^31-1). Headless tooling only. */
export function seedRng(seed: number = DEFAULT_SEED): void {
  s = seed;
}

export function rand(): number {
  s = (s * 16807) % 2147483647;
  return s / 2147483647;
}

export function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

export function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
