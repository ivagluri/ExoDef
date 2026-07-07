// Shared sim RNG — deterministic per run, which keeps the headless smoke test
// reproducible. Not seeded from anywhere yet; replace with a per-run seed if
// replays ever matter.
let s = 987654321;

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
