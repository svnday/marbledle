"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import {
  type DailyPuzzle,
  type Marble,
  type MarbleId,
  type PositionGuess,
  createEmptyGuess,
  getDailyPuzzle,
  getGuessValidation,
  getMarbleById,
  getMarbleRaceDuration,
  guessToOrder,
  scoreGuess,
} from "@/lib/game";

type RaceState = "guessing" | "racing" | "finished";

type RacingMarble = {
  id: MarbleId;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  finishIndex: number;
  duration: number;
  startOffset: THREE.Vector3;
};

export function MarbledleGame() {
  const puzzle = useMemo(() => getDailyPuzzle(), []);
  const [guess, setGuess] = useState<PositionGuess>(() => createEmptyGuess());
  const [raceState, setRaceState] = useState<RaceState>("guessing");

  const validation = getGuessValidation(guess);
  const guessedOrder = useMemo(() => guessToOrder(guess), [guess]);
  const duplicatePositions = useMemo(() => getDuplicatePositions(guess), [guess]);
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
      puzzle.raceDurationSeconds * 1000 + 900,
    );

    return () => window.clearTimeout(timeout);
  }, [puzzle.raceDurationSeconds, raceState]);

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
              Daily 3D drop #{puzzle.dateKey}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Marbledle
            </h1>
          </div>
          <div className="max-w-xl text-sm leading-6 text-slate-300">
            Predict each marble&apos;s finishing spot, then watch the whole pack
            drop into a generated 3D track with a chase camera and deterministic
            daily finish order.
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
                {validation.hasDuplicates
                  ? "Duplicate position typed."
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
            <ThreeRaceScene puzzle={puzzle} raceState={raceState} />
            <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-cyan-300/30 bg-slate-950/70 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              Chase camera
            </div>
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

function ThreeRaceScene({
  puzzle,
  raceState,
}: {
  puzzle: DailyPuzzle;
  raceState: RaceState;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let frameId = 0;
    let disposed = false;
    const startTime = performance.now();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050814");
    scene.fog = new THREE.Fog("#050814", 26, 92);

    const renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setClearColor("#050814");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);
    const ambientLight = new THREE.AmbientLight("#b7c9ff", 1.3);
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
    keyLight.position.set(12, 16, 10);
    keyLight.castShadow = true;
    const cyanLight = new THREE.PointLight("#22d3ee", 3.2, 42);
    cyanLight.position.set(-8, 5, 8);
    const violetLight = new THREE.PointLight("#c084fc", 2.5, 46);
    violetLight.position.set(9, -20, -10);
    scene.add(ambientLight, keyLight, cyanLight, violetLight);

    const courseGroup = new THREE.Group();
    scene.add(courseGroup);

    const trackPoints = puzzle.trackPoints.map(
      (point) => new THREE.Vector3(point.x, point.y, point.z),
    );
    const curve = new THREE.CatmullRomCurve3(trackPoints, false, "catmullrom", 0.42);
    const leftRail = new THREE.CatmullRomCurve3(
      trackPoints.map((point) => point.clone().add(new THREE.Vector3(-1.25, 0, 0))),
      false,
      "catmullrom",
      0.42,
    );
    const rightRail = new THREE.CatmullRomCurve3(
      trackPoints.map((point) => point.clone().add(new THREE.Vector3(1.25, 0, 0))),
      false,
      "catmullrom",
      0.42,
    );

    const bedGeometry = new THREE.TubeGeometry(curve, 360, 0.58, 18, false);
    const railGeometry = new THREE.TubeGeometry(leftRail, 360, 0.12, 10, false);
    const railGeometryTwo = new THREE.TubeGeometry(rightRail, 360, 0.12, 10, false);
    const bedMaterial = new THREE.MeshStandardMaterial({
      color: "#172033",
      metalness: 0.25,
      roughness: 0.42,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: "#67e8f9",
      emissive: "#0e7490",
      emissiveIntensity: 0.65,
      metalness: 0.45,
      roughness: 0.28,
    });
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    const railOne = new THREE.Mesh(railGeometry, railMaterial);
    const railTwo = new THREE.Mesh(railGeometryTwo, railMaterial);
    bed.receiveShadow = true;
    courseGroup.add(bed, railOne, railTwo);

    addStartGate(courseGroup, curve.getPoint(0));
    addFinishPlatform(courseGroup, curve.getPoint(1));
    puzzle.trackFeatures.forEach((feature) => addTrackFeature(courseGroup, feature));

    const racingMarbles = puzzle.marbles.map((marble, index) => {
      const geometry = new THREE.SphereGeometry(0.58, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: marble.color,
        emissive: marble.glow,
        emissiveIntensity: 0.22,
        metalness: 0.18,
        roughness: 0.18,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      courseGroup.add(mesh);

      return {
        id: marble.id,
        mesh,
        finishIndex: puzzle.finishOrder.indexOf(marble.id),
        duration: getMarbleRaceDuration(puzzle, marble.id),
        startOffset: new THREE.Vector3((index - 2) * 0.82, 2.2, -1.3),
      };
    });

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const renderFrame = (now: number) => {
      if (disposed) {
        return;
      }

      const elapsed = (now - startTime) / 1000;
      const packProgress =
        raceState === "racing"
          ? clamp(elapsed / puzzle.raceDurationSeconds, 0, 1)
          : raceState === "finished"
            ? 1
            : 0;

      updateMarbles({
        curve,
        elapsed,
        marbles: racingMarbles,
        raceState,
      });
      updateCamera({
        camera,
        curve,
        progress: packProgress,
      });

      const spinSpeed = raceState === "racing" ? 0.025 : 0.006;
      courseGroup.traverse((object) => {
        if (object.userData.spin === true) {
          object.rotation.y += spinSpeed;
        }
      });

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      disposeObject(scene);
      renderer.dispose();
    };
  }, [puzzle, raceState]);

  return (
    <canvas
      aria-label="3D marble race track"
      className="absolute inset-0 h-full w-full"
      ref={canvasRef}
    />
  );
}

