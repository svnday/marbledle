// Pure, deterministic procedural course generator.
//
// This module emits plain data only. The path samples describe the marble-run
// centerline; static scenery, obstacles, starts, finish, camera, and validation all
// derive from the same path so the daily course has one source of truth.

import { type MarbleId, MARBLES, createSeededRandom } from "./game";

export type Vec3 = { x: number; y: number; z: number };

type PhysicsProps = {
  restitution: number;
  friction: number;
};

export type CuboidSpec = PhysicsProps & {
  kind: "cuboid";
  role: "floor" | "rail" | "support" | "ramp" | "divider" | "funnel";
  half: Vec3;
  position: Vec3;
  rotation: Vec3;
  station?: number;
};

export type PegSpec = PhysicsProps & {
  kind: "peg";
  radius: number;
  halfHeight: number;
  position: Vec3;
  rotation: Vec3;
  station: number;
};

export type BumperSpec = PhysicsProps & {
  kind: "bumper";
  radius: number;
  position: Vec3;
  station: number;
};

export type SpinnerSpec = PhysicsProps & {
  kind: "spinner";
  half: Vec3;
  position: Vec3;
  angularVelocity: number;
  station: number;
};

export type SensorSpec = {
  kind: "sensor";
  role: "finish";
  half: Vec3;
  position: Vec3;
  station: number;
};

export type CourseElement =
  | CuboidSpec
  | PegSpec
  | BumperSpec
  | SpinnerSpec
  | SensorSpec;

export type SegmentKind =
  | "start"
  | "sweep"
  | "banked-turn"
  | "helix"
  | "pinball"
  | "finish";

export type TrackSegment = {
  id: string;
  kind: SegmentKind;
  startStation: number;
  endStation: number;
  obstacleDensity: number;
  bank: number;
};

export type SetpieceKind =
  | "start-gate"
  | "checkpoint"
  | "chaos-zone"
  | "helix-beacon"
  | "finish-arch";

export type TrackSetpiece = {
  kind: SetpieceKind;
  station: number;
  segmentId: string;
  position: Vec3;
  tangent: Vec3;
  right: Vec3;
  label: string;
  color: string;
};

export type PathSample = {
  station: number;
  position: Vec3;
  tangent: Vec3;
  right: Vec3;
  bank: number;
  segmentId: string;
};

export type CoursePath = {
  length: number;
  width: number;
  railHeight: number;
  samples: PathSample[];
  segments: TrackSegment[];
  setpieces: TrackSetpiece[];
};

export type MarbleStart = {
  id: MarbleId;
  position: Vec3;
  linvel: Vec3;
  angvel: Vec3;
  station: number;
  laneOffset: number;
};

export type CourseSpec = {
  seed: string;
  gravity: Vec3;
  bounds: { min: Vec3; max: Vec3 };
  finishY: number;
  finishStation: number;
  path: CoursePath;
  marble: PhysicsProps & { radius: number };
  marbleStarts: MarbleStart[];
  elements: CourseElement[];
};

const TRACK_WIDTH = 7.2;
const RAIL_HEIGHT = 1.15;
const MARBLE_RADIUS = 0.5;
const SAMPLE_SPACING = 1.15;
const START_Y = 14;
const FLOOR_THICKNESS = 0.26;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: Vec3, value: number): Vec3 {
  return v3(a.x * value, a.y * value, a.z * value);
}

function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1;
  return v3(a.x / len, a.y / len, a.z / len);
}

