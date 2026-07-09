// Headless deterministic race simulation.
//
// Turns a CourseSpec (from src/lib/course.ts) into a Rapier world, steps it at a FIXED
// timestep with no rendering, and records:
//   - finishOrder: the order marbles cross the finish plane (the emergent, hidden answer),
//   - trajectory: per-step transforms of every dynamic/kinematic body, for exact replay,
//   - durationSeconds: emergent race length = steps * dt.
//
// If a course fails (a marble gets stuck or escapes the bounds), we salt the seed and
// regenerate - so a procedurally generated day is always a valid, completable race.
//
// Determinism: fixed timestep, seeded inputs, a fresh world per run, bodies inserted in a
// stable order, and Euler->quaternion conversions quantized (sin/cos are not cross-platform
// deterministic; snapping to 1e-3 then normalizing with the correctly-rounded sqrt is).

import { getRapier, type Rapier } from "./rapier";
import {
  generateCourse,
  type CourseSpec,
  type Vec3,
} from "./course";
import type { MarbleId } from "./game";

const DT = 1 / 60;
const MAX_STEPS = 60 * 60; // 60s budget; a marble slower than this is "stuck"
const MAX_ATTEMPTS = 16; // reseed budget before we accept a best-effort result

/** Per-body recorded motion: `frames` is frameCount * 7 floats [x,y,z, qx,qy,qz,qw]. */
export type BodyTrack = {
  id: string;
  kind: "marble" | "spinner";
  marbleId: MarbleId | null;
  frames: number[];
};

export type Trajectory = {
  dt: number;
  frameCount: number;
  tracks: BodyTrack[];
};

export type RaceResult = {
  /** The (possibly reseeded) spec that actually produced this race - render THIS one. */
  spec: CourseSpec;
  seed: string;
  attempts: number;
  valid: boolean;
  finishOrder: MarbleId[];
  durationSeconds: number;
  trajectory: Trajectory;
};

type World = InstanceType<Rapier["World"]>;
type RigidBody = ReturnType<World["createRigidBody"]>;

/** Convert a quantized Euler-XYZ rotation to a normalized, cross-platform-stable quaternion. */
function eulerToQuat(rot: Vec3): { x: number; y: number; z: number; w: number } {
  const hx = rot.x / 2;
  const hy = rot.y / 2;
  const hz = rot.z / 2;
  const cx = Math.cos(hx);
  const sx = Math.sin(hx);
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cz = Math.cos(hz);
  const sz = Math.sin(hz);

  // Snap the transcendental results to a 1e-3 grid so any cross-engine ULP differences
  // vanish, then normalize with sqrt (which IS correctly-rounded / deterministic).
  const snap = (n: number) => Math.round(n * 1000) / 1000;
  let x = snap(sx * cy * cz + cx * sy * sz);
  let y = snap(cx * sy * cz - sx * cy * sz);
  let z = snap(cx * cy * sz + sx * sy * cz);
  let w = snap(cx * cy * cz - sx * sy * sz);
  const inv = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  x *= inv;
  y *= inv;
  z *= inv;
  w *= inv;
  return { x, y, z, w };
}

/**
 * Build a Rapier world from a CourseSpec. Insertion order is fixed and seed-independent:
 * course elements in array order, then marbles in id order. Returns the world plus handles
 * to the bodies we need to read each step.
 */
export function buildWorld(RAPIER: Rapier, spec: CourseSpec) {
  const world = new RAPIER.World(spec.gravity);
  world.timestep = DT;

  const spinners: { index: number; body: RigidBody }[] = [];

  spec.elements.forEach((element, index) => {
    if (element.kind === "spinner") {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(
          element.position.x,
          element.position.y,
          element.position.z,
        ),
      );
      body.setAngvel({ x: 0, y: 0, z: element.angularVelocity }, true);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(element.half.x, element.half.y, element.half.z)
          .setRestitution(element.restitution)
          .setFriction(element.friction),
        body,
      );
      spinners.push({ index, body });
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      element.position.x,
      element.position.y,
      element.position.z,
    );
    if ("rotation" in element) {
      bodyDesc.setRotation(eulerToQuat(element.rotation));
    }
    const body = world.createRigidBody(bodyDesc);

    let colliderDesc;
    if (element.kind === "cuboid") {
      colliderDesc = RAPIER.ColliderDesc.cuboid(element.half.x, element.half.y, element.half.z);
    } else if (element.kind === "peg") {
      colliderDesc = RAPIER.ColliderDesc.cylinder(element.halfHeight, element.radius);
    } else if (element.kind === "bumper") {
      colliderDesc = RAPIER.ColliderDesc.ball(element.radius);
    } else {
      // sensor: passes marbles through (no physical response); used as the finish marker.
      colliderDesc = RAPIER.ColliderDesc.cuboid(element.half.x, element.half.y, element.half.z).setSensor(true);
    }
    if (element.kind !== "sensor") {
      colliderDesc.setRestitution(element.restitution).setFriction(element.friction);
    }
    world.createCollider(colliderDesc, body);
  });

  const marbles = new Map<MarbleId, RigidBody>();
  spec.marbleStarts.forEach((start) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.position.x, start.position.y, start.position.z)
        .setLinvel(start.linvel.x, start.linvel.y, start.linvel.z)
        .setAngvel(start.angvel)
        .setCcdEnabled(true),
    );
    // Uniform density -> uniform mass (same radius for all), so no marble has an advantage.
    world.createCollider(
      RAPIER.ColliderDesc.ball(spec.marble.radius)
        .setRestitution(spec.marble.restitution)
        .setFriction(spec.marble.friction)
        .setDensity(1),
      body,
    );
    marbles.set(start.id, body);
  });

  return { world, marbles, spinners };
}

