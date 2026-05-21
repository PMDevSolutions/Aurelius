#!/usr/bin/env node
/**
 * export-design-system.js
 *
 * Export generated components as a publishable design-system workspace.
 *
 * Reads:
 *   - build-spec.json   (for outputTarget: react|vue|svelte|react-native)
 *   - design-tokens.lock.json (single source of truth for tokens)
 *   - src/components/  (or configured dir) — components to package
 *
 * Writes a pnpm workspace to <output> containing:
 *   - packages/design-tokens/      framework-agnostic token package
 *   - packages/<fw>-components/    framework-specific component library
 *
 * Web targets (react/vue/svelte) build with Vite library mode.
 * react-native builds with `tsc` only (Vite is incompatible with the RN runtime).
 *
 * Exit codes: 0 ok, 1 generic error, 2 missing inputs, 3 unsupported framework.
 */
import fs from "node:fs";
import path from "node:path";

// ---------- CLI ----------

function parseArgs(argv) {
  const args = {
    output: "dist/design-system",
    scope: null,
    componentsDir: null,
    lockfile: null,
    buildSpec: null,
    framework: null,
    storybook: true,
    changesets: true,
    dryRun: false,
    json: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--output":
        args.output = next();
        break;
      case "--scope":
        args.scope = next();
        break;
      case "--components-dir":
        args.componentsDir = next();
        break;
      case "--lockfile":
        args.lockfile = next();
        break;
      case "--build-spec":
        args.buildSpec = next();
        break;
      case "--framework":
        args.framework = next();
        break;
      case "--no-storybook":
        args.storybook = false;
        break;
      case "--no-changesets":
        args.changesets = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith("--")) die(`Unknown flag: ${a}`, 1);
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Usage: export-design-system.js [options]

Generate a publishable pnpm workspace from generated components + design tokens.

Options:
  --output <dir>           Output directory (default: dist/design-system)
  --scope <name>           NPM scope (e.g. @my-org). Inferred from package.json if omitted.
  --components-dir <dir>   Source components dir (default: src/components)
  --lockfile <path>        design-tokens.lock.json (auto-detected if omitted)
  --build-spec <path>      build-spec.json (auto-detected if omitted)
  --framework <name>       Override outputTarget: react|vue|svelte|react-native
  --no-storybook           Skip Storybook docs scaffolding
  --no-changesets          Skip Changesets versioning setup
  --force                  Overwrite existing output directory
  --dry-run                Report what would be written; do not write
  --json                   Emit a JSON summary
  -h, --help               Show this help
`);
}

// ---------- helpers ----------

function die(msg, code = 1) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(code);
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    die(`Failed to parse JSON at ${p}: ${e.message}`, 1);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(target, content, opts) {
  if (opts.dryRun) {
    opts._written.push(target);
    return;
  }
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
  opts._written.push(target);
}

function copyDirRecursive(src, dest, filterFn, opts) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(sp, dp, filterFn, opts);
    } else if (entry.isFile()) {
      if (filterFn && !filterFn(sp)) continue;
      if (!opts.dryRun) {
        ensureDir(path.dirname(dp));
        fs.copyFileSync(sp, dp);
      }
      opts._copied.push(dp);
      count++;
    }
  }
  return count;
}

// ---------- detection ----------

function autoDetect(args) {
  const candidates = {
    lockfile: ["src/styles/design-tokens.lock.json", "design-tokens.lock.json"],
    buildSpec: [".claude/plans/build-spec.json", "build-spec.json"],
    componentsDir: ["src/components", "components", "src/lib/components"],
  };
  for (const k of Object.keys(candidates)) {
    if (args[k]) continue;
    for (const c of candidates[k]) {
      if (fs.existsSync(c)) {
        args[k] = c;
        break;
      }
    }
  }
}

function detectFramework(buildSpec) {
  if (buildSpec && buildSpec.outputTarget) return buildSpec.outputTarget;
  // Fallback: infer from package.json deps
  const pkg = readJsonIfExists("package.json") || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps["react-native"] || deps["expo"]) return "react-native";
  if (deps["vue"] || deps["@vue/runtime-core"]) return "vue";
  if (deps["svelte"] || deps["@sveltejs/kit"]) return "svelte";
  if (deps["react"] || deps["next"]) return "react";
  return null;
}

function defaultScope() {
  const pkg = readJsonIfExists("package.json") || {};
  if (typeof pkg.name === "string" && pkg.name.startsWith("@")) {
    const slash = pkg.name.indexOf("/");
    if (slash > 0) return pkg.name.slice(0, slash);
  }
  return "@my-app";
}

// ---------- per-framework descriptors ----------

const FRAMEWORKS = {
  react: {
    label: "React",
    componentExt: [".tsx", ".ts", ".jsx", ".js"],
    pkgSuffix: "react-components",
    bundler: "vite",
    peers: { react: "^18.0.0 || ^19.0.0", "react-dom": "^18.0.0 || ^19.0.0" },
    devDeps: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      "vite-plugin-dts": "^4.0.0",
    },
  },
  vue: {
    label: "Vue 3",
    componentExt: [".vue", ".ts", ".tsx"],
    pkgSuffix: "vue-components",
    bundler: "vite",
    peers: { vue: "^3.4.0" },
    devDeps: {
      "@vitejs/plugin-vue": "^5.2.0",
      "vue-tsc": "^2.2.0",
      "vite-plugin-dts": "^4.0.0",
    },
  },
  svelte: {
    label: "Svelte 5",
    componentExt: [".svelte", ".ts"],
    pkgSuffix: "svelte-components",
    bundler: "vite",
    peers: { svelte: "^5.0.0" },
    devDeps: {
      "@sveltejs/package": "^2.3.0",
      "@sveltejs/vite-plugin-svelte": "^5.0.0",
      "svelte-check": "^4.0.0",
    },
  },
  "react-native": {
    label: "React Native",
    componentExt: [".tsx", ".ts"],
    pkgSuffix: "native-components",
    bundler: "tsc",
    peers: { react: "^18.0.0", "react-native": ">=0.74.0" },
    devDeps: {
      "@types/react": "^18.3.0",
      typescript: "^5.7.0",
    },
  },
};

// ---------- file generators ----------

function tokensCss(lock) {
  const lines = [":root {"];
  const colors = (lock && lock.colors) || {};
  const flat = flattenObject(colors, "color");
  for (const [k, v] of Object.entries(flat)) {
    if (typeof v === "string") lines.push(`  --${k}: ${v};`);
  }
  const spacing = (lock && lock.spacing) || {};
  for (const [k, v] of Object.entries(spacing)) {
    if (typeof v === "string" || typeof v === "number") {
      lines.push(`  --space-${k}: ${typeof v === "number" ? `${v}px` : v};`);
    }
  }
  const radii = (lock && lock.radii) || (lock && lock.borderRadius) || {};
  for (const [k, v] of Object.entries(radii)) {
    if (typeof v === "string" || typeof v === "number") {
      lines.push(`  --radius-${k}: ${typeof v === "number" ? `${v}px` : v};`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

function flattenObject(obj, prefix) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !("value" in v)) {
      Object.assign(out, flattenObject(v, key));
    } else if (v && typeof v === "object" && "value" in v) {
      out[key] = v.value;
    } else {
      out[key] = v;
    }
  }
  return out;
}

function tokensTs(lock) {
  return `// Auto-generated from design-tokens.lock.json. Do not edit by hand.
// Re-run \`/export-design-system\` to refresh.

export const tokens = ${JSON.stringify(lock || {}, null, 2)} as const;

export type Tokens = typeof tokens;

export default tokens;
`;
}

function tokensIndexTs() {
  return `export { tokens, default } from './tokens';
export type { Tokens } from './tokens';
export { default as preset } from './tailwind-preset';
`;
}

function tailwindPreset(lock) {
  const colors = (lock && lock.colors) || {};
  const spacing = (lock && lock.spacing) || {};
  const radii = (lock && lock.radii) || (lock && lock.borderRadius) || {};
  const fonts = (lock && lock.typography && lock.typography.fontFamily) || {};
  return `// Auto-generated Tailwind preset from design-tokens.lock.json
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6)},
      spacing: ${JSON.stringify(spacing, null, 6)},
      borderRadius: ${JSON.stringify(radii, null, 6)},
      fontFamily: ${JSON.stringify(fonts, null, 6)},
    },
  },
};