function updateMarbles({
  curve,
  elapsed,
  marbles,
  raceState,
}: {
  curve: THREE.CatmullRomCurve3;
  elapsed: number;
  marbles: RacingMarble[];
  raceState: RaceState;
}) {
  const startPoint = curve.getPoint(0);
  const finishPoint = curve.getPoint(1);

  marbles.forEach((marble) => {
    if (raceState === "guessing") {
      marble.mesh.position.copy(startPoint).add(marble.startOffset);
      return;
    }

    if (raceState === "finished") {
      marble.mesh.position.copy(finishPoint);
      marble.mesh.position.x += (marble.finishIndex - 2) * 0.72;
      marble.mesh.position.y += 0.64;
      marble.mesh.position.z += 1.2;
      return;
    }

    const progress = clamp(elapsed / marble.duration, 0, 1);
    const eased = easeInOut(progress);
    const point = curve.getPoint(eased);
    const tangent = curve.getTangent(eased);
    const sideWobble = Math.sin(elapsed * 5 + marble.finishIndex) * 0.24;
    marble.mesh.position.set(
      point.x + sideWobble,
      point.y + 0.7,
      point.z + Math.cos(elapsed * 4.4 + marble.finishIndex) * 0.18,
    );
    marble.mesh.rotation.x += 0.12 + Math.abs(tangent.y) * 0.04;
    marble.mesh.rotation.z += 0.08 + Math.abs(tangent.x) * 0.05;
  });
}

