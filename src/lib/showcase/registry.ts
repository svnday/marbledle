import type { Vec3 } from "../course";
import type { ModuleKind, TrackModuleDefinition } from "./types";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const VERSION = "1.0.0";
const WIDTH = 7.2;
const RAIL = 1.15;

function pathColliders(id: string, path: Vec3[], floorSurfaceId: string, railSurfaceId: string) {
  return path.slice(0, -1).flatMap((start, index) => {
    const end = path[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const horizontal = Math.hypot(dx, dz);
    const segmentLength = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(-dy, Math.max(horizontal, 0.001));
    const right = v(Math.cos(yaw), 0, -Math.sin(yaw));
    const midpoint = v((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    const rotation = v(pitch, yaw, 0);
    return [
      {
        id: `${id}:floor:${index}`,
        shape: "cuboid" as const,
        position: v(midpoint.x, midpoint.y - 0.2, midpoint.z),
        rotation,
        halfExtents: v(WIDTH / 2, 0.22, segmentLength / 2 + 0.12),
        coversSurfaceIds: [floorSurfaceId],
      },
      ...([-1, 1] as const).map((side) => ({
        id: `${id}:rail:${index}:${side}`,
        shape: "cuboid" as const,
        position: v(
          midpoint.x + right.x * side * WIDTH / 2,
          midpoint.y + 0.72,
          midpoint.z + right.z * side * WIDTH / 2,
        ),
        rotation,
        halfExtents: v(0.18, RAIL / 2, segmentLength / 2 + 0.16),
        coversSurfaceIds: [railSurfaceId],
      })),
    ];
  });
}

function define(
  kind: ModuleKind,
  title: string,
  path: Vec3[],
  options: Partial<Pick<TrackModuleDefinition, "sensors" | "movingBodyHooks">> & {
    branchPaths?: Vec3[][];
    socketType?: "standard" | "wide" | "drop" | "finish";
    extraSurface?: string;
  } = {},
): TrackModuleDefinition {
  const first = path[0];
  const last = path[path.length - 1];
  const surfaceId = `${kind}:surface`;
  const surfaces = [
    { id: surfaceId, role: "race-surface" as const, colliderRequired: true },
    { id: `${kind}:rails`, role: "rail" as const, colliderRequired: true },
    ...(options.extraSurface
      ? [{ id: options.extraSurface, role: "obstacle" as const, colliderRequired: true }]
      : []),
  ];
  const renderPaths = options.branchPaths ?? [path];
  const colliders = [
    ...renderPaths.flatMap((renderPath, index) =>
      pathColliders(`${kind}:path:${index}`, renderPath, surfaceId, `${kind}:rails`),
    ),
    ...(options.extraSurface
      ? [{
          id: `${kind}:feature-collider`,
          shape: "cylinder" as const,
          position: path[Math.floor(path.length / 2)],
          rotation: v(0, 0, 0),
          radius: 2.2,
          halfHeight: 0.3,
          coversSurfaceIds: [options.extraSurface],
        }]
      : []),
  ];

  return {
    id: kind,
    version: VERSION,
    kind,
    title,
    entrySockets: [{
      id: "entry",
      type: "standard",
      position: first,
      forward: v(0, 0, 1),
      up: v(0, 1, 0),
      width: WIDTH,
      railHeight: RAIL,
      clearanceHeight: 3.2,
    }],
    exitSockets: [{
      id: "exit",
      type: options.socketType === "finish" ? "finish" : "standard",
      position: last,
      forward: v(0, 0, 1),
      up: v(0, 1, 0),
      width: WIDTH,
      railHeight: RAIL,
      clearanceHeight: 3.2,
    }],
    render: {
      path,
      branchPaths: options.branchPaths,
      surfaces,
      materialFamily: "observatory-ceramic",
    },
    colliders,
    sensors: options.sensors ?? [],
    movingBodyHooks: options.movingBodyHooks ?? [],
    cameraHints: [{
      id: "hero",
      position: v((first.x + last.x) / 2 + 12, Math.max(first.y, last.y) + 9, (first.z + last.z) / 2 - 10),
      target: path[Math.floor(path.length / 2)],
      safeRadius: 7,
    }],
    bounds: {
      min: v(
        Math.min(...renderPaths.flat().map((p) => p.x)) - WIDTH / 2 - 1,
        Math.min(...renderPaths.flat().map((p) => p.y)) - 2,
        Math.min(...renderPaths.flat().map((p) => p.z)) - 2,
      ),
      max: v(
        Math.max(...renderPaths.flat().map((p) => p.x)) + WIDTH / 2 + 1,
        Math.max(...renderPaths.flat().map((p) => p.y)) + 4,
        Math.max(...renderPaths.flat().map((p) => p.z)) + 2,
      ),
    },
    validation: {
      maximumSlopeDegrees: kind === "drop" ? 72 : kind === "helix" ? 68 : 35,
      minimumClearance: 3.2,
      intendedSpeed: { min: 2, max: kind === "drop" ? 18 : 12 },
    },
    performance: {
      triangleBudget: kind === "helix" || kind === "funnel" ? 24_000 : 12_000,
      drawCallBudget: 18,
      colliderCount: colliders.length,
    },
  };
}

const helix = Array.from({ length: 33 }, (_, index) => {
  const t = (index / 32) * Math.PI * 2;
  return v(Math.sin(t) * 6, -(index / 32) * 8, index / 32 * 14 + (1 - Math.cos(t)) * 2);
});

export const TRACK_MODULES: TrackModuleDefinition[] = [
  define("start-chute", "Chronometer Launch Chute", [v(0, 0, 0), v(0, -1, 5), v(0, -4, 14)], {
    movingBodyHooks: [{ id: "start-gate", role: "gate", position: v(0, 0.7, 2), axis: v(0, 0, 1) }],
    extraSurface: "start-chute:gate-housing",
  }),
  define("straight-trough", "Ceramic Acceleration Trough", [v(0, 0, 0), v(0, -1, 8), v(0, -2, 16)]),
  define("banked-turn", "Brass-Banked Observatory Turn", [v(0, 0, 0), v(4, -1, 4), v(7, -2, 9), v(0, -3, 15)]),
  define("s-curve", "Twin Calibration S-Curve", [v(0, 0, 0), v(-6, -1, 5), v(6, -2, 11), v(0, -3, 17)]),
  define("drop", "Pendulum Drop", [v(0, 0, 0), v(0, -4, 3), v(0, -12, 8)], { socketType: "drop" }),
  define("helix", "Sidereal Helix", helix),
  define("pegboard", "Astronomer Pin Field", [v(0, 0, 0), v(0, -3, 8), v(0, -7, 16)], { extraSurface: "pegboard:pegs" }),
  define("spinner-zone", "Orrery Spinner Array", [v(0, 0, 0), v(0, -1, 6), v(0, -2, 13)], {
    movingBodyHooks: [{ id: "orrery-spinner", role: "spinner", position: v(0, 1, 7), axis: v(0, 1, 0) }],
    extraSurface: "spinner-zone:spinner",
  }),
  define("funnel", "Transit Funnel", [v(0, 0, 0), v(4, -2, 5), v(-4, -3, 9), v(0, -5, 14)], { extraSurface: "funnel:bowl" }),
  define("split-merge", "Binary Orbit Split", [v(0, 0, 0), v(0, -2, 16)], {
    socketType: "wide",
    branchPaths: [
      [v(0, 0, 0), v(-5, -1, 7), v(0, -2, 16)],
      [v(0, 0, 0), v(5, -1, 7), v(0, -2, 16)],
    ],
  }),
  define("finish-tray", "Meridian Finish Collector", [v(0, 0, 0), v(0, -1, 8), v(0, -2, 16)], {
    socketType: "finish",
    sensors: [{ id: "finish", role: "finish", position: v(0, 1, 10), halfExtents: v(3.6, 2, 0.4) }],
    extraSurface: "finish-tray:collector",
  }),
];

export const TRACK_MODULE_REGISTRY = new Map(TRACK_MODULES.map((module) => [module.id, module]));