export default preset;
`;
}

function tokensPackageJson(scope, version) {
  return (
    JSON.stringify(
      {
        name: `${scope}/design-tokens`,
        version,
        description:
          "Framework-agnostic design tokens (CSS variables, Tailwind preset, typed exports).",
        type: "module",
        sideEffects: ["./dist/tokens.css"],
        main: "./dist/index.cjs",
        module: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
            require: "./dist/index.cjs",
          },
          "./tokens.css": "./dist/tokens.css",
          "./tailwind-preset": {
            types: "./dist/tailwind-preset.d.ts",
            import: "./dist/tailwind-preset.js",
            require: "./dist/tailwind-preset.cjs",
          },
          "./tokens.json": "./dist/tokens.json",
        },
        files: ["dist"],
        scripts: {
          build: "vite build && node scripts/postbuild.mjs",
          dev: "vite build --watch",
          "type-check": "tsc --noEmit",
        },
        devDependencies: {
          typescript: "^5.7.0",
          vite: "^6.0.0",
          "vite-plugin-dts": "^4.0.0",
          tailwindcss: "^4.0.0",
        },
        publishConfig: { access: "public" },
      },
      null,
      2,
    ) + "\n"
  );
}

function tokensViteConfig() {
  return `import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'tailwind-preset': resolve(__dirname, 'src/tailwind-preset.ts'),
      },
      formats: ['es', 'cjs'],
    },
    sourcemap: true,
  },
});
`;
}

function tokensPostbuildScript() {
  return `// Cross-platform copy of static token files into dist/.
