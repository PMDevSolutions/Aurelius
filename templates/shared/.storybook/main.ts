import type { StorybookConfig } from "@storybook/react-vite";

// Storybook 10 (Vite 5 to 8). Controls, actions, viewport and interactions ship
// in Storybook's core since version 9; docs and a11y remain separate addons.
// Install: pnpm add -D storybook@^10 @storybook/react-vite@^10 @storybook/addon-docs@^10 @storybook/addon-a11y@^10
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
