import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pipeline infrastructure tests share state files on disk
    // (cache-manifest.json, history.json) so must run sequentially
    fileParallelism: false,
    testTimeout: 30000,
  },
});
