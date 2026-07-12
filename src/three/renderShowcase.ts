import * as THREE from "three";
import { TRACK_MODULE_REGISTRY } from "@/lib/showcase/registry";
import type { CourseDefinition, CourseModuleInstance, TrackModuleDefinition } from "@/lib/showcase/types";
import type { Vec3 } from "@/lib/course";

const COLORS = {
  ceramic: "#ded8c8",
  ceramicDark: "#817d72",
  brass: "#b98a45",
  navy: "#101827",
  cyan: "#67e8f9",
  graphite: "#232a35",
};

const vector = (value: Vec3) => new THREE.Vector3(value.x, value.y, value.z);

export function buildShowcaseCourse(course: CourseDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = `${course.id}@${course.version}`;

  for (const instance of course.modules) {
    const definition = TRACK_MODULE_REGISTRY.get(instance.moduleId);
    if (!definition) continue;
    const group = buildModule(definition);
    applyInstance(group, instance);
    root.add(group);
  }
  root.add(buildObservatoryDeck(course));
  return root;
}

export function buildShowcaseDebug(course: CourseDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = "Module alignment debug";

  for (const instance of course.modules) {
    const definition = TRACK_MODULE_REGISTRY.get(instance.moduleId);
    if (!definition) continue;
    const group = new THREE.Group();
    applyInstance(group, instance);

    const bounds = new THREE.Box3(vector(definition.bounds.min), vector(definition.bounds.max));
    group.add(new THREE.Box3Helper(bounds, "#f59e0b"));

    for (const collider of definition.colliders) {
      const material = new THREE.MeshBasicMaterial({
        color: "#22d3ee",
        depthTest: false,
        opacity: 0.32,
        transparent: true,
        wireframe: true,
      });
      const geometry = collider.shape === "cuboid"
        ? new THREE.BoxGeometry(
            (collider.halfExtents?.x ?? 1) * 2,
            (collider.halfExtents?.y ?? 1) * 2,
            (collider.halfExtents?.z ?? 1) * 2,
          )
        : new THREE.CylinderGeometry(
            collider.radius ?? 1,
            collider.radius ?? 1,
            (collider.halfHeight ?? 1) * 2,
            20,
          );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(vector(collider.position));
      mesh.rotation.set(collider.rotation.x, collider.rotation.y, collider.rotation.z);
      group.add(mesh);
    }

    for (const socket of [...definition.entrySockets, ...definition.exitSockets]) {
      const isEntry = socket.id === "entry";
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 8),
        new THREE.MeshBasicMaterial({ color: isEntry ? "#22c55e" : "#ef4444", depthTest: false }),
      );
      marker.position.copy(vector(socket.position));
      group.add(marker);
      group.add(new THREE.ArrowHelper(vector(socket.forward), vector(socket.position), 3, "#ffffff", 0.7, 0.4));
      group.add(new THREE.ArrowHelper(vector(socket.up), vector(socket.position), 2, "#facc15", 0.55, 0.35));
    }
    root.add(group);
  }
  return root;
}

function applyInstance(group: THREE.Object3D, instance: CourseModuleInstance) {
  group.position.copy(vector(instance.position));
  group.rotation.set(instance.rotation.x, instance.rotation.y, instance.rotation.z);
}

function buildModule(definition: TrackModuleDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = definition.title;
  const paths = definition.render.branchPaths ?? [definition.render.path];
  for (const path of paths) {
    group.add(buildRibbon(path));
    buildRails(path).forEach((rail) => group.add(rail));
  }
  addSupports(group, definition);
  addFeatureGeometry(group, definition);
  return group;
}

function buildRibbon(path: Vec3[]) {
  const curve = new THREE.CatmullRomCurve3(path.map(vector), false, "centripetal");
  const samples = curve.getPoints(Math.max(16, path.length * 5));
  const vertices: number[] = [];
  const indices: number[] = [];
  const width = 7.2;

  samples.forEach((point, index) => {
    const tangent = curve.getTangent(index / Math.max(samples.length - 1, 1)).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tangent).normalize();
    if (right.lengthSq() < 0.1) right.set(1, 0, 0);
    const left = point.clone().addScaledVector(right, -width / 2);
    const middle = point.clone().add(new THREE.Vector3(0, -0.16, 0));
    const edge = point.clone().addScaledVector(right, width / 2);
    [left, middle, edge].forEach((item) => vertices.push(item.x, item.y, item.z));
  });
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = index * 3;
    const b = a + 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: COLORS.ceramic, metalness: 0.08, roughness: 0.46, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildRails(path: Vec3[]) {
  const curve = new THREE.CatmullRomCurve3(path.map(vector), false, "centripetal");
  const material = new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.72, roughness: 0.26 });
  return [-1, 1].map((side) => {
    const points = curve.getPoints(Math.max(16, path.length * 5)).map((point, index, all) => {
      const tangent = curve.getTangent(index / Math.max(all.length - 1, 1)).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tangent).normalize();
      if (right.lengthSq() < 0.1) right.set(1, 0, 0);
      return point.clone().addScaledVector(right, side * 3.55).add(new THREE.Vector3(0, 0.78, 0));
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, 0.13, 8), material.clone());
    mesh.castShadow = true;
    return mesh;
  });
}

