import * as THREE from "three";
import { MARBLES } from "@/lib/game";
import type {
  BumperSpec,
  CourseSpec,
  CuboidSpec,
  PegSpec,
  SensorSpec,
  Vec3,
} from "@/lib/course";

function vector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function setTransform(object: THREE.Object3D, position: Vec3, rotation?: Vec3) {
  object.position.set(position.x, position.y, position.z);
  if (rotation) {
    object.rotation.set(rotation.x, rotation.y, rotation.z, "XYZ");
  }
}

function roleMaterial(spec: CuboidSpec): THREE.MeshStandardMaterial {
  switch (spec.role) {
    case "rail":
      return new THREE.MeshStandardMaterial({
        color: "#172554",
        emissive: "#38bdf8",
        emissiveIntensity: 0.16,
        metalness: 0.35,
        roughness: 0.35,
      });
    case "support":
      return new THREE.MeshStandardMaterial({
        color: "#111827",
        metalness: 0.45,
        roughness: 0.55,
      });
    case "ramp":
    case "divider":
      return new THREE.MeshStandardMaterial({
        color: "#1f2a44",
        emissive: "#0e7490",
        emissiveIntensity: 0.15,
        metalness: 0.3,
        roughness: 0.4,
      });
    case "funnel":
      return new THREE.MeshStandardMaterial({
        color: "#155e63",
        emissive: "#22d3ee",
        emissiveIntensity: 0.25,
        metalness: 0.35,
        roughness: 0.35,
      });
    default:
      return new THREE.MeshStandardMaterial({
        color: "#101a2f",
        metalness: 0.2,
        roughness: 0.6,
      });
  }
}

function cuboidMesh(spec: CuboidSpec): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(spec.half.x * 2, spec.half.y * 2, spec.half.z * 2);
  const mesh = new THREE.Mesh(geometry, roleMaterial(spec));
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function pegMesh(spec: PegSpec): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.halfHeight * 2, 24);
  const material = new THREE.MeshStandardMaterial({
    color: "#a5f3fc",
    emissive: "#06b6d4",
    emissiveIntensity: 0.5,
    metalness: 0.55,
    roughness: 0.2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function bumperMesh(spec: BumperSpec): THREE.Mesh {
  const groupGeometry = new THREE.SphereGeometry(spec.radius, 28, 20);
  const material = new THREE.MeshStandardMaterial({
    color: "#f472b6",
    emissive: "#be185d",
    emissiveIntensity: 0.62,
    metalness: 0.34,
    roughness: 0.18,
  });
  const mesh = new THREE.Mesh(groupGeometry, material);
  setTransform(mesh, spec.position);
  return mesh;
}

function sensorMesh(spec: SensorSpec): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(spec.half.x * 2, spec.half.y * 2, spec.half.z * 2);
  const material = new THREE.MeshStandardMaterial({
    color: "#22d3ee",
    emissive: "#22d3ee",
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  setTransform(mesh, spec.position);
  return mesh;
}

function buildTrackRun(spec: CourseSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = "Path track";
  group.add(buildTrackSurface(spec));
  buildRailTubes(spec).forEach((rail) => group.add(rail));
  group.add(buildCenterGlow(spec));

  return group;
}

function buildTrackSurface(spec: CourseSpec): THREE.Mesh {
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const halfWidth = spec.path.width / 2;

  spec.path.samples.forEach((sample) => {
    const center = vector(sample.position);
    const right = vector(sample.right).normalize();
    const tangent = vector(sample.tangent).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const left = center.clone().add(right.clone().multiplyScalar(-halfWidth));
    const rightPoint = center.clone().add(right.clone().multiplyScalar(halfWidth));
    const bowl = up.clone().multiplyScalar(-0.16);
    const middle = center.clone().add(bowl);

    [left, middle, rightPoint].forEach((point) => {
      vertices.push(point.x, point.y, point.z);
      normals.push(up.x, up.y, up.z);
    });
  });

  for (let index = 0; index < spec.path.samples.length - 1; index += 1) {
    const a = index * 3;
    const b = (index + 1) * 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#10203a",
      emissive: "#0e7490",
      emissiveIntensity: 0.12,
      metalness: 0.34,
      roughness: 0.38,
      side: THREE.DoubleSide,
    }),
  );
}

function buildRailTubes(spec: CourseSpec): THREE.Mesh[] {
  const halfWidth = spec.path.width / 2;
  const railMaterial = new THREE.MeshStandardMaterial({
    color: "#1d4ed8",
    emissive: "#38bdf8",
    emissiveIntensity: 0.32,
    metalness: 0.42,
    roughness: 0.28,
  });

  return [-1, 1].map((side) => {
    const points = spec.path.samples.map((sample) => {
      const center = vector(sample.position);
      const right = vector(sample.right).normalize();
      const tangent = vector(sample.tangent).normalize();
      const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
      return center
        .add(right.multiplyScalar(side * halfWidth))
        .add(up.multiplyScalar(spec.path.railHeight * 0.62));
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, Math.max(48, points.length * 2), 0.15, 10, false);
    return new THREE.Mesh(geometry, railMaterial.clone());
  });
}

function buildCenterGlow(spec: CourseSpec): THREE.Line {
  const points = spec.path.samples.map((sample) => {
    const tangent = vector(sample.tangent).normalize();
    const right = vector(sample.right).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return vector(sample.position).add(up.multiplyScalar(0.04));
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: "#22d3ee",
    transparent: true,
    opacity: 0.42,
  });
  return new THREE.Line(geometry, material);
}

function wireframeMaterial(color = "#fbbf24"): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: 0.7,
    wireframe: true,
  });
}

