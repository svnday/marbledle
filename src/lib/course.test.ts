import { describe, it, expect } from "vitest";
import { MARBLES } from "./game";
import { generateCourse, type CourseSpec } from "./course";

/** Recursively collect every numeric value in a spec (for the quantization check). */
function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectNumbers(item, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectNumbers(item, out));
  }
  return out;
}

describe("generateCourse", () => {
  it("is deterministic: same seed produces a deeply-equal spec", () => {
    expect(generateCourse("marbledle-2026-07-08")).toEqual(
      generateCourse("marbledle-2026-07-08"),
    );
  });

  it("produces different specs for different seeds", () => {
    const a = generateCourse("marbledle-2026-07-08");
    const b = generateCourse("marbledle-2026-07-09");
    expect(a).not.toEqual(b);
    // The layout (not just the seed string) must differ.
    expect(a.elements).not.toEqual(b.elements);
  });

  it("quantizes every numeric parameter to a 1e-3 grid", () => {
    const numbers = collectNumbers(generateCourse("quantize-check"));
    expect(numbers.length).toBeGreaterThan(50);
    for (const n of numbers) {
      // n must be an exact multiple of 1e-3.
      expect(Math.round(n * 1000)).toBeCloseTo(n * 1000, 8);
    }
  });

  it("emits exactly one finish sensor and an enclosing shell", () => {
    const spec = generateCourse("structure");
    const sensors = spec.elements.filter((e) => e.kind === "sensor");
    expect(sensors).toHaveLength(1);
    expect(spec.elements.filter((e) => e.kind === "cuboid" && e.role === "wall").length).toBe(4);
    expect(spec.elements.some((e) => e.kind === "cuboid" && e.role === "floor")).toBe(true);
  });

  it("starts all five marbles, matching the canonical marble ids, above the finish", () => {
    const spec: CourseSpec = generateCourse("marbles");
    expect(spec.marbleStarts.map((m) => m.id).sort()).toEqual(
      MARBLES.map((m) => m.id).sort(),
    );
    for (const start of spec.marbleStarts) {
      expect(start.position.y).toBeGreaterThan(spec.finishY);
      expect(start.position.x).toBeGreaterThan(spec.bounds.min.x);
      expect(start.position.x).toBeLessThan(spec.bounds.max.x);
    }
  });
});