function addSupports(group: THREE.Group, definition: TrackModuleDefinition) {
  const middle = definition.render.path[Math.floor(definition.render.path.length / 2)];
  const height = Math.max(3, middle.y - definition.bounds.min.y + 2);
  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, height, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.navy, metalness: 0.58, roughness: 0.4 }),
  );
  support.position.set(middle.x, middle.y - height / 2 - 0.25, middle.z);
  support.castShadow = true;
  group.add(support);
}

function addFeatureGeometry(group: THREE.Group, definition: TrackModuleDefinition) {
  const middle = definition.render.path[Math.floor(definition.render.path.length / 2)];
  if (definition.kind === "start-chute") {
    group.add(buildArch(new THREE.Vector3(0, 1.7, 2), 4.3, COLORS.brass));
    const gate = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.28, 0.32), featureMaterial(COLORS.cyan));
    gate.position.set(0, 0.65, 2);
    group.add(gate);
  } else if (definition.kind === "pegboard") {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.5, 12), featureMaterial(COLORS.brass));
        peg.position.set((column - 2) * 1.35 + (row % 2 ? 0.65 : 0), -1.2 - row * 1.25, 4 + row * 2.7);
        peg.rotation.x = Math.PI / 2;
        group.add(peg);
      }
    }
  } else if (definition.kind === "spinner-zone") {
    const hub = new THREE.Group();
    hub.position.copy(vector(middle)).add(new THREE.Vector3(0, 0.8, 0));
    for (let index = 0; index < 4; index += 1) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.24, 0.42), featureMaterial(COLORS.brass));
      arm.rotation.y = index * Math.PI / 4;
      hub.add(arm);
    }
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16), featureMaterial(COLORS.cyan)));
    group.add(hub);
  } else if (definition.kind === "funnel") {
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 1.1, 2.2, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: COLORS.graphite, metalness: 0.34, roughness: 0.26, side: THREE.DoubleSide }),
    );
    bowl.position.copy(vector(middle)).add(new THREE.Vector3(0, 0.15, 0));
    group.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.16, 10, 64), featureMaterial(COLORS.brass));
    rim.position.copy(bowl.position).add(new THREE.Vector3(0, 1.1, 0));
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
  } else if (definition.kind === "finish-tray") {
    group.add(buildArch(new THREE.Vector3(0, 1.7, 10), 4.5, "#34d399"));
    const tray = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.5, 6), featureMaterial(COLORS.graphite));
    tray.position.set(0, -2.3, 14);
    group.add(tray);
  } else if (definition.kind === "drop") {
    const rings = [1.5, 4, 6.5].map((z, index) => buildArch(new THREE.Vector3(0, -index * 3.5, z), 4.1, COLORS.brass));
    rings.forEach((ring) => group.add(ring));
  } else if (definition.kind === "helix") {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 15, 16), featureMaterial(COLORS.navy));
    mast.position.set(0, -4, 9);
    group.add(mast);
  }
}

function buildArch(position: THREE.Vector3, radius: number, color: string) {
  const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.18, 10, 48, Math.PI), featureMaterial(color));
  arch.position.copy(position);
  arch.rotation.z = Math.PI;
  return arch;
}

function featureMaterial(color: string) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, metalness: 0.55, roughness: 0.28 });
}

function buildObservatoryDeck(course: CourseDefinition) {
  const sizeZ = course.bounds.max.z - course.bounds.min.z + 30;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, sizeZ),
    new THREE.MeshStandardMaterial({ color: "#070c16", metalness: 0.25, roughness: 0.82 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, course.bounds.min.y - 3, (course.bounds.min.z + course.bounds.max.z) / 2);
  floor.receiveShadow = true;
  return floor;
}
