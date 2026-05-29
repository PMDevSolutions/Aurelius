/// <reference types="vitest" />
import { getViteConfig } from "astro/config";

// Astro's getViteConfig wires the Astro Vite plugin into Vitest so that both
// component flavors can be exercised in one test run:
//   • React islands (.tsx)  → @testing-library/react + jsdom (identical to the
//     Vite/Next React path).
//   • Static .astro files   → rendered via the Astro Container API
//     (`experimental_AstroContainer` from "astro/container"), then asserted
//     against the returned HTML string.
// See https://docs.astro.build/en/reference/container-reference/ for the
// Container API and https://docs.astro.build/en/guides/testing/#vitest.
export default getViteConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