function lerp(a: number, b: number, t: number): number {
  return q(a + (b - a) * t);
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function makeRight(heading: number, bank: number): Vec3 {
  return normalize({
    x: Math.cos(heading),
    y: Math.sin(bank) * 0.58,
    z: -Math.sin(heading),
  });
}

type SegmentDraft = {
  kind: SegmentKind;
  length: number;
  turnRadians: number;
  drop: number;
  bank: number;
  obstacleDensity: number;
};

function buildSegmentDrafts(random: () => number): SegmentDraft[] {
  const drafts: SegmentDraft[] = [
    {
      kind: "start",
      length: 18,
      turnRadians: 0,
      drop: 4.8,
      bank: 0,
      obstacleDensity: 0.15,
    },
  ];

  const kinds: SegmentKind[] = [
    "sweep",
    "banked-turn",
    "pinball",
    "helix",
    "sweep",
    "banked-turn",
    "pinball",
    "helix",
  ];

  for (let index = 0; index < kinds.length; index += 1) {
    const dir = random() < 0.5 ? -1 : 1;
    const kind = kinds[index];
    const isHelix = kind === "helix";
    const isPinball = kind === "pinball";
    const len = isHelix ? range(random, 22, 27) : range(random, 15, 22);
    const turn =
      kind === "sweep"
        ? dir * range(random, 0.35, 0.72)
        : kind === "banked-turn"
          ? dir * range(random, 0.85, 1.35)
          : isHelix
            ? dir * range(random, 1.6, 2.25)
            : dir * range(random, 0.2, 0.55);

    drafts.push({
      kind,
      length: len,
      turnRadians: turn,
      drop: len * range(random, isHelix ? 0.19 : 0.16, isPinball ? 0.24 : 0.28),
      bank: clamp(turn / Math.max(len, 1) * 9, -0.58, 0.58),
      obstacleDensity: isPinball ? 0.95 : isHelix ? 0.34 : 0.48,
    });
  }

  drafts.push({
    kind: "finish",
    length: 20,
    turnRadians: random() < 0.5 ? -0.24 : 0.24,
    drop: 5.8,
    bank: 0,
    obstacleDensity: 0.18,
  });

  return drafts;
}

function buildPath(seed: string): CoursePath {
  const random = createSeededRandom(`${seed}:path`);
  const drafts = buildSegmentDrafts(random);
  const samples: PathSample[] = [];
  const segments: TrackSegment[] = [];
  let station = 0;
  let heading = range(random, -0.45, 0.45);
  let position = v3(0, START_Y, 0);

  drafts.forEach((draft, segmentIndex) => {
    const id = `${segmentIndex}-${draft.kind}`;
    const startStation = station;
    const steps = Math.max(3, Math.ceil(draft.length / SAMPLE_SPACING));

    for (let step = 0; step <= steps; step += 1) {
      const localT = step / steps;
      const sampleStation = q(startStation + draft.length * localT);
      const bank = q(Math.sin(localT * Math.PI) * draft.bank);
      const tangent = normalize({
        x: Math.sin(heading),
        y: -draft.drop / Math.max(draft.length, 1),
        z: Math.cos(heading),
      });

      if (samples.length === 0 || sampleStation > samples[samples.length - 1].station) {
        samples.push({
          station: sampleStation,
          position,
          tangent,
          right: makeRight(heading, bank),
          bank,
          segmentId: id,
        });
      }

      if (step < steps) {
        const ds = draft.length / steps;
        const turnDelta = draft.turnRadians / steps;
        heading += turnDelta;
        position = v3(
          position.x + Math.sin(heading) * ds,
          position.y - (draft.drop / steps),
          position.z + Math.cos(heading) * ds,
        );
      }
    }

    station = q(startStation + draft.length);
    segments.push({
      id,
      kind: draft.kind,
      startStation,
      endStation: station,
      obstacleDensity: q(draft.obstacleDensity),
      bank: q(draft.bank),
    });
  });

  const finalSample = samples[samples.length - 1];
  if (finalSample.station !== station) {
    samples.push({ ...finalSample, station });
  }

  const path = {
    length: station,
    width: TRACK_WIDTH,
    railHeight: RAIL_HEIGHT,
    samples,
    segments,
  };

  return {
    ...path,
    setpieces: buildSetpieces(path),
  };
}

export function sampleCoursePath(path: CoursePath, station: number) {
  const clamped = clamp(station, 0, path.length);
  const samples = path.samples;

  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    if (clamped >= a.station && clamped <= b.station) {
      const span = Math.max(b.station - a.station, 0.001);
      const t = (clamped - a.station) / span;
      return {
        station: q(clamped),
        position: lerpVec(a.position, b.position, t),
        tangent: normalize(lerpVec(a.tangent, b.tangent, t)),
        right: normalize(lerpVec(a.right, b.right, t)),
        bank: lerp(a.bank, b.bank, t),
        segmentId: t < 0.5 ? a.segmentId : b.segmentId,
      } satisfies PathSample;
    }
  }

  return samples[samples.length - 1];
}

