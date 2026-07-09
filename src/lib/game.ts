export type MarbleId = "red" | "blue" | "green" | "yellow" | "purple";

export type Marble = {
  id: MarbleId;
  name: string;
  color: string;
  shadow: string;
};

export type TrackGate = {
  lane: number;
  left: number;
  height: number;
};

export type DailyPuzzle = {
  dateKey: string;
  seed: string;
  marbles: Marble[];
  finishOrder: MarbleId[];
  trackGates: TrackGate[];
  trackTilt: number;
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

export const MARBLES: Marble[] = [
  { id: "red", name: "Red", color: "#ef4444", shadow: "#7f1d1d" },
  { id: "blue", name: "Blue", color: "#3b82f6", shadow: "#1e3a8a" },
  { id: "green", name: "Green", color: "#22c55e", shadow: "#14532d" },
  { id: "yellow", name: "Yellow", color: "#facc15", shadow: "#854d0e" },
  { id: "purple", name: "Purple", color: "#a855f7", shadow: "#581c87" },
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

  return {
    dateKey,
    seed,
    marbles: MARBLES,
    finishOrder,
    trackGates: createTrackGates(random),
    trackTilt: Math.round((random() * 2 - 1) * 4),
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

function createTrackGates(random: () => number): TrackGate[] {
  return Array.from({ length: 9 }, (_, index) => ({
    lane: index % MARBLES.length,
    left: 14 + index * 8 + Math.round(random() * 5),
    height: 24 + Math.round(random() * 38),
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
