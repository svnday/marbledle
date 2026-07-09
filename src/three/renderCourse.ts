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

// Renders a CourseSpec into three.js meshes that mirror the Rapier colliders 1:1 — same
// primitives, same half-extents, same positions/rotations. Because the physics colliders
// (src/lib/physics.ts) and these meshes come from the same spec, what you see is exactly
// what collides. That equivalence is the fix for the old "everything clips through
// everything" behaviour.
//
// Static scenery (walls/floor/pegs/bumpers/ramps/dividers/funnel/finish) is built here.
// The moving bodies — marbles and spinners — are created here too but positioned every
// frame by RaceScene from the recorded trajectory, keyed by the same track ids the
// simulation used ("marble:<id>", "spinner:<elementIndex>").

const HALF_DEPTH_HINT = 3; // front wall sits at +z; hide it so it doesn't occlude the view

function setTransform(object: THREE.Object3D, position: Vec3, rotation?: Vec3) {
  object.position.set(position.x, position.y, position.z);
  if (rotation) {
    object.rotation.set(rotation.x, rotation.y, rotation.z, "XYZ");
  }
}

function wallMaterial(spec: CuboidSpec): THREE.MeshStandardMaterial {
  // The wall nearest the camera (+z) is rendered as faint glass so we can see inside the
  // shaft; it is still a full collider in the physics world.
  const isFrontWall = spec.role === "wall" && spec.position.z > HALF_DEPTH_HINT;
  if (isFrontWall) {
    return new THREE.MeshStandardMaterial({
      color: "#0b1220",
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: spec.role === "floor" ? "#0b1120" : "#141d31",
    metalness: 0.2,
    roughness: 0.6,
  });
}

function roleMaterial(spec: CuboidSpec): THREE.MeshStandardMaterial {
  switch (spec.role) {
    case "ramp":
      return new THREE.MeshStandardMaterial({
        color: "#1f2a44",
        emissive: "#0e7490",
        emissiveIntensity: 0.15,
        metalness: 0.3,
        roughness: 0.4,
      });
    case "divider":
      return new THREE.MeshStandardMaterial({
        color: "#334155",
        emissive: "#a855f7",
        emissiveIntensity: 0.2,
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
      return wallMaterial(spec);
  }
}

function cuboidMesh(spec: CuboidSpec): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(spec.half.x * 2, spec.half.y * 2, spec.half.z * 2);
  const mesh = new THREE.Mesh(geometry, roleMaterial(spec));
  setTransform(mesh, spec.position, spec.rotation);
  return mesh;
}

function pegMesh(spec: PegSpec): THREE.Mesh {
  // three cylinder axis is +Y, matching Rapier's cylinder; the spec's rotation lays it flat.
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

/** All non-moving scenery for a course, as one group. */
export function buildStaticCourse(spec: CourseSpec): THREE.Group {
  const group = new THREE.Group();

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
    // "spinner" is a moving body — see buildSpinnerMeshes.
  });

  return group;
}

/** Spinner meshes keyed by trajectory track id ("spinner:<elementIndex>"). */
export function buildSpinnerMeshes(spec: CourseSpec): Map<string, THREE.Mesh> {
  const meshes = new Map<string, THREE.Mesh>();

  spec.elements.forEach((element, index) => {
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
    meshes.set(`spinner:${index}`, mesh);
  });

  return meshes;
}

/** Marble meshes keyed by trajectory track id ("marble:<id>"), coloured from MARBLES. */
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
