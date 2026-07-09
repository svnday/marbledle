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
        expect(race.durationSeconds, dateKey).toBeGreaterThanOrEqual(30);
        expect(race.durationSeconds, dateKey).toBeLessThanOrEqual(60);
        expect(race.trajectory.frameCount, dateKey).toBe(
          Math.round(race.durationSeconds / race.trajectory.dt),
        );
        expect(race.validation.usedAssist, dateKey).toBe(false);
        expect(race.validation.failureReason, dateKey).toBeNull();
        expect(race.validation.obstacleHits, dateKey).toBeGreaterThan(0);
        expect(race.validation.marbleContacts, dateKey).toBeGreaterThan(0);
        expect(race.validation.maxStallSeconds, dateKey).toBeLessThan(4);
        expect(race.validation.minProgressPerWindow, dateKey).toBeGreaterThan(1.2);
        expect(race.spec.path.segments.some((segment) => segment.kind === "helix"), dateKey).toBe(true);
        expect(
          Math.max(...race.spec.path.samples.map((sample) => sample.position.x)) -
            Math.min(...race.spec.path.samples.map((sample) => sample.position.x)),
          dateKey,
        ).toBeGreaterThan(10);
      }
    },
    300_000,
  );
});
