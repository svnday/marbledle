export const RUNTIME_VERSIONS = {
  legacyEngine: "path-sim@1.0.0",
  courseSchema: "module-course@1.0.0",
  replay: "float-json@1.0.0",
  assetCatalog: "observatory-core@1.0.0",
  dailyManifest: "daily-manifest@1.0.0",
} as const;

export function assertSupportedMajor(value: string, expected: string): void {
  const major = value.match(/@(\d+)\./)?.[1];
  const expectedMajor = expected.match(/@(\d+)\./)?.[1];
  if (!major || major !== expectedMajor) {
    throw new Error(`Unsupported version ${value}; expected ${expected}.`);
  }
}
