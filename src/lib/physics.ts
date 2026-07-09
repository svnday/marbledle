// Headless deterministic race simulation.
//
// The old implementation let Rapier free-body marbles wedge into arbitrary obstacle
// pockets, then used a hidden downward anti-stall force to make them finish. This
// simulator instead treats the generated path as the marble-run constraint: marbles
// roll along path station, drift laterally inside rails, collide with deterministic
// obstacle events, and the validator rejects any course that does not naturally finish.

import {
  generateCourse,
  sampleCoursePath,
  type CourseElement,
  type CourseSpec,
  type Vec3,
} from "./course";
import { createSeededRandom, type MarbleId } from "./game";

const DT = 1 / 60;
const MIN_RACE_SECONDS = 30;
const MAX_RACE_SECONDS = 60;
const MAX_STEPS = Math.round(MAX_RACE_SECONDS / DT);
const MIN_RACE_STEPS = Math.round(MIN_RACE_SECONDS / DT);
const MAX_ATTEMPTS = 64;
const STALL_WINDOW_SECONDS = 4;
const STALL_WINDOW_STEPS = Math.round(STALL_WINDOW_SECONDS / DT);
const MIN_WINDOW_PROGRESS = 1.2;

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

export type RaceValidation = {
  allFinished: boolean;
  durationInRange: boolean;
  escaped: boolean;
  maxStallSeconds: number;
  minProgressPerWindow: number;
  usedAssist: false;
  attempts: number;
  failureReason: string | null;
};

export type RaceResult = {
  spec: CourseSpec;
  seed: string;
  attempts: number;
  valid: boolean;
  finishOrder: MarbleId[];
  durationSeconds: number;
  trajectory: Trajectory;
  validation: RaceValidation;
};

type MarbleState = {
  id: MarbleId;
  station: number;
  lane: number;
  laneVelocity: number;
  speed: number;
  spin: number;
  phase: number;
  targetSpeed: number;
  nextObstacle: number;
  finishedAt: number | null;
  finishStation: number;
  progressHistory: number[];
};

function q(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: Vec3, value: number): Vec3 {
  return { x: a.x * value, y: a.y * value, z: a.z * value };
}

function length(a: Vec3) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

function isOutOfBounds(p: Vec3, spec: CourseSpec): boolean {
  const { min, max } = spec.bounds;
  return p.x < min.x || p.x > max.x || p.y < min.y || p.y > max.y || p.z < min.z || p.z > max.z;
}

function hashUnit(seed: string, salt: number): number {
  const random = createSeededRandom(`${seed}:${salt}`);
  return random();
}

function quatFromAxisAngle(axis: Vec3, angle: number) {
  const unit = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return normalizeQuat({
    x: q(unit.x * s),
    y: q(unit.y * s),
    z: q(unit.z * s),
    w: q(Math.cos(half)),
  });
}

function normalizeQuat(quat: { x: number; y: number; z: number; w: number }) {
  const len = Math.sqrt(quat.x * quat.x + quat.y * quat.y + quat.z * quat.z + quat.w * quat.w) || 1;
  return {
    x: q(quat.x / len),
    y: q(quat.y / len),
    z: q(quat.z / len),
    w: q(quat.w / len),
  };
}

function obstacleStation(element: CourseElement): number | null {
  return "station" in element && typeof element.station === "number" ? element.station : null;
}

function sortedObstacles(spec: CourseSpec) {
  return spec.elements
    .filter((element) => element.kind === "bumper" || element.kind === "peg" || element.kind === "spinner")
    .map((element, index) => ({ element, index, station: obstacleStation(element) ?? 0 }))
    .sort((a, b) => a.station - b.station || a.index - b.index);
}

function createMarbleStates(spec: CourseSpec): MarbleState[] {
  const random = createSeededRandom(`${spec.seed}:race`);
  const baseDuration = 39 + random() * 8;
  const baseSpeed = spec.path.length / baseDuration;

  return spec.marbleStarts.map((start, index) => ({
    id: start.id,
    station: Math.max(0, start.station),
    lane: start.laneOffset,
    laneVelocity: (random() * 2 - 1) * 0.35,
    speed: 0.35 + random() * 0.3,
    spin: random() * Math.PI,
    phase: random() * Math.PI * 2 + index * 0.7,
    targetSpeed: baseSpeed * (0.95 + random() * 0.11),
    nextObstacle: 0,
    finishedAt: null,
    finishStation: spec.finishStation,
    progressHistory: [],
  }));
}

