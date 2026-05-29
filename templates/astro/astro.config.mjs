// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  // React powers the interactive islands (.tsx). Static, presentational
  // components stay zero-JS .astro files. Tailwind drives styling for both.
  integrations: [
    react(),
    tailwind({
      // Tailwind config lives in tailwind.config.mjs; let it own base styles.
      applyBaseStyles: true,
    }),
  ],
});
