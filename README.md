# Marbledle

Marbledle is a daily marble-race guessing game built for a browser-first prototype and a future Discord Activity/App surface.

Each day, using the `America/New_York` date, the app generates:

- a deterministic daily seed
- a five-marble finish order
- a matching track layout/personality

Players arrange the five marbles in their predicted finish order, submit once, then watch the race reveal the canonical result. Scoring is based on total position error: a perfect order is 100%, and the exact reverse order is 0%.

## Project Foundation

- Next.js App Router
- TypeScript
- Tailwind CSS
- Deterministic game logic in `src/lib/game.ts`
- Client game surface in `src/components/MarbledleGame.tsx`

## Local Development

```bash
npm run dev
```

Then open `http://localhost:3000`.
