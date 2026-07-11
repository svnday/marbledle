export type MarbledlePerformanceMetrics = {
  raceGenerationMs?: number;
  raceFrames?: number;
  raceTracks?: number;
  trajectoryNumbers?: number;
  frameSamplesMs: number[];
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  longTasks: Array<{ durationMs: number; startTimeMs: number }>;
};

declare global {
  interface Window {
    __MARBLEDLE_METRICS__?: MarbledlePerformanceMetrics;
  }
}

export function getPerformanceMetrics(): MarbledlePerformanceMetrics | null {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("metrics")) {
    return null;
  }

  window.__MARBLEDLE_METRICS__ ??= {
    frameSamplesMs: [],
    longTasks: [],
  };
  return window.__MARBLEDLE_METRICS__;
}
