"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sampleCoursePath, type CourseSpec, type Vec3 } from "@/lib/course";
import type { Trajectory } from "@/lib/physics";
import { getPerformanceMetrics } from "@/lib/performanceMetrics";
import {
  buildColliderWireframes,
  buildMarbleMeshes,
  buildSpinnerMeshes,
  buildStaticCourse,
} from "@/three/renderCourse";

type RaceState = "guessing" | "racing" | "finished";

/**
 * Renders the course and replays the precomputed race. Static scenery comes from the spec;
 * marbles and spinners are positioned every frame from the recorded trajectory (interpolated
 * between fixed-step samples by wall-clock time), so the visual is guaranteed to match the
 * scored finish order and is immune to render-framerate hitches.
 */
export function RaceScene({
  spec,
  trajectory,
  raceState,
  showDebugColliders = false,
}: {
  spec: CourseSpec;
  trajectory: Trajectory;
  raceState: RaceState;
  showDebugColliders?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raceStateRef = useRef<RaceState>(raceState);
  const debugRef = useRef(showDebugColliders);
  const startTimeRef = useRef<number | null>(null);

  // The animation loop reads these refs so state changes don't tear down the scene.
  useEffect(() => {
    raceStateRef.current = raceState;
    if (raceState === "racing" && startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }
    if (raceState === "guessing") {
      startTimeRef.current = null;
    }
  }, [raceState]);

  useEffect(() => {
    debugRef.current = showDebugColliders;
  }, [showDebugColliders]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let frameId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#040712");
    scene.fog = new THREE.Fog("#050814", 24, 150);

    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 280);
    camera.position.set(0, 10, 34);

    scene.add(new THREE.AmbientLight("#b7c9ff", 1.25));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2);
    keyLight.position.set(10, 20, 16);
    keyLight.castShadow = true;
    const cyanLight = new THREE.PointLight("#22d3ee", 2.6, 60);
    cyanLight.position.set(-8, 4, 12);
    const violetLight = new THREE.PointLight("#c084fc", 2.2, 70);
    violetLight.position.set(9, -24, 8);
    const leaderLight = new THREE.PointLight("#ffffff", 1.6, 20);
    scene.add(keyLight, cyanLight, violetLight, leaderLight);

    scene.add(buildStaticCourse(spec));
    const debugGroup = buildColliderWireframes(spec);
    debugGroup.visible = debugRef.current;
    scene.add(debugGroup);
    const { gate, leftGate, rightGate } = buildStartGate(spec);
    scene.add(gate);

    const dynamicMeshes = new Map<string, THREE.Mesh>([
      ...buildMarbleMeshes(spec),
      ...buildSpinnerMeshes(spec),
    ]);
    dynamicMeshes.forEach((mesh) => scene.add(mesh));

    const marbleMeshes = trajectory.tracks
      .filter((track) => track.kind === "marble")
      .map((track) => dynamicMeshes.get(track.id))
      .filter((mesh): mesh is THREE.Mesh => Boolean(mesh));

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setClearColor("#050814");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

    const { dt, frameCount } = trajectory;
    const lastFrame = Math.max(frameCount - 1, 0);
    const quatA = new THREE.Quaternion();
    const quatB = new THREE.Quaternion();
    const centroid = new THREE.Vector3();
    const target = new THREE.Vector3();
    const smoothedTarget = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const smoothedPosition = new THREE.Vector3();
    const lightTarget = new THREE.Vector3();
    const pathFocus = new THREE.Vector3();
    const pathTangent = new THREE.Vector3();
    const pathRight = new THREE.Vector3();
    let previousCameraNow = performance.now();
    let previousFrameNow = previousCameraNow;
    let cameraInitialized = false;

    const sampleTrack = (frames: number[], frameFloat: number, mesh: THREE.Mesh) => {
      const i = Math.min(Math.floor(frameFloat), lastFrame);
      const j = Math.min(i + 1, lastFrame);
      const t = frameFloat - i;
      const bi = i * 7;
      const bj = j * 7;
      const px = frames[bi] + (frames[bj] - frames[bi]) * t;
      const py = frames[bi + 1] + (frames[bj + 1] - frames[bi + 1]) * t;
      const pz = frames[bi + 2] + (frames[bj + 2] - frames[bi + 2]) * t;
      const qax = frames[bi + 3];
      const qay = frames[bi + 4];
      const qaz = frames[bi + 5];
      const qaw = frames[bi + 6];
      const qbx = frames[bj + 3];
      const qby = frames[bj + 4];
      const qbz = frames[bj + 5];
      const qbw = frames[bj + 6];

      if (![px, py, pz, qax, qay, qaz, qaw, qbx, qby, qbz, qbw].every(Number.isFinite)) {
        mesh.visible = false;
        return;
      }

      mesh.visible = true;
      mesh.position.set(px, py, pz);
      quatA.set(qax, qay, qaz, qaw);
      quatB.set(qbx, qby, qbz, qbw);
      mesh.quaternion.slerpQuaternions(quatA, quatB, t);
    };

    const currentFrameFloat = (now: number): number => {
      const state = raceStateRef.current;
      if (state === "finished") {
        return lastFrame;
      }
      if (state === "racing" && startTimeRef.current !== null) {
        return Math.min((now - startTimeRef.current) / 1000 / dt, lastFrame);
      }
      return 0;
    };

    const updateCamera = (now: number, frameFloat: number) => {
      centroid.set(0, 0, 0);
      let packSpread = 0;

      for (const mesh of marbleMeshes) {
        centroid.add(mesh.position);
      }

      const n = Math.max(marbleMeshes.length, 1);
      centroid.divideScalar(n);
      for (const mesh of marbleMeshes) {
        packSpread = Math.max(packSpread, mesh.position.distanceTo(centroid));
      }

      const progress = easeInOut(clamp(frameFloat / Math.max(lastFrame, 1), 0, 1));
      const guided = sampleCoursePath(spec.path, progress * spec.path.length);
      const lookAhead = sampleCoursePath(spec.path, Math.min(spec.path.length, guided.station + 8));
      pathFocus.copy(toVector(guided.position));
      pathTangent.copy(toVector(lookAhead.position).sub(pathFocus)).normalize();
      if (pathTangent.lengthSq() < 0.001) {
        pathTangent.copy(toVector(guided.tangent)).normalize();
      }
      pathRight.copy(toVector(guided.right)).normalize();
      target.copy(pathFocus).lerp(centroid, 0.38).add(pathTangent.clone().multiplyScalar(3));
      const rawDeltaSeconds = (now - previousCameraNow) / 1000;
      const deltaSeconds = Number.isFinite(rawDeltaSeconds)
        ? clamp(rawDeltaSeconds, 1 / 120, 0.12)
        : 1 / 60;
      const targetSmoothing = 1 - Math.exp(-deltaSeconds * 3.2);
      const positionSmoothing = 1 - Math.exp(-deltaSeconds * 2.4);
      const fovSmoothing = 1 - Math.exp(-deltaSeconds * 2.1);

      previousCameraNow = now;
      desired
        .copy(target)
        .add(pathTangent.clone().multiplyScalar(-15 - Math.min(packSpread, 9) * 0.32))
        .add(pathRight.clone().multiplyScalar(5.2))
        .add(new THREE.Vector3(0, 7.8 + Math.min(packSpread, 8) * 0.22, 0));

      if (!isFiniteVector(target)) {
        target.copy(pathFocus);
      }
      if (!isFiniteVector(desired)) {
        desired.copy(pathFocus).add(new THREE.Vector3(0, 9, 18));
      }

      if (!cameraInitialized || !isFiniteVector(smoothedTarget) || !isFiniteVector(smoothedPosition)) {
        smoothedTarget.copy(target);
        smoothedPosition.copy(desired);
        camera.position.copy(desired);
        cameraInitialized = true;
      } else {
        smoothedTarget.lerp(target, targetSmoothing);
        smoothedPosition.lerp(desired, positionSmoothing);
      }

      camera.position.copy(smoothedPosition);
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        56 + Math.min(packSpread, 16) * 0.32,
        fovSmoothing,
      );
      camera.updateProjectionMatrix();
      camera.lookAt(smoothedTarget);
      if (!isFiniteVector(camera.position)) {
        camera.position.copy(desired);
      }
      lightTarget.copy(centroid).add(new THREE.Vector3(0, 3, 4));
      leaderLight.position.lerp(lightTarget, Math.max(targetSmoothing, 0.08));
    };

    const updateStartGate = (now: number) => {
      const state = raceStateRef.current;
      const elapsed =
        state === "racing" && startTimeRef.current !== null
          ? (now - startTimeRef.current) / 1000
          : state === "finished"
            ? 1
            : 0;
      const open = state === "guessing" ? 0 : easeOut(clamp(elapsed / 0.8, 0, 1));
      leftGate.rotation.z = open * -1.25;
      rightGate.rotation.z = open * 1.25;
    };

    const renderFrame = (now: number) => {
      if (disposed) {
        return;
      }
      const frameFloat = currentFrameFloat(now);
      if (frameCount > 0) {
        trajectory.tracks.forEach((track) => {
          const mesh = dynamicMeshes.get(track.id);
          if (mesh) {
            sampleTrack(track.frames, frameFloat, mesh);
          }
        });
      }
      debugGroup.visible = debugRef.current;
      updateStartGate(now);
      updateCamera(now, frameFloat);
      renderer.render(scene, camera);
      const metrics = getPerformanceMetrics();
      if (metrics) {
        const frameMs = now - previousFrameNow;
        previousFrameNow = now;
        if (Number.isFinite(frameMs) && frameMs > 0) {
          metrics.frameSamplesMs.push(frameMs);
          if (metrics.frameSamplesMs.length > 600) metrics.frameSamplesMs.shift();
        }
        metrics.drawCalls = renderer.info.render.calls;
        metrics.triangles = renderer.info.render.triangles;
        metrics.geometries = renderer.info.memory.geometries;
        metrics.textures = renderer.info.memory.textures;
      }
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
  }, [spec, trajectory]);

  return (
    <canvas
      aria-label="3D marble race"
      className="absolute inset-0 h-full w-full"
      ref={canvasRef}
    />
  );
}

