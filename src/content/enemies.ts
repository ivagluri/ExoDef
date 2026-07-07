// Data-driven enemy definitions (GAME-DESIGN.md §5). All numbers [tunable].
// Phase 2 ships the grunt; bomber/diver/ufo arrive in Phase 3.

export interface EnemyDef {
  id: string;
  hp: number;
  bounty: number;
  behavior: "formationDrift" | "seekAndBomb" | "plunge" | "transit";
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  grunt: { id: "grunt", hp: 20, bounty: 8, behavior: "formationDrift" },
  // bomber: { id: "bomber", hp: 60, bounty: 25, behavior: "seekAndBomb" },   // Phase 3
  // diver:  { id: "diver",  hp: 15, bounty: 15, behavior: "plunge" },        // Phase 3
  // ufo:    { id: "ufo",    hp: 80, bounty: 150, behavior: "transit" },      // Phase 3
};
