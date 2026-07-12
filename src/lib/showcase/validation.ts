import { RUNTIME_VERSIONS, assertSupportedMajor } from "../contracts/versions";
import { TRACK_MODULE_REGISTRY } from "./registry";
import type { CourseDefinition, TrackModuleDefinition, TrackSocket } from "./types";

export type ShowcaseValidationIssue = {
  code: string;
  message: string;
  moduleId?: string;
};

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function rotate(
  value: TrackSocket["position"],
  rotation: TrackSocket["position"],
): TrackSocket["position"] {
  const cx = Math.cos(rotation.x); const sx = Math.sin(rotation.x);
  const cy = Math.cos(rotation.y); const sy = Math.sin(rotation.y);
  const cz = Math.cos(rotation.z); const sz = Math.sin(rotation.z);
  const afterX = { x: value.x, y: value.y * cx - value.z * sx, z: value.y * sx + value.z * cx };
  const afterY = { x: afterX.x * cy + afterX.z * sy, y: afterX.y, z: -afterX.x * sy + afterX.z * cy };
  return { x: afterY.x * cz - afterY.y * sz, y: afterY.x * sz + afterY.y * cz, z: afterY.z };
}

const world = (
  position: TrackSocket["position"],
  offset: TrackSocket["position"],
  rotation: TrackSocket["position"],
) => {
  const rotated = rotate(position, rotation);
  return { x: rotated.x + offset.x, y: rotated.y + offset.y, z: rotated.z + offset.z };
};

export function validateModule(definition: TrackModuleDefinition): ShowcaseValidationIssue[] {
  const issues: ShowcaseValidationIssue[] = [];
  const covered = new Set(definition.colliders.flatMap((collider) => collider.coversSurfaceIds));
  for (const surface of definition.render.surfaces) {
    if (surface.colliderRequired && !covered.has(surface.id)) {
      issues.push({ code: "MISSING_COLLIDER_COVERAGE", moduleId: definition.id, message: surface.id });
    }
  }
  if (!definition.entrySockets.length || !definition.exitSockets.length) {
    issues.push({ code: "MISSING_SOCKET", moduleId: definition.id, message: "Entry and exit sockets are required." });
  }
  if (definition.performance.colliderCount !== definition.colliders.length) {
    issues.push({ code: "COLLIDER_COUNT_MISMATCH", moduleId: definition.id, message: "Performance metadata is stale." });
  }
  for (let index = 0; index < definition.render.path.length - 1; index += 1) {
    const start = definition.render.path[index];
    const end = definition.render.path[index + 1];
    const horizontal = Math.hypot(end.x - start.x, end.z - start.z);
    const slopeDegrees = Math.atan2(Math.abs(end.y - start.y), Math.max(horizontal, 0.001)) * 180 / Math.PI;
    if (slopeDegrees > definition.validation.maximumSlopeDegrees + 0.001) {
      issues.push({
        code: "SLOPE_EXCEEDS_LIMIT",
        moduleId: definition.id,
        message: `${slopeDegrees.toFixed(3)} > ${definition.validation.maximumSlopeDegrees}`,
      });
    }
  }
  return issues;
}

export function validateCourse(course: CourseDefinition): ShowcaseValidationIssue[] {
  const issues: ShowcaseValidationIssue[] = [];
  try {
    assertSupportedMajor(course.schemaVersion, RUNTIME_VERSIONS.courseSchema);
  } catch (error) {
    issues.push({ code: "UNSUPPORTED_SCHEMA", message: error instanceof Error ? error.message : String(error) });
  }

  course.modules.forEach((instance, index) => {
    const definition = TRACK_MODULE_REGISTRY.get(instance.moduleId);
    if (!definition || definition.version !== instance.moduleVersion) {
      issues.push({ code: "UNKNOWN_MODULE_VERSION", moduleId: instance.id, message: instance.moduleVersion });
      return;
    }
    issues.push(...validateModule(definition).map((issue) => ({ ...issue, moduleId: instance.id })));

    const next = course.modules[index + 1];
    if (!next) return;
    const nextModule = TRACK_MODULE_REGISTRY.get(next.moduleId);
    if (!nextModule) return;
    const exit = definition.exitSockets[0];
    const entry = nextModule.entrySockets[0];
    const exitWorld = world(exit.position, instance.position, instance.rotation);
    const entryWorld = world(entry.position, next.position, next.rotation);
    if (distance(exitWorld, entryWorld) > 0.001) {
      issues.push({ code: "SOCKET_POSITION_GAP", moduleId: instance.id, message: `${distance(exitWorld, entryWorld)}` });
    }
    if (
      distance(rotate(exit.forward, instance.rotation), rotate(entry.forward, next.rotation)) > 0.001 ||
      distance(rotate(exit.up, instance.rotation), rotate(entry.up, next.rotation)) > 0.001
    ) {
      issues.push({ code: "SOCKET_ORIENTATION_MISMATCH", moduleId: instance.id, message: next.id });
    }
    if (Math.abs(exit.width - entry.width) > 0.001) {
      issues.push({ code: "SOCKET_WIDTH_MISMATCH", moduleId: instance.id, message: next.id });
    }
    if (exit.type !== entry.type) {
      issues.push({ code: "SOCKET_TYPE_MISMATCH", moduleId: instance.id, message: next.id });
    }
    if (Math.abs(exit.railHeight - entry.railHeight) > 0.001) {
      issues.push({ code: "RAIL_ALIGNMENT_MISMATCH", moduleId: instance.id, message: next.id });
    }
    if (Math.min(exit.clearanceHeight, entry.clearanceHeight) < 3.2) {
      issues.push({ code: "INSUFFICIENT_CLEARANCE", moduleId: instance.id, message: next.id });
    }
  });
  return issues;
}