function buildStartGate(spec: CourseSpec) {
  const start = sampleCoursePath(spec.path, 0);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: "#38bdf8",
    emissive: "#0891b2",
    emissiveIntensity: 0.7,
    metalness: 0.45,
    roughness: 0.25,
  });
  const postGeometry = new THREE.BoxGeometry(0.16, 2.2, 0.16);
  const leftPost = new THREE.Mesh(postGeometry, material);
  const rightPost = new THREE.Mesh(postGeometry, material);
  const leftGateGeometry = new THREE.BoxGeometry(3.2, 0.16, 0.22);
  const rightGateGeometry = new THREE.BoxGeometry(3.2, 0.16, 0.22);
  const leftGate = new THREE.Mesh(leftGateGeometry, material);
  const rightGate = new THREE.Mesh(rightGateGeometry, material);

  group.position.copy(toVector(start.position)).add(new THREE.Vector3(0, 1.05, 0));
  orientAlong(group, toVector(start.tangent), toVector(start.right));
  leftPost.position.set(-3.3, 0.1, 0);
  rightPost.position.set(3.3, 0.1, 0);
  leftGate.position.set(-1.55, 0.7, 0);
  rightGate.position.set(1.55, 0.7, 0);
  leftGate.geometry.translate(1.55, 0, 0);
  rightGate.geometry.translate(-1.55, 0, 0);
  group.add(leftPost, rightPost, leftGate, rightGate);

  return { gate: group, leftGate, rightGate };
}

function toVector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function orientAlong(object: THREE.Object3D, tangent: THREE.Vector3, rightHint: THREE.Vector3) {
  const z = tangent.clone().normalize();
  const up = new THREE.Vector3().crossVectors(z, rightHint).normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const matrix = new THREE.Matrix4().makeBasis(x, up, z);
  object.quaternion.setFromRotationMatrix(matrix);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOut(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOut(value: number) {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function isFiniteVector(vector: THREE.Vector3) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}
