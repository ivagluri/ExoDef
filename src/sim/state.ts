// Fixed-timestep simulation state (GAME-DESIGN.md §13).
// The sim is decoupled from rendering and NEVER pauses for camera/view changes —
// pillar 1 ("the camera switch is the drama") depends on this.
// Phase 1: the loop exists but only tracks time. Entities arrive in Phase 2.

export interface GameState {
  simTime: number; // seconds of simulation elapsed
  tick: number;
}

export function createGameState(): GameState {
  return { simTime: 0, tick: 0 };
}

export function simTick(state: GameState, dt: number): void {
  state.simTime += dt;
  state.tick++;
}