function pointOnTrack(path: CoursePath, station: number, laneOffset: number, lift = 0): Vec3 {
  const sample = sampleCoursePath(path, station);
  return add(sample.position, add(scale(sample.right, laneOffset), v3(0, lift, 0)));
}

function buildObstacles(seed: string, path: CoursePath): CourseElement[] {
  const random = createSeededRandom(`${seed}:obstacles`);
  const elements: CourseElement[] = [];

  path.segments.forEach((segment) => {
    if (segment.kind === "start" || segment.kind === "finish") {
      return;
    }

    const span = segment.endStation - segment.startStation;
    const count = Math.max(1, Math.round(span * segment.obstacleDensity / 7));
    for (let index = 0; index < count; index += 1) {
      const station = q(segment.startStation + ((index + 1) / (count + 1)) * span + jitter(random, 1.2));
      const lane = range(random, -TRACK_WIDTH * 0.32, TRACK_WIDTH * 0.32);
      const choice = random();

      if (choice < 0.44) {
        elements.push({
          kind: "bumper",
          radius: range(random, 0.45, 0.78),
          position: pointOnTrack(path, station, lane, 0.48),
          station,
          restitution: 1.05,
          friction: 0.16,
        });
      } else if (choice < 0.78) {
        const sample = sampleCoursePath(path, station);
        elements.push({
          kind: "peg",
          radius: range(random, 0.18, 0.28),
          halfHeight: 0.82,
          position: pointOnTrack(path, station, lane, 0.7),
          rotation: v3(0, q(Math.atan2(sample.tangent.x, sample.tangent.z)), 0),
          station,
          restitution: 0.74,
          friction: 0.12,
        });
      } else {
        elements.push({
          kind: "spinner",
          half: v3(range(random, 0.85, 1.35), 0.14, 0.18),
          position: pointOnTrack(path, station, lane, 0.72),
          angularVelocity: q((random() < 0.5 ? -1 : 1) * range(random, 1.6, 2.9)),
          station,
          restitution: 0.68,
          friction: 0.28,
        });
      }
    }
  });

  return elements.sort((a, b) => elementStation(a) - elementStation(b));
}

function buildSetpieces(path: Omit<CoursePath, "setpieces">): TrackSetpiece[] {
  const setpieces: TrackSetpiece[] = [];

  path.segments.forEach((segment, index) => {
    const midStation = q((segment.startStation + segment.endStation) / 2);
    const sample = sampleCoursePath({ ...path, setpieces: [] }, midStation);

    if (segment.kind === "start") {
      const start = sampleCoursePath({ ...path, setpieces: [] }, 0);
      setpieces.push({
        kind: "start-gate",
        station: 0,
        segmentId: segment.id,
        position: start.position,
        tangent: start.tangent,
        right: start.right,
        label: "START",
        color: "#38bdf8",
      });
    } else if (segment.kind === "pinball") {
      setpieces.push({
        kind: "chaos-zone",
        station: midStation,
        segmentId: segment.id,
        position: sample.position,
        tangent: sample.tangent,
        right: sample.right,
        label: `CHAOS ${index}`,
        color: "#f472b6",
      });
    } else if (segment.kind === "helix") {
      setpieces.push({
        kind: "helix-beacon",
        station: midStation,
        segmentId: segment.id,
        position: sample.position,
        tangent: sample.tangent,
        right: sample.right,
        label: `HELIX ${index}`,
        color: "#a78bfa",
      });
    } else if (segment.kind === "banked-turn") {
      setpieces.push({
        kind: "checkpoint",
        station: midStation,
        segmentId: segment.id,
        position: sample.position,
        tangent: sample.tangent,
        right: sample.right,
        label: `GATE ${index}`,
        color: "#22d3ee",
      });
    } else if (segment.kind === "finish") {
      const finish = sampleCoursePath({ ...path, setpieces: [] }, path.length);
      setpieces.push({
        kind: "finish-arch",
        station: path.length,
        segmentId: segment.id,
        position: finish.position,
        tangent: finish.tangent,
        right: finish.right,
        label: "FINISH",
        color: "#34d399",
      });
    }
  });

  return setpieces;
}

