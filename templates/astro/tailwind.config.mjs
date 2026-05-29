/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,tsx,ts,jsx,js,md,mdx}"],
  theme: {
    extend: {
      // Design tokens (from Figma/Canva/screenshot intake) go here.
      // Mirror the structure used by templates/shared/tailwind.config.ts so the
      // token-lock and converter pipelines emit a consistent shape.
      colors: {
        // primary: "#...",
        // secondary: "#...",
      },
      fontFamily: {
        // sans: ["Inter", "system-ui", "sans-serif"],
      },
      spacing: {
        // Custom spacing scale
      },
      borderRadius: {
        // Custom radii
      },
      boxShadow: {
        // Custom shadows
      },
    },
  },
  plugins: [],
};
