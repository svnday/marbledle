"use client";

// Browser-only loader for the deterministic Rapier build.
//
// We use `@dimforge/rapier3d-deterministic-compat` on purpose:
//  - the *deterministic* build guarantees bit-level cross-platform reproducibility,
//    which is what lets every player get the byte-identical daily race, and
//  - the *-compat* variant embeds the WASM as base64 inside the JS bundle, so no
//    Turbopack/webpack WASM-loader configuration is required.
//
// `init()` must be awaited exactly once before any Rapier API is touched. We memoize
// the whole thing so repeated callers share a single initialized instance, and we
// dynamic-import it so the ~2 MB module stays out of the initial page bundle.

export type Rapier = typeof import("@dimforge/rapier3d-deterministic-compat");

let rapierPromise: Promise<Rapier> | null = null;

export function getRapier(): Promise<Rapier> {
  if (rapierPromise === null) {
    rapierPromise = import("@dimforge/rapier3d-deterministic-compat").then(
      async (rapier) => {
        await rapier.init();
        return rapier;
      },
    );
  }

  return rapierPromise;
}
