import { RUNTIME_VERSIONS } from "../contracts/versions";
import { TRACK_MODULES } from "./registry";
import type { CourseDefinition, CourseModuleInstance } from "./types";

let y = 20;
let z = -70;
const modules: CourseModuleInstance[] = TRACK_MODULES.map((module, index) => {
  const instance = {
    id: `${String(index + 1).padStart(2, "0")}-${module.id}`,
    moduleId: module.id,
    moduleVersion: module.version,
    position: { x: 0, y, z },
    rotation: { x: 0, y: 0, z: 0 },
  };
  const exit = module.exitSockets[0].position;
  y += exit.y;
  z += exit.z;
  return instance;
});

export const SHOWCASE_V1: CourseDefinition = {
  id: "showcase-v1",
  version: "1.0.0",
  schemaVersion: RUNTIME_VERSIONS.courseSchema,
  engine: "showcase-preview",
  seed: "handcrafted-showcase-v1",
  modules,
  bounds: {
    min: { x: -15, y: -45, z: -75 },
    max: { x: 15, y: 28, z: 95 },
  },
  startModuleId: modules[0].id,
  finishModuleId: modules[modules.length - 1].id,
  assetCatalogVersion: RUNTIME_VERSIONS.assetCatalog,
  contentHash: "showcase-v1-contract-2026-07-11",
};
