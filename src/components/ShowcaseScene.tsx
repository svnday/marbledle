"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SHOWCASE_V1 } from "@/lib/showcase/showcaseV1";
import { buildShowcaseCourse, buildShowcaseDebug } from "@/three/renderShowcase";

export function ShowcaseScene({ showDebug = false }: { showDebug?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050912");
    scene.fog = new THREE.Fog("#050912", 115, 260);
    scene.add(buildShowcaseCourse(SHOWCASE_V1));
    const debug = buildShowcaseDebug(SHOWCASE_V1);
    debug.visible = showDebug;
    scene.add(debug);

    scene.add(new THREE.HemisphereLight("#b9d9ff", "#070910", 1.45));
    const key = new THREE.DirectionalLight("#fff3d6", 3.2);
    key.position.set(35, 70, -20);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 90;
    key.shadow.camera.bottom = -90;
    scene.add(key);
    const instrument = new THREE.PointLight("#67e8f9", 4, 130);
    instrument.position.set(-16, 10, 20);
    scene.add(instrument);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
    const bounds = new THREE.Box3(
      new THREE.Vector3(SHOWCASE_V1.bounds.min.x, SHOWCASE_V1.bounds.min.y, SHOWCASE_V1.bounds.min.z),
      new THREE.Vector3(SHOWCASE_V1.bounds.max.x, SHOWCASE_V1.bounds.max.y, SHOWCASE_V1.bounds.max.z),
    );
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    camera.position.copy(center).add(new THREE.Vector3(radius * 1.35, radius * 0.72, radius * 0.62));
    camera.lookAt(center);

    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, [showDebug]);

  return <canvas aria-label="showcase-v1 modular course preview" className="absolute inset-0 h-full w-full" ref={canvasRef} />;
}
