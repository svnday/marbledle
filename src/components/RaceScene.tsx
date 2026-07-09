"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CourseSpec } from "@/lib/course";
import type { Trajectory } from "@/lib/physics";
import {
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
}: {
  spec: CourseSpec;
  trajectory: Trajectory;
  raceState: RaceState;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raceStateRef = useRef<RaceState>(raceState);
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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let frameId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050814");
    scene.fog = new THREE.Fog("#050814", 16, 78);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 240);
    camera.position.set(0, 6, 24);

    scene.add(new THREE.AmbientLight("#b7c9ff", 1.1));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2);
    keyLight.position.set(10, 20, 16);
    const cyanLight = new THREE.PointLight("#22d3ee", 2.6, 60);
    cyanLight.position.set(-8, 4, 12);
    const violetLight = new THREE.PointLight("#c084fc", 2.2, 70);
    violetLight.position.set(9, -24, 8);
    scene.add(keyLight, cyanLight, violetLight);

    scene.add(buildStaticCourse(spec));

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
    const pos = new THREE.Vector3();
    const quatA = new THREE.Quaternion();
    const quatB = new THREE.Quaternion();
    const target = new THREE.Vector3();
    const desired = new THREE.Vector3();

    const sampleTrack = (frames: number[], frameFloat: number, mesh: THREE.Mesh) => {
      const i = Math.min(Math.floor(frameFloat), lastFrame);
      const j = Math.min(i + 1, lastFrame);
      const t = frameFloat - i;
      const bi = i * 7;
      const bj = j * 7;
      mesh.position.set(
        frames[bi] + (frames[bj] - frames[bi]) * t,
        frames[bi + 1] + (frames[bj + 1] - frames[bi + 1]) * t,
        frames[bi + 2] + (frames[bj + 2] - frames[bi + 2]) * t,
      );
      quatA.set(frames[bi + 3], frames[bi + 4], frames[bi + 5], frames[bi + 6]);
      quatB.set(frames[bj + 3], frames[bj + 4], frames[bj + 5], frames[bj + 6]);
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

    const updateCamera = () => {
      let cx = 0;
      let cy = 0;
      for (const mesh of marbleMeshes) {
        cx += mesh.position.x;
        cy += mesh.position.y;
      }
      const n = Math.max(marbleMeshes.length, 1);
      cx /= n;
      cy /= n;
      const framedX = THREE.MathUtils.clamp(cx, -4, 4);
      target.set(framedX * 0.6, cy - 2, 0);
      desired.set(framedX * 0.4, cy + 5, 24);
      camera.position.lerp(desired, 0.06);
      camera.lookAt(target);
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
      updateCamera();
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
  }, [spec, trajectory]);

  return (
    <canvas
      aria-label="3D marble race"
      className="absolute inset-0 h-full w-full"
      ref={canvasRef}
    />
  );
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
