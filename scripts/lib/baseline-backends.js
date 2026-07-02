/**
 * baseline-backends.js — RFC 0002 §8 baseline storage backend adapters.
 *
 * Every backend exposes the same small surface so the capture/compare CLI is
 * backend-agnostic:
 *
 *   fetch({ baselineDir })  → { baselineRoot, manifestPath?, reason? }
 *                             make baselines available locally; baselineRoot
 *                             null + reason = nothing to compare against yet
 *   storeInstructions(ctx)  → string[]   how new baselines are persisted
 *   delegated               → boolean    true when the provider owns capture,
 *                                        diff, and review (service backend)
 *
 * Backends:
 *   commit      (default) — baselines are git-tracked in the worktree
 *   ci-artifact           — compare against the cross-browser-baselines
 *                           artifact published from the last green main build
 *   service               — delegate to Chromatic/Percy (opt-in; project
 *                           token supplied via the configured env var)
 */

import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export class BackendError extends Error {}

const ARTIFACT_NAME = "cross-browser-baselines";
const WORKFLOW_FILE = "cross-browser-baselines.yml";

export function resolveBackend(config, deps = {}) {
  const name = config.backend ?? "commit";
  const execFile = deps.execFile ?? ((cmd, args) => execFileSync(cmd, args, { encoding: "utf-8" }));
  if (name === "commit") return commitBackend(config);
  if (name === "ci-artifact") return ciArtifactBackend(config, execFile);
  if (name === "service") return serviceBackend(config);
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
    storeInstructions({ baselineDir }) {
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

function ciArtifactBackend(config, execFile) {
  return {
    name: "ci-artifact",
    delegated: false,
    async fetch() {
      let runId;
      try {
        runId = execFile("gh", [
          "run",
          "list",
          "--workflow",
          WORKFLOW_FILE,
          "--branch",
          "main",
          "--status",
          "success",
          "--limit",
          "1",
          "--json",
          "databaseId",
          "--jq",
          ".[0].databaseId",
        ]).trim();
      } catch (err) {
        throw new BackendError(
          `the ci-artifact backend needs the gh CLI to locate the last green main build (${err.message})`,
        );
      }
      if (!runId) {
        return {
          baselineRoot: null,
          reason:
            "no published cross-browser baselines artifact on main yet — " +
            "merge a capture to main first (the publish job in cross-browser-baselines.yml uploads it)",
        };
      }
      const dest = mkdtempSync(join(tmpdir(), "cbb-artifact-"));
      try {
        execFile("gh", ["run", "download", runId, "-n", ARTIFACT_NAME, "-D", dest]);
      } catch (err) {
        throw new BackendError(
          `failed to download the ${ARTIFACT_NAME} artifact from run ${runId}: ${err.message}`,
        );
      }
      return {
        baselineRoot: dest,
        manifestPath: join(dest, "manifest.json"),
        source: `gh run ${runId} (last green main)`,
      };
    },
    storeInstructions() {
      return [
        "baselines publish automatically from main (publish job in .github/workflows/cross-browser-baselines.yml)",
      ];
    },
  };
}

function serviceBackend(config) {
  const provider = config.service?.provider ?? "chromatic";
  const tokenEnv = config.service?.projectTokenEnv ?? "CHROMATIC_PROJECT_TOKEN";
  return {
    name: "service",
    delegated: true,
    provider,
    tokenEnv,
    requireToken(env) {
      if (!env[tokenEnv]) {
        throw new BackendError(
          `the ${provider} service backend needs a project token in $${tokenEnv} ` +
            "(set it as a CI secret; the provider owns capture, diff, and review)",
        );
      }
    },
    providerArgv({ blocking, snapshotsFile } = {}) {
      if (provider === "percy") {
        return ["npx", "--yes", "@percy/cli", "snapshot", snapshotsFile];
      }
      // Chromatic reads the project token from its env var; non-blocking runs
      // mirror visualBaselines.blocking=false by exiting zero on changes.
      return ["npx", "--yes", "chromatic", ...(blocking ? [] : ["--exit-zero-on-changes"])];
    },
    /** Percy full-page snapshots generated from the configured routes. */
    buildSnapshots({ url }) {
      const base = url.replace(/\/$/, "");
      const routes = config.routes ?? ["/"];
      return JSON.stringify(
        routes.map((route) => ({ name: route, url: `${base}${route}` })),
        null,
        2,
      );
    },
    storeInstructions() {
      return [`baseline storage and review are owned by ${provider} — see the provider dashboard`];
    },
  };
}
