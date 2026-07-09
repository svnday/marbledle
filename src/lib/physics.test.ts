import { describe, it, expect } from "vitest";
import { MARBLES } from "./game";
import { generateCourse } from "./course";
import { simulateRace, type Trajectory } from "./physics";

const marbleIds = MARBLES.map((m) => m.id).sort();

/** The last recorded [x,y,z,qx,qy,qz,qw] of every tracked body. */
function finalFrame(trajectory: Trajectory): number[][] {
  const offset = (trajectory.frameCount - 1) * 7;
  return trajectory.tracks.map((track) => track.frames.slice(offset, offset + 7));
}

describe("simulateRace", () => {
  it("is deterministic: same seed -> identical finish order and bit-identical final transforms", async () => {
    const a = await simulateRace(generateCourse("marbledle-2026-07-08"));
    const b = await simulateRace(generateCourse("marbledle-2026-07-08"));

    expect(a.finishOrder).toEqual(b.finishOrder);
    expect(a.durationSeconds).toBe(b.durationSeconds);
    expect(a.trajectory.frameCount).toBe(b.trajectory.frameCount);
    // Bit-for-bit identical final transforms across independent runs.
    expect(finalFrame(a.trajectory)).toEqual(finalFrame(b.trajectory));
  }, 30000);

  it("stays deterministic through the reseed path (a seed that needs several attempts)", async () => {
    const a = await simulateRace(generateCourse("marbledle-2026-07-09"));
    const b = await simulateRace(generateCourse("marbledle-2026-07-09"));

    expect(a.attempts).toBe(b.attempts);
    expect(a.seed).toBe(b.seed);
    expect(a.finishOrder).toEqual(b.finishOrder);
    expect(finalFrame(a.trajectory)).toEqual(finalFrame(b.trajectory));
  }, 30000);

  it("produces a valid race where all five marbles finish in a permutation", async () => {
    const race = await simulateRace(generateCourse("marbledle-2026-07-10"));

    expect(race.valid).toBe(true);
    expect([...race.finishOrder].sort()).toEqual(marbleIds);
    expect(race.durationSeconds).toBeGreaterThan(0);
    expect(race.trajectory.frameCount).toBe(Math.round(race.durationSeconds * 60));
  }, 30000);

  it("produces an emergent order that differs from the start lineup", async () => {
    const spec = generateCourse("marbledle-2026-07-08");
    const race = await simulateRace(spec);
    const startOrder = spec.marbleStarts.map((m) => m.id).join(",");

    expect(race.finishOrder.join(",")).not.toBe(startOrder);
  }, 30000);

  it("yields a valid, complete race across a range of seeds", async () => {
    for (const seed of ["a", "b", "marbledle-2026-03-14", "marbledle-2026-11-02"]) {
      const race = await simulateRace(generateCourse(seed));
      expect(race.valid).toBe(true);
      expect([...race.finishOrder].sort()).toEqual(marbleIds);
    }
  }, 60000);
});
