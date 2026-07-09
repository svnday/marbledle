// Pure, deterministic procedural course generator.
//
// This module has NO three.js or Rapier imports on purpose: it emits a plain-data
// `CourseSpec` that is the single source of truth for BOTH the physics colliders
// (src/lib/physics.ts) and the rendered meshes (src/three/renderCourse.ts). Because
// both sides read the same spec, what you see is exactly what collides - that is the
// fix for the old "everything clips through everything" problem.
//
// The course is a tall, enclosed vertical shaft. Marbles are dropped in at the top and
// gravity pulls them down through seeded layers of obstacles (pegs, spinners, bumpers,
// ramps, dividers). A converging funnel near the bottom serializes the pack into a
// finish sensor; the order marbles cross that sensor is the emergent race result.
//
// DETERMINISM: every numeric value is quantized to 1e-3 before it leaves this file.
// Rapier's docs warn that transcendental functions (Math.sin/cos) are not cross-platform
// deterministic, so we (a) never use them here - all variation comes from the seeded
// PRNG - and (b) quantize regardless, so any float that does sneak in is snapped to a
// grid coarser than any cross-engine rounding difference.

import { type MarbleId, MARBLES, createSeededRandom } from "./game";

export type Vec3 = { x: number; y: number; z: number };

type PhysicsProps = {
  restitution: number;
  friction: number;
};

/** A box collider - also the renderable unit for floors, walls, ramps, dividers, funnels. */
export type CuboidSpec = PhysicsProps & {
  kind: "cuboid";
  role: "wall" | "floor" | "ramp" | "divider" | "funnel";
  /** Rapier-style half-extents. */
  half: Vec3;
  position: Vec3;
  /** Euler XYZ rotation in radians (quantized). */
  rotation: Vec3;
};

/** A fixed cylinder - a pachinko peg. Rendered/collided lying across the shaft depth (Z). */
export type PegSpec = PhysicsProps & {
  kind: "peg";
  radius: number;
  halfHeight: number;
  position: Vec3;
  rotation: Vec3;
};

/** A fixed high-restitution ball that kicks marbles around. */
export type BumperSpec = PhysicsProps & {
  kind: "bumper";
  radius: number;
  position: Vec3;
};

/** A kinematic bar rotating at a fixed angular velocity (rad/s) about its Z axis. */
export type SpinnerSpec = PhysicsProps & {
  kind: "spinner";
  half: Vec3;
  position: Vec3;
  angularVelocity: number;
};

/** A sensor slab: marbles pass through it (no physical response); crossing order = result. */
export type SensorSpec = {
  kind: "sensor";
  role: "finish";
  half: Vec3;
  position: Vec3;
};

export type CourseElement =
  | CuboidSpec
  | PegSpec
  | BumperSpec
  | SpinnerSpec
  | SensorSpec;

export type MarbleStart = {
  id: MarbleId;
  position: Vec3;
  /** Initial linear velocity. */
  linvel: Vec3;
  /** Initial angular velocity (spin). */
  angvel: Vec3;
};

export type CourseSpec = {
  seed: string;
  gravity: Vec3;
  /** Axis-aligned bounds; a marble outside these has "escaped" (used by validation). */
  bounds: { min: Vec3; max: Vec3 };
  /** Y of the finish sensor plane (for camera framing / progress). */
  finishY: number;
  marble: PhysicsProps & { radius: number };
  marbleStarts: MarbleStart[];
  elements: CourseElement[];
};

// --- Geometry constants (course "shape"; kept out of the RNG so the shell is stable) ---

const HALF_WIDTH = 6; // shaft spans x in [-6, 6]
const HALF_DEPTH = 3; // shaft spans z in [-3, 3]
const WALL_THICKNESS = 0.5;
const TOP_Y = 1;
const LAYER_COUNT = 9;
const LAYER_SPACING = 6.5;
const FIRST_LAYER_Y = -6;
const FUNNEL_Y = FIRST_LAYER_Y - LAYER_COUNT * LAYER_SPACING - 4; // below the last layer
const SENSOR_Y = FUNNEL_Y - 3;
const FLOOR_Y = SENSOR_Y - 2.5;
const MARBLE_RADIUS = 0.5;

// --- Quantization + seeded helpers -----------------------------------------------------

