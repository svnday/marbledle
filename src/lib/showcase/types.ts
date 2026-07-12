import type { Vec3 } from "../course";

export type ModuleKind =
  | "start-chute"
  | "straight-trough"
  | "banked-turn"
  | "s-curve"
  | "drop"
  | "helix"
  | "pegboard"
  | "spinner-zone"
  | "funnel"
  | "split-merge"
  | "finish-tray";

export type SocketType = "standard" | "wide" | "drop" | "finish";

export type TrackSocket = {
  id: string;
  type: SocketType;
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  width: number;
  railHeight: number;
  clearanceHeight: number;
};

export type ColliderDefinition = {
  id: string;
  shape: "cuboid" | "cylinder";
  position: Vec3;
  rotation: Vec3;
  halfExtents?: Vec3;
  radius?: number;
  halfHeight?: number;
  coversSurfaceIds: string[];
};

export type RenderSurfaceDefinition = {
  id: string;
  role: "race-surface" | "rail" | "housing" | "support" | "obstacle" | "tray";
  colliderRequired: boolean;
};

export type TrackModuleDefinition = {
  id: string;
  version: string;
  kind: ModuleKind;
  title: string;
  entrySockets: TrackSocket[];
  exitSockets: TrackSocket[];
  render: {
    path: Vec3[];
    branchPaths?: Vec3[][];
    surfaces: RenderSurfaceDefinition[];
    materialFamily: "observatory-ceramic";
  };
  colliders: ColliderDefinition[];
  sensors: Array<{ id: string; role: "checkpoint" | "finish"; position: Vec3; halfExtents: Vec3 }>;
  movingBodyHooks: Array<{
    id: string;
    role: "gate" | "spinner";
    position: Vec3;
    axis: Vec3;
  }>;
  cameraHints: Array<{
    id: string;
    position: Vec3;
    target: Vec3;
    safeRadius: number;
  }>;
  bounds: { min: Vec3; max: Vec3 };
  validation: {
    maximumSlopeDegrees: number;
    minimumClearance: number;
    intendedSpeed: { min: number; max: number };
  };
  performance: {
    triangleBudget: number;
    drawCallBudget: number;
    colliderCount: number;
  };
};

export type CourseModuleInstance = {
  id: string;
  moduleId: string;
  moduleVersion: string;
  position: Vec3;
  rotation: Vec3;
};

export type CourseDefinition = {
  id: "showcase-v1";
  version: string;
  schemaVersion: string;
  engine: "showcase-preview";
  seed: "handcrafted-showcase-v1";
  modules: CourseModuleInstance[];
  bounds: { min: Vec3; max: Vec3 };
  startModuleId: string;
  finishModuleId: string;
  assetCatalogVersion: string;
  contentHash: string;
};
