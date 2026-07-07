# EXODEF

Missile Command x Space Invaders x tower defense on a rotating orbital defence platform.

The game is playable in the browser with a complete wave-50 arc, freeplay, six tower types, mothership boss waves, plotted missile interception, persistent radar, WebAudio cues, local high score, and paid damaged-core repair.

## Run

```sh
npm run dev
npm run build
npm run smoke
```

Use `npm run dev` for browser playtesting. Run `npm run build` after TypeScript/render changes and `npm run smoke` after sim/gameplay changes. In Codex sandboxed sessions, `npm run smoke` may need elevated execution because `tsx` opens an IPC pipe.

## Resume

Read these first:

- `BUILD-PLAN.md` — current phase tracker, latest status, next-agent checklist, session log.
- `GAME-DESIGN.md` — buildable gameplay spec and backlog.

Current resume state: Phase 6 is complete and pushed through `9912d35 Fix Phase 6 playtest feedback`. Live playtest is looking good. Do not assume a Phase 7 exists yet; collect remaining playtest notes and confirm the next direction before starting a new feature or balance phase.

## Guardrails

- Use "core" language, not "city"; these are energy cores on an orbital defence platform.
- Enemy warheads are purely player-fought through coordinate view. AA Missile towers must not target warheads.
- Keep visuals flat-shaded, low-poly, and gameplay-readable.
- Keep shared balance/scaling values in `src/balance.ts`; keep tower/enemy definitions in `src/content/`.