function debugCuboidMesh(spec: CuboidSpec): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(spec.half.x * 2, spec.half.y * 2, spec.half.z * 2);
  const mesh = new THREE.Mesh(geometry, wireframeMaterial(spec.role === "support" ? "#fbbf24" : "#38bdf8"));
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function debugPegMesh(spec: PegSpec): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.halfHeight * 2, 16);
  const mesh = new THREE.Mesh(geometry, wireframeMaterial("#22d3ee"));
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function debugBumperMesh(spec: BumperSpec): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(spec.radius, 16, 12);
  const mesh = new THREE.Mesh(geometry, wireframeMaterial("#f472b6"));
  setTransform(mesh, spec.position);
  return mesh;
}

function debugSensorMesh(spec: SensorSpec): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(spec.half.x * 2, spec.half.y * 2, spec.half.z * 2);
  const mesh = new THREE.Mesh(geometry, wireframeMaterial("#34d399"));
  setTransform(mesh, spec.position);
  return mesh;
}

function debugPathLine(spec: CourseSpec): THREE.Line {
  const points = spec.path.samples.map((sample) => vector(sample.position).add(new THREE.Vector3(0, 0.35, 0)));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: "#facc15",
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Line(geometry, material);
}

export function buildStaticCourse(spec: CourseSpec): THREE.Group {
  const group = new THREE.Group();
  group.add(buildTrackRun(spec));

  spec.elements.forEach((element) => {
    if (element.kind === "cuboid") {
      group.add(cuboidMesh(element));
    } else if (element.kind === "peg") {
      group.add(pegMesh(element));
    } else if (element.kind === "bumper") {
      group.add(bumperMesh(element));
    } else if (element.kind === "sensor") {
      group.add(sensorMesh(element));
    }
  });

  return group;
}

export function buildColliderWireframes(spec: CourseSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = "Collider wireframes";
  group.add(debugPathLine(spec));

  spec.elements.forEach((element) => {
    if (element.kind === "cuboid") {
      group.add(debugCuboidMesh(element));
    } else if (element.kind === "peg") {
      group.add(debugPegMesh(element));
    } else if (element.kind === "bumper") {
      group.add(debugBumperMesh(element));
    } else if (element.kind === "sensor") {
      group.add(debugSensorMesh(element));
    } else if (element.kind === "spinner") {
      const geometry = new THREE.BoxGeometry(element.half.x * 2, element.half.y * 2, element.half.z * 2);
      const mesh = new THREE.Mesh(geometry, wireframeMaterial("#a78bfa"));
      setTransform(mesh, element.position);
      group.add(mesh);
    }
  });

  return group;
}

export function buildSpinnerMeshes(spec: CourseSpec): Map<string, THREE.Mesh> {
  const meshes = new Map<string, THREE.Mesh>();
  let spinnerIndex = 0;

  spec.elements.forEach((element) => {
    if (element.kind !== "spinner") {
      return;
    }
    const geometry = new THREE.BoxGeometry(element.half.x * 2, element.half.y * 2, element.half.z * 2);
    const material = new THREE.MeshStandardMaterial({
      color: "#a78bfa",
      emissive: "#7c3aed",
      emissiveIntensity: 0.56,
      metalness: 0.42,
      roughness: 0.22,
    });
    const mesh = new THREE.Mesh(geometry, material);
    setTransform(mesh, element.position);
    meshes.set(`spinner:${spinnerIndex}`, mesh);
    spinnerIndex += 1;
  });

  return meshes;
}

export function buildMarbleMeshes(spec: CourseSpec): Map<string, THREE.Mesh> {
  const meshes = new Map<string, THREE.Mesh>();

  spec.marbleStarts.forEach((start) => {
    const marble = MARBLES.find((item) => item.id === start.id);
    const geometry = new THREE.SphereGeometry(spec.marble.radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: marble?.color ?? "#ffffff",
      emissive: marble?.glow ?? "#ffffff",
      emissiveIntensity: 0.3,
      metalness: 0.2,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(start.position.x, start.position.y, start.position.z);
    meshes.set(`marble:${start.id}`, mesh);
  });

  return meshes;
}