// Vite library mode does not emit non-imported assets, so we copy them here.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
cpSync('src/tokens.css', 'dist/tokens.css');
cpSync('src/tokens.json', 'dist/tokens.json');
`;
}

function tokensTsconfig() {
  return (
    JSON.stringify(
      {
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          outDir: "dist",
          declaration: true,
          declarationDir: "dist",
          moduleResolution: "bundler",
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ) + "\n"
  );
}

// ---------- components package ----------

function componentsPackageJson(scope, version, framework, fwDesc, hasTokens) {
  const name = `${scope}/${fwDesc.pkgSuffix}`;
  const tokenDep = hasTokens ? { [`${scope}/design-tokens`]: `workspace:^${version}` } : {};
  const isVite = fwDesc.bundler === "vite";

  const exportsField = isVite
    ? {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
          require: "./dist/index.cjs",
        },
        "./styles.css": "./dist/styles.css",
      }
    : {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      };

  const scripts = isVite
    ? {
        build: "vite build",
        dev: "vite build --watch",
        "type-check": framework === "vue" ? "vue-tsc --noEmit" : "tsc --noEmit",
      }
    : {
        build: "tsc -p tsconfig.json",
        "type-check": "tsc --noEmit",
      };

  return (
    JSON.stringify(
      {
        name,
        version,
        description: `${fwDesc.label} component library generated from design tokens.`,
        type: "module",
        sideEffects: isVite ? ["*.css"] : false,
        main: isVite ? "./dist/index.cjs" : "./dist/index.js",
        module: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: exportsField,
        files: ["dist"],
        scripts,
        peerDependencies: fwDesc.peers,
        dependencies: tokenDep,
        devDependencies: {
          ...fwDesc.devDeps,
          typescript: "^5.7.0",
          vite: isVite ? "^6.0.0" : undefined,
        },
        publishConfig: { access: "public" },
      },
      (k, v) => (v === undefined ? undefined : v),
      2,
    ) + "\n"
  );
}

function componentsViteConfig(framework) {
  const plugin = {
    react: { import: "import react from '@vitejs/plugin-react';", call: "react()" },
    vue: { import: "import vue from '@vitejs/plugin-vue';", call: "vue()" },
    svelte: {
      import: "import { svelte } from '@sveltejs/vite-plugin-svelte';",
      call: "svelte()",
    },
  }[framework];

  const externals = {
    react: ["react", "react-dom", "react/jsx-runtime"],
    vue: ["vue"],
    svelte: ["svelte", "svelte/internal"],
  }[framework];

  const dtsPlugin =
    framework === "svelte"
      ? "" // SvelteKit/svelte-package handles types separately; keep it simple here
      : "import dts from 'vite-plugin-dts';\n";

  const dtsCall = framework === "svelte" ? "" : ", dts({ rollupTypes: true })";

  return `import { defineConfig } from 'vite';
