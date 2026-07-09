"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  type Marble,
  type MarbleId,
  type PositionGuess,
  type TrackFeature,
  createEmptyGuess,
  getDailyPuzzle,
  getGuessValidation,
  getMarbleById,
  getMarbleRaceDuration,
  guessToOrder,
  scoreGuess,
} from "@/lib/game";

type RaceState = "guessing" | "racing" | "finished";

const POSITION_OPTIONS = [1, 2, 3, 4, 5];

export function MarbledleGame() {
  const puzzle = useMemo(() => getDailyPuzzle(), []);
  const [guess, setGuess] = useState<PositionGuess>(() => createEmptyGuess());
  const [raceState, setRaceState] = useState<RaceState>("guessing");

  const validation = getGuessValidation(guess);
  const guessedOrder = useMemo(() => guessToOrder(guess), [guess]);
  const score = useMemo(
    () =>
      raceState === "finished"
        ? scoreGuess(guessedOrder, puzzle.finishOrder)
        : null,
    [guessedOrder, puzzle.finishOrder, raceState],
  );

  useEffect(() => {
    if (raceState !== "racing") {
      return;
    }

    const timeout = window.setTimeout(
      () => setRaceState("finished"),
      puzzle.raceDurationSeconds * 1000 + 700,
    );

    return () => window.clearTimeout(timeout);
  }, [puzzle.raceDurationSeconds, raceState]);

  function updateGuess(marbleId: MarbleId, value: string) {
    if (raceState !== "guessing") {
      return;
    }

    setGuess((current) => ({
      ...current,
      [marbleId]: value === "" ? "" : Number(value),
    }));
  }

  function lockGuess() {
    if (!validation.isValid) {
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
              Daily drop #{puzzle.dateKey}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Marbledle
            </h1>
          </div>
          <div className="max-w-xl text-sm leading-6 text-slate-300">
            Call each marble&apos;s finishing position from 1 to 5, lock the
            board, then watch today&apos;s generated track decide the order.
            Results stay hidden until the last marble crosses.
          </div>
        </header>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Predict the finish</h2>
              <p className="text-sm text-slate-400">
                Each position can only be used once.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-h-5 text-sm font-semibold text-amber-200">
                {validation.hasDuplicates
                  ? "Duplicate positions need fixing."
                  : validation.isComplete
                    ? "Ready to race."
                    : "Pick a finishing spot for every marble."}
              </p>
              <button
                className="rounded-md bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={raceState !== "guessing" || !validation.isValid}
                onClick={lockGuess}
              >
                Lock guess
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {puzzle.marbles.map((marble) => (
              <MarbleGuessCard
                disabled={raceState !== "guessing"}
                guess={guess[marble.id]}
                key={marble.id}
                marble={marble}
                onChange={(value) => updateGuess(marble.id, value)}
              />
            ))}
          </div>
        </section>

        <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[780px] overflow-hidden rounded-lg border border-cyan-300/20 bg-[#0b1020] shadow-2xl shadow-cyan-950/30">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(192,132,252,0.16),_transparent_34%)]" />
            <RaceTrack puzzle={puzzle} raceState={raceState} />
          </div>

          <aside className="flex flex-col gap-4">
            <StatusPanel
              dateKey={puzzle.dateKey}
              duration={puzzle.raceDurationSeconds}
              raceState={raceState}
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
                <ResultList title="Actual finish" order={puzzle.finishOrder} />
                <ResultList title="Your guess" order={guessedOrder} />
              </>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">
                {raceState === "racing"
                  ? "Race in progress. Finish order and score will unlock after every marble lands."
                  : "Lock a valid prediction to start the daily drop."}
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

function MarbleGuessCard({
  disabled,
  guess,
  marble,
  onChange,
}: {
  disabled: boolean;
  guess: number | "";
  marble: Marble;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
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
        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
          position
        </span>
      </span>
      <select
        className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-base font-black text-white outline-none transition focus:border-cyan-300 disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={guess}
      >
        <option value="">-</option>
        {POSITION_OPTIONS.map((position) => (
          <option key={position} value={position}>
            {position}
          </option>
        ))}
      </select>
    </label>
  );
}

function RaceTrack({
  puzzle,
  raceState,
}: {
  puzzle: ReturnType<typeof getDailyPuzzle>;
  raceState: RaceState;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
      <svg
        aria-label="Daily vertical marble race track"
        className="h-full max-h-[1040px] w-full max-w-[520px] overflow-visible"
        role="img"
        viewBox="0 0 420 980"
      >
        <defs>
          <filter id="track-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <path
          d={puzzle.trackPath}
          fill="none"
          filter="url(#track-glow)"
          opacity="0.65"
          stroke="#22d3ee"
          strokeLinecap="round"
          strokeWidth="34"
        />
        <path
          d={puzzle.trackPath}
          fill="none"
          stroke="#1e293b"
          strokeLinecap="round"
          strokeWidth="30"
        />
        <path
          d={puzzle.trackPath}
          fill="none"
          stroke="#67e8f9"
          strokeDasharray="2 22"
          strokeLinecap="round"
          strokeWidth="4"
        />

        <line
          stroke="#f8fafc"
          strokeDasharray="10 8"
          strokeWidth="4"
          x1="126"
          x2="294"
          y1="950"
          y2="950"
        />
        <text
          fill="#cbd5e1"
          fontSize="16"
          fontWeight="800"
          letterSpacing="3"
          textAnchor="middle"
          x="210"
          y="974"
        >
          FINISH
        </text>

        {puzzle.trackFeatures.map((feature) => (
          <TrackFeatureMarker feature={feature} key={feature.id} />
        ))}

        {puzzle.marbles.map((marble) => (
          <AnimatedMarble
            finishIndex={puzzle.finishOrder.indexOf(marble.id)}
            key={marble.id}
            marble={marble}
            path={puzzle.trackPath}
            raceDuration={getMarbleRaceDuration(puzzle, marble.id)}
            raceState={raceState}
          />
        ))}
      </svg>
    </div>
  );
}

function TrackFeatureMarker({ feature }: { feature: TrackFeature }) {
  const label = {
    boost: "BOOST",
    bumper: "BUMPER",
    loop: "LOOP",
    portal: "PORTAL",
    spinner: "SPIN",
    switchback: "TURN",
  }[feature.kind];

  if (feature.kind === "portal") {
    return (
      <g transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotation})`}>
        <ellipse fill="none" rx="28" ry="15" stroke="#c084fc" strokeWidth="5" />
        <ellipse fill="none" opacity="0.55" rx="16" ry="8" stroke="#22d3ee" strokeWidth="3" />
      </g>
    );
  }

  if (feature.kind === "loop") {
    return (
      <g transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotation})`}>
        <circle fill="none" r="26" stroke="#f472b6" strokeWidth="6" />
        <circle fill="none" opacity="0.42" r="15" stroke="#f8fafc" strokeWidth="2" />
      </g>
    );
  }

  return (
    <g transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotation})`}>
      <rect
        fill={feature.kind === "boost" ? "#facc15" : "#0f172a"}
        height="18"
        rx="9"
        stroke={feature.kind === "spinner" ? "#a78bfa" : "#38bdf8"}
        strokeWidth="3"
        width="58"
        x="-29"
        y="-9"
      />
      <text
        fill={feature.kind === "boost" ? "#0f172a" : "#e2e8f0"}
        fontSize="7"
        fontWeight="900"
        letterSpacing="1"
        textAnchor="middle"
        y="3"
      >
        {label}
      </text>
    </g>
  );
}

function AnimatedMarble({
  finishIndex,
  marble,
  path,
  raceDuration,
  raceState,
}: {
  finishIndex: number;
  marble: Marble;
  path: string;
  raceDuration: number;
  raceState: RaceState;
}) {
  const finishX = 162 + finishIndex * 24;
  const isRacing = raceState === "racing";
  const positionProps =
    raceState === "racing"
      ? { cx: 0, cy: 0 }
      : raceState === "finished"
        ? { cx: finishX, cy: 952 }
        : { cx: 210, cy: 28 };

  return (
    <circle
      fill={marble.color}
      r="13"
      stroke="#ffffff"
      strokeWidth="3"
      {...positionProps}
      style={
        {
          filter: `drop-shadow(0 0 10px ${marble.glow})`,
        } as CSSProperties
      }
    >
      {isRacing ? (
        <animateMotion
          begin="0s"
          calcMode="spline"
          dur={`${raceDuration}s`}
          fill="freeze"
          keySplines="0.18 0.72 0.16 1"
          keyTimes="0;1"
          path={path}
          rotate="auto"
        />
      ) : null}
    </circle>
  );
}

function StatusPanel({
  dateKey,
  duration,
  raceState,
}: {
  dateKey: string;
  duration: number;
  raceState: RaceState;
}) {
  const status = {
    finished: "Results locked",
    guessing: "Awaiting picks",
    racing: "Race live",
  }[raceState];

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
          <dt className="text-slate-500">Max time</dt>
          <dd className="font-bold text-slate-200">{duration}s</dd>
        </div>
      </dl>
    </div>
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
