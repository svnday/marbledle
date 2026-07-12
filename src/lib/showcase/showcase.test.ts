import { describe, expect, it } from "vitest";
import { RUNTIME_VERSIONS, assertSupportedMajor } from "../contracts/versions";
import { TRACK_MODULES } from "./registry";
import { SHOWCASE_V1 } from "./showcaseV1";
import { validateCourse, validateModule } from "./validation";

describe("showcase-v1 contracts", () => {
  it("uses stable versioned identities", () => {
    expect(SHOWCASE_V1.id).toBe("showcase-v1");
    expect(SHOWCASE_V1.engine).toBe("showcase-preview");
    expect(SHOWCASE_V1.schemaVersion).toBe(RUNTIME_VERSIONS.courseSchema);
    expect(() => assertSupportedMajor("module-course@2.0.0", RUNTIME_VERSIONS.courseSchema)).toThrow();
  });

  it("contains the complete explicit module kit in a deterministic order", () => {
    expect(SHOWCASE_V1.modules.map((instance) => instance.moduleId)).toEqual([
      "start-chute",
      "straight-trough",
      "banked-turn",
      "s-curve",
      "drop",
      "helix",
      "pegboard",
      "spinner-zone",
      "funnel",
      "split-merge",
      "finish-tray",
    ]);
    expect(SHOWCASE_V1.seed).toBe("handcrafted-showcase-v1");
  });

  it("maps every collider-required render surface to collider metadata", () => {
    for (const definition of TRACK_MODULES) {
      expect(validateModule(definition)).toEqual([]);
      const covered = new Set(definition.colliders.flatMap((collider) => collider.coversSurfaceIds));
      for (const surface of definition.render.surfaces.filter((item) => item.colliderRequired)) {
        expect(covered.has(surface.id), `${definition.id}:${surface.id}`).toBe(true);
      }
    }
  });

  it("has continuous positions, orientations, widths, rails, and clearance", () => {
    expect(validateCourse(SHOWCASE_V1)).toEqual([]);
  });

  it("reports a socket gap with a machine-readable code", () => {
    const broken = structuredClone(SHOWCASE_V1);
    broken.modules[1].position.x += 0.25;
    expect(validateCourse(broken)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "SOCKET_POSITION_GAP" })]),
    );
  });

  it("reports width, rail, orientation, clearance, slope, and coverage failures", () => {
    const brokenCourse = structuredClone(SHOWCASE_V1);
    const brokenRegistryDefinition = TRACK_MODULES[1];
    const originalEntry = structuredClone(brokenRegistryDefinition.entrySockets[0]);
    brokenRegistryDefinition.entrySockets[0].width += 1;
    brokenRegistryDefinition.entrySockets[0].railHeight += 1;
    brokenRegistryDefinition.entrySockets[0].up = { x: 1, y: 0, z: 0 };
    brokenRegistryDefinition.entrySockets[0].clearanceHeight = 2;
    const codes = validateCourse(brokenCourse).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "SOCKET_WIDTH_MISMATCH",
      "RAIL_ALIGNMENT_MISMATCH",
      "SOCKET_ORIENTATION_MISMATCH",
      "INSUFFICIENT_CLEARANCE",
    ]));
    brokenRegistryDefinition.entrySockets[0] = originalEntry;

    const brokenModule = structuredClone(TRACK_MODULES[0]);
    brokenModule.render.path[1].y = -100;
    brokenModule.colliders = [];
    expect(validateModule(brokenModule).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["SLOPE_EXCEEDS_LIMIT", "MISSING_COLLIDER_COVERAGE"]),
    );
  });

  it("defines real contract hooks for gates, spinners, cameras, and finish sensing", () => {
    expect(TRACK_MODULES.flatMap((module) => module.movingBodyHooks).map((hook) => hook.role)).toEqual(
      expect.arrayContaining(["gate", "spinner"]),
    );
    expect(TRACK_MODULES.every((module) => module.cameraHints.length > 0)).toBe(true);
    expect(TRACK_MODULES.flatMap((module) => module.sensors).some((sensor) => sensor.role === "finish")).toBe(true);
  });
});