${plugin.import}
${dtsPlugin}import { resolve } from 'node:path';

export default defineConfig({
  plugins: [${plugin.call}${dtsCall}],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => \`index.\${format === 'es' ? 'js' : 'cjs'}\`,
    },
    rollupOptions: {
      external: ${JSON.stringify(externals)},
    },
    sourcemap: true,
    cssCodeSplit: false,
  },
});
`;
}

function componentsTsconfig(framework) {
  const base = {
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      outDir: "dist",
      declaration: true,
      declarationDir: "dist",
      moduleResolution: "bundler",
      jsx: framework === "react" || framework === "react-native" ? "react-jsx" : undefined,
    },
    include: ["src/**/*"],
  };
  if (framework === "react-native") {
    base.compilerOptions.module = "esnext";
    base.compilerOptions.target = "esnext";
    base.compilerOptions.lib = ["esnext"];
  }
  return JSON.stringify(base, (k, v) => (v === undefined ? undefined : v), 2) + "\n";
}

function themeProvider(framework, scope, hasTokens) {
  const tokenImport = hasTokens ? `import { tokens } from '${scope}/design-tokens';\n` : "";
  switch (framework) {
    case "react":
      return `import { createContext, useContext, useMemo, type ReactNode } from 'react';
${tokenImport}
type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  tokens: ${hasTokens ? "typeof tokens" : "Record<string, unknown>"};
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  theme?: Theme;
  children: ReactNode;
}

export function ThemeProvider({ theme = 'light', children }: ThemeProviderProps) {
  const value = useMemo(() => ({ theme, tokens: ${hasTokens ? "tokens" : "{}"} }), [theme]);
  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
`;
    case "vue":
      return `import { defineComponent, provide, inject, computed, h, type InjectionKey, type PropType } from 'vue';
${tokenImport}
type Theme = 'light' | 'dark';

interface ThemeContext {
  theme: Theme;
  tokens: ${hasTokens ? "typeof tokens" : "Record<string, unknown>"};
}

export const ThemeKey: InjectionKey<ThemeContext> = Symbol('theme');

export const ThemeProvider = defineComponent({
  name: 'ThemeProvider',
  props: {
    theme: { type: String as PropType<Theme>, default: 'light' },
  },
  setup(props, { slots }) {
    const ctx = computed<ThemeContext>(() => ({ theme: props.theme, tokens: ${hasTokens ? "tokens" : "{}"} }));
    provide(ThemeKey, ctx.value);
    return () => h('div', { 'data-theme': props.theme }, slots.default?.());
  },
});

export function useTheme(): ThemeContext {
  const ctx = inject(ThemeKey);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
`;
    case "svelte":
      return `<script lang="ts" context="module">
${tokenImport.trim()}
  export type Theme = 'light' | 'dark';
  export const themeContextKey = Symbol('theme');
  export interface ThemeContext {
    theme: Theme;
    tokens: ${hasTokens ? "typeof tokens" : "Record<string, unknown>"};
  }
</script>

<script lang="ts">
  import { setContext } from 'svelte';
  export let theme: Theme = 'light';
  $: setContext<ThemeContext>(themeContextKey, { theme, tokens: ${hasTokens ? "tokens" : "{}"} });
</script>

<div data-theme={theme}>
  <slot />
</div>
`;
    case "react-native":
      return `import { createContext, useContext, useMemo, type ReactNode } from 'react';
${tokenImport}
type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  tokens: ${hasTokens ? "typeof tokens" : "Record<string, unknown>"};
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  theme?: Theme;
  children: ReactNode;
}

export function ThemeProvider({ theme = 'light', children }: ThemeProviderProps) {
  const value = useMemo(() => ({ theme, tokens: ${hasTokens ? "tokens" : "{}"} }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
`;
    default:
      return "";
  }
}

function themeProviderFilename(framework) {
  switch (framework) {
    case "react":
      return "ThemeProvider.tsx";
    case "vue":
      return "ThemeProvider.ts";
    case "svelte":
      return "ThemeProvider.svelte";
    case "react-native":
      return "ThemeProvider.tsx";
    default:
      return "ThemeProvider.ts";
  }
}

