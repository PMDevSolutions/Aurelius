import type { StorybookConfig } from "@storybook/vue3-vite";

// Storybook 10: controls, actions, viewport and interactions ship in core; docs
// and a11y remain separate addons.
// Install: pnpm add -D storybook@^10 @storybook/vue3-vite@^10 @storybook/addon-docs@^10 @storybook/addon-a11y@^10
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|vue)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/vue3-vite",
    options: {},
  },
};

export default config;
