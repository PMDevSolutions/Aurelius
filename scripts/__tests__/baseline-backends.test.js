// Tests for scripts/lib/baseline-backends.js — the RFC 0002 §8 backend
// adapter contract (commit | ci-artifact | service). External commands (gh,
// provider CLIs) are exercised through an injected exec recorder.
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

import { resolveBackend, BackendError } from "../lib/baseline-backends.js";

const BASE_CONFIG = {
  backend: "commit",
  storage: "git",
  baselineDir: ".claude/visual-qa/baselines",
  routes: ["/", "/about"],
  ciArtifact: { compareAgainst: "last-green-main", retentionDays: 30 },
  service: { provider: "chromatic", projectTokenEnv: "CBB_TEST_TOKEN" },
};

function recorder(responses = {}) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = `${cmd} ${args.slice(0, 2).join(" ")}`;
    for (const [prefix, value] of Object.entries(responses)) {
      if (key.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    return "";
  };
  return { exec, calls };
}

describe("resolveBackend", () => {
  it("returns the commit backend by default with the worktree as baseline root", async () => {
    const backend = resolveBackend(BASE_CONFIG);
    expect(backend.name).toBe("commit");
    expect(backend.delegated).toBe(false);
    const fetched = await backend.fetch({ baselineDir: "/some/dir" });
    expect(fetched.baselineRoot).toBe("/some/dir");
    expect(fetched.manifestPath).toBeUndefined();
  });

  it("throws BackendError for unknown backends", () => {
    expect(() => resolveBackend({ ...BASE_CONFIG, backend: "s3" })).toThrow(BackendError);
  });
});

describe("ci-artifact backend", () => {
  const config = { ...BASE_CONFIG, backend: "ci-artifact" };

  it("downloads the last green main artifact via gh and points at it", async () => {
    const { exec, calls } = recorder({ "gh run list": "12345\n" });
    const backend = resolveBackend(config, { execFile: exec });
    expect(backend.name).toBe("ci-artifact");

    const fetched = await backend.fetch({ baselineDir: "/ignored" });
    expect(fetched.baselineRoot).toBeTruthy();
    expect(existsSync(fetched.baselineRoot)).toBe(true);
    expect(fetched.manifestPath).toBe(join(fetched.baselineRoot, "manifest.json"));

    const list = calls.find((c) => c[1] === "run" && c[2] === "list");
    expect(list).toContain("cross-browser-baselines.yml");
    expect(list).toContain("--branch");
    expect(list).toContain("main");
    expect(list).toContain("--status");
    expect(list).toContain("success");

    const download = calls.find((c) => c[1] === "run" && c[2] === "download");
    expect(download).toContain("12345");
    expect(download).toContain("cross-browser-baselines");
  });

  it("signals a skip when no published artifact exists yet", async () => {
    const { exec, calls } = recorder({ "gh run list": "\n" });
    const backend = resolveBackend(config, { execFile: exec });
    const fetched = await backend.fetch({ baselineDir: "/ignored" });
    expect(fetched.baselineRoot).toBeNull();
    expect(fetched.reason).toMatch(/no published/i);
    expect(calls.some((c) => c[2] === "download")).toBe(false);
  });

  it("wraps a missing gh CLI in a BackendError", async () => {
    const { exec } = recorder({ "gh run list": Object.assign(new Error("ENOENT"), { code: "ENOENT" }) });
    const backend = resolveBackend(config, { execFile: exec });
    await expect(backend.fetch({ baselineDir: "/ignored" })).rejects.toThrow(BackendError);
  });
});

describe("service backend", () => {
  const config = { ...BASE_CONFIG, backend: "service" };

  it("is delegated and validates the project token env var", () => {
    const backend = resolveBackend(config, {});
    expect(backend.delegated).toBe(true);
    expect(() => backend.requireToken({})).toThrow(/CBB_TEST_TOKEN/);
    expect(() => backend.requireToken({ CBB_TEST_TOKEN: "tok" })).not.toThrow();
  });

  it("builds the chromatic argv honoring blocking semantics", () => {
    const backend = resolveBackend(config, {});
    const nonBlocking = backend.providerArgv({ blocking: false });
    expect(nonBlocking.slice(0, 3)).toEqual(["npx", "--yes", "chromatic"]);
    expect(nonBlocking).toContain("--exit-zero-on-changes");
    const blocking = backend.providerArgv({ blocking: true });
    expect(blocking).not.toContain("--exit-zero-on-changes");
  });

  it("builds the percy argv around a generated snapshots file", () => {
    const percyConfig = {
      ...config,
      service: { provider: "percy", projectTokenEnv: "PERCY_TOKEN" },
    };
    const backend = resolveBackend(percyConfig, {});
    const argv = backend.providerArgv({ blocking: false, snapshotsFile: "/tmp/snap.json" });
    expect(argv).toContain("@percy/cli");
    expect(argv).toContain("snapshot");
    expect(argv).toContain("/tmp/snap.json");

    const snapshots = JSON.parse(backend.buildSnapshots({ url: "http://localhost:3000" }));
    expect(snapshots).toEqual([
      { name: "/", url: "http://localhost:3000/" },
      { name: "/about", url: "http://localhost:3000/about" },
    ]);
  });
});