/** Snap to a 1e-3 grid so cross-engine float differences can never leak into the sim. */
function q(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function v3(x: number, y: number, z: number): Vec3 {
  return { x: q(x), y: q(y), z: q(z) };
}

function range(random: () => number, min: number, max: number): number {
  return q(min + random() * (max - min));
}

function jitter(random: () => number, amp: number): number {
  return q((random() * 2 - 1) * amp);
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

// --- Builders --------------------------------------------------------------------------

/** The four perimeter walls + a catch floor: an open-top box marbles cannot escape. */
function buildShell(): CuboidSpec[] {
  const height = TOP_Y - FLOOR_Y;
  const midY = q((TOP_Y + FLOOR_Y) / 2);
  const halfY = q(height / 2);
  const wall: PhysicsProps = { restitution: 0.15, friction: 0.4 };

  return [
    {
      kind: "cuboid",
      role: "wall",
      half: v3(WALL_THICKNESS, halfY, HALF_DEPTH + WALL_THICKNESS),
      position: v3(-(HALF_WIDTH + WALL_THICKNESS), midY, 0),
      rotation: v3(0, 0, 0),
      ...wall,
    },
    {
      kind: "cuboid",
      role: "wall",
      half: v3(WALL_THICKNESS, halfY, HALF_DEPTH + WALL_THICKNESS),
      position: v3(HALF_WIDTH + WALL_THICKNESS, midY, 0),
      rotation: v3(0, 0, 0),
      ...wall,
    },
    {
      kind: "cuboid",
      role: "wall",
      half: v3(HALF_WIDTH + WALL_THICKNESS, halfY, WALL_THICKNESS),
      position: v3(0, midY, -(HALF_DEPTH + WALL_THICKNESS)),
      rotation: v3(0, 0, 0),
      ...wall,
    },
    {
      kind: "cuboid",
      role: "wall",
      half: v3(HALF_WIDTH + WALL_THICKNESS, halfY, WALL_THICKNESS),
      position: v3(0, midY, HALF_DEPTH + WALL_THICKNESS),
      rotation: v3(0, 0, 0),
      ...wall,
    },
    {
      kind: "cuboid",
      role: "floor",
      half: v3(HALF_WIDTH + WALL_THICKNESS, WALL_THICKNESS, HALF_DEPTH + WALL_THICKNESS),
      position: v3(0, FLOOR_Y, 0),
      rotation: v3(0, 0, 0),
      ...wall,
    },
  ];
}

/** One seeded obstacle layer at height `y`. Layer type is chosen from the catalog. */
function buildLayer(random: () => number, y: number): CourseElement[] {
  const kind = pick(random, ["pegs", "spinner", "bumpers", "ramp", "divider"] as const);

  if (kind === "pegs") {
    const count = 3 + Math.floor(random() * 3); // 3..5 pegs
    const spacing = q((2 * HALF_WIDTH) / (count + 1));
    return Array.from({ length: count }, (_, i): PegSpec => ({
      kind: "peg",
      radius: range(random, 0.45, 0.7),
      halfHeight: HALF_DEPTH,
      position: v3(-HALF_WIDTH + spacing * (i + 1) + jitter(random, 0.4), y, 0),
      // Lay the cylinder across the shaft depth (rotate its Y axis onto Z).
      rotation: v3(q(Math.PI / 2), 0, 0),
      restitution: 0.4,
      friction: 0.3,
    }));
  }

  if (kind === "spinner") {
    const dir = random() < 0.5 ? -1 : 1;
    return [
      {
        kind: "spinner",
        half: v3(range(random, 2.5, 4), 0.25, 0.4),
        position: v3(jitter(random, 1.5), y, 0),
        angularVelocity: q(dir * range(random, 1, 2.2)),
        restitution: 0.5,
        friction: 0.3,
      },
    ];
  }

  if (kind === "bumpers") {
    const count = 2 + Math.floor(random() * 2); // 2..3 bumpers
    const spacing = q((2 * HALF_WIDTH) / (count + 1));
    return Array.from({ length: count }, (_, i): BumperSpec => ({
      kind: "bumper",
      radius: range(random, 0.6, 0.9),
      position: v3(-HALF_WIDTH + spacing * (i + 1) + jitter(random, 0.5), y, jitter(random, 1)),
      restitution: 0.9,
      friction: 0.2,
    }));
  }

  if (kind === "ramp") {
    const dir = random() < 0.5 ? -1 : 1;
    return [
      {
        kind: "cuboid",
        role: "ramp",
        half: v3(range(random, 3.5, 4.5), 0.3, HALF_DEPTH),
        position: v3(jitter(random, 1.2), y, 0),
        rotation: v3(0, 0, q(dir * range(random, 0.3, 0.5))),
        restitution: 0.2,
        friction: 0.5,
      },
    ];
  }

  // divider: a vertical fin that splits the falling pack into two lanes
  return [
    {
      kind: "cuboid",
      role: "divider",
      half: v3(0.3, range(random, 1.5, 2.5), HALF_DEPTH),
      position: v3(jitter(random, 2), y, 0),
      rotation: v3(0, 0, 0),
      restitution: 0.3,
      friction: 0.4,
    },
  ];
}

/**
 * A converging V-funnel that serializes the pack, leaving a central gap to the sensor.
 * Each arm slopes DOWN toward the centre: the left arm rotates -0.4 rad about Z (its inner
 * +X tip drops), the right arm +0.4 rad (its inner -X tip drops), so marbles slide inward
 * into a ~2.4-unit central gap. Outer ends embed into the side walls (no outer escape route).
 */
function buildFunnel(): CuboidSpec[] {
  const funnel: PhysicsProps = { restitution: 0.2, friction: 0.3 };
  return [
    {
      kind: "cuboid",
      role: "funnel",
      half: v3(3, 0.3, HALF_DEPTH),
      position: v3(-4, FUNNEL_Y, 0),
      rotation: v3(0, 0, q(-0.4)),
      ...funnel,
    },
    {
      kind: "cuboid",
      role: "funnel",
      half: v3(3, 0.3, HALF_DEPTH),
      position: v3(4, FUNNEL_Y, 0),
      rotation: v3(0, 0, q(0.4)),
      ...funnel,
    },
  ];
}

function buildFinishSensor(): SensorSpec {
  return {
    kind: "sensor",
    role: "finish",
    half: v3(HALF_WIDTH, 0.2, HALF_DEPTH),
    position: v3(0, SENSOR_Y, 0),
  };
}

/** Five marbles across the top, each with seeded jitter/spin so identical marbles diverge. */
function buildMarbleStarts(random: () => number): MarbleStart[] {
  return MARBLES.map((marble, index): MarbleStart => {
    const laneX = -4 + index * 2; // -4, -2, 0, 2, 4
    return {
      id: marble.id,
      position: v3(laneX + jitter(random, 0.4), TOP_Y + 1.5 + jitter(random, 0.3), jitter(random, 0.4)),
      linvel: v3(jitter(random, 0.3), 0, jitter(random, 0.3)),
      angvel: v3(jitter(random, 1), jitter(random, 1), jitter(random, 1)),
    };
  });
}

/**
 * Build the full daily course for a given seed. Same seed -> identical spec (deep-equal),
 * different seeds -> different specs. All numbers are quantized to 1e-3.
 */
export function generateCourse(seed: string): CourseSpec {
  const random = createSeededRandom(seed);

  const elements: CourseElement[] = [];
  // Deterministic insertion order: shell, then layers top-to-bottom, then funnel, then sensor.
  elements.push(...buildShell());
  for (let i = 0; i < LAYER_COUNT; i += 1) {
    elements.push(...buildLayer(random, q(FIRST_LAYER_Y - i * LAYER_SPACING)));
  }
  elements.push(...buildFunnel());
  elements.push(buildFinishSensor());

  return {
    seed,
    gravity: v3(0, -9.81, 0),
    bounds: {
      min: v3(-(HALF_WIDTH + 3), FLOOR_Y - 5, -(HALF_DEPTH + 3)),
      max: v3(HALF_WIDTH + 3, TOP_Y + 6, HALF_DEPTH + 3),
    },
    finishY: q(SENSOR_Y),
    marble: { radius: MARBLE_RADIUS, restitution: 0.3, friction: 0.4 },
    marbleStarts: buildMarbleStarts(random),
    elements,
  };
}