function elementStation(element: CourseElement): number {
  return "station" in element && typeof element.station === "number" ? element.station : 0;
}

function buildFinishSensor(path: CoursePath): SensorSpec {
  const station = q(path.length - 0.6);
  const sample = sampleCoursePath(path, station);
  return {
    kind: "sensor",
    role: "finish",
    half: v3(TRACK_WIDTH / 2, 0.18, 0.5),
    position: add(sample.position, v3(0, 0.25, 0)),
    station,
  };
}

function buildMarbleStarts(seed: string, path: CoursePath): MarbleStart[] {
  const random = createSeededRandom(`${seed}:starts`);
  const laneStep = TRACK_WIDTH / 6;

  return MARBLES.map((marble, index): MarbleStart => {
    const laneOffset = q((index - 2) * laneStep + jitter(random, 0.16));
    const station = q(jitter(random, 0.18));
    const sample = sampleCoursePath(path, 0);
    return {
      id: marble.id,
      position: add(sample.position, add(scale(sample.right, laneOffset), v3(0, 1.35 + jitter(random, 0.08), 0))),
      linvel: scale(sample.tangent, range(random, 0.2, 0.45)),
      angvel: v3(jitter(random, 1), jitter(random, 1), jitter(random, 1)),
      station,
      laneOffset,
    };
  });
}

function buildGuideElements(path: CoursePath): CuboidSpec[] {
  const elements: CuboidSpec[] = [];
  const supportEvery = 12;

  path.samples.forEach((sample, index) => {
    if (index % supportEvery !== 0 && index !== path.samples.length - 1) {
      return;
    }
    elements.push({
      kind: "cuboid",
      role: "support",
      half: v3(0.09, Math.max(1, sample.position.y + 1) / 2, 0.09),
      position: v3(sample.position.x, (sample.position.y - Math.max(1, sample.position.y + 1) / 2) - 0.28, sample.position.z),
      rotation: v3(0, 0, 0),
      station: sample.station,
      restitution: 0.1,
      friction: 0.5,
    });
  });

  const finish = sampleCoursePath(path, path.length);
  elements.push({
    kind: "cuboid",
    role: "floor",
    half: v3(TRACK_WIDTH / 2, FLOOR_THICKNESS, 1.4),
    position: add(finish.position, v3(0, -0.35, 0)),
    rotation: v3(0, 0, 0),
    station: path.length,
    restitution: 0.18,
    friction: 0.38,
  });

  return elements;
}

function buildBounds(path: CoursePath) {
  const xs = path.samples.map((sample) => sample.position.x);
  const ys = path.samples.map((sample) => sample.position.y);
  const zs = path.samples.map((sample) => sample.position.z);
  const pad = TRACK_WIDTH + 6;

  return {
    min: v3(Math.min(...xs) - pad, Math.min(...ys) - 8, Math.min(...zs) - pad),
    max: v3(Math.max(...xs) + pad, Math.max(...ys) + 8, Math.max(...zs) + pad),
  };
}

export function generateCourse(seed: string): CourseSpec {
  const path = buildPath(seed);
  const elements: CourseElement[] = [
    ...buildGuideElements(path),
    ...buildObstacles(seed, path),
    buildFinishSensor(path),
  ];
  const finish = sampleCoursePath(path, path.length);

  return {
    seed,
    gravity: v3(0, -9.4, 0),
    bounds: buildBounds(path),
    finishY: q(finish.position.y),
    finishStation: q(path.length),
    path,
    marble: { radius: MARBLE_RADIUS, restitution: 0.45, friction: 0.42 },
    marbleStarts: buildMarbleStarts(seed, path),
    elements,
  };
}
