"use client";

import { useMemo, useState } from "react";
import {
  type DailyPuzzle,
  type MarbleId,
  getMarbleById,
  scoreGuess,
} from "@/lib/game";

type MarbledleGameProps = {
  puzzle: DailyPuzzle;
};

export function MarbledleGame({ puzzle }: MarbledleGameProps) {
  const [guess, setGuess] = useState<MarbleId[]>(
    puzzle.marbles.map((marble) => marble.id),
  );
  const [isSubmitted, setIsSubmitted] = useState(false);

  const score = useMemo(
    () => (isSubmitted ? scoreGuess(guess, puzzle.finishOrder) : null),
    [guess, isSubmitted, puzzle.finishOrder],
  );

  function moveMarble(index: number, direction: -1 | 1) {
    if (isSubmitted) {
      return;
    }

    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= guess.length) {
      return;
    }

    const nextGuess = [...guess];
    [nextGuess[index], nextGuess[targetIndex]] = [
      nextGuess[targetIndex],
      nextGuess[index],
    ];
    setGuess(nextGuess);
  }

  return (
    <main className="min-h-screen bg-[#f5f1e8] text-[#1f2933]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d6c9ad] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#7a5c2e]">
              Daily race #{puzzle.dateKey}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[#172033] sm:text-6xl">
              Marbledle
            </h1>
          </div>
          <div className="max-w-md text-sm leading-6 text-[#5f6673]">
            Predict today&apos;s finish order, lock it in, then watch the same
            race everyone else gets. Accuracy is based on how close each marble
            lands to your call.
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-lg border border-[#d6c9ad] bg-[#fffaf0] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Your podium call</h2>
                <p className="text-sm text-[#68717f]">First place at the top.</p>
              </div>
              <button
                className="rounded-md bg-[#172033] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2b3548] disabled:cursor-not-allowed disabled:bg-[#9aa0aa]"
                disabled={isSubmitted}
                onClick={() => setIsSubmitted(true)}
              >
                Lock guess
              </button>
            </div>

            <ol className="mt-5 space-y-3">
              {guess.map((marbleId, index) => {
                const marble = getMarbleById(marbleId);

                return (
                  <li
                    className="flex items-center gap-3 rounded-md border border-[#e3d7bd] bg-white p-3"
                    key={marble.id}
                  >
                    <span className="w-8 text-center text-sm font-black text-[#7a5c2e]">
                      {index + 1}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-9 w-9 rounded-full border-2 border-white shadow-[inset_-8px_-8px_0_rgba(0,0,0,0.18),0_4px_10px_rgba(31,41,51,0.18)]"
                      style={{ backgroundColor: marble.color }}
                    />
                    <span className="flex-1 font-bold">{marble.name}</span>
                    <div className="flex gap-1">
                      <button
                        aria-label={`Move ${marble.name} up`}
                        className="h-8 w-8 rounded border border-[#d6c9ad] text-sm font-black disabled:opacity-30"
                        disabled={isSubmitted || index === 0}
                        onClick={() => moveMarble(index, -1)}
                      >
                        Up
                      </button>
                      <button
                        aria-label={`Move ${marble.name} down`}
                        className="h-8 w-8 rounded border border-[#d6c9ad] text-sm font-black disabled:opacity-30"
                        disabled={isSubmitted || index === guess.length - 1}
                        onClick={() => moveMarble(index, 1)}
                      >
                        Down
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            {score ? (
              <div className="mt-5 rounded-md bg-[#172033] p-4 text-white">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f7d77a]">
                    Accuracy
                  </p>
                  <p className="text-4xl font-black">{score.accuracy}%</p>
                </div>
                <p className="mt-2 text-sm text-[#d9e0eb]">
                  Total position error: {score.totalError} / {score.maxError}
                </p>
              </div>
            ) : null}
          </section>

          <section className="flex min-h-[560px] flex-col rounded-lg border border-[#d6c9ad] bg-[#fffaf0] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Today&apos;s track</h2>
                <p className="text-sm text-[#68717f]">
                  Generated from the New York date seed.
                </p>
              </div>
              <span className="rounded-full bg-[#e8dcc2] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#6d5429]">
                {isSubmitted ? "Race live" : "Guess first"}
              </span>
            </div>

            <div className="relative mt-5 flex-1 overflow-hidden rounded-lg border border-[#d6c9ad] bg-[#d8ebf2]">
              <div className="absolute inset-x-0 top-0 h-16 bg-[#b9d9e8]" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-[#88b06b]" />
              <div
                className="absolute inset-x-4 top-20 bottom-20 rounded-[32px] border-4 border-[#7b5f36] bg-[#c99a5b] shadow-inner"
                style={{ transform: `rotate(${puzzle.trackTilt}deg)` }}
              />

              {puzzle.trackGates.map((gate, index) => (
                <span
                  aria-hidden="true"
                  className="absolute top-[30%] w-3 rounded-full bg-[#6d4a24] opacity-75"
                  key={`${gate.left}-${index}`}
                  style={{
                    left: `${gate.left}%`,
                    height: `${gate.height}px`,
                    transform: `translateY(${gate.lane * 26}px)`,
                  }}
                />
              ))}

              <div className="absolute inset-x-8 top-1/2 flex -translate-y-1/2 flex-col gap-6">
                {puzzle.marbles.map((marble) => {
                  const finishIndex = puzzle.finishOrder.indexOf(marble.id);
                  const duration = 5.2 + finishIndex * 0.58;

                  return (
                    <div
                      className="relative h-12 rounded-full bg-white/35 shadow-inner"
                      key={marble.id}
                    >
                      <div className="absolute inset-y-0 right-0 w-1 rounded bg-white/80" />
                      <div
                        className={
                          isSubmitted
                            ? "marble-racer absolute left-0 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-2 border-white shadow-[inset_-9px_-9px_0_rgba(0,0,0,0.2),0_6px_16px_rgba(31,41,51,0.24)]"
                            : "absolute left-0 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-2 border-white shadow-[inset_-9px_-9px_0_rgba(0,0,0,0.2),0_6px_16px_rgba(31,41,51,0.24)]"
                        }
                        style={{
                          backgroundColor: marble.color,
                          animationDuration: `${duration}s`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {isSubmitted ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ResultList title="Actual finish" order={puzzle.finishOrder} />
                <ResultList title="Your guess" order={guess} />
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function ResultList({ title, order }: { title: string; order: MarbleId[] }) {
  return (
    <div className="rounded-md border border-[#e3d7bd] bg-white p-3">
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#7a5c2e]">
        {title}
      </h3>
      <ol className="mt-3 space-y-2">
        {order.map((marbleId, index) => {
          const marble = getMarbleById(marbleId);

          return (
            <li className="flex items-center gap-2 text-sm font-bold" key={marble.id}>
              <span className="w-5 text-[#7a5c2e]">{index + 1}</span>
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-full border border-white shadow"
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
