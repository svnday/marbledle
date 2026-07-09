"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Marble,
  type MarbleId,
  type PositionGuess,
  createEmptyGuess,
  getDailyPuzzle,
  getGuessValidation,
  getMarbleById,
  guessToOrder,
  scoreGuess,
} from "@/lib/game";
import type { RaceResult } from "@/lib/physics";
import { RaceScene } from "@/components/RaceScene";

type RaceState = "guessing" | "racing" | "finished";

export function MarbledleGame() {
  const puzzle = useMemo(() => getDailyPuzzle(), []);
  const [race, setRace] = useState<RaceResult | null>(null);
  const [guess, setGuess] = useState<PositionGuess>(() => createEmptyGuess());
  const [raceState, setRaceState] = useState<RaceState>("guessing");

  const validation = getGuessValidation(guess);
  const guessedOrder = useMemo(() => guessToOrder(guess), [guess]);
  const duplicatePositions = useMemo(() => getDuplicatePositions(guess), [guess]);
  const score = useMemo(
    () =>
      raceState === "finished" && race
        ? scoreGuess(guessedOrder, race.finishOrder)
        : null,
    [guessedOrder, race, raceState],
  );

  // Precompute today's race once, on the client. The dynamic import keeps the ~2 MB
  // deterministic Rapier WASM out of the initial bundle — it only loads after mount.
  useEffect(() => {
    let cancelled = false;

    import("@/lib/physics")
      .then(({ simulateRace }) => simulateRace(puzzle.courseSpec))
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRace(result);
        // TEMP (Milestone 4): confirm the precompute wiring before the renderer exists.
        console.log("[marbledle] precomputed race", {
          finishOrder: result.finishOrder,
          durationSeconds: result.durationSeconds,
          attempts: result.attempts,
          valid: result.valid,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [puzzle.courseSpec]);

  useEffect(() => {
    if (raceState !== "racing" || !race) {
      return;
    }

    const timeout = window.setTimeout(
      () => setRaceState("finished"),
      race.durationSeconds * 1000 + 900,
    );

    return () => window.clearTimeout(timeout);
  }, [race, raceState]);

  const isReady = race !== null;

  function updateGuess(marbleId: MarbleId, value: string) {
    if (raceState !== "guessing") {
      return;
    }

    if (!/^[1-5]?$/.test(value)) {
      return;
    }

    setGuess((current) => ({
      ...current,
      [marbleId]: value === "" ? "" : Number(value),
    }));
  }

  function lockGuess() {
    if (!validation.isValid || !isReady) {
      return;
    }

    setRaceState("racing");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#070a12] text-[#f8fafc]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">
              Daily 3D drop #{puzzle.dateKey}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Marbledle
            </h1>
          </div>
          <div className="max-w-xl text-sm leading-6 text-slate-300">
            Predict each marble&apos;s finishing spot, then watch the whole pack
            drop into a generated 3D course where the finishing order is decided by
            real, deterministic physics — the same race for everyone.
          </div>
        </header>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Predict the finish</h2>
              <p className="text-sm text-slate-400">
                Type a unique position from 1 to 5 for every marble.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-h-5 text-sm font-semibold text-amber-200">
                {!isReady
                  ? "Generating today's race…"
                  : validation.hasDuplicates
                    ? "Duplicate position typed."
                    : validation.isComplete
                      ? "Ready to race."
                      : "Pick a finishing spot for every marble."}
              </p>
              <button
                className="rounded-md bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={raceState !== "guessing" || !validation.isValid || !isReady}
                onClick={lockGuess}
              >
                Lock guess
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {puzzle.marbles.map((marble) => {
              const marbleGuess = guess[marble.id];

              return (
                <MarbleGuessCard
                  disabled={raceState !== "guessing"}
                  hasDuplicate={
                    typeof marbleGuess === "number" &&
                    duplicatePositions.has(marbleGuess)
                  }
                  guess={marbleGuess}
                  key={marble.id}
                  marble={marble}
                  onChange={(value) => updateGuess(marble.id, value)}
                />
              );
            })}
          </div>
        </section>

        <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[780px] overflow-hidden rounded-lg border border-cyan-300/20 bg-[#050814] shadow-2xl shadow-cyan-950/30">
            {race ? (
              <RaceScene
                spec={race.spec}
                trajectory={race.trajectory}
                raceState={raceState}
              />
            ) : (
              <RacePlaceholder isReady={isReady} raceState={raceState} />
            )}
            <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-cyan-300/30 bg-slate-950/70 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              Follow camera
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <StatusPanel
              dateKey={puzzle.dateKey}
              duration={race ? Math.round(race.durationSeconds) : null}
              raceState={raceState}
              ready={isReady}
            />

            {score ? (
              <>
                <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
                      Accuracy
                    </p>
                    <p className="text-5xl font-black text-white">
                      {score.accuracy}%
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Total position error: {score.totalError} / {score.maxError}
                  </p>
                </div>
                <ResultList title="Actual finish" order={race!.finishOrder} />
                <ResultList title="Your guess" order={guessedOrder} />
              </>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">
                {!isReady
                  ? "Generating today's race — one moment while the physics is precomputed."
                  : raceState === "racing"
                    ? "Race in progress. The camera follows the pack until all marbles finish."
                    : "Lock a valid prediction to drop the marbles into the 3D course."}
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

// TEMP (Milestone 4): a lightweight stand-in for the 3D scene. Prompt 5 replaces this with
// <RaceScene> that renders the course from the spec and animates it from the trajectory.
function RacePlaceholder({
  isReady,
  raceState,
}: {
  isReady: boolean;
  raceState: RaceState;
}) {
  const message = !isReady
    ? "Generating today's deterministic race…"
    : raceState === "guessing"
      ? "Race ready. Lock a valid prediction to drop the marbles into the 3D course."
      : raceState === "racing"
        ? "Race in progress…"
        : "Race complete.";

  return (
    <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
      <p className="max-w-sm text-sm text-slate-400">{message}</p>
    </div>
  );
}

function MarbleGuessCard({
  disabled,
  guess,
  hasDuplicate,
  marble,
  onChange,
}: {
  disabled: boolean;
  guess: number | "";
  hasDuplicate: boolean;
  marble: Marble;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={
        hasDuplicate
          ? "flex items-center gap-3 rounded-lg border border-red-400 bg-red-950/40 p-3 shadow-[0_0_18px_rgba(248,113,113,0.16)]"
          : "flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3"
      }
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-full border-2 border-white/70 shadow-[inset_-9px_-9px_0_rgba(0,0,0,0.22),0_0_22px_var(--marble-glow)]"
        style={
          {
            "--marble-glow": marble.glow,
            backgroundColor: marble.color,
          } as CSSProperties
        }
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black">{marble.name}</span>
        <span
          className={
            hasDuplicate
              ? "text-xs font-black uppercase tracking-[0.16em] text-red-300"
              : "text-xs uppercase tracking-[0.16em] text-slate-500"
          }
        >
          {hasDuplicate ? "duplicate" : "position"}
        </span>
      </span>
      <input
        aria-invalid={hasDuplicate}
        className={
          hasDuplicate
            ? "h-11 w-14 rounded-md border border-red-300 bg-red-950 px-3 text-center text-lg font-black text-white outline-none transition focus:border-red-200 disabled:opacity-50"
            : "h-11 w-14 rounded-md border border-white/10 bg-slate-900 px-3 text-center text-lg font-black text-white outline-none transition focus:border-cyan-300 disabled:opacity-50"
        }
        disabled={disabled}
        inputMode="numeric"
        maxLength={1}
        onChange={(event) => onChange(event.target.value)}
        pattern="[1-5]"
        value={guess}
      />
    </label>
  );
}

function StatusPanel({
  dateKey,
  duration,
  raceState,
  ready,
}: {
  dateKey: string;
  duration: number | null;
  raceState: RaceState;
  ready: boolean;
}) {
  const status = ready
    ? {
        finished: "Results locked",
        guessing: "Awaiting picks",
        racing: "Race live",
      }[raceState]
    : "Generating race";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
        Race status
      </p>
      <p className="mt-2 text-2xl font-black">{status}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Date seed</dt>
          <dd className="font-bold text-slate-200">{dateKey}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Race time</dt>
          <dd className="font-bold text-slate-200">
            {duration === null ? "…" : `${duration}s`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function getDuplicatePositions(guess: PositionGuess) {
  const counts = new Map<number, number>();

  Object.values(guess).forEach((position) => {
    if (typeof position !== "number") {
      return;
    }

    counts.set(position, (counts.get(position) ?? 0) + 1);
  });

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([position]) => position),
  );
}

function ResultList({ title, order }: { title: string; order: MarbleId[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
        {title}
      </h3>
      <ol className="mt-3 space-y-2">
        {order.map((marbleId, index) => {
          const marble = getMarbleById(marbleId);

          return (
            <li
              className="flex items-center gap-3 rounded-md bg-slate-950/60 p-2 text-sm font-bold"
              key={marble.id}
            >
              <span className="w-6 text-center text-cyan-200">{index + 1}</span>
              <span
                aria-hidden="true"
                className="h-6 w-6 rounded-full border border-white shadow"
                style={{ backgroundColor: marble.color }}
              />
              {marble.name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
