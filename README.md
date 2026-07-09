# Marbledle

Marbledle is a daily marble-race prediction game - a browser-first take on *Marbles on
Stream*, where the finishing order is decided by **real physics**, not scripted in advance.

Each day, from the `America/New_York` date, the app derives a deterministic seed and
procedurally generates:

- an **enclosed 3D course** (a descending shaft of funnels, pachinko pegs, spinners,
  bumpers, ramps and dividers), and
- five marbles with seeded starting positions and spin.

The pack is then dropped into a **deterministic physics simulation** (Rapier). Marbles
collide with each other and with the obstacles, so the finishing order **emerges** from the
race - and because the simulation is cross-platform deterministic, every player gets the
byte-identical race for that day. Valid daily races are constrained to finish between 30
and 60 seconds.

Players assign each marble a guessed finishing position from 1 to 5, submit once, then watch
the recorded race replay. Results stay hidden until the race finishes. Scoring is based on
total position error: a perfect order is 100%, and the exact reverse order is 0%.

## How the daily race is produced

1. **Generate** (`src/lib/course.ts`) - the seed builds a `CourseSpec`: plain data describing
   every collider. All numbers are quantized to a 1e-3 grid so cross-engine float differences
   can't leak in. This one spec is the single source of truth for both physics and rendering.
2. **Precompute** (`src/lib/physics.ts`) - on load, the course is simulated headlessly at a
   fixed timestep until every marble crosses the finish sensor. This records the emergent
   `finishOrder`, a per-step replay `trajectory`, and the race duration. If a procedurally
   generated course turns out to be too short, too long, or unwinnable, the seed is salted
   and regenerated. A deterministic anti-stall flow nudges parked marbles back into motion.
3. **Replay** (`src/components/RaceScene.tsx`) - the course meshes are built from the *same*
   spec as the colliders (so what you see is exactly what collided), and the marbles/spinners
   are animated from the recorded trajectory. The scored answer therefore always matches the
   visible race. The camera follows the leading pack from the start gate down through the
   shaft, with a dev-only collider wireframe toggle for checking render/physics alignment.

## Project foundation

- Next.js App Router + TypeScript + Tailwind CSS
- **three.js** for rendering, **`@dimforge/rapier3d-deterministic-compat`** for deterministic physics
- Deterministic, engine-free game logic and course generation in `src/lib/` (`game.ts`,
  `course.ts`), physics simulation in `src/lib/physics.ts`
- Client game surface in `src/components/MarbledleGame.tsx` + `RaceScene.tsx`
- Physics runs client-side and is lazy-loaded, so the WASM stays out of the initial bundle
- Reduced-motion users skip the animation and reveal the completed result immediately
- Vitest unit tests cover determinism, quantization, and race validity
- `npm run test:robustness` runs a slower 500-seed race validity sweep

## Local development

```bash
npm run dev              # start the dev server at http://localhost:3000
npm test                 # run the unit tests
npm run test:robustness  # run the slower 500-seed sweep
npm run build            # production build
```
