/**
 * baseline-backends.js — RFC 0002 §8 baseline storage backend adapters.
 *
 * Every backend exposes the same small surface so the capture/compare CLI is
 * backend-agnostic:
 *
 *   fetch({ baselineDir })  → { baselineRoot }  make baselines available locally
 *   storeInstructions(ctx)  → string[]          how new baselines are persisted
 *   delegated               → boolean           true when the provider owns
 *                                               capture + diff + review (service)
 *
 * Backends:
 *   commit      (default) — baselines are git-tracked in the worktree
 *   ci-artifact           — compare against the last-green-main CI artifact
 *   service               — delegate to Chromatic/Percy (opt-in, token via env)
 */

export class BackendError extends Error {}

export function resolveBackend(config, deps = {}) {
  const name = config.backend ?? "commit";
  if (name === "commit") return commitBackend(config);
  if (name === "ci-artifact" || name === "service") {
    throw new BackendError(
      `visualBaselines.backend "${name}" is not implemented yet (RFC 0002 Phase C)`,
    );
  }
  throw new BackendError(
    `unknown visualBaselines.backend "${name}" (expected commit | ci-artifact | service)`,
  );
}

function commitBackend(config) {
  return {
    name: "commit",
    delegated: false,
    async fetch({ baselineDir }) {
      // Baselines are already in the worktree (git or git-lfs).
      return { baselineRoot: baselineDir };
    },
    storeInstructions({ baselineDir, manifestPath }) {
      return [
        `git add ${baselineDir}`,
        `git commit -m "test: update cross-browser baselines"`,
        ...(config.storage === "lfs"
          ? ["(storage=lfs: ensure scripts/setup-baseline-lfs.sh has been run)"]
          : []),
      ];
    },
  };
}