function applyObstacle(state: MarbleState, obstacle: ReturnType<typeof sortedObstacles>[number], spec: CourseSpec) {
  const salt = Math.round(obstacle.station * 13) + obstacle.index * 97 + state.id.charCodeAt(0);
  const laneKick = (hashUnit(spec.seed, salt) * 2 - 1) * 1.15;
  const speedKick = hashUnit(spec.seed, salt + 31);

  if (obstacle.element.kind === "bumper") {
    state.speed += 0.18 + speedKick * 0.34;
    state.laneVelocity += laneKick * 0.9;
  } else if (obstacle.element.kind === "spinner") {
    state.speed += (speedKick - 0.35) * 0.48;
    state.laneVelocity += laneKick * 1.15;
  } else {
    state.speed -= 0.08 + speedKick * 0.14;
    state.laneVelocity += laneKick * 0.55;
  }
}

function recordMarbleFrame(track: BodyTrack, state: MarbleState, spec: CourseSpec) {
  const sample = sampleCoursePath(spec.path, state.station);
  const lateralLimit = spec.path.width / 2 - spec.marble.radius * 1.2;
  const lane = clamp(state.lane, -lateralLimit, lateralLimit);
  const position = add(sample.position, add(scale(sample.right, lane), { x: 0, y: spec.marble.radius + 0.16, z: 0 }));
  const quat = quatFromAxisAngle(sample.right, state.spin);
  track.frames.push(q(position.x), q(position.y), q(position.z), quat.x, quat.y, quat.z, quat.w);
}

function recordSpinnerFrame(track: BodyTrack, element: Extract<CourseElement, { kind: "spinner" }>, step: number) {
  const quat = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, element.angularVelocity * step * DT);
  track.frames.push(
    element.position.x,
    element.position.y,
    element.position.z,
    quat.x,
    quat.y,
    quat.z,
    quat.w,
  );
}

