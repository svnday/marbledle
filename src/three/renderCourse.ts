import * as THREE from "three";
import { MARBLES } from "@/lib/game";
import type {
  BumperSpec,
  CourseSpec,
  CuboidSpec,
  PathSample,
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

function orientAlong(mesh: THREE.Object3D, tangent: THREE.Vector3, rightHint: THREE.Vector3) {
  const z = tangent.clone().normalize();
  const up = new THREE.Vector3().crossVectors(z, rightHint).normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const matrix = new THREE.Matrix4().makeBasis(x, up, z);
  mesh.quaternion.setFromRotationMatrix(matrix);
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
  const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.halfHeight * 2, 20);
  const material = new THREE.MeshStandardMaterial({
    color: "#67e8f9",
    emissive: "#0e7490",
    emissiveIntensity: 0.45,
    metalness: 0.4,
    roughness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function bumperMesh(spec: BumperSpec): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(spec.radius, 20, 20);
  const material = new THREE.MeshStandardMaterial({
    color: "#f472b6",
    emissive: "#be185d",
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.25,
  });
  const mesh = new THREE.Mesh(geometry, material);
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

function trackSpanMeshes(a: PathSample, b: PathSample, spec: CourseSpec): THREE.Mesh[] {
  const start = vector(a.position);
  const end = vector(b.position);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const tangent = end.clone().sub(start);
  const length = Math.max(tangent.length(), 0.001);
  const right = vector(a.right).add(vector(b.right)).multiplyScalar(0.5).normalize();
  const up = new THREE.Vector3().crossVectors(tangent.clone().normalize(), right).normalize();

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(spec.path.width, 0.22, length * 1.04),
    new THREE.MeshStandardMaterial({
      color: "#0f1b33",
      emissive: "#0e7490",
      emissiveIntensity: 0.09,
      metalness: 0.28,
      roughness: 0.42,
    }),
  );
  floor.position.copy(center).add(up.clone().multiplyScalar(-0.12));
  orientAlong(floor, tangent, right);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: "#172554",
    emissive: "#38bdf8",
    emissiveIntensity: 0.16,
    metalness: 0.35,
    roughness: 0.35,
  });
  const leftRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, spec.path.railHeight, length * 1.04),
    railMaterial,
  );
  const rightRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, spec.path.railHeight, length * 1.04),
    railMaterial.clone(),
  );
  const railLift = up.clone().multiplyScalar(spec.path.railHeight / 2);
  leftRail.position.copy(center).add(right.clone().multiplyScalar(-spec.path.width / 2)).add(railLift);
  rightRail.position.copy(center).add(right.clone().multiplyScalar(spec.path.width / 2)).add(railLift);
  orientAlong(leftRail, tangent, right);
  orientAlong(rightRail, tangent, right);

  return [floor, leftRail, rightRail];
}

function buildTrackRun(spec: CourseSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = "Path track";

  for (let index = 0; index < spec.path.samples.length - 1; index += 1) {
    trackSpanMeshes(spec.path.samples[index], spec.path.samples[index + 1], spec).forEach((mesh) => {
      group.add(mesh);
    });
  }

  return group;
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
      emissiveIntensity: 0.4,
      metalness: 0.35,
      roughness: 0.3,
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