function buildBarrelIndex(framework, componentNames) {
  const themeFile = themeProviderFilename(framework).replace(/\.(tsx|ts|svelte)$/, "");
  const themeImport =
    framework === "svelte"
      ? `export { default as ThemeProvider } from './theme/${themeFile}.svelte';\n`
      : `export { ThemeProvider, useTheme } from './theme/${themeFile}';\n` +
        `export type { ThemeProviderProps } from './theme/${themeFile}';\n`;

  const componentExports = componentNames
    .map((name) => {
      if (framework === "svelte")
        return `export { default as ${name} } from './components/${name}.svelte';`;
      if (framework === "vue")
        return `export { default as ${name} } from './components/${name}.vue';`;
      return `export * from './components/${name}';`;
    })
    .join("\n");

  return `${themeImport}\n${componentExports}\n`;
}

// ---------- workspace-level files ----------

function workspaceRootPackageJson(scope) {
  return (
    JSON.stringify(
      {
        name: `${scope.replace(/^@/, "")}-design-system`,
        private: true,
        version: "0.0.0",
        scripts: {
          build: 'pnpm -r --filter "./packages/**" run build',
          "type-check": 'pnpm -r --filter "./packages/**" run type-check',
          changeset: "changeset",
          version: "changeset version",
          release: "pnpm build && changeset publish",
        },
        devDependencies: {
          "@changesets/cli": "^2.27.0",
          typescript: "^5.7.0",
        },
        packageManager: "pnpm@9.0.0",
      },
      null,
      2,
    ) + "\n"
  );
}

function workspacePnpmYaml() {
  return `packages:\n  - 'packages/*'\n`;
}

function workspaceTsconfigBase() {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          resolveJsonModule: true,
          forceConsistentCasingInFileNames: true,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function changesetsConfig() {
  return (
    JSON.stringify(
      {
        $schema: "https://unpkg.com/@changesets/config@3.0.0/schema.json",
        changelog: "@changesets/cli/changelog",
        commit: false,
        fixed: [],
        linked: [],
        access: "public",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: [],
      },
      null,
      2,
    ) + "\n"
  );
}

function workspaceReadme(ctx) {
  const { scope, framework, fwDesc, componentCount, version } = ctx;
  const rnNote =
    framework === "react-native"
      ? `\n> **React Native note:** components build with \`tsc\` (Vite is not used for the RN runtime).\n`
      : "";
  return `# ${scope.replace(/^@/, "")}-design-system

Generated design-system workspace from your project's tokens and components.
${rnNote}
## Packages

- \`${scope}/design-tokens\` — Framework-agnostic tokens (CSS variables, Tailwind preset, typed exports).
- \`${scope}/${fwDesc.pkgSuffix}\` — ${fwDesc.label} component library (${componentCount} components).

## Develop

\`\`\`bash
pnpm install
pnpm build
\`\`\`

## Versioning & publishing

This workspace uses [Changesets](https://github.com/changesets/changesets):

\`\`\`bash
pnpm changeset           # describe a change
pnpm version             # bump versions per changeset
pnpm release             # build + publish to npm
\`\`\`

Set the npm scope (\`${scope}\`) to one you control before publishing, or change it in each package.json.

## Layout

\`\`\`
packages/
  design-tokens/
    src/
      index.ts
      tokens.ts            # typed token export
      tokens.css           # CSS custom properties
      tokens.json          # raw lockfile snapshot
      tailwind-preset.ts   # Tailwind preset
  ${fwDesc.pkgSuffix}/
    src/
      index.ts             # barrel export
      components/          # generated components
      theme/               # ThemeProvider + useTheme
\`\`\`

Initial version: \`${version}\`.
`;
}

function componentsReadme(scope, fwDesc, componentNames) {
  return `# ${scope}/${fwDesc.pkgSuffix}

${fwDesc.label} component library.

## Install

\`\`\`bash
pnpm add ${scope}/${fwDesc.pkgSuffix} ${scope}/design-tokens
\`\`\`

## Use

\`\`\`ts
import { ThemeProvider${componentNames.length ? ", " + componentNames.slice(0, 3).join(", ") : ""} } from '${scope}/${fwDesc.pkgSuffix}';
\`\`\`

## Components

${componentNames.length ? componentNames.map((n) => `- \`${n}\``).join("\n") : "_No components detected._"}
`;
}

function tokensReadme(scope) {
  return `# ${scope}/design-tokens