function updateCamera({
  camera,
  curve,
  progress,
}: {
  camera: THREE.PerspectiveCamera;
  curve: THREE.CatmullRomCurve3;
  progress: number;
}) {
  const lookAt = curve.getPoint(clamp(progress + 0.025, 0, 1));
  const tangent = curve.getTangent(clamp(progress + 0.02, 0, 1));
  const cameraPoint = curve.getPoint(clamp(progress - 0.035, 0, 1));
  const desiredPosition = new THREE.Vector3(
    cameraPoint.x - tangent.x * 5.5,
    cameraPoint.y + 4.6,
    cameraPoint.z + 12.5,
  );

  camera.position.lerp(desiredPosition, 0.12);
  camera.lookAt(lookAt.x, lookAt.y + 0.25, lookAt.z);
}

function addStartGate(group: THREE.Group, point: THREE.Vector3) {
  const gateMaterial = new THREE.MeshStandardMaterial({
    color: "#38bdf8",
    emissive: "#0891b2",
    emissiveIntensity: 0.7,
    metalness: 0.5,
    roughness: 0.25,
  });
  const barGeometry = new THREE.BoxGeometry(6, 0.18, 0.18);
  const postGeometry = new THREE.BoxGeometry(0.16, 2.8, 0.16);
  const bar = new THREE.Mesh(barGeometry, gateMaterial);
  const postOne = new THREE.Mesh(postGeometry, gateMaterial);
  const postTwo = new THREE.Mesh(postGeometry, gateMaterial);
  bar.position.set(point.x, point.y + 1.55, point.z - 1.3);
  postOne.position.set(point.x - 3, point.y + 0.25, point.z - 1.3);
  postTwo.position.set(point.x + 3, point.y + 0.25, point.z - 1.3);
  group.add(bar, postOne, postTwo);
}

function addFinishPlatform(group: THREE.Group, point: THREE.Vector3) {
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.7, 0.35, 40),
    new THREE.MeshStandardMaterial({
      color: "#111827",
      emissive: "#0f766e",
      emissiveIntensity: 0.28,
      metalness: 0.25,
      roughness: 0.35,
    }),
  );
  platform.position.set(point.x, point.y - 0.2, point.z + 1.2);
  platform.receiveShadow = true;
  group.add(platform);
}

function addTrackFeature(group: THREE.Group, feature: DailyPuzzle["trackFeatures"][number]) {
  const position = new THREE.Vector3(feature.x, feature.y + 0.9, feature.z);

  if (feature.kind === "portal") {
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.09, 12, 36),
      new THREE.MeshStandardMaterial({
        color: "#c084fc",
        emissive: "#9333ea",
        emissiveIntensity: 0.9,
        metalness: 0.2,
        roughness: 0.2,
      }),
    );
    portal.position.copy(position);
    portal.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(feature.rotation));
    portal.userData.spin = true;
    group.add(portal);
    return;
  }

  if (feature.kind === "loop") {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.12, 12, 48),
      new THREE.MeshStandardMaterial({
        color: "#f472b6",
        emissive: "#be185d",
        emissiveIntensity: 0.55,
        metalness: 0.25,
        roughness: 0.24,
      }),
    );
    loop.position.copy(position);
    loop.rotation.set(0, THREE.MathUtils.degToRad(feature.rotation), Math.PI / 2);
    group.add(loop);
    return;
  }

  if (feature.kind === "spinner") {
    const spinner = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: "#a78bfa",
      emissive: "#7c3aed",
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.25,
    });
    const bladeOne = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, 0.3), material);
    const bladeTwo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 3), material);
    spinner.add(bladeOne, bladeTwo);
    spinner.position.copy(position);
    spinner.userData.spin = true;
    group.add(spinner);
    return;
  }

  const bumper = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 24, 24),
    new THREE.MeshStandardMaterial({
      color: "#22d3ee",
      emissive: "#0891b2",
      emissiveIntensity: 0.55,
      metalness: 0.25,
      roughness: 0.2,
    }),
  );
  bumper.position.copy(position);
  bumper.castShadow = true;
  group.add(bumper);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
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

function easeInOut(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
