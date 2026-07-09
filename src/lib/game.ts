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
  | "spinner"
  | "switchback"
  | "boost";

export type TrackFeature = {
  id: string;
  kind: TrackFeatureKind;
  x: number;
  y: number;
  rotation: number;
};

export type DailyPuzzle = {
  dateKey: string;
  seed: string;
  marbles: Marble[];
  finishOrder: MarbleId[];
  trackPath: string;
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
const TRACK_WIDTH = 420;
const TRACK_CENTER = TRACK_WIDTH / 2;

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

  return {
    dateKey,
    seed,
    marbles: MARBLES,
    finishOrder,
    trackPath: createTrackPath(random),
    trackFeatures: createTrackFeatures(random),
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

function createTrackPath(random: () => number) {
  let path = `M ${TRACK_CENTER} 28`;
  let currentX = TRACK_CENTER;
  let currentY = 28;

  for (let index = 0; index < 8; index += 1) {
    const nextY = 126 + index * 104;
    const nextX = 88 + random() * 244;
    const controlXOne = clamp(currentX + (random() * 220 - 110), 52, 368);
    const controlXTwo = clamp(nextX + (random() * 220 - 110), 52, 368);
    const controlYOne = currentY + 38 + random() * 58;
    const controlYTwo = nextY - 66 + random() * 58;

    path += ` C ${round(controlXOne)} ${round(controlYOne)}, ${round(
      controlXTwo,
    )} ${round(controlYTwo)}, ${round(nextX)} ${round(nextY)}`;
    currentX = nextX;
    currentY = nextY;
  }

  path += ` C ${round(currentX)} 910, ${TRACK_CENTER} 926, ${TRACK_CENTER} 952`;

  return path;
}

function createTrackFeatures(random: () => number): TrackFeature[] {
  const kinds: TrackFeatureKind[] = [
    "loop",
    "portal",
    "bumper",
    "spinner",
    "switchback",
    "boost",
  ];

  return Array.from({ length: 11 }, (_, index) => ({
    id: `feature-${index}`,
    kind: kinds[Math.floor(random() * kinds.length)],
    x: round(62 + random() * 296),
    y: round(118 + index * 74 + random() * 34),
    rotation: round(random() * 360),
  }));
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

function createSeededRandom(seed: string) {
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
