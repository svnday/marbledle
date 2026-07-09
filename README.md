# Marbledle

Marbledle is a daily marble-race guessing game built for a browser-first prototype and a future Discord Activity/App surface.

Each day, using the `America/New_York` date, the app generates:

- a deterministic daily seed
- a five-marble finish order
- a 3D track path
- 3D track features like loops, portals, bumpers, and spinners
- a 30-45 second race duration

Players assign each marble a guessed finishing position from 1 to 5, submit once, then watch the marbles drop down the same generated 3D track everyone else gets. Results remain hidden until the race finishes. Scoring is based on total position error: a perfect order is 100%, and the exact reverse order is 0%.

## Project Foundation

- Next.js App Router
- TypeScript
- Tailwind CSS
- Three.js
- Deterministic game logic in `src/lib/game.ts`
- Client game surface in `src/components/MarbledleGame.tsx`
- Dark-mode browser surface
- Browser-side daily puzzle generation to avoid freezing the daily race at deploy time

## Local Development

```bash
npm run dev
```

Then open `http://localhost:3000`.
