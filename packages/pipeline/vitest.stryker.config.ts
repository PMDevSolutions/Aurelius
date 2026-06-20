import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest config used by Stryker mutation runs (see ../../stryker.conf.json).
 *
 * Identical to vitest.config.ts except it excludes the end-to-end test, which
 * reads a fixture at the repo root — outside the Stryker sandbox (cwd =
 * packages/pipeline) — and would fail the initial test run. Unit tests provide
 * the mutant-killing signal.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    exclude: [...configDefaults.exclude, "**/__tests__/e2e.test.ts"],
  },
});
