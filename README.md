# EXODEF

Missile Command x Space Invaders x tower defense on a rotating orbital defence platform.

The game is playable in the browser with a complete wave-50 arc, freeplay, ten tower types, seven enemy types plus mothership boss waves, plotted missile interception, persistent radar, WebAudio cues, local high score, and paid damaged-core repair.

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

Current resume state: everything through the small-screen/UX pass is committed and pushed (`6bc06b1`). The roster is complete and frozen at ten towers (Phase 7: napalm + hack array with splitter + swarm enemies; Phase 8: blockade launcher + one-shot nuke), playtested on desktop and the iPhone SE simulator. The **balance pass** is the agreed next phase — economy generosity, stronger-enemy volume, per-tower tuning (see BUILD-PLAN status + backlog notes); interview the user for targets before changing numbers.

## Guardrails

- Use "core" language, not "city"; these are energy cores on an orbital defence platform.
- Enemy warheads are purely player-fought through coordinate view. AA Missile towers must not target warheads.
- Keep visuals flat-shaded, low-poly, and gameplay-readable.
- Keep shared balance/scaling values in `src/balance.ts`; keep tower/enemy definitions in `src/content/`.