function isOutOfBounds(p: Vec3, spec: CourseSpec): boolean {
  const { min, max } = spec.bounds;
  return (
    p.x < min.x || p.x > max.x || p.y < min.y || p.y > max.y || p.z < min.z || p.z > max.z
  );
}

/** Run one course to completion (or budget). Frees the Rapier world before returning. */
function runSimulation(RAPIER: Rapier, spec: CourseSpec) {
  const { world, marbles, spinners } = buildWorld(RAPIER, spec);
  const marbleIds = spec.marbleStarts.map((s) => s.id);

  const tracks: BodyTrack[] = [
    ...marbleIds.map((id) => ({ id: `marble:${id}`, kind: "marble" as const, marbleId: id, frames: [] as number[] })),
    ...spinners.map((s) => ({ id: `spinner:${s.index}`, kind: "spinner" as const, marbleId: null, frames: [] as number[] })),
  ];

  const finishAt = new Map<MarbleId, { step: number; y: number }>();
  const minY = new Map<MarbleId, number>(marbleIds.map((id) => [id, Infinity]));
  let escaped = false;
  let steps = 0;

  for (; steps < MAX_STEPS; steps += 1) {
    world.step();

    marbleIds.forEach((id, i) => {
      const body = marbles.get(id)!;
      const t = body.translation();
      const r = body.rotation();
      tracks[i].frames.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);

      if (t.y < minY.get(id)!) minY.set(id, t.y);
      if (!finishAt.has(id) && t.y < spec.finishY) finishAt.set(id, { step: steps, y: t.y });
      if (isOutOfBounds(t, spec)) escaped = true;
    });

    spinners.forEach((s, i) => {
      const t = s.body.translation();
      const r = s.body.rotation();
      tracks[marbleIds.length + i].frames.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
    });

    if (finishAt.size === marbleIds.length || escaped) {
      steps += 1;
      break;
    }
  }

  const frameCount = tracks.length > 0 ? tracks[0].frames.length / 7 : 0;

  // Finishers first, ordered by (crossing step, then depth past the plane, then id).
  const finished = [...finishAt.entries()]
    .sort(
      (a, b) =>
        a[1].step - b[1].step ||
        a[1].y - b[1].y ||
        marbleIds.indexOf(a[0]) - marbleIds.indexOf(b[0]),
    )
    .map(([id]) => id);
  // Any non-finishers (only in a best-effort invalid run) ranked by how far down they got.
  const unfinished = marbleIds
    .filter((id) => !finishAt.has(id))
    .sort((a, b) => minY.get(a)! - minY.get(b)!);

  const valid = unfinished.length === 0 && !escaped;
  world.free();

  return {
    valid,
    finishOrder: [...finished, ...unfinished],
    durationSeconds: Math.round(frameCount * DT * 1000) / 1000,
    trajectory: { dt: DT, frameCount, tracks },
  };
}

/**
 * Simulate the daily race for `spec`. If the course is invalid, salt the seed
 * (`seed#1`, `seed#2`, ...) and regenerate, up to MAX_ATTEMPTS. Returns the spec that
 * actually produced the race (render that one), the emergent finish order, and the
 * replay trajectory. Loads (and memoizes) the deterministic Rapier build internally.
 */
export async function simulateRace(spec: CourseSpec): Promise<RaceResult> {
  const RAPIER = await getRapier();

  let attemptSpec = spec;
  let outcome = runSimulation(RAPIER, attemptSpec);
  let attempt = 1;

  while (!outcome.valid && attempt < MAX_ATTEMPTS) {
    attemptSpec = generateCourse(`${spec.seed}#${attempt}`);
    outcome = runSimulation(RAPIER, attemptSpec);
    attempt += 1;
  }

  return {
    spec: attemptSpec,
    seed: attemptSpec.seed,
    attempts: attempt,
    valid: outcome.valid,
    finishOrder: outcome.finishOrder,
    durationSeconds: outcome.durationSeconds,
    trajectory: outcome.trajectory,
  };
}
