import { describe, expect, it } from "vitest";
import { generateCourse } from "./course";
import { MARBLES } from "./game";
import { simulateRace } from "./physics";

const marbleIds = MARBLES.map((marble) => marble.id).sort();
const SEED_COUNT = 500;

describe("simulateRace robustness sweep", () => {
  it(
    `yields valid races across ${SEED_COUNT} synthetic date keys`,
    async () => {
      for (let index = 0; index < SEED_COUNT; index += 1) {
        const dateKey = `marbledle-robustness-${String(index).padStart(3, "0")}`;
        const race = await simulateRace(generateCourse(dateKey));

        expect(race.valid, dateKey).toBe(true);
        expect([...race.finishOrder].sort(), dateKey).toEqual(marbleIds);
        expect(race.durationSeconds, dateKey).toBeGreaterThan(0);
        expect(race.trajectory.frameCount, dateKey).toBe(
          Math.round(race.durationSeconds / race.trajectory.dt),
        );
      }
    },
    300_000,
  );
});