Framework-agnostic design tokens.

## Install

\`\`\`bash
pnpm add ${scope}/design-tokens
\`\`\`

## Use

\`\`\`ts
import { tokens } from '${scope}/design-tokens';
import preset from '${scope}/design-tokens/tailwind-preset';
import '${scope}/design-tokens/tokens.css';
\`\`\`

## Files

- \`tokens.ts\` — typed token object
- \`tokens.css\` — CSS custom properties
- \`tokens.json\` — raw lockfile snapshot
- \`tailwind-preset\` — Tailwind preset to extend in your app
`;
}

// ---------- main ----------

function main() {
  const args = parseArgs(process.argv.slice(2));
  autoDetect(args);

  const buildSpec = readJsonIfExists(args.buildSpec);
  const lock = readJsonIfExists(args.lockfile);
  const framework = args.framework || detectFramework(buildSpec);

  if (!framework) {
    die(
      "Could not determine outputTarget. Pass --framework <react|vue|svelte|react-native> or ensure build-spec.json has outputTarget set.",
      2,
    );
  }
  const fwDesc = FRAMEWORKS[framework];
  if (!fwDesc) {
    die(
      `Unsupported framework: ${framework}. Supported: ${Object.keys(FRAMEWORKS).join(", ")}.`,
      3,
    );
  }
  if (!lock) {
    die(
      `No design-tokens.lock.json found. Looked at: src/styles/design-tokens.lock.json, design-tokens.lock.json. Pass --lockfile <path> to override.`,
      2,
    );
  }

  const scope = args.scope || defaultScope();
  const componentsDir = args.componentsDir || "src/components";
  const version = "0.0.1";

  const outRoot = path.resolve(args.output);
  if (fs.existsSync(outRoot) && !args.force && !args.dryRun) {
    die(
      `Output directory already exists: ${outRoot}. Pass --force to overwrite or pick a different --output.`,
      1,
    );
  }
  if (fs.existsSync(outRoot) && args.force && !args.dryRun) {
    fs.rmSync(outRoot, { recursive: true, force: true });
  }

  const opts = { dryRun: args.dryRun, _written: [], _copied: [] };
  const tokensPkgDir = path.join(outRoot, "packages", "design-tokens");
  const compPkgDir = path.join(outRoot, "packages", fwDesc.pkgSuffix);

  // ----- workspace root -----
  writeFile(path.join(outRoot, "package.json"), workspaceRootPackageJson(scope), opts);
  writeFile(path.join(outRoot, "pnpm-workspace.yaml"), workspacePnpmYaml(), opts);
  writeFile(path.join(outRoot, "tsconfig.base.json"), workspaceTsconfigBase(), opts);
  writeFile(
    path.join(outRoot, ".npmrc"),
    "auto-install-peers=true\nstrict-peer-dependencies=false\n",
    opts,
  );
  writeFile(
    path.join(outRoot, ".gitignore"),
    "node_modules\ndist\n.turbo\n.changeset/.cache\n",
    opts,
  );

  if (args.changesets) {
    writeFile(path.join(outRoot, ".changeset", "config.json"), changesetsConfig(), opts);
    writeFile(
      path.join(outRoot, ".changeset", "README.md"),
      "# Changesets\n\nRun `pnpm changeset` to describe a change before merging.\n",
      opts,
    );
  }

  // ----- design-tokens package -----
  writeFile(path.join(tokensPkgDir, "package.json"), tokensPackageJson(scope, version), opts);
  writeFile(path.join(tokensPkgDir, "tsconfig.json"), tokensTsconfig(), opts);
  writeFile(path.join(tokensPkgDir, "vite.config.ts"), tokensViteConfig(), opts);
  writeFile(path.join(tokensPkgDir, "README.md"), tokensReadme(scope), opts);
  writeFile(path.join(tokensPkgDir, "src", "tokens.ts"), tokensTs(lock), opts);
  writeFile(path.join(tokensPkgDir, "src", "tokens.css"), tokensCss(lock), opts);
  writeFile(
    path.join(tokensPkgDir, "src", "tokens.json"),
    JSON.stringify(lock, null, 2) + "\n",
    opts,
  );
  writeFile(path.join(tokensPkgDir, "src", "tailwind-preset.ts"), tailwindPreset(lock), opts);
  writeFile(path.join(tokensPkgDir, "src", "index.ts"), tokensIndexTs(), opts);
  writeFile(path.join(tokensPkgDir, "scripts", "postbuild.mjs"), tokensPostbuildScript(), opts);

  // ----- components package -----
  const componentNames = collectComponents(componentsDir, fwDesc.componentExt);
  writeFile(
    path.join(compPkgDir, "package.json"),
    componentsPackageJson(scope, version, framework, fwDesc, true),
    opts,
  );
  writeFile(path.join(compPkgDir, "tsconfig.json"), componentsTsconfig(framework), opts);
  if (fwDesc.bundler === "vite") {
    writeFile(path.join(compPkgDir, "vite.config.ts"), componentsViteConfig(framework), opts);
  }
  writeFile(
    path.join(compPkgDir, "README.md"),
    componentsReadme(scope, fwDesc, componentNames),
    opts,
  );
  writeFile(
    path.join(compPkgDir, "src", "theme", themeProviderFilename(framework)),
    themeProvider(framework, scope, true),
    opts,
  );
  writeFile(
    path.join(compPkgDir, "src", "index.ts"),
    buildBarrelIndex(framework, componentNames),
    opts,
  );

  // Copy components
  let copiedCount = 0;
  if (fs.existsSync(componentsDir)) {
    const filter = (filepath) => {
      const ext = path.extname(filepath);
      if (!fwDesc.componentExt.includes(ext)) return false;
      // Skip tests, stories, type defs
      if (/\.(test|spec|stories)\.[a-z]+$/.test(filepath)) return false;
      if (filepath.endsWith(".d.ts")) return false;
      return true;
    };
    copiedCount = copyDirRecursive(
      componentsDir,
      path.join(compPkgDir, "src", "components"),
      filter,
      opts,
    );
  }

  // ----- workspace README -----
  writeFile(
    path.join(outRoot, "README.md"),
    workspaceReadme({
      scope,
      framework,
      fwDesc,
      componentCount: componentNames.length,
      version,
    }),
    opts,
  );

  // ----- summary -----
  const summary = {
    status: "ok",
    framework,
    scope,
    output: outRoot,
    packages: [`${scope}/design-tokens`, `${scope}/${fwDesc.pkgSuffix}`],
    components: componentNames,
    componentsCopied: copiedCount,
    filesWritten: opts._written.length,
    dryRun: args.dryRun,
    bundler: fwDesc.bundler,
    nextSteps: [`cd ${path.relative(process.cwd(), outRoot) || "."}`, "pnpm install", "pnpm build"],
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    const tag = args.dryRun ? "[dry-run] " : "";
    process.stdout.write(`${tag}Exported ${fwDesc.label} design system to ${outRoot}\n`);
    process.stdout.write(`  Packages: ${summary.packages.join(", ")}\n`);
    process.stdout.write(`  Components: ${componentNames.length} (${copiedCount} files copied)\n`);
    process.stdout.write(`  Files written: ${opts._written.length}\n`);
    if (framework === "react-native") {
      process.stdout.write(`  Note: react-native uses \`tsc\` (Vite is not used for RN).\n`);
    }
    process.stdout.write(`\nNext: ${summary.nextSteps.join(" && ")}\n`);
  }
}

function collectComponents(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const names = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Look for an index file or same-named file inside
      const sub = path.join(dir, entry.name);
      const innerFiles = fs.readdirSync(sub);
      const hasComponent = innerFiles.some((f) => {
        const ext = path.extname(f);
        const base = path.basename(f, ext);
        return exts.includes(ext) && !/\.(test|spec|stories)$/.test(base) && !f.endsWith(".d.ts");
      });
      if (hasComponent) names.add(entry.name);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const base = path.basename(entry.name, ext);
      if (
        exts.includes(ext) &&
        !/\.(test|spec|stories)$/.test(base) &&
        base !== "index" &&
        !entry.name.endsWith(".d.ts")
      ) {
        names.add(base);
      }
    }
  }
  return Array.from(names).sort();
}

main();
