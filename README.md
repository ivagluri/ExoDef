# EXODEF

Missile Command x Space Invaders x tower defense on a rotating orbital defence platform.

The game is playable in the browser with a complete wave-50 arc, freeplay, eight tower types, seven enemy types plus mothership boss waves, plotted missile interception, persistent radar, WebAudio cues, local high score, and paid damaged-core repair.

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

Current resume state: Phase 7 (Napalm Clouder + Aerial Hack Array towers; Splitter + Swarm Cluster enemies) is built and awaiting user browser playtest. A Phase 8 shortlist (Orbital Mine + Blockade Launcher with paired enemies) and the deferred balance pass are the queued candidates — confirm direction with the user before starting either.

## Guardrails

- Use "core" language, not "city"; these are energy cores on an orbital defence platform.
- Enemy warheads are purely player-fought through coordinate view. AA Missile towers must not target warheads.
- Keep visuals flat-shaded, low-poly, and gameplay-readable.
- Keep shared balance/scaling values in `src/balance.ts`; keep tower/enemy definitions in `src/content/`.
