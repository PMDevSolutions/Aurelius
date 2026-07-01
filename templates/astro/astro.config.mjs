// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // React powers the interactive islands (.tsx). Static, presentational
  // components stay zero-JS .astro files.
  //
  // Tailwind v4 is wired through its Vite plugin (@tailwindcss/vite). The old
  // `@astrojs/tailwind` integration was dropped in the Astro 6 upgrade — its
  // latest release supports Astro ≤5 only. Styles load from
  // `src/styles/global.css` (imported by src/pages/index.astro), which pulls in
  // Tailwind and bridges the token config via `@config`.
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
