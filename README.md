# Marbledle

Marbledle is a daily marble-race prediction game - a browser-first take on *Marbles on
Stream*, where the finishing order is decided by a deterministic marble-run simulation,
not scripted in advance.

Each day, from the `America/New_York` date, the app derives a deterministic seed and
procedurally generates:

- a **contained 3D marble-run course** with banked turns, lateral sweeps, helix/corkscrew
  sections, pinball-style obstacle zones, rails, bumpers and spinners, and
- five marbles with seeded starting positions and spin.

The pack is then dropped into a **deterministic path-station simulation**. Marbles roll
along the generated run, drift between rails, and hit seeded obstacle events, so the
finishing order **emerges** from the race - and because the simulation is deterministic,
every player gets the byte-identical race for that day. Valid daily races are constrained
to finish between 30 and 60 seconds.

Players assign each marble a guessed finishing position from 1 to 5, submit once, then watch
the recorded race replay. Results stay hidden until the race finishes. Scoring is based on
total position error: a perfect order is 100%, and the exact reverse order is 0%.

## How the daily race is produced

1. **Generate** (`src/lib/course.ts`) - the seed builds a `CourseSpec`: plain data describing
   the course path, segments, obstacle events, starts, finish, and renderable scenery. All
   numbers are quantized to a 1e-3 grid so float differences can't leak in. This one spec is
   the single source of truth for simulation, validation, camera, and rendering.
2. **Precompute** (`src/lib/physics.ts`) - on load, the course is simulated headlessly at a
   fixed timestep until every marble reaches the finish station. This records the emergent
   `finishOrder`, a per-step replay `trajectory`, the race duration, and a validation report.
   If a procedurally generated course is too short, too long, escaped, stalled, or unwinnable,
   the seed is salted and regenerated. There is no live anti-stall assist; a course that needs
   rescue is invalid.
3. **Replay** (`src/components/RaceScene.tsx`) - the course meshes are built from the *same*
   path spec as the simulation, and the marbles/spinners are animated from the recorded
   trajectory. The scored answer therefore always matches the visible race. The camera follows
   station progress with look-ahead smoothing, with a dev-only path/collider wireframe toggle
   for checking render/simulation alignment.

## Project foundation

- Next.js App Router + TypeScript + Tailwind CSS
- **three.js** for rendering
- Deterministic, engine-free game logic and course generation in `src/lib/` (`game.ts`,
  `course.ts`), race simulation and playability validation in `src/lib/physics.ts`
- Client game surface in `src/components/MarbledleGame.tsx` + `RaceScene.tsx`
- Race precomputation runs client-side and is lazy-loaded out of the initial bundle
- Reduced-motion users skip the animation and reveal the completed result immediately
- Vitest unit tests cover determinism, quantization, 3D path variety, and race validity
- `npm run test:robustness` runs a 500-seed race validity sweep, including no-assist and
  no-stall assertions

## Local development

```bash
npm run dev              # start the dev server at http://localhost:3000
npm test                 # run the unit tests
npm run test:e2e         # run the browser smoke test with system Chrome/Edge
npm run test:robustness  # run the slower 500-seed sweep
npm run build            # production build
```

`npm run test:e2e` uses an installed Chrome or Edge browser. Set
`CHROME_EXECUTABLE_PATH` if the browser is installed somewhere nonstandard.
