export type MarbleId = "red" | "blue" | "green" | "yellow" | "purple";

export type Marble = {
  id: MarbleId;
  name: string;
  color: string;
  glow: string;
};

export type TrackFeatureKind =
  | "loop"
  | "portal"
  | "bumper"
  | "spinner";

export type TrackFeature = {
  id: string;
  kind: TrackFeatureKind;
  x: number;
  y: number;
  z: number;
  rotation: number;
};

export type TrackPoint = {
  x: number;
  y: number;
  z: number;
};

export type DailyPuzzle = {
  dateKey: string;
  seed: string;
  marbles: Marble[];
  finishOrder: MarbleId[];
  trackPoints: TrackPoint[];
  trackFeatures: TrackFeature[];
  raceDurationSeconds: number;
};

export type MarbleScore = {
  marble: MarbleId;
  actualPosition: number;
  guessedPosition: number;
  error: number;
};

export type ScoreResult = {
  totalError: number;
  maxError: number;
  accuracy: number;
  details: MarbleScore[];
};

export type PositionGuess = Record<MarbleId, number | "">;

export const MARBLES: Marble[] = [
  { id: "red", name: "Red", color: "#ff4d6d", glow: "#fb7185" },
  { id: "blue", name: "Blue", color: "#38bdf8", glow: "#7dd3fc" },
  { id: "green", name: "Green", color: "#34d399", glow: "#86efac" },
  { id: "yellow", name: "Yellow", color: "#fde047", glow: "#facc15" },
  { id: "purple", name: "Purple", color: "#c084fc", glow: "#d8b4fe" },
];

const NEW_YORK_TIME_ZONE = "America/New_York";

export function getNewYorkDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function getDailyPuzzle(date = new Date()): DailyPuzzle {
  const dateKey = getNewYorkDateKey(date);
  const seed = `marbledle-${dateKey}`;
  const random = createSeededRandom(seed);
  const finishOrder = shuffle(
    MARBLES.map((marble) => marble.id),
    random,
  );
  const trackPoints = createTrackPoints(random);

  return {
    dateKey,
    seed,
    marbles: MARBLES,
    finishOrder,
    trackPoints,
    trackFeatures: createTrackFeatures(random, trackPoints),
    raceDurationSeconds: 30 + Math.round(random() * 15),
  };
}

export function createEmptyGuess(): PositionGuess {
  return MARBLES.reduce((guess, marble) => {
    guess[marble.id] = "";
    return guess;
  }, {} as PositionGuess);
}

export function guessToOrder(guess: PositionGuess): MarbleId[] {
  return MARBLES.map((marble) => marble.id).sort(
    (left, right) => Number(guess[left]) - Number(guess[right]),
  );
}

export function getGuessValidation(guess: PositionGuess) {
  const positions = Object.values(guess).filter(
    (position): position is number => typeof position === "number",
  );
  const uniquePositions = new Set(positions);

  return {
    isComplete: positions.length === MARBLES.length,
    hasDuplicates: uniquePositions.size !== positions.length,
    isValid: positions.length === MARBLES.length && uniquePositions.size === positions.length,
  };
}

export function getMarbleRaceDuration(
  puzzle: DailyPuzzle,
  marbleId: MarbleId,
) {
  const finishIndex = puzzle.finishOrder.indexOf(marbleId);
  const finalGap = 1.05;
  const leadGap = (puzzle.finishOrder.length - 1 - finishIndex) * finalGap;

  return Math.max(24, puzzle.raceDurationSeconds - leadGap);
}

export function scoreGuess(guess: MarbleId[], actual: MarbleId[]): ScoreResult {
  const details = actual.map((marble, actualIndex) => {
    const guessedIndex = guess.indexOf(marble);

    return {
      marble,
      actualPosition: actualIndex + 1,
      guessedPosition: guessedIndex + 1,
      error: Math.abs(actualIndex - guessedIndex),
    };
  });

  const totalError = details.reduce((sum, detail) => sum + detail.error, 0);
  const maxError = getMaxPositionError(actual.length);
  const accuracy = Math.max(0, Math.round((1 - totalError / maxError) * 100));

  return { totalError, maxError, accuracy, details };
}

export function getMarbleById(id: MarbleId) {
  const marble = MARBLES.find((item) => item.id === id);

  if (!marble) {
    throw new Error(`Unknown marble id: ${id}`);
  }

  return marble;
}

function createTrackPoints(random: () => number): TrackPoint[] {
  const points: TrackPoint[] = [{ x: 0, y: 3, z: 0 }];

  for (let index = 1; index < 18; index += 1) {
    const drift = Math.sin(index * 0.9) * 4.8;
    const sweep = Math.cos(index * 0.62) * 4.4;

    points.push({
      x: roundToTenth(clamp(drift + (random() * 7 - 3.5), -9.5, 9.5)),
      y: roundToTenth(3 - index * 3.35),
      z: roundToTenth(clamp(sweep + (random() * 7 - 3.5), -9.5, 9.5)),
    });
  }

  points.push({ x: 0, y: -59, z: 0 });

  return points;
}

function createTrackFeatures(
  random: () => number,
  trackPoints: TrackPoint[],
): TrackFeature[] {
  const kinds: TrackFeatureKind[] = [
    "loop",
    "portal",
    "bumper",
    "spinner",
  ];

  return Array.from({ length: 12 }, (_, index) => {
    const point = trackPoints[2 + index];

    return {
      id: `feature-${index}`,
      kind: kinds[Math.floor(random() * kinds.length)],
      x: roundToTenth(point.x + (random() * 4 - 2)),
      y: roundToTenth(point.y),
      z: roundToTenth(point.z + (random() * 4 - 2)),
      rotation: round(random() * 360),
    };
  });
}

function getMaxPositionError(length: number) {
  const normal = Array.from({ length }, (_, index) => index);
  const reversed = [...normal].reverse();

  return normal.reduce(
    (sum, position, index) => sum + Math.abs(position - reversed[index]),
    0,
  );
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function createSeededRandom(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}