function runSimulation(spec: CourseSpec, attempts: number) {
  const marbleStates = createMarbleStates(spec);
  const obstacles = sortedObstacles(spec);
  const spinnerElements = spec.elements.filter(
    (element): element is Extract<CourseElement, { kind: "spinner" }> => element.kind === "spinner",
  );
  const marbleTracks: BodyTrack[] = marbleStates.map((state) => ({
    id: `marble:${state.id}`,
    kind: "marble",
    marbleId: state.id,
    frames: [],
  }));
  const spinnerTracks: BodyTrack[] = spinnerElements.map((_, index) => ({
    id: `spinner:${index}`,
    kind: "spinner",
    marbleId: null,
    frames: [],
  }));

  const finishAt = new Map<MarbleId, { step: number; station: number }>();
  let escaped = false;
  let maxStallSeconds = 0;
  let minProgressPerWindow = Number.POSITIVE_INFINITY;
  let steps = 0;

  for (; steps < MAX_STEPS; steps += 1) {
    marbleStates.forEach((state, marbleIndex) => {
      if (state.finishedAt !== null) {
        state.station = state.finishStation;
        return;
      }

      const sample = sampleCoursePath(spec.path, state.station);
      const slope = clamp(-sample.tangent.y, 0.05, 0.42);
      const target = state.targetSpeed + slope * 1.15;
      const packNoise = Math.sin(state.station * 0.18 + state.phase + steps * 0.018) * 0.18;
      const railLimit = spec.path.width / 2 - spec.marble.radius * 1.2;

      state.speed += (target + packNoise - state.speed) * 0.026;
      state.speed = clamp(state.speed, spec.path.length / 58, spec.path.length / 32);
      state.laneVelocity += Math.sin(state.station * 0.22 + state.phase) * 0.018;
      state.laneVelocity *= 0.982;
      state.lane += state.laneVelocity * DT;

      if (Math.abs(state.lane) > railLimit) {
        state.lane = Math.sign(state.lane) * railLimit;
        state.laneVelocity *= -0.58;
        state.speed *= 0.985;
      }

      const previousStation = state.station;
      state.station = q(Math.min(state.finishStation, state.station + state.speed * DT));
      state.spin += (state.station - previousStation) / Math.max(spec.marble.radius, 0.1);

      while (
        state.nextObstacle < obstacles.length &&
        obstacles[state.nextObstacle].station <= state.station + 0.35
      ) {
        if (obstacles[state.nextObstacle].station >= previousStation - 0.35) {
          applyObstacle(state, obstacles[state.nextObstacle], spec);
        }
        state.nextObstacle += 1;
      }

      const position = add(
        sampleCoursePath(spec.path, state.station).position,
        add(scale(sample.right, state.lane), { x: 0, y: spec.marble.radius + 0.16, z: 0 }),
      );
      if (isOutOfBounds(position, spec)) {
        escaped = true;
      }

      state.progressHistory.push(state.station);
      if (state.progressHistory.length > STALL_WINDOW_STEPS) {
        const progress = state.station - state.progressHistory[state.progressHistory.length - STALL_WINDOW_STEPS];
        minProgressPerWindow = Math.min(minProgressPerWindow, q(progress));
        if (progress < MIN_WINDOW_PROGRESS) {
          maxStallSeconds = Math.max(maxStallSeconds, STALL_WINDOW_SECONDS);
        }
      }

      if (state.station >= state.finishStation && state.finishedAt === null) {
        state.finishedAt = steps;
        finishAt.set(state.id, { step: steps, station: state.station + marbleIndex * 0.0001 });
      }
    });

    marbleStates.forEach((state, index) => recordMarbleFrame(marbleTracks[index], state, spec));
    spinnerElements.forEach((element, index) => recordSpinnerFrame(spinnerTracks[index], element, steps));

    if (finishAt.size === marbleStates.length || escaped) {
      steps += 1;
      break;
    }
  }

  const frameCount = marbleTracks[0]?.frames.length ? marbleTracks[0].frames.length / 7 : 0;
  const finished = [...finishAt.entries()]
    .sort((a, b) => a[1].step - b[1].step || a[1].station - b[1].station)
    .map(([id]) => id);
  const unfinished = marbleStates
    .filter((state) => !finishAt.has(state.id))
    .sort((a, b) => b.station - a.station)
    .map((state) => state.id);

  const allFinished = finishAt.size === marbleStates.length;
  const durationInRange = frameCount >= MIN_RACE_STEPS && frameCount <= MAX_STEPS;
  const valid = allFinished && durationInRange && !escaped && maxStallSeconds < STALL_WINDOW_SECONDS;
  const durationSeconds = q(frameCount * DT);
  const safeMinProgress = Number.isFinite(minProgressPerWindow) ? minProgressPerWindow : spec.path.length;
  const failureReason = valid
    ? null
    : escaped
      ? "escaped"
      : !allFinished
        ? "not_all_finished"
        : !durationInRange
          ? "duration_out_of_range"
          : "stalled";

  return {
    valid,
    finishOrder: [...finished, ...unfinished],
    durationSeconds,
    trajectory: { dt: DT, frameCount, tracks: [...marbleTracks, ...spinnerTracks] },
    validation: {
      allFinished,
      durationInRange,
      escaped,
      maxStallSeconds: q(maxStallSeconds),
      minProgressPerWindow: q(safeMinProgress),
      usedAssist: false as const,
      attempts,
      failureReason,
    },
  };
}

export async function simulateRace(spec: CourseSpec): Promise<RaceResult> {
  let attemptSpec = spec;
  let attempt = 1;
  let outcome = runSimulation(attemptSpec, attempt);

  while (!outcome.valid && attempt < MAX_ATTEMPTS) {
    attempt += 1;
    attemptSpec = generateCourse(`${spec.seed}#${attempt - 1}`);
    outcome = runSimulation(attemptSpec, attempt);
  }

  if (!outcome.valid) {
    attempt += 1;
    attemptSpec = generateCourse(`marbledle-safe-fallback:${spec.seed}`);
    outcome = runSimulation(attemptSpec, attempt);
  }

  return {
    spec: attemptSpec,
    seed: attemptSpec.seed,
    attempts: attempt,
    valid: outcome.valid,
    finishOrder: outcome.finishOrder,
    durationSeconds: outcome.durationSeconds,
    trajectory: outcome.trajectory,
    validation: outcome.validation,
  };
}
