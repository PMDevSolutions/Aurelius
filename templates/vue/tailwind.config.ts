import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{vue,ts,tsx,js,jsx}",
    "./components/**/*.{vue,ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      // Design tokens from Figma go here
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

export default config;
