# Quickstart Guide

Get from zero to a running project in under 10 minutes.

---

## 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/PMDevSolutions/Aurelius.git
cd Aurelius

# Install pnpm if you do not have it
corepack enable
corepack prepare pnpm@latest --activate
```

> **Important:** This project uses pnpm exclusively. npm and yarn are not supported.

---

## 2. Create a New Project

The `setup-project.sh` script scaffolds a new application with all framework configs pre-applied:

```bash
# Next.js project
./scripts/setup-project.sh my-app --next

# Vite project (lighter, faster)
./scripts/setup-project.sh my-app --vite
```

This creates an `app/` directory (or the name you specified) with:
- TypeScript strict mode
- Tailwind CSS with design token structure
- ESLint + Prettier configured
- Vitest + React Testing Library ready
- Playwright for E2E (run `./scripts/setup-playwright.sh` once for browser engines)

```bash
cd my-app
pnpm install
pnpm dev
```

Your dev server is now running at `http://localhost:3000` (Next.js) or `http://localhost:5173` (Vite).

---

## 3. Verify Your Setup

Run the code quality scripts to confirm everything works:

```bash
# From your app directory
./scripts/lint-and-format.sh       # ESLint + Prettier
./scripts/check-types.sh           # TypeScript type checking
./scripts/run-tests.sh             # Vitest with coverage
./scripts/check-accessibility.sh   # WCAG 2.1 AA linting
```

All four should pass on a fresh project.

---

## 4. Build from a Design (Autonomous Pipelines)

Aurelius can convert designs into fully working, tested applications with a single command. Three pipelines are available:

### From Figma

```
/build-from-figma https://figma.com/file/abc123/My-Design
```

This runs a 10-phase autonomous pipeline:
1. **Token Sync** -- checks for drift if a lockfile exists
2. **Intake** -- discovers Figma structure, asks 3-5 questions, produces `build-spec.json`
3. **Token Lock** -- extracts design tokens into `design-tokens.lock.json`
4. **TDD (Hard Gate)** -- writes failing tests before any component code
5. **Build** -- generates React components that pass the tests
6. **Visual Diff** -- pixel-level comparison loop (up to 5 iterations, 2% threshold)
7. **E2E Tests** -- Playwright tests tailored to your app type
8. **Cross-Browser** -- Firefox/WebKit screenshot verification
9. **Quality Gate** -- coverage, TypeScript, build, tokens, Lighthouse
10. **Report** -- final build report with diff images and docs

### From Canva

```
/build-from-canva https://www.canva.com/design/DAGxyz.../My-Design
```

Same pipeline with AI-powered token inference (Canva does not expose raw tokens like Figma).

### From a Screenshot or URL

```
/build-from-screenshot https://example.com
/build-from-screenshot ./designs/homepage.png ./designs/about.png
```

Captures the page, analyzes it with vision, and builds a working app. Supports all output targets: React, Vue 3, Svelte, and React Native.

---

## 5. Using Claude Code Agents

When you work with Claude Code in this repository, **53 specialized agents** are available automatically. You do not need to invoke them manually -- Claude Code selects the right agent based on your task.

### Examples

```
User: "Build a hero component with a CTA button"
Claude: [Uses frontend-developer agent]

User: "Write tests for the auth hook"
Claude: [Uses test-writer-fixer agent]

User: "Check this page for accessibility issues"
Claude: [Uses accessibility-auditor agent]

User: "Optimize the bundle size"
Claude: [Uses bundle-analyzer agent]

User: "Create a PR for this feature"
Claude: [Uses commit-commands plugin: /commit-push-pr]
```

See the full [Architecture Overview](architecture.md) for the complete agent catalog.

---

## 6. Using Skills (Slash Commands)

Skills are invoked with slash commands. Key ones:

| Command | What It Does |
|---------|-------------|
| `/build-from-figma <URL>` | Full Figma-to-app pipeline |
| `/build-from-canva <URL>` | Full Canva-to-app pipeline |
| `/build-from-screenshot <URL>` | Full screenshot-to-app pipeline |
| `/commit` | Structured git commit |
| `/commit-push-pr` | Commit, push, and create PR |
| `/lint` | Run ESLint + Prettier |
| `/test` | Run test suite |

---

## 7. Code Quality Checklist

Before submitting any pull request, run these checks:

```bash
./scripts/lint-and-format.sh          # Linting and formatting
./scripts/run-tests.sh                # Unit and component tests
./scripts/check-types.sh              # TypeScript strict mode
./scripts/check-accessibility.sh      # WCAG 2.1 AA
./scripts/verify-tokens.sh            # No hardcoded design values
./scripts/check-security.sh           # Dependency vulnerabilities
```

All must pass. The [Contributing Guide](../../CONTRIBUTING.md) has details on branch naming, commit conventions, and the PR process.

---

## 8. Multi-Framework Output

By default, pipelines generate React components. To target a different framework, set `outputTarget` in `build-spec.json`:

| Target | Value | What You Get |
|--------|-------|-------------|
| React | `"react"` | React + TypeScript + Tailwind (Next.js or Vite) |
| Vue 3 | `"vue"` | Vue 3 + `<script setup>` + TypeScript + Tailwind |
| Svelte | `"svelte"` | SvelteKit + TypeScript + Tailwind |
| React Native | `"react-native"` | Expo + TypeScript + NativeWind |

The pipeline auto-detects the framework from `package.json` if `outputTarget` is not specified.

---

## 9. Project Structure at a Glance

```
Aurelius/
├── .claude/
│   ├── agents/              # 53 specialized agents
│   ├── skills/              # 19 development skills
│   ├── commands/            # Slash commands (/build-from-figma, /lint, /test)
│   ├── hooks/               # Hook scripts (8 automated hooks)
│   ├── pipeline.config.json # All pipeline thresholds and behavior
│   ├── CUSTOM-AGENTS-GUIDE.md
│   ├── PLUGINS-REFERENCE.md
│   └── settings.json        # Claude Code settings and hook config
├── scripts/                 # 30+ automation scripts
├── templates/               # Starter configs (Next.js, Vite, Vue, Svelte, Expo)
├── docs/                    # Documentation
│   ├── onboarding/          # You are here
│   ├── figma-to-react/
│   ├── canva-to-react/
│   ├── screenshot-to-app/
│   ├── multi-framework/
│   ├── react-development/
│   └── regression-testing/
├── CLAUDE.md                # Claude Code project instructions
├── CONTRIBUTING.md          # Contribution guide
└── README.md                # Project overview
```

---

## Next Steps

- Read the [Architecture Overview](architecture.md) to understand how agents, skills, and pipelines connect
- Explore [Pipeline Configuration](pipeline-configuration.md) if you need to customize thresholds
- Check the [Troubleshooting FAQ](troubleshooting.md) if you run into issues
