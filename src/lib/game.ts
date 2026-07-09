import { generateCourse, type CourseSpec } from "./course";

export type MarbleId = "red" | "blue" | "green" | "yellow" | "purple";

export type Marble = {
  id: MarbleId;
  name: string;
  color: string;
  glow: string;
};

export type DailyPuzzle = {
  dateKey: string;
  seed: string;
  marbles: Marble[];
  courseSpec: CourseSpec;
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

/**
 * The daily puzzle no longer carries a predetermined finish order - that now emerges from
 * the physics simulation of `courseSpec` (see src/lib/physics.ts `simulateRace`). This just
 * pins the deterministic daily seed and the procedurally generated course everyone shares.
 */
export function getDailyPuzzle(date = new Date()): DailyPuzzle {
  const dateKey = getNewYorkDateKey(date);
  const seed = `marbledle-${dateKey}`;

  return {
    dateKey,
    seed,
    marbles: MARBLES,
    courseSpec: generateCourse(seed),
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

function getMaxPositionError(length: number) {
  const normal = Array.from({ length }, (_, index) => index);
  const reversed = [...normal].reverse();

  return normal.reduce(
    (sum, position, index) => sum + Math.abs(position - reversed[index]),
    0,
  );
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
