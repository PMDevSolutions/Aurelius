# Desktop GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/gui/` (`@aurelius/gui`), an Electron desktop app that drives Aurelius's existing scripts and Claude Code through four screens, plus the prerequisite script, CI lane, and docs the issue asks for.

**Architecture:** Fork Vespasian's manifest-driven GUI engine verbatim from the local clone, strip its Wix screen, and retarget it with one Aurelius `ProductManifest` and four bespoke React panels. Core stays pure Node (no Electron import) and is unit-tested headless; main bridges core to a typed IPC surface; the renderer only calls named bridge methods.

**Tech Stack:** Electron 39, electron-vite 5, electron-builder 26, React 18, TypeScript 5.9, ESLint 9 flat config, `node --test` + tsx, Playwright (Electron smoke), pnpm 9 workspace.

**Spec:** `docs/superpowers/specs/2026-09-12-desktop-gui-design.md`

## Global Constraints

- Fork source: `/home/paul/Repos/Vespasian/packages/gui` at commit `deb6c1c` (main). Dependency versions: Flavian's `packages/gui/package.json` (electron-vite `^5.0.0`, electron-builder `^26.15.3`, electron `^39.8.10`, playwright `1.60.0`, typescript-eslint `^8.67.0`, `@types/node ^22.20.1`, eslint `^9.39.5`, `@eslint/js ^9.39.5`, tsx `^4.23.12`).
- Package name `@aurelius/gui`, `engines.node >= 22.12.0`, bridge `window.aurelius`, IPC prefix `aurelius:`, appId `net.pmds.aurelius.gui`, productName `Aurelius`, settings file `aurelius-gui-settings.json`, env vars `AURELIUS_BASH` / `AURELIUS_DEBUG`.
- Root Prettier config applies (double quotes, width 100): after every task run `npx -y pnpm@9 prettier --write packages/gui` before committing. Root ESLint only lints `.js/.mjs/.cjs`; the GUI's own `eslint.config.mjs` lints TypeScript.
- Local pnpm is v11; run every pnpm command as `CI=true npx -y pnpm@9 …` to match CI (pnpm 9).
- Screens and step ids exactly as in the spec table: `prereq`(check, playwright), `wizard`(create), `pipeline`(figma), `qa`(baselines, regression, responsive, dark-mode, cross-browser).
- Frameworks for the wizard, in this order: `nextjs` Next.js, `vite` Vite, `astro` Astro, `sveltekit` SvelteKit, `expo` Expo.
- Artifact reads are sandboxed to `.claude/visual-qa/`.
- Documented script count moves 55 → 56 (CLAUDE.md line 637 only).
- Commit after every task with a conventional message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

Created (new, written from scratch):

| File | Responsibility |
| --- | --- |
| `scripts/check-prerequisites.sh` | Prints the sibling-format prerequisite report; exit 0/1/2 |
| `scripts/__tests__/check-prerequisites.test.js` | Vitest: format contract of the script |
| `packages/gui/src/shared/product/aurelius.ts` | The Aurelius ProductManifest (pure data) |
| `packages/gui/tests/fixtures/prereq-{all-pass,with-failures,with-skips}.txt` | Real-format transcripts of the new script |
| `packages/gui/src/renderer/hooks/useStep.ts` | Generic run-a-manifest-step hook (QA buttons, Playwright installer) |
| `.github/workflows/gui.yml` | Lint → typecheck → test, plus Xvfb smoke |
| `docs/GUI.md`, `packages/gui/docs/GUI-PLATFORM.md` | User + platform docs |

Forked then rewritten (content replaced):

| File | Responsibility |
| --- | --- |
| `src/shared/product/manifest.ts` | Drop `site` ScreenId + `module` descriptor; add `extras.frameworks` |
| `src/shared/product/index.ts` | Registry → aurelius; drop `initModuleDir` |
| `src/shared/types/{task,init,pipeline,qa,ipc,prerequisites}.ts`, `ipc-channels.ts` | Aurelius vocabulary |
| `src/core/init/init-flags.ts` | `InitInput` → command vars for `setup-project.sh` |
| `src/core/product/command-spec.ts` | `fillTemplate` drops empty placeholder-only parts |
| `src/core/qa/discover.ts` | Discover `.claude/visual-qa` reports + PNG galleries |
| `src/core/fs/read-artifact.ts` | Allowlist `.claude/visual-qa` |
| `src/core/prerequisites/{prereq-parser,prereq-metadata}.ts` | Aurelius groups + guidance |
| `src/core/pipelines/pipeline-run.ts` | Figma only |
| `src/main/ipc/register-handlers.ts`, `src/preload/index.ts` | `runStep`, bash wizard, no site |
| `src/renderer/App.tsx`, `components/{Prereq,Wizard,Pipeline,Qa}Panel.tsx`, `ProjectGate.tsx`, `hooks/useInit.ts` | Aurelius screens |
| `tests/**` | Adapted per task |

Deleted from the fork: `src/core/wix/`, `src/core/project/list-plans.ts`, `src/core/init/run-init.ts`, `src/shared/types/site.ts`, `src/shared/product/vespasian.ts`, `src/renderer/components/SitePanel.tsx`, `tests/core/wix/`, `tests/core/project/list-plans.test.mts`.

---

### Task 1: `scripts/check-prerequisites.sh`

**Files:**
- Create: `scripts/check-prerequisites.sh`
- Create: `scripts/__tests__/check-prerequisites.test.js`
- Modify: `scripts/README.md` (after the "Setup Playwright" entry), `CLAUDE.md:637` (55 → 56 scripts)

**Interfaces:**
- Produces: a bash script whose stdout follows the contract the GUI parser reads: section headers (`REQUIRED SOFTWARE`, `REQUIRED ACCOUNTS`, `OPTIONAL SOFTWARE`, `SYSTEM REQUIREMENTS`, each underlined with dashes), status lines `[PASS] …`, `[FAIL] …`, `[SKIP] …`, `[WARN] …`, `[INFO] …`, indented hint lines (7 spaces), a `=== Summary ===` block with `Required: n/m passed`, `Optional: n/m installed`, `System: n/m passed`, then `Ready to use Aurelius: YES|NO`. Exit 0 = ready, 1 = required missing, 2 = script error.

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/check-prerequisites.test.js
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "check-prerequisites.sh");

function run(env = {}) {
  const r = spawnSync("bash", [SCRIPT], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

describe("check-prerequisites.sh", () => {
  it("prints the sectioned [STATUS] report the GUI parser expects", () => {
    const { code, out } = run();
    expect([0, 1]).toContain(code);
    for (const header of [
      "REQUIRED SOFTWARE",
      "REQUIRED ACCOUNTS",
      "OPTIONAL SOFTWARE",
      "SYSTEM REQUIREMENTS",
    ]) {
      expect(out).toMatch(new RegExp(`^${header}\\n-+$`, "m"));
    }
    expect(out).toMatch(/^\[PASS\] Git \d+\.\d+/m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] Node\.js /m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] pnpm /m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] Claude Code/m);
    expect(out).toMatch(/^\[INFO\] Figma Dev Mode/m);
    expect(out).toMatch(/^\[(PASS|SKIP|WARN)\] Playwright/m);
    expect(out).toMatch(/^=== Summary ===$/m);
    expect(out).toMatch(/^Required: \d+\/\d+ passed$/m);
    expect(out).toMatch(/^Optional: \d+\/\d+ installed$/m);
    expect(out).toMatch(/^System:\s+\d+\/\d+ passed$/m);
    expect(out).toMatch(/^Ready to use Aurelius: (YES|NO)$/m);
  });

  it("exit code agrees with the readiness line", () => {
    const { code, out } = run();
    const ready = /Ready to use Aurelius: YES/.test(out);
    expect(code).toBe(ready ? 0 : 1);
  });

  it("reports a missing required tool as [FAIL] with an install hint and exits 1", () => {
    // Hide every tool by pointing PATH at an empty dir; bash itself is invoked by absolute path.
    const { code, out } = run({ PATH: "/nonexistent-empty-dir" });
    expect(code).toBe(1);
    expect(out).toMatch(/^\[FAIL\] Git not installed$/m);
    expect(out).toMatch(/^ {7}Install: https:\/\/git-scm\.com/m);
    expect(out).toMatch(/^\[FAIL\] Node\.js not installed$/m);
    expect(out).toMatch(/Ready to use Aurelius: NO/);
  });

  it("does not emit ANSI escapes when NO_COLOR is set", () => {
    const { out } = run();
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx -y pnpm@9 vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/check-prerequisites.test.js`
Expected: FAIL (script not found, exit code null).

- [ ] **Step 3: Write the script**

```bash
#!/bin/bash
#
# Prerequisites Verification Script
# Checks the tools needed to work with Aurelius and its desktop GUI.
#
# Required:  git, Node.js 22.12+, pnpm 9+, Claude Code
# Optional:  GitHub CLI, jq, Playwright browsers
#
# Output format is shared with the Flavian/Vespasian GUIs: sectioned
# [PASS]/[FAIL]/[SKIP]/[WARN]/[INFO] lines, a summary block, and a readiness line.
#
# Usage: ./scripts/check-prerequisites.sh
#
# Exit Codes:
#   0 - All required prerequisites met
#   1 - One or more required prerequisites missing
#   2 - Script execution error
#

set -u

# Colors (disabled when NO_COLOR is set or stdout is not a TTY)
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then
    RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; NC=''
else
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
fi

REQUIRED_PASS=0
REQUIRED_FAIL=0
OPTIONAL_PASS=0
OPTIONAL_SKIP=0
SYSTEM_PASS=0
SYSTEM_FAIL=0
WARNINGS=0

MIN_GIT_VERSION="2.30.0"
MIN_NODE_VERSION="22.12.0"
MIN_PNPM_MAJOR=9
MIN_RAM_GB=4
MIN_DISK_GB=5

print_header() {
    echo ""
    echo -e "${CYAN}$1${NC}"
    echo "$(echo "$1" | sed 's/./-/g')"
}
print_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
print_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
print_skip() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# Returns 0 if $1 >= $2 (dotted versions)
version_gte() {
    local v1 v2
    v1=$(echo "$1" | sed 's/[^0-9.]//g')
    v2=$(echo "$2" | sed 's/[^0-9.]//g')
    [ "$(printf '%s\n' "$v2" "$v1" | sort -V | head -n1)" = "$v2" ]
}

extract_version() {
    grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1
}

check_git() {
    if command -v git &> /dev/null; then
        local version
        version=$(git --version 2>&1 | extract_version)
        if [ -n "$version" ] && version_gte "$version" "$MIN_GIT_VERSION"; then
            print_pass "Git $version (minimum: $MIN_GIT_VERSION)"
            ((REQUIRED_PASS++)); return 0
        fi
        print_fail "Git $version (minimum: $MIN_GIT_VERSION required)"
        ((REQUIRED_FAIL++)); return 1
    fi
    print_fail "Git not installed"
    echo "       Install: https://git-scm.com/downloads"
    ((REQUIRED_FAIL++)); return 1
}

check_node() {
    if command -v node &> /dev/null; then
        local version
        version=$(node --version 2>&1 | extract_version)
        if [ -n "$version" ] && version_gte "$version" "$MIN_NODE_VERSION"; then
            print_pass "Node.js $version (minimum: $MIN_NODE_VERSION)"
            ((REQUIRED_PASS++)); return 0
        fi
        print_fail "Node.js $version (minimum: $MIN_NODE_VERSION required)"
        echo "       Install: https://nodejs.org/ (or use nvm/fnm)"
        ((REQUIRED_FAIL++)); return 1
    fi
    print_fail "Node.js not installed"
    echo "       Install: https://nodejs.org/"
    ((REQUIRED_FAIL++)); return 1
}

check_pnpm() {
    if command -v pnpm &> /dev/null; then
        local version major
        version=$(pnpm --version 2>&1 | extract_version)
        major=$(echo "$version" | cut -d. -f1)
        if [ -n "$major" ] && [ "$major" -ge "$MIN_PNPM_MAJOR" ]; then
            print_pass "pnpm $version (major >= $MIN_PNPM_MAJOR)"
            ((REQUIRED_PASS++)); return 0
        fi
        print_fail "pnpm $version (${MIN_PNPM_MAJOR}.x or newer required)"
        echo "       Fix: corepack enable && corepack prepare pnpm@9 --activate"
        ((REQUIRED_FAIL++)); return 1
    fi
    print_fail "pnpm not installed"
    echo "       Install: corepack enable && corepack prepare pnpm@9 --activate"
    ((REQUIRED_FAIL++)); return 1
}

check_claude() {
    if command -v claude &> /dev/null; then
        local version
        version=$(claude --version 2>&1 | extract_version)
        if [ -n "$version" ]; then
            print_pass "Claude Code $version"
        else
            print_pass "Claude Code installed"
        fi
        ((REQUIRED_PASS++)); return 0
    fi
    print_fail "Claude Code not installed"
    echo "       Install: npm install -g @anthropic-ai/claude-code"
    echo "       Or visit: https://claude.ai/code"
    ((REQUIRED_FAIL++)); return 1
}

check_gh() {
    if command -v gh &> /dev/null; then
        local version
        version=$(gh --version 2>&1 | extract_version)
        if [ -n "$version" ]; then
            if gh auth status &> /dev/null; then
                print_pass "GitHub CLI $version (authenticated)"
            else
                print_pass "GitHub CLI $version (not authenticated)"
                echo "       Run 'gh auth login' to authenticate"
            fi
            ((OPTIONAL_PASS++)); return 0
        fi
    fi
    print_skip "GitHub CLI not installed"
    echo "       Install: https://cli.github.com/"
    ((OPTIONAL_SKIP++)); return 0
}

check_jq() {
    if command -v jq &> /dev/null; then
        local version
        version=$(jq --version 2>&1 | extract_version)
        print_pass "jq ${version:-installed} (used by hook scripts)"
        ((OPTIONAL_PASS++)); return 0
    fi
    print_skip "jq not installed (hook scripts use it)"
    echo "       Install: https://jqlang.github.io/jq/ (brew install jq / apt install jq)"
    ((OPTIONAL_SKIP++)); return 0
}

check_playwright() {
    if ! command -v node &> /dev/null; then
        print_skip "Playwright check skipped (Node.js missing)"
        ((OPTIONAL_SKIP++)); return 0
    fi
    local cache_dirs=("$HOME/Library/Caches/ms-playwright" "$HOME/.cache/ms-playwright" "${LOCALAPPDATA:-}/ms-playwright")
    local found=false
    for d in "${cache_dirs[@]}"; do
        if [ -n "$d" ] && [ -d "$d" ] && ls "$d" 2>/dev/null | grep -q "chromium"; then
            found=true; break
        fi
    done
    if $found; then
        print_pass "Playwright Chromium browser installed"
        ((OPTIONAL_PASS++))
    else
        print_warn "Playwright browsers missing — run: ./scripts/setup-playwright.sh"
        ((OPTIONAL_SKIP++)); ((WARNINGS++))
    fi
    return 0
}

check_ram() {
    local ram_kb=0 ram_gb=0
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        ram_gb=$((ram_kb / 1024 / 1024))
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        ram_gb=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "${WINDIR:-}" ]]; then
        ram_kb=$(wmic OS get TotalVisibleMemorySize 2>/dev/null | grep -E '^[0-9]+' | head -1 | tr -d ' \r')
        [ -n "$ram_kb" ] && ram_gb=$((ram_kb / 1024 / 1024)) || ram_gb=$MIN_RAM_GB
    fi
    if [ "$ram_gb" -ge "$MIN_RAM_GB" ]; then
        print_pass "RAM: ${ram_gb} GB (minimum: ${MIN_RAM_GB} GB)"; ((SYSTEM_PASS++)); return 0
    elif [ "$ram_gb" -gt 0 ]; then
        print_fail "RAM: ${ram_gb} GB (minimum: ${MIN_RAM_GB} GB required)"; ((SYSTEM_FAIL++)); return 1
    fi
    print_info "RAM: Could not detect (minimum: ${MIN_RAM_GB} GB)"; ((SYSTEM_PASS++)); return 0
}

check_disk() {
    local disk_free_gb=0 disk_free_kb
    disk_free_kb=$(df -k . 2>/dev/null | tail -1 | awk '{print $4}')
    [ -n "$disk_free_kb" ] && disk_free_gb=$((disk_free_kb / 1024 / 1024))
    if [ "$disk_free_gb" -ge "$MIN_DISK_GB" ]; then
        print_pass "Disk: ${disk_free_gb} GB free (minimum: ${MIN_DISK_GB} GB)"; ((SYSTEM_PASS++)); return 0
    elif [ "$disk_free_gb" -gt 0 ]; then
        print_fail "Disk: ${disk_free_gb} GB free (minimum: ${MIN_DISK_GB} GB required)"; ((SYSTEM_FAIL++)); return 1
    fi
    print_info "Disk: Could not detect (minimum: ${MIN_DISK_GB} GB)"; ((SYSTEM_PASS++)); return 0
}

check_os() {
    local os_name="" supported=false
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        os_name=$( (grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"') || echo Linux)
        [ -z "$os_name" ] && os_name="Linux"
        supported=true
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        os_name="macOS $(sw_vers -productVersion 2>/dev/null)"; supported=true
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "${WINDIR:-}" ]]; then
        os_name="Windows"; supported=true
    else
        os_name="Unknown ($OSTYPE)"
    fi
    if [ "$supported" = true ]; then
        print_pass "OS: $os_name (supported)"; ((SYSTEM_PASS++)); return 0
    fi
    print_fail "OS: $os_name (may not be fully supported)"; ((SYSTEM_FAIL++)); return 1
}

main() {
    echo ""
    echo -e "${CYAN}=== Aurelius Prerequisites Check ===${NC}"

    print_header "REQUIRED SOFTWARE"
    check_git
    check_node
    check_pnpm
    check_claude

    print_header "REQUIRED ACCOUNTS"
    print_info "Figma Dev Mode (for the Figma pipeline) - Manual verification required"
    echo "       Open Figma > Press Shift+D > Dev Mode panel should appear"
    check_gh

    print_header "OPTIONAL SOFTWARE"
    check_jq
    check_playwright

    print_header "SYSTEM REQUIREMENTS"
    check_ram
    check_disk
    check_os

    echo ""
    echo -e "${CYAN}=== Summary ===${NC}"
    echo "Required: $REQUIRED_PASS/$((REQUIRED_PASS + REQUIRED_FAIL)) passed"
    echo "Optional: $OPTIONAL_PASS/$((OPTIONAL_PASS + OPTIONAL_SKIP)) installed"
    echo "System:   $SYSTEM_PASS/$((SYSTEM_PASS + SYSTEM_FAIL)) passed"
    [ "$WARNINGS" -gt 0 ] && echo "Warnings: $WARNINGS (see above — none are blocking)"
    echo ""

    if [ "$REQUIRED_FAIL" -eq 0 ] && [ "$SYSTEM_FAIL" -eq 0 ]; then
        echo -e "${GREEN}Ready to use Aurelius: YES${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Install dependencies:  pnpm install"
        echo "  2. Create a project:      ./scripts/setup-project.sh my-app --vite"
        echo "  3. Open Claude Code:      claude"
        echo ""
        exit 0
    fi
    echo -e "${RED}Ready to use Aurelius: NO${NC}"
    echo ""
    echo "Please install missing requirements above, then run this script again."
    echo ""
    echo "Documentation: docs/onboarding/README.md#prerequisites"
    echo ""
    exit 1
}

main "$@"
```

`chmod +x scripts/check-prerequisites.sh`.

- [ ] **Step 4: Run the test to verify it passes**

Run the same vitest command. Expected: 4 passed. Also `bash -n scripts/check-prerequisites.sh`.

- [ ] **Step 5: Docs + counts**

Add to `scripts/README.md` after the Setup Playwright entry:

```markdown
### Check Prerequisites (`check-prerequisites.sh`)
- **Purpose**: Verify Git, Node 22.12+, pnpm 9+, Claude Code, and optional tools (GitHub CLI, jq, Playwright browsers); also drives the desktop GUI's Prerequisites screen
- **Usage**: `./scripts/check-prerequisites.sh` (exit 0 ready, 1 missing requirements, 2 error)
```

In `CLAUDE.md` line 637 change `55 scripts` to `56 scripts`.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-prerequisites.sh scripts/__tests__/check-prerequisites.test.js scripts/README.md CLAUDE.md
git commit -m "feat(scripts): add check-prerequisites.sh (GUI-compatible report format)"
```

---

### Task 2: Fork the engine, strip Wix, rename identity, wire the workspace

**Files:**
- Create: `packages/gui/**` (copied from `/home/paul/Repos/Vespasian/packages/gui`)
- Modify: `package.json` (root scripts), `.gitignore` (nothing needed — `out/`/`dist/` are ignored inside the package)

**Interfaces:**
- Produces: a `packages/gui` tree with no `vespasian`/`Vespasian`/`VESPASIAN`/`wix`/`Wix` identifiers, Flavian's dependency versions, and root `gui:*` scripts. Type-checking is NOT expected to pass yet (Tasks 3–6 finish the retarget).

- [ ] **Step 1: Copy and delete**

```bash
cp -r /home/paul/Repos/Vespasian/packages/gui packages/gui
rm -rf packages/gui/node_modules packages/gui/out packages/gui/dist
rm -rf packages/gui/src/core/wix packages/gui/tests/core/wix
rm packages/gui/src/core/project/list-plans.ts packages/gui/tests/core/project/list-plans.test.mts
rm packages/gui/src/core/init/run-init.ts
rm packages/gui/src/shared/types/site.ts
rm packages/gui/src/shared/product/vespasian.ts
rm packages/gui/src/renderer/components/SitePanel.tsx
rm packages/gui/docs/GUI-PLATFORM.md   # rewritten in Task 8
```

- [ ] **Step 2: Rename identity everywhere**

```bash
cd packages/gui
grep -rl --exclude-dir=node_modules 'vespasian\|Vespasian\|VESPASIAN' . | xargs sed -i \
  -e 's/VESPASIAN_/AURELIUS_/g' \
  -e 's/@vespasian\/gui/@aurelius\/gui/g' \
  -e 's/vespasian:/aurelius:/g' \
  -e 's/window\.vespasian/window.aurelius/g' \
  -e "s/exposeInMainWorld('vespasian'/exposeInMainWorld('aurelius'/g" \
  -e 's/VespasianBridge/AureliusBridge/g' \
  -e 's/vespasianManifest/aureliusManifest/g' \
  -e "s/'\.\/vespasian'/'.\/aurelius'/g" \
  -e 's/vespasian-gui-settings/aurelius-gui-settings/g' \
  -e 's/net\.pmds\.vespasian\.gui/net.pmds.aurelius.gui/g' \
  -e 's/Vespasian/Aurelius/g' -e 's/vespasian/aurelius/g'
grep -rn -i 'vespasian\|wix' --exclude-dir=node_modules . ; # must print nothing except doc prose you will rewrite in later tasks
```

Then hand-fix prose that the sed made nonsensical but is replaced anyway in later tasks (panels, manifest tests). It is fine for those files to be temporarily wrong; they are rewritten.

- [ ] **Step 3: package.json**

Replace `packages/gui/package.json` with:

```json
{
  "name": "@aurelius/gui",
  "version": "2.0.0",
  "private": true,
  "description": "Desktop GUI for Aurelius — a thin orchestration shell over the setup wizard, the Figma-to-React pipeline, and the visual-QA scripts. Invokes the existing scripts and Claude Code; does not reimplement them.",
  "license": "MIT",
  "author": "PMDevSolutions",
  "main": "./out/main/index.js",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "start": "electron-vite preview",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "lint": "eslint .",
    "test": "node --import tsx --test \"tests/**/*.test.mts\"",
    "smoke": "node tests/smoke/smoke.mjs",
    "package": "electron-vite build && electron-builder"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.5",
    "@types/node": "^22.20.1",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.7.0",
    "electron": "^39.8.10",
    "electron-builder": "^26.15.3",
    "electron-vite": "^5.0.0",
    "eslint": "^9.39.5",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.1.1",
    "playwright": "1.60.0",
    "tsx": "^4.23.12",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.67.0",
    "vite": "^6.4.3"
  }
}
```

`electron-builder.yml`: replace the header comment with the Aurelius equivalent (the GUI operates on an Aurelius checkout on disk, writing scaffolded apps and `.claude/visual-qa/` artifacts); keep `appId: net.pmds.aurelius.gui`, `productName: Aurelius`, and the rest verbatim.

- [ ] **Step 4: Root wiring**

Add to root `package.json` `scripts` (after `"new-app"`):

```json
"gui:dev": "pnpm --filter @aurelius/gui dev",
"gui:build": "pnpm --filter @aurelius/gui build",
"gui:test": "pnpm --filter @aurelius/gui test",
"gui:lint": "pnpm --filter @aurelius/gui lint",
"gui:typecheck": "pnpm --filter @aurelius/gui typecheck",
"gui:package": "pnpm --filter @aurelius/gui package"
```

Run: `CI=true npx -y pnpm@9 install` (updates `pnpm-lock.yaml`; Electron downloads its binary). Expected: success, `packages/gui/node_modules/.bin/electron-vite` exists.

- [ ] **Step 5: Format with the root Prettier config**

Run: `CI=true npx -y pnpm@9 prettier --write packages/gui` then `CI=true npx -y pnpm@9 prettier --check .` Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/gui package.json pnpm-lock.yaml
git commit -m "feat(gui): fork the Vespasian desktop GUI engine as @aurelius/gui"
```

---

### Task 3: Shared layer — manifest type, Aurelius manifest, vocabulary types, IPC contract

**Files:**
- Rewrite: `packages/gui/src/shared/product/manifest.ts`, `index.ts`; create `aurelius.ts`
- Rewrite: `packages/gui/src/shared/types/task.ts`, `init.ts`, `pipeline.ts`, `qa.ts`, `ipc.ts`, `prerequisites.ts`; `packages/gui/src/shared/ipc-channels.ts`
- Test: `packages/gui/tests/shared/product/manifest.test.mts`

**Interfaces:**
- Produces (used by every later task):
  - `ScreenId = 'prereq' | 'wizard' | 'pipeline' | 'qa' | (string & {})`
  - `CommandDescriptor` without `module`; `ScreenExtras.frameworks?: readonly { id: string; label: string }[]`
  - `aureliusManifest: ProductManifest`; `PRODUCTS`, `ACTIVE_PRODUCT_ID = 'aurelius'`, `activeManifest`, `getScreen`, `getStep`, `soleStep` (no `initModuleDir`)
  - `TaskKind`: `'prereq-check' | 'prereq:playwright' | 'init' | 'pipeline:figma' | 'qa:baselines' | 'qa:regression' | 'qa:responsive' | 'qa:dark-mode' | 'qa:cross-browser' | (string & {})`
  - `InitInput { name: string; renderer: string; preview: boolean }`, `InitResult { ok: boolean; projectName: string; renderer: string; preview: boolean; error?: string }`
  - `PipelineKind = 'figma'`, `PipelineInput { kind: 'figma'; figmaUrl: string }`, `PipelineResult { ok; kind; error? }`
  - `QaStepId = 'baselines' | 'regression' | 'responsive' | 'dark-mode' | 'cross-browser'`
  - `QaArtifacts { reports: { title: string; relPath: string }[]; galleries: { title: string; images: string[] }[] }`
  - `PrereqGroup` without `'wix-credentials'`
  - `AureliusBridge` with `runStep(screenId: ScreenId, stepId: string, vars?: Record<string,string>): Promise<{ taskId: string }>` and no `runSite/getSiteStatus/listPlans/runQa`
  - `IPC.stepRun = 'aurelius:step:run'`

- [ ] **Step 1: Write the failing manifest test**

Replace `tests/shared/product/manifest.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ACTIVE_PRODUCT_ID,
  PRODUCTS,
  activeManifest,
  getScreen,
  getStep,
  soleStep,
} from '../../../src/shared/product';
import { aureliusManifest } from '../../../src/shared/product/aurelius';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');

test('the active product is Aurelius', () => {
  assert.equal(ACTIVE_PRODUCT_ID, 'aurelius');
  assert.equal(activeManifest, PRODUCTS.aurelius);
  assert.equal(activeManifest.displayName, 'Aurelius');
});

test('Aurelius exposes the four screens, in order, with their nav labels', () => {
  assert.deepEqual(
    aureliusManifest.screens.map((s) => s.id),
    ['prereq', 'wizard', 'pipeline', 'qa'],
  );
  assert.deepEqual(
    aureliusManifest.screens.map((s) => s.navLabel),
    ['Prerequisites', 'Setup wizard', 'Build from Figma', 'Visual QA'],
  );
});

test('prereq screen: check (parsed, exit 0|1 ok) + Playwright installer', () => {
  const prereq = getScreen(aureliusManifest, 'prereq');
  assert.deepEqual(prereq.steps.map((s) => s.id), ['check', 'playwright']);
  const check = soleStep(aureliusManifest, 'prereq');
  assert.equal(check.parser, 'prereq');
  assert.deepEqual(check.successExitCodes, [0, 1]);
  assert.equal(check.taskKind, 'prereq-check');
  assert.equal(getStep(prereq, 'playwright').taskKind, 'prereq:playwright');
});

test('wizard runs setup-project.sh with name/renderer/dryRun placeholders', () => {
  const create = soleStep(aureliusManifest, 'wizard');
  assert.equal(create.taskKind, 'init');
  assert.equal(create.command.exec, 'bashScript');
  if (create.command.exec === 'bashScript') {
    assert.equal(create.command.script, 'scripts/setup-project.sh');
    assert.deepEqual(create.command.argsTemplate, ['{name}', '--renderer', '{renderer}', '{dryRun}']);
  }
  assert.deepEqual(
    getScreen(aureliusManifest, 'wizard').extras?.frameworks?.map((f) => f.id),
    ['nextjs', 'vite', 'astro', 'sveltekit', 'expo'],
  );
});

test('pipeline screen drives /build-from-figma through headless Claude Code', () => {
  const figma = getStep(getScreen(aureliusManifest, 'pipeline'), 'figma');
  assert.equal(figma.taskKind, 'pipeline:figma');
  assert.equal(figma.command.exec, 'claude');
  if (figma.command.exec === 'claude') {
    assert.deepEqual(figma.command.argsTemplate, ['-p', '/build-from-figma {figmaUrl}']);
  }
  assert.equal(getScreen(aureliusManifest, 'pipeline').extras?.docs?.figma, 'docs/figma-to-react/README.md');
});

test('qa screen lists the five visual-QA scripts with a {url} argument', () => {
  const qa = getScreen(aureliusManifest, 'qa');
  assert.deepEqual(qa.steps.map((s) => s.id), [
    'baselines',
    'regression',
    'responsive',
    'dark-mode',
    'cross-browser',
  ]);
  for (const step of qa.steps) {
    assert.equal(step.command.exec, 'bashScript');
    assert.equal(step.taskKind, `qa:${step.id}`);
    if (step.command.exec === 'bashScript') {
      assert.ok(step.command.argsTemplate?.includes('{url}'), `${step.id} takes {url}`);
    }
  }
});

test('every bashScript step points at a script that exists in this repo', async () => {
  for (const screen of aureliusManifest.screens) {
    for (const step of screen.steps) {
      if (step.command.exec !== 'bashScript') continue;
      await assert.doesNotReject(
        () => access(join(repoRoot, ...step.command.script.split('/'))),
        `${screen.id}/${step.id}: ${step.command.script} missing`,
      );
    }
  }
});

test('project identity carries the Aurelius checkout markers', () => {
  assert.deepEqual(aureliusManifest.project.markers, [
    'scripts/setup-project.sh',
    '.claude/pipeline.config.json',
  ]);
  assert.equal(aureliusManifest.project.packageName, 'aurelius');
  assert.match(aureliusManifest.project.selectTitle, /Aurelius/);
});

test('selectors throw on unknown ids', () => {
  assert.throws(() => getScreen(aureliusManifest, 'site'));
  assert.throws(() => getStep(getScreen(aureliusManifest, 'qa'), 'nope'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/gui && node --import tsx --test tests/shared/product/manifest.test.mts` Expected: fails to import `./aurelius` / type errors.

- [ ] **Step 3: manifest.ts**

Edit `src/shared/product/manifest.ts`:
- `ProductId = 'aurelius' | 'vespasian' | 'flavian' | 'nerva' | (string & {})`
- `ScreenId = 'prereq' | 'wizard' | 'pipeline' | 'qa' | (string & {})`
- Remove the `module` member from `CommandDescriptor` (and its doc line).
- `ScreenExtras` becomes:

```ts
export interface ScreenExtras {
  /** Any screen: external links (docs sites, dashboards, …). */
  readonly links?: readonly { readonly label: string; readonly url: string }[];
  /** Pipeline screen: per-kind reference docs (repo-relative). */
  readonly docs?: Readonly<Record<string, string>>;
  /** Wizard screen: the framework choices offered, in display order. */
  readonly frameworks?: readonly { readonly id: string; readonly label: string }[];
}
```

Update the header comment to name Aurelius and reference `./aurelius`.

- [ ] **Step 4: aurelius.ts**

```ts
/**
 * The Aurelius product manifest — the single declarative catalog of everything
 * product-specific the GUI shows and runs. Aurelius turns designs into tested
 * React/Vue/Svelte/Expo apps, so the catalog is: a prerequisite check, the
 * project scaffolder (`scripts/setup-project.sh`), the autonomous Figma pipeline
 * (the `/build-from-figma` slash command run through headless Claude Code), and
 * the visual-QA scripts under `scripts/`. Changing the app's catalog means editing
 * this object; the engine is untouched.
 *
 * Command notes:
 *   - prereq runs `bash scripts/check-prerequisites.sh`; exit 0 OR 1 is task-success.
 *   - wizard runs `bash scripts/setup-project.sh <name> --renderer <id> [--dry-run]`;
 *     `{dryRun}` is either '--dry-run' or '' (an empty placeholder-only arg is dropped).
 *   - pipeline: `claude -p "/build-from-figma <url>"` — the same slash command a
 *     terminal user would type; Claude Code runs phases 0–9 autonomously.
 *   - qa steps each take the running app's URL as `{url}` and write their artifacts
 *     under `.claude/visual-qa/`, which the QA screen then renders.
 */
import type { ProductManifest, ProductStep } from './manifest';

const project = { kind: 'project' } as const;

/** Helper to keep QA step ids honestly typed and `taskKind` derived from the id. */
const qa = (id: string, label: string, cta: string, script: string, argsTemplate: readonly string[]): ProductStep => ({
  id,
  label,
  cta,
  taskKind: `qa:${id}`,
  command: { exec: 'bashScript', script, argsTemplate },
  prerequisites: [project],
});

export const aureliusManifest: ProductManifest = {
  id: 'aurelius',
  displayName: 'Aurelius',

  project: {
    markers: ['scripts/setup-project.sh', '.claude/pipeline.config.json'],
    packageName: 'aurelius',
    invalidReason:
      'Not an Aurelius project — expected scripts/setup-project.sh, .claude/pipeline.config.json, and a package.json named "aurelius".',
    notFoundReason: 'No Aurelius project found while walking up from the start directory.',
    selectTitle: 'Select your Aurelius project folder',
    selectMessage: 'Choose the directory that contains scripts/ and .claude/pipeline.config.json.',
  },

  screens: [
    {
      id: 'prereq',
      navLabel: 'Prerequisites',
      title: 'Prerequisites',
      prerequisites: [project],
      steps: [
        {
          id: 'check',
          label: 'Re-check',
          taskKind: 'prereq-check',
          command: { exec: 'bashScript', script: 'scripts/check-prerequisites.sh' },
          parser: 'prereq',
          // Exit 1 ("requirements missing") is a valid result, not a task failure.
          successExitCodes: [0, 1],
          prerequisites: [project],
        },
        {
          id: 'playwright',
          label: 'Install Playwright browsers',
          cta: 'Install Playwright browsers',
          taskKind: 'prereq:playwright',
          command: { exec: 'bashScript', script: 'scripts/setup-playwright.sh' },
          prerequisites: [project],
        },
      ],
    },

    {
      id: 'wizard',
      navLabel: 'Setup wizard',
      title: 'Setup wizard',
      prerequisites: [project],
      extras: {
        frameworks: [
          { id: 'nextjs', label: 'Next.js' },
          { id: 'vite', label: 'Vite' },
          { id: 'astro', label: 'Astro' },
          { id: 'sveltekit', label: 'SvelteKit' },
          { id: 'expo', label: 'Expo' },
        ],
      },
      steps: [
        {
          id: 'create',
          label: 'Create project',
          cta: 'Create project',
          taskKind: 'init',
          command: {
            exec: 'bashScript',
            script: 'scripts/setup-project.sh',
            argsTemplate: ['{name}', '--renderer', '{renderer}', '{dryRun}'],
          },
          prerequisites: [project],
        },
      ],
    },

    {
      id: 'pipeline',
      navLabel: 'Build from Figma',
      title: 'Build from Figma',
      prerequisites: [project],
      extras: {
        docs: { figma: 'docs/figma-to-react/README.md' },
        links: [{ label: 'Figma Dev Mode', url: 'https://help.figma.com/hc/en-us/articles/15023124644247' }],
      },
      steps: [
        {
          id: 'figma',
          label: 'Figma',
          cta: 'Build app',
          taskKind: 'pipeline:figma',
          command: { exec: 'claude', argsTemplate: ['-p', '/build-from-figma {figmaUrl}'] },
          prerequisites: [
            project,
            {
              kind: 'tool',
              tool: 'claude',
              hint: 'Runs the /build-from-figma pipeline in a headless Claude Code session with Figma MCP access.',
            },
          ],
        },
      ],
    },

    {
      id: 'qa',
      navLabel: 'Visual QA',
      title: 'Visual QA',
      prerequisites: [project],
      steps: [
        qa('baselines', 'Capture baselines', 'Capture baselines', 'scripts/capture-baselines.sh', ['{url}']),
        qa('regression', 'Pixel-diff regression', 'Run regression', 'scripts/regression-test.sh', ['{url}']),
        qa('responsive', 'Responsive screenshots', 'Check responsive', 'scripts/check-responsive.sh', ['{url}']),
        qa('dark-mode', 'Dark mode', 'Check dark mode', 'scripts/check-dark-mode.sh', ['{url}']),
        qa('cross-browser', 'Cross-browser compare', 'Compare browsers', 'scripts/cross-browser-baseline.sh', ['compare', '{url}']),
      ],
    },
  ],
};
```

- [ ] **Step 5: index.ts**

Replace the registry body: import `aureliusManifest` from `./aurelius`; `PRODUCTS = { aurelius: aureliusManifest }`; `ACTIVE_PRODUCT_ID = 'aurelius'`; delete `initModuleDir`; rewrite the header comment (extension point: add `<product>.ts`, register in `PRODUCTS`, flip `ACTIVE_PRODUCT_ID`). Keep `getScreen`, `getStep`, `soleStep` verbatim.

- [ ] **Step 6: Vocabulary types**

`types/task.ts` — replace the `TaskKind` union with the one in **Interfaces**; update the header comment (prereq check, setup wizard, Figma pipeline, visual QA).

`types/init.ts`:

```ts
/**
 * Setup-wizard model. The GUI collects an InitInput and the engine runs
 * `scripts/setup-project.sh <name> --renderer <renderer> [--dry-run]` — the same
 * script a terminal user runs, so the GUI and CLI share one scaffolding path.
 */
export interface InitInput {
  /** Project directory name (lowercase letters, digits, hyphens). */
  name: string;
  /** Renderer id from renderers/ (nextjs | vite | astro | sveltekit | expo). */
  renderer: string;
  /** Print the resolved plan without creating anything (--dry-run). */
  preview: boolean;
}

export interface InitResult {
  ok: boolean;
  projectName: string;
  renderer: string;
  preview: boolean;
  error?: string;
}
```

`types/pipeline.ts`:

```ts
/** The design-to-app pipelines the GUI can launch (Canva/screenshot/conversation are follow-ups). */
export type PipelineKind = 'figma';

export interface PipelineInput {
  kind: PipelineKind;
  /** Figma file/design URL, optionally with ?node-id=. */
  figmaUrl: string;
}

export interface PipelineResult {
  ok: boolean;
  kind: PipelineKind;
  error?: string;
}
```

`types/qa.ts`:

```ts
/** Visual-QA steps (manifest step ids on the qa screen) and the artifacts the GUI renders. */
export type QaStepId = 'baselines' | 'regression' | 'responsive' | 'dark-mode' | 'cross-browser';

/** A markdown report under .claude/visual-qa/ (repo-relative path). */
export interface QaReport {
  title: string;
  relPath: string;
}

/** A directory of PNGs under .claude/visual-qa/ (repo-relative image paths, sorted). */
export interface QaGallery {
  title: string;
  images: string[];
}

export interface QaArtifacts {
  /** Reports that exist on disk, in display order. */
  reports: QaReport[];
  /** Galleries that have at least one PNG, in display order. */
  galleries: QaGallery[];
}
```

`types/prerequisites.ts` — remove `'wix-credentials'` from `PrereqGroup`; header comment: "Warnings (e.g. missing Playwright browsers) are never blocking"; key list `git|node|pnpm|claude|gh|jq|playwright|ram|disk|os`.

`ipc-channels.ts` — remove `siteRun`, `siteStatus`, `listPlans`, `qaRun`; add `stepRun: 'aurelius:step:run'` after `initResult`.

`types/ipc.ts` — remove the site imports/methods and `runQa`; rename to `AureliusBridge`; add after `getInitResult`:

```ts
  /** Run any manifest step by screen/step id with runtime vars; returns a task id.
   *  Used for script-backed buttons (QA scripts, the Playwright installer). */
  runStep(screenId: ScreenId, stepId: string, vars?: Record<string, string>): Promise<{ taskId: string }>;
```

(import `type { ScreenId } from '../product/manifest'`). Update the doc comment to `window.aurelius`.

- [ ] **Step 7: Run the manifest test; then commit**

Run: `cd packages/gui && node --import tsx --test tests/shared/product/manifest.test.mts` Expected: 9 passed.
Prettier: `CI=true npx -y pnpm@9 prettier --write packages/gui`.

```bash
git add packages/gui
git commit -m "feat(gui): Aurelius product manifest and shared vocabulary"
```

---

### Task 4: Core — wizard args, template filling, prerequisites, QA discovery, artifact sandbox, pipeline

**Files:**
- Rewrite: `src/core/init/init-flags.ts`, `src/core/product/command-spec.ts` (fillTemplate only), `src/core/qa/discover.ts`, `src/core/fs/read-artifact.ts` (ALLOWED_DIRS), `src/core/prerequisites/prereq-parser.ts` (GROUP_HEADERS + RECOGNIZERS), `src/core/prerequisites/prereq-metadata.ts`, `src/core/pipelines/pipeline-run.ts`, `src/core/shell/shell-resolver.ts` + `src/core/logger.ts` (comments only), `src/core/process/pty-runner.ts` (comment only)
- Tests: `tests/core/init/init-flags.test.mts`, `tests/core/product/command-spec.test.mts`, `tests/core/qa/qa.test.mts`, `tests/core/fs/read-artifact.test.mts`, `tests/core/prerequisites/prereq-parser.test.mts`, `tests/core/prerequisites/run-prerequisites.test.mts`, `tests/core/pipelines/pipeline-run.test.mts`, `tests/core/project/locate-root.test.mts`, `tests/core/shell/shell-resolver.test.mts`; fixtures `tests/fixtures/prereq-*.txt`

**Interfaces:**
- Consumes: Task 3 types.
- Produces:
  - `toSetupVars(input: InitInput): { name: string; renderer: string; dryRun: '--dry-run' | '' }` and `validateInitInput(input: InitInput, frameworks: readonly { id: string }[]): string | null` (error message or null)
  - `fillTemplate(template, vars)` drops a part that is exactly one `{placeholder}` whose value is missing/empty.
  - `discoverQaArtifacts(repoRoot): Promise<QaArtifacts>`, `QA_REPORTS`, `QA_GALLERIES` constants (title + rel dir).
  - `createPipelineRun(deps)` unchanged signature; Figma only; vars `{ figmaUrl }`.

- [ ] **Step 1: Failing tests**

`tests/core/init/init-flags.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSetupVars, validateInitInput } from '../../../src/core/init/init-flags';

const frameworks = [{ id: 'nextjs' }, { id: 'vite' }];

test('maps a real run to name/renderer with an empty dryRun', () => {
  assert.deepEqual(toSetupVars({ name: ' my-app ', renderer: 'vite', preview: false }), {
    name: 'my-app',
    renderer: 'vite',
    dryRun: '',
  });
});

test('preview maps to --dry-run', () => {
  assert.equal(toSetupVars({ name: 'x', renderer: 'vite', preview: true }).dryRun, '--dry-run');
});

test('validateInitInput enforces the create-app.js name rule and a known renderer', () => {
  assert.equal(validateInitInput({ name: 'my-app', renderer: 'vite', preview: false }, frameworks), null);
  assert.match(validateInitInput({ name: '', renderer: 'vite', preview: false }, frameworks) ?? '', /name/i);
  assert.match(validateInitInput({ name: 'My App', renderer: 'vite', preview: false }, frameworks) ?? '', /lowercase/);
  assert.match(validateInitInput({ name: 'ok', renderer: 'rails', preview: false }, frameworks) ?? '', /framework/i);
});
```

`tests/core/product/command-spec.test.mts` — keep `fakeShell`/`commands`; replace the Vespasian-driven tests with:

```ts
test('fillTemplate substitutes {placeholders} and drops empty placeholder-only parts', () => {
  assert.deepEqual(fillTemplate(['a', '{x}', 'c-{y}'], { x: 'B', y: 'D' }), ['a', 'B', 'c-D']);
  assert.deepEqual(fillTemplate(undefined, {}), []);
  assert.deepEqual(fillTemplate(['{missing}'], {}), []); // placeholder-only + empty → dropped
  assert.deepEqual(fillTemplate(['pre-{missing}'], {}), ['pre-']); // mixed text is kept
});

test('wizard step renders setup-project.sh name --renderer id, omitting dryRun when empty', async () => {
  const step = soleStep(aureliusManifest, 'wizard');
  const spec = await buildCommandSpec(commands, '/repo', step.command, { name: 'my-app', renderer: 'vite', dryRun: '' });
  assert.equal(spec.command, 'bash');
  assert.ok(spec.args[0].endsWith('setup-project.sh'));
  assert.deepEqual(spec.args.slice(1), ['my-app', '--renderer', 'vite']);
});

test('wizard step appends --dry-run when previewing', async () => {
  const step = soleStep(aureliusManifest, 'wizard');
  const spec = await buildCommandSpec(commands, '/repo', step.command, { name: 'my-app', renderer: 'expo', dryRun: '--dry-run' });
  assert.deepEqual(spec.args.slice(1), ['my-app', '--renderer', 'expo', '--dry-run']);
});

test('qa steps pass the app URL; cross-browser prefixes "compare"', async () => {
  const qa = getScreen(aureliusManifest, 'qa');
  const regression = await buildCommandSpec(commands, '/repo', getStep(qa, 'regression').command, { url: 'http://localhost:5173' });
  assert.ok(regression.args[0].endsWith('regression-test.sh'));
  assert.deepEqual(regression.args.slice(1), ['http://localhost:5173']);
  const cross = await buildCommandSpec(commands, '/repo', getStep(qa, 'cross-browser').command, { url: 'http://localhost:5173' });
  assert.deepEqual(cross.args.slice(1), ['compare', 'http://localhost:5173']);
});

test('prereq + playwright steps target their scripts', async () => {
  const prereq = getScreen(aureliusManifest, 'prereq');
  assert.ok((await buildCommandSpec(commands, '/repo', getStep(prereq, 'check').command)).args[0].endsWith('check-prerequisites.sh'));
  assert.ok((await buildCommandSpec(commands, '/repo', getStep(prereq, 'playwright').command)).args[0].endsWith('setup-playwright.sh'));
});

test('pipeline "figma" step renders `claude -p "/build-from-figma <url>"`', async () => {
  const step = getStep(getScreen(aureliusManifest, 'pipeline'), 'figma');
  const spec = await buildCommandSpec(commands, '/repo', step.command, { figmaUrl: 'https://figma.com/x' });
  assert.equal(spec.command, 'claude');
  assert.deepEqual(spec.args, ['-p', '/build-from-figma https://figma.com/x']);
});
```

(Import `aureliusManifest` from `../../../src/shared/product/aurelius`; remove the `module descriptors` test since `module` no longer exists.)

`tests/core/qa/qa.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverQaArtifacts } from '../../../src/core/qa/discover';

async function tree(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aurelius-qa-'));
  for (const f of files) {
    await mkdir(join(root, ...f.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...f.split('/')), 'x');
  }
  return root;
}

test('discovers only the reports and galleries that exist, in display order', async () => {
  const root = await tree([
    '.claude/visual-qa/regression-report.md',
    '.claude/visual-qa/diffs/regression/home-desktop.png',
    '.claude/visual-qa/diffs/regression/about-desktop.png',
    '.claude/visual-qa/diffs/regression/notes.txt',
    '.claude/visual-qa/screenshots/responsive/home-mobile-375px.png',
  ]);
  try {
    const a = await discoverQaArtifacts(root);
    assert.deepEqual(a.reports, [
      { title: 'Regression report', relPath: '.claude/visual-qa/regression-report.md' },
    ]);
    assert.deepEqual(
      a.galleries.map((g) => g.title),
      ['Regression diffs', 'Responsive screenshots'],
    );
    assert.deepEqual(a.galleries[0].images, [
      '.claude/visual-qa/diffs/regression/about-desktop.png',
      '.claude/visual-qa/diffs/regression/home-desktop.png',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an empty project yields no reports and no galleries', async () => {
  const root = await tree([]);
  try {
    assert.deepEqual(await discoverQaArtifacts(root), { reports: [], galleries: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

`tests/core/fs/read-artifact.test.mts` — same two tests, but the allowlisted dir is `.claude/visual-qa` (PNG under `.claude/visual-qa/diffs/regression/diff-home.png`; text `.claude/visual-qa/regression-report.md`); `tests/visual/...` and `.vespasian/...` paths must now return `null`; `.env` still `null`.

`tests/core/prerequisites/prereq-parser.test.mts` — same four tests against the new fixtures with these expectations: all-pass summary `{4,4,3,3,3,3}`; git version `2.43.0` min `2.30.0`; no `env` item (assert `report.items.find((i) => i.key === 'env')` is `undefined`); with-failures: pnpm fails with guidance URL matching `/pnpm\.io/` and a `corepack` hint, `requiredPassed` 3, a `playwright` `warn` item; with-skips: `gh` is `skip` in `required-accounts`, `jq` is `skip`, `optionalInstalled` 0 / `optionalTotal` 2, `ready` true.

`tests/fixtures/prereq-all-pass.txt`:

```

=== Aurelius Prerequisites Check ===

REQUIRED SOFTWARE
-----------------
[PASS] Git 2.43.0 (minimum: 2.30.0)
[PASS] Node.js 22.12.0 (minimum: 22.12.0)
[PASS] pnpm 9.15.9 (major >= 9)
[PASS] Claude Code 2.1.208

REQUIRED ACCOUNTS
-----------------
[INFO] Figma Dev Mode (for the Figma pipeline) - Manual verification required
       Open Figma > Press Shift+D > Dev Mode panel should appear
[PASS] GitHub CLI 2.86.0 (authenticated)

OPTIONAL SOFTWARE
-----------------
[PASS] jq 1.7 (used by hook scripts)
[PASS] Playwright Chromium browser installed

SYSTEM REQUIREMENTS
-------------------
[PASS] RAM: 16 GB (minimum: 4 GB)
[PASS] Disk: 120 GB free (minimum: 5 GB)
[PASS] OS: Ubuntu 24.04 LTS (supported)

=== Summary ===
Required: 4/4 passed
Optional: 3/3 installed
System:   3/3 passed

Ready to use Aurelius: YES

Next steps:
  1. Install dependencies:  pnpm install
  2. Create a project:      ./scripts/setup-project.sh my-app --vite
  3. Open Claude Code:      claude
```

`tests/fixtures/prereq-with-failures.txt`: same shape with `[FAIL] pnpm not installed` + hint line `       Install: corepack enable && corepack prepare pnpm@9 --activate`, `[SKIP] GitHub CLI not installed` + `       Install: https://cli.github.com/`, `[SKIP] jq not installed (hook scripts use it)`, `[WARN] Playwright browsers missing — run: ./scripts/setup-playwright.sh`, summary `Required: 3/4 passed`, `Optional: 0/2 installed`, `System: 3/3 passed`, `Warnings: 1 (see above — none are blocking)`, `Ready to use Aurelius: NO`, then the "Please install…" footer and `Documentation: docs/onboarding/README.md#prerequisites`.

`tests/fixtures/prereq-with-skips.txt`: all required pass, `[SKIP] GitHub CLI not installed`, `[SKIP] jq not installed (hook scripts use it)`, `[PASS] Playwright Chromium browser installed`? — no: to get `Optional: 0/2` use `[WARN] Playwright browsers missing — run: ./scripts/setup-playwright.sh`; summary `Required: 4/4 passed`, `Optional: 0/2 installed`, `System: 3/3 passed`, `Warnings: 1 (see above — none are blocking)`, `Ready to use Aurelius: YES`.

`tests/core/prerequisites/run-prerequisites.test.mts` — swap `vespasianManifest` → `aureliusManifest`; expectations unchanged (`requiredPassed` 4, exit 1 → not ready).

`tests/core/pipelines/pipeline-run.test.mts`: keep `CaptureRunner`; tests become: figma renders `['-p', '/build-from-figma https://figma.com/x']` and `result.ok === true`; figma with `figmaUrl: ''` rejects; a runner exiting 1 yields `ok: false` with an `error` string.

`tests/core/project/locate-root.test.mts` — `makeAureliusRoot()` writes `scripts/setup-project.sh`, `.claude/pipeline.config.json`, and `package.json` `{ name: 'aurelius' }`; import `aureliusManifest`.

`tests/core/shell/shell-resolver.test.mts` — `AURELIUS_BASH` (the sed did this); the `resolveTool` test uses `'claude'` instead of `'wix'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/gui && CI=true npx -y pnpm@9 test` Expected: failures in init-flags, command-spec, qa, read-artifact, prereq-parser, pipeline-run, locate-root.

- [ ] **Step 3: Implement**

`src/core/init/init-flags.ts`:

```ts
import type { InitInput } from '../../shared/types/init';

/** Runtime vars for the wizard step's argsTemplate (`{name}`, `{renderer}`, `{dryRun}`). */
export interface SetupVars extends Record<string, string> {
  name: string;
  renderer: string;
  /** '--dry-run' when previewing, '' otherwise (an empty placeholder-only arg is dropped). */
  dryRun: '--dry-run' | '';
}

/** Same rule scripts/create-app.js enforces for app names. */
const NAME_RULE = /^[a-z0-9-]+$/;

export function toSetupVars(input: InitInput): SetupVars {
  return {
    name: input.name.trim(),
    renderer: input.renderer,
    dryRun: input.preview ? '--dry-run' : '',
  };
}

/** Validate before any task is created; returns a user-facing message or null when valid. */
export function validateInitInput(
  input: InitInput,
  frameworks: readonly { readonly id: string }[],
): string | null {
  const name = input.name.trim();
  if (!name) return 'Enter a project name.';
  if (!NAME_RULE.test(name)) return 'Project name must be lowercase letters, numbers, and hyphens only.';
  if (!frameworks.some((f) => f.id === input.renderer)) return 'Choose a framework.';
  return null;
}
```

`src/core/product/command-spec.ts` — replace `fillTemplate`:

```ts
const SOLE_PLACEHOLDER = /^\{(\w+)\}$/;

/**
 * Fill `{name}` placeholders in a template's parts from `vars` (missing → '').
 * A part that is exactly one placeholder whose value is empty is dropped, so
 * optional flags (`{dryRun}` → '--dry-run' | '') never produce a stray '' argument.
 */
export function fillTemplate(template: readonly string[] | undefined, vars: CommandVars): string[] {
  const out: string[] = [];
  for (const part of template ?? []) {
    const sole = SOLE_PLACEHOLDER.exec(part);
    if (sole) {
      const value = vars[sole[1]] ?? '';
      if (value !== '') out.push(value);
      continue;
    }
    out.push(part.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? ''));
  }
  return out;
}
```

Remove the `case 'module'` branch from `buildCommandSpec` and its doc paragraph.

`src/core/qa/discover.ts`:

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { QaArtifacts, QaGallery, QaReport } from '../../shared/types/qa';

/** Reports the visual-QA scripts write (regression-test.sh, cross-browser-baseline.sh). */
export const QA_REPORTS: readonly QaReport[] = [
  { title: 'Regression report', relPath: '.claude/visual-qa/regression-report.md' },
  { title: 'Cross-browser report', relPath: '.claude/visual-qa/cross-browser-report.md' },
];

/** PNG directories the scripts write, in display order. */
export const QA_GALLERIES: readonly { title: string; relDir: string }[] = [
  { title: 'Regression diffs', relDir: '.claude/visual-qa/diffs/regression' },
  { title: 'Regression screenshots', relDir: '.claude/visual-qa/screenshots/regression' },
  { title: 'Responsive screenshots', relDir: '.claude/visual-qa/screenshots/responsive' },
  { title: 'Dark mode screenshots', relDir: '.claude/visual-qa/screenshots/dark' },
  { title: 'Dark vs light diffs', relDir: '.claude/visual-qa/diffs/dark-vs-light' },
  { title: 'Cross-browser diffs', relDir: '.claude/visual-qa/diffs/cross-browser' },
  { title: 'Cross-browser screenshots', relDir: '.claude/visual-qa/screenshots/cross-browser' },
  { title: 'Baselines', relDir: '.claude/visual-qa/baselines' },
];

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function listPngs(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  } catch {
    return [];
  }
}

/** Discover whatever QA artifacts exist on disk for the project (repo-relative paths). */
export async function discoverQaArtifacts(repoRoot: string): Promise<QaArtifacts> {
  const reports: QaReport[] = [];
  for (const r of QA_REPORTS) {
    if (await exists(join(repoRoot, ...r.relPath.split('/')))) reports.push(r);
  }
  const galleries: QaGallery[] = [];
  for (const g of QA_GALLERIES) {
    const images = (await listPngs(join(repoRoot, ...g.relDir.split('/')))).map((f) => `${g.relDir}/${f}`);
    if (images.length > 0) galleries.push({ title: g.title, images });
  }
  return { reports, galleries };
}
```

`src/core/fs/read-artifact.ts` — `const ALLOWED_DIRS = ['.claude/visual-qa'];` and comment "Repo-relative directories the renderer is allowed to read QA artifacts from."

`src/core/prerequisites/prereq-parser.ts` — `GROUP_HEADERS` without `'WIX CREDENTIALS (.env)'`; `RECOGNIZERS` without the Wix CLI, `.env` and `WIX_` entries; doc comment mentions "missing Playwright browsers" only.

`src/core/prerequisites/prereq-metadata.ts`:

```ts
export const PREREQ_GUIDANCE: Record<string, PrereqGuidance> = {
  git: { text: 'Install Git 2.30 or newer.', url: 'https://git-scm.com/downloads' },
  node: { text: 'Install Node.js 22.12 or newer (nvm/fnm work fine).', url: 'https://nodejs.org/' },
  pnpm: { text: 'Install pnpm 9: corepack enable && corepack prepare pnpm@9 --activate', url: 'https://pnpm.io/installation' },
  claude: { text: 'Install Claude Code: npm install -g @anthropic-ai/claude-code', url: 'https://claude.ai/code' },
  gh: { text: 'Install the GitHub CLI, then run `gh auth login`.', url: 'https://cli.github.com/' },
  jq: { text: 'jq is optional — the hook scripts use it.', url: 'https://jqlang.github.io/jq/' },
  playwright: { text: 'Install the Playwright browsers: ./scripts/setup-playwright.sh (or the button above).', url: 'https://playwright.dev/docs/browsers' },
  ram: { text: 'Free up memory — at least 4 GB of RAM is required.' },
  disk: { text: 'Free up disk space — at least 5 GB free is required.' },
  os: { text: 'Use a supported OS: Windows, macOS, or Linux.' },
};
```

`src/core/pipelines/pipeline-run.ts` — keep the structure; validation becomes `if (!deps.input.figmaUrl?.trim()) throw new Error('A Figma file URL is required.');`, vars `{ figmaUrl: deps.input.figmaUrl.trim() }`, result `{ ok, kind, error }` (no slug); doc comment: "`claude` (Figma) → a headless `claude -p "/build-from-figma <url>"` session".

`shell-resolver.ts`, `logger.ts`, `pty-runner.ts` — fix the comments the sed left: `AURELIUS_BASH`/`AURELIUS_DEBUG` are GUI-development-only env vars documented in `docs/GUI.md`; the PTY seam is reserved for live `claude` sessions. `resolveTool` signature: `name: 'node' | 'pnpm' | 'claude' | (string & {})`.

- [ ] **Step 4: Run tests; typecheck core**

Run: `cd packages/gui && CI=true npx -y pnpm@9 test` Expected: all pass (main/renderer are not imported by tests). Then `CI=true npx -y pnpm@9 prettier --write packages/gui`.

- [ ] **Step 5: Commit**

```bash
git add packages/gui
git commit -m "feat(gui): retarget the orchestration core to Aurelius scripts"
```

---

### Task 5: Main process and preload — `runStep`, bash wizard, no site

**Files:**
- Rewrite: `src/main/ipc/register-handlers.ts`, `src/preload/index.ts`
- Modify: `src/main/settings.ts`, `src/main/env.ts` (comments only)

**Interfaces:**
- Consumes: `toSetupVars`, `validateInitInput`, `createPipelineRun`, `createPrereqRun`, `buildCommandSpec`, `streamResultParser`, `discoverQaArtifacts`, manifest selectors.
- Produces: `ipcMain` handlers for every `IPC.*` channel in Task 3; `window.aurelius` implementing `AureliusBridge`.

- [ ] **Step 1: register-handlers.ts**

Start from the forked file and apply:
- Imports: drop `SiteCommand`, `WixSiteStatus`, `readSiteStatus`, `listPlanDirs`, `createInitRun`, `initModuleDir`; add `import { toSetupVars, validateInitInput } from '../../core/init/init-flags';` and `import type { ScreenId } from '../../shared/product/manifest';`.
- Replace the `IPC.initRun` handler:

```ts
  ipcMain.handle(IPC.initRun, async (_event, input: InitInput): Promise<{ taskId: string }> => {
    const screen = getScreen(manifest, 'wizard');
    const step = soleStep(manifest, 'wizard');
    // Validate before any task is created — the rejection surfaces to the renderer.
    const problem = validateInitInput(input, screen.extras?.frameworks ?? []);
    if (problem) throw new Error(problem);
    const vars = toSetupVars(input);
    const spec = await buildCommandSpec(commands, root(), step.command, vars);
    const task = deps.taskManager.create({
      kind: step.taskKind,
      run: (onEvent) => runner.run(spec, onEvent),
    });
    deps.bridge.attach(task);
    initResults.set(
      task.id,
      task.start().done.then((res) => ({
        ok: res.code === 0,
        projectName: vars.name,
        renderer: vars.renderer,
        preview: input.preview,
        error: res.code === 0 ? undefined : 'Setup failed — see the log for details.',
      })),
    );
    return { taskId: task.id };
  });
```

(Note `task.start()` returns the `RunHandle`; do not call `task.start()` twice.)

- Delete the `IPC.siteRun`, `IPC.siteStatus`, `IPC.listPlans`, `IPC.qaRun` handlers. Add:

```ts
  ipcMain.handle(
    IPC.stepRun,
    async (
      _event,
      screenId: ScreenId,
      stepId: string,
      vars: Record<string, string> = {},
    ): Promise<{ taskId: string }> => {
      const step = getStep(getScreen(manifest, screenId), stepId);
      const spec = await buildCommandSpec(commands, root(), step.command, vars);
      const task = deps.taskManager.create({
        kind: step.taskKind,
        run: (onEvent) => runner.run(spec, onEvent),
        isSuccess: (result) => (step.successExitCodes ?? [0]).includes(result.code ?? -1),
      });
      deps.bridge.attach(task);
      task.start();
      return { taskId: task.id };
    },
  );
```

- `IPC.pipelineRun` handler unchanged except `getStep(getScreen(manifest, 'pipeline'), input.kind)` still works (kind `'figma'`).
- Header comment: "Every product specific … is read from `deps.manifest`".

- [ ] **Step 2: preload/index.ts**

Remove `runSite`, `getSiteStatus`, `listPlans`, `runQa` and the site imports; add

```ts
  runStep: (screenId, stepId, vars) =>
    ipcRenderer.invoke(IPC.stepRun, screenId, stepId, vars) as Promise<{ taskId: string }>,
```

Keep `contextBridge.exposeInMainWorld('aurelius', bridge)`.

- [ ] **Step 3: Typecheck the node project**

Run: `cd packages/gui && npx tsc -p tsconfig.node.json --noEmit` Expected: clean (renderer is in the web project, checked in Task 6). Prettier write. Commit:

```bash
git add packages/gui
git commit -m "feat(gui): generic runStep IPC and script-backed setup wizard"
```

---

### Task 6: Renderer — shell, hooks, and the four panels

**Files:**
- Rewrite: `src/renderer/App.tsx`, `components/ProjectGate.tsx`, `components/PrereqPanel.tsx`, `components/WizardPanel.tsx`, `components/PipelinePanel.tsx`, `components/QaPanel.tsx`, `hooks/useInit.ts`
- Create: `src/renderer/hooks/useStep.ts`
- Keep verbatim: `main.tsx`, `index.html` (title `Aurelius` — done by sed), `vite-env.d.ts` (`window.aurelius: AureliusBridge`), `api/bridge.ts`, `hooks/useTaskStream.ts`, `hooks/usePrerequisites.ts`, `hooks/usePipeline.ts`, `components/{LogStream,StatusBadge,ArtifactImage,PrereqItemRow}.tsx`, `styles/app.css`

**Interfaces:**
- Consumes: `AureliusBridge` (Task 3), manifest selectors, `InitInput/InitResult`, `PipelineInput/PipelineResult`, `QaArtifacts`.
- Produces: `useStep(): { active: { taskId; label } | null; lines; state; busy; run(screenId, stepId, label, vars?) }`.

- [ ] **Step 1: useStep.ts**

```ts
import { useCallback, useState } from 'react';
import type { ScreenId } from '../../shared/product/manifest';
import { bridge } from '../api/bridge';
import { useTaskStream } from './useTaskStream';

export interface StepController {
  /** The step currently (or last) run on this screen. */
  active: { taskId: string; label: string } | null;
  lines: string[];
  state: ReturnType<typeof useTaskStream>['state'];
  /** True while a step is running. */
  busy: boolean;
  error: string | null;
  run: (screenId: ScreenId, stepId: string, label: string, vars?: Record<string, string>) => void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Drives any script-backed manifest step (QA scripts, the Playwright installer) via runStep. */
export function useStep(): StepController {
  const [active, setActive] = useState<{ taskId: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stream = useTaskStream(active?.taskId ?? null);

  const run = useCallback(
    (screenId: ScreenId, stepId: string, label: string, vars?: Record<string, string>) => {
      setError(null);
      bridge()
        .runStep(screenId, stepId, vars)
        .then(({ taskId }) => setActive({ taskId, label }))
        .catch((e) => setError(message(e)));
    },
    [],
  );

  const terminal =
    stream.state === 'succeeded' || stream.state === 'failed' || stream.state === 'cancelled';
  const busy = active !== null && !terminal;

  return { active, lines: stream.lines, state: stream.state, busy, error, run };
}
```

- [ ] **Step 2: useInit.ts** — unchanged logic; only the `InitInput`/`InitResult` types differ (already imported from shared). No edit needed beyond the sed; verify it compiles in Step 8.

- [ ] **Step 3: App.tsx** — remove the `SitePanel` import and the `{view === 'site' && <SitePanel />}` line. Everything else stays (brand + nav come from the manifest).

- [ ] **Step 4: ProjectGate.tsx** — replace the paragraph:

```tsx
        <p>
          Point {productName} at your project folder — the directory that contains{' '}
          <code>scripts/</code> and <code>.claude/pipeline.config.json</code>. The app reads and
          writes that folder (scaffolded apps, <code>.claude/visual-qa/</code> artifacts), so it
          must be a real {productName} checkout.
        </p>
```

- [ ] **Step 5: PrereqPanel.tsx**

- `GROUP_TITLES`/`GROUP_ORDER` without `'wix-credentials'`.
- `ReadyBanner` text `Ready to use {activeManifest.displayName}: …`.
- Intro: "Verifies the tools Aurelius needs (Git, Node 22.12+, pnpm 9+, Claude Code, plus optional GitHub CLI, jq and the Playwright browsers) by running the repo's `check-prerequisites.sh` and showing the result here."
- Add the Playwright installer under the report, using `useStep`:

```tsx
const PLAYWRIGHT = getStep(getScreen(activeManifest, 'prereq'), 'playwright');
// inside PrereqPanel():
const installer = useStep();
useEffect(() => {
  // Re-check once the installer finishes so the Playwright row updates.
  if (installer.active && !installer.busy) run();
}, [installer.active, installer.busy, run]);
// after the group list:
{report && (
  <div className="group">
    <h2>Playwright browsers</h2>
    <p className="panel-intro">
      Cross-browser and visual-QA scripts need the Playwright browser engines. This runs{' '}
      <code>scripts/setup-playwright.sh</code>.
    </p>
    <div className="button-row">
      <button
        type="button"
        disabled={installer.busy || running}
        onClick={() => installer.run('prereq', PLAYWRIGHT.id, PLAYWRIGHT.label)}
      >
        {installer.busy ? 'Installing…' : PLAYWRIGHT.cta}
      </button>
    </div>
    {installer.error && <div className="banner banner-error">{installer.error}</div>}
    {installer.active && <LogStream lines={installer.lines} />}
  </div>
)}
```

(imports: `getScreen, getStep` from `../../shared/product`; `useStep` from `../hooks/useStep`.)

- [ ] **Step 6: WizardPanel.tsx**

```tsx
import { useState, type FormEvent } from 'react';
import { activeManifest, getScreen } from '../../shared/product';
import type { InitInput } from '../../shared/types/init';
import { useInit } from '../hooks/useInit';
import { LogStream } from './LogStream';

const WIZARD = getScreen(activeManifest, 'wizard');
const FRAMEWORKS = WIZARD.extras?.frameworks ?? [];
const NAME_RULE = /^[a-z0-9-]+$/;

const DEFAULT_INPUT: InitInput = { name: '', renderer: FRAMEWORKS[0]?.id ?? 'vite', preview: false };

export function WizardPanel() {
  const [input, setInput] = useState<InitInput>(DEFAULT_INPUT);
  const { result, error, running, lines, run, reset } = useInit();

  function update<K extends keyof InitInput>(key: K, value: InitInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const name = input.name.trim();
  const nameValid = NAME_RULE.test(name);
  const canSubmit = nameValid && !running;

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (canSubmit) run({ ...input, name });
  }

  if (result) {
    const label = FRAMEWORKS.find((f) => f.id === result.renderer)?.label ?? result.renderer;
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{WIZARD.title}</h1>
          <button type="button" onClick={reset}>
            Start over
          </button>
        </header>
        {result.ok ? (
          <>
            <div className="banner banner-ok">
              <strong>
                {result.preview ? 'Preview complete' : `Project created: ${result.projectName}`}
              </strong>
              <span className="summary">{label}</span>
            </div>
            {!result.preview && (
              <div className="next-steps">
                <h2>Next steps</h2>
                <ol>
                  <li>
                    In a terminal: <code>cd {result.projectName} && pnpm install && pnpm dev</code>
                  </li>
                  <li>
                    Build the app from a design on the <strong>Build from Figma</strong> tab.
                  </li>
                  <li>
                    Verify it on the <strong>Visual QA</strong> tab while the dev server runs.
                  </li>
                </ol>
              </div>
            )}
          </>
        ) : (
          <div className="banner banner-error">
            <strong>Setup failed</strong>
            <span>{result.error}</span>
          </div>
        )}
        <details className="raw" open={!result.ok || result.preview}>
          <summary>Setup log</summary>
          <LogStream lines={lines} />
        </details>
      </section>
    );
  }

  if (running) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{input.preview ? 'Previewing…' : 'Creating project…'}</h1>
        </header>
        <p className="panel-intro">
          Running <code>scripts/setup-project.sh</code> — the same script as the CLI.
        </p>
        <LogStream lines={lines} />
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{WIZARD.title}</h1>
      </header>
      <p className="panel-intro">
        Scaffold a new app the same way <code>./scripts/setup-project.sh</code> does: pick a name
        and a framework, and the project is created next to this checkout&rsquo;s{' '}
        <code>scripts/</code> folder with the shared Aurelius configs.
      </p>

      {error && <div className="banner banner-error">Could not start setup: {error}</div>}

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Project name</span>
          <input
            value={input.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="my-app"
            spellCheck={false}
          />
          {input.name.trim() !== '' && !nameValid && (
            <span className="field-error">Lowercase letters, numbers, and hyphens only.</span>
          )}
        </label>

        <div className="field">
          <span>Framework</span>
          {FRAMEWORKS.map((f) => (
            <label key={f.id} className="field-check">
              <input
                type="radio"
                name="renderer"
                value={f.id}
                checked={input.renderer === f.id}
                onChange={() => update('renderer', f.id)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>

        <label className="field-check">
          <input
            type="checkbox"
            checked={input.preview}
            onChange={(e) => update('preview', e.target.checked)}
          />
          <span>Preview only (dry run — print the plan, create nothing)</span>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={!canSubmit}>
            {input.preview ? 'Preview' : (WIZARD.steps[0]?.cta ?? 'Create project')}
          </button>
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Step 7: PipelinePanel.tsx**

```tsx
import { useState } from 'react';
import { activeManifest, getScreen, getStep } from '../../shared/product';
import { bridge } from '../api/bridge';
import { usePipeline } from '../hooks/usePipeline';
import { LogStream } from './LogStream';

const PIPELINE = getScreen(activeManifest, 'pipeline');
const FIGMA = getStep(PIPELINE, 'figma');
const DOC = PIPELINE.extras?.docs?.figma ?? 'docs/figma-to-react/README.md';
const LINKS = PIPELINE.extras?.links ?? [];

/** figma.com/file|design|proto/<key>/… with an optional ?node-id=. */
const FIGMA_URL = /^https?:\/\/(www\.)?figma\.com\/(file|design|proto|board)\/[A-Za-z0-9]+(\/|$|\?)/i;

export function PipelinePanel() {
  const [figmaUrl, setFigmaUrl] = useState('');
  const { result, error, running, lines, run, cancel, reset } = usePipeline();

  const urlValid = FIGMA_URL.test(figmaUrl.trim());
  const canLaunch = urlValid && !running;

  const openDoc = (): void => {
    void bridge().openPath(DOC);
  };
  const openHelp = (relPath: string): void => {
    void bridge().openPath(relPath);
  };

  if (running) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>Building…</h1>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </header>
        <p className="panel-intro">
          Running <code>/build-from-figma</code> in a headless Claude Code session: intake, token
          lock, TDD, build, visual diff, E2E, quality gate, report. This takes a while.
        </p>
        <LogStream lines={lines} />
      </section>
    );
  }

  if (result) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h1>{PIPELINE.title}</h1>
          <button type="button" onClick={reset}>
            New build
          </button>
        </header>
        {result.ok ? (
          <>
            <div className="banner banner-ok">
              <strong>Pipeline finished</strong>
              <span className="summary">
                Report: <code>build-report.md</code> in the project
              </span>
            </div>
            <div className="next-steps">
              <h2>Next steps</h2>
              <ol>
                <li>Read the build report and the log below for anything the pipeline escalated.</li>
                <li>
                  Start the dev server in a terminal (<code>pnpm dev</code>) and verify it on the{' '}
                  <strong>Visual QA</strong> tab.
                </li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <div className="banner banner-error">
              <strong>Pipeline failed</strong>
              <span>{result.error}</span>
            </div>
            <p className="panel-intro">
              Troubleshooting:{' '}
              <button type="button" className="link-btn" onClick={() => openHelp('docs/onboarding/troubleshooting.md')}>
                Troubleshooting FAQ
              </button>
              {' · '}
              <button type="button" className="link-btn" onClick={openDoc}>
                Figma pipeline guide
              </button>
            </p>
          </>
        )}
        <details className="raw" open={!result.ok}>
          <summary>Pipeline log</summary>
          <LogStream lines={lines} />
        </details>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{PIPELINE.title}</h1>
      </header>
      <p className="panel-intro">
        Turn a Figma design into a working, tested app. This launches the same{' '}
        <code>/build-from-figma</code> command a terminal user would type, in a headless Claude
        Code session, and streams its progress here.
      </p>

      {error && <div className="banner banner-error">Could not start: {error}</div>}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canLaunch) run({ kind: 'figma', figmaUrl: figmaUrl.trim() });
        }}
      >
        <label className="field">
          <span>Figma file URL (Dev Mode)</span>
          <input
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/<key>/<name>?node-id=1-2"
            spellCheck={false}
          />
          {figmaUrl.trim() !== '' && !urlValid && (
            <span className="field-error">Enter a figma.com file, design, or proto URL.</span>
          )}
        </label>

        <p className="hint-note">
          Needs <strong>Figma Dev Mode</strong> (Professional plan or higher) and Claude Code with
          the Figma MCP server configured — see the pipeline guide.
        </p>

        <p className="panel-intro">
          <button type="button" className="link-btn" onClick={openDoc}>
            Figma pipeline guide →
          </button>
          {LINKS.map((l) => (
            <span key={l.url}>
              {' · '}
              <button type="button" className="link-btn" onClick={() => void bridge().openExternal(l.url)}>
                {l.label}
              </button>
            </span>
          ))}
        </p>

        <div className="form-actions">
          <button type="submit" disabled={!canLaunch}>
            {FIGMA.cta}
          </button>
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Step 8: QaPanel.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { activeManifest, getScreen } from '../../shared/product';
import type { QaArtifacts } from '../../shared/types/qa';
import { bridge } from '../api/bridge';
import { useStep } from '../hooks/useStep';
import { ArtifactImage } from './ArtifactImage';
import { LogStream } from './LogStream';

const QA = getScreen(activeManifest, 'qa');
const DEFAULT_URL = 'http://localhost:3000';
const URL_RULE = /^https?:\/\/\S+$/i;

function QaReportView({ path, title }: { path: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    bridge()
      .readQaText(path)
      .then(setText)
      .catch(() => setText(null));
  }, [path]);
  if (!text) return null;
  return (
    <div className="group">
      <h2>{title}</h2>
      <pre className="log-stream">{text}</pre>
    </div>
  );
}

export function QaPanel() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [artifacts, setArtifacts] = useState<QaArtifacts | null>(null);
  const step = useStep();

  const refresh = useCallback(() => {
    bridge()
      .getQaArtifacts()
      .then(setArtifacts)
      .catch(() => setArtifacts(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-scan the artifact directories whenever a step finishes.
  useEffect(() => {
    if (step.active && !step.busy) refresh();
  }, [step.active, step.busy, refresh]);

  const urlValid = URL_RULE.test(url.trim());

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{QA.title}</h1>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>
      <p className="panel-intro">
        Run the visual-QA scripts against your running app, then review what they wrote under{' '}
        <code>.claude/visual-qa/</code>. Start the dev server first (<code>pnpm dev</code>), and
        capture baselines before running the regression diff.
      </p>

      <label className="field">
        <span>App URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_URL} spellCheck={false} />
        {!urlValid && <span className="field-error">Enter an http(s) URL.</span>}
      </label>

      <div className="button-row">
        {QA.steps.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={step.busy || !urlValid}
            onClick={() => step.run('qa', s.id, s.label, { url: url.trim() })}
          >
            {s.cta ?? s.label}
          </button>
        ))}
      </div>

      {step.error && <div className="banner banner-error">Could not start: {step.error}</div>}

      {step.active && (
        <div className="group">
          <h2>
            {step.active.label}
            {step.busy ? ' — running…' : step.state === 'succeeded' ? ' — done' : ` — ${step.state}`}
          </h2>
          <LogStream lines={step.lines} />
        </div>
      )}

      {artifacts && artifacts.reports.length === 0 && artifacts.galleries.length === 0 && (
        <p className="panel-intro">No QA artifacts yet — run a step above.</p>
      )}

      {artifacts?.reports.map((r) => (
        <QaReportView key={r.relPath} path={r.relPath} title={r.title} />
      ))}

      {artifacts?.galleries.map((g) => (
        <div className="group" key={g.title}>
          <h2>{g.title}</h2>
          <div className="diff-images">
            {g.images.map((img) => (
              <figure key={img}>
                <figcaption>{img.split('/').pop()}</figcaption>
                <ArtifactImage relPath={img} alt={img} />
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 9: Verify the whole package**

Run, from `packages/gui`, each with `CI=true npx -y pnpm@9 …`: `typecheck`, `lint`, `test`, `build`. Expected: all clean; `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist. Then `grep -rn -i 'vespasian\|wix' packages/gui --exclude-dir=node_modules --exclude-dir=out` prints nothing. Prettier write + check.

- [ ] **Step 10: Commit**

```bash
git add packages/gui
git commit -m "feat(gui): Aurelius screens — prerequisites, setup wizard, Figma build, visual QA"
```

---

### Task 7: Smoke test and GUI CI lane

**Files:**
- Modify: `packages/gui/tests/smoke/smoke.mjs`
- Create: `.github/workflows/gui.yml`

**Interfaces:**
- Consumes: the built app from Task 6 (`out/main/index.js`).
- Produces: `pnpm --filter @aurelius/gui smoke` exits 0 when the shell renders the `Aurelius` brand and either the Prerequisites view or the project gate.

- [ ] **Step 1: smoke.mjs** — after the sed the brand assertion reads `assert.equal(brand, 'Aurelius', …)` and the body regex is `/Prerequisites|Open an? Aurelius project/`. Fix the article: the gate renders "Open a Aurelius project" from `ProjectGate` — change the gate heading in `ProjectGate.tsx` to `Open an {productName} project`? No: keep the component generic and use `/Prerequisites|Aurelius project/` in the smoke regex. Update the header comment (`pnpm --filter @aurelius/gui build && … smoke`).

- [ ] **Step 2: Run the smoke locally**

Run: `cd packages/gui && CI=true npx -y pnpm@9 build && xvfb-run --auto-servernum node tests/smoke/smoke.mjs` (or without `xvfb-run` on a desktop session). Expected: `smoke: GUI launched and reached the setup view`. If `xvfb-run` is missing locally, note it and rely on CI.

- [ ] **Step 3: gui.yml**

```yaml
name: GUI Tests

on:
  pull_request:
    paths:
      - "packages/gui/**"
      - "pnpm-workspace.yaml"
      - "pnpm-lock.yaml"
      - ".github/workflows/gui.yml"
  push:
    branches: [main]
    paths:
      - "packages/gui/**"
      - "pnpm-workspace.yaml"
      - "pnpm-lock.yaml"
      - ".github/workflows/gui.yml"

jobs:
  gui:
    name: GUI lint, typecheck, tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # The GUI's orchestration core is pure Node/TS and its tests run headless — no
    # Electron window is launched, so this lane needs no display server.
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        # Skip the ~100 MB Electron binary — typecheck only needs the bundled types.
        # side-effects-cache off so pnpm never records the skipped postinstall.
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"
        run: pnpm install --frozen-lockfile --config.side-effects-cache=false

      - name: Lint
        run: pnpm --filter @aurelius/gui lint

      - name: Typecheck
        run: pnpm --filter @aurelius/gui typecheck

      - name: Run GUI unit tests
        run: pnpm --filter @aurelius/gui test

  smoke:
    name: GUI smoke (Xvfb)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # Launches the built Electron app under Xvfb and asserts it reaches the shell.
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --config.side-effects-cache=false

      - name: Ensure Electron binary present
        working-directory: packages/gui
        run: |
          ELECTRON_DIR="$(node -e "console.log(require('path').dirname(require.resolve('electron/package.json')))")"
          if [ ! -f "$ELECTRON_DIR/path.txt" ] || [ ! -e "$ELECTRON_DIR/dist" ]; then
            echo "Electron binary missing — running its install script"
            (cd "$ELECTRON_DIR" && node install.js)
          fi

      - name: Install Electron runtime libraries + Xvfb
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb
          pnpm --filter @aurelius/gui exec playwright install-deps chromium

      - name: Build GUI
        run: pnpm --filter @aurelius/gui build

      - name: Smoke test
        run: xvfb-run --auto-servernum pnpm --filter @aurelius/gui smoke
```

- [ ] **Step 4: Validate and commit**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/gui.yml'))"` and `CI=true npx -y pnpm@9 prettier --check .github/workflows/gui.yml`.

```bash
git add packages/gui/tests/smoke/smoke.mjs .github/workflows/gui.yml
git commit -m "ci(gui): headless lint/typecheck/test lane and Xvfb smoke launch"
```

---

### Task 8: Docs, README section, release version tracking

**Files:**
- Create: `docs/GUI.md`, `packages/gui/docs/GUI-PLATFORM.md`
- Modify: `README.md` (new section after Quick Start's InDesign subsection, i.e. before `## The Figma-to-React Pipeline`; Documentation Index row), `CLAUDE.md` (tree + commands), `.versionrc.json` (bumpFiles), `CONTRIBUTING.md` (one sentence in Release Process)

- [ ] **Step 1: docs/GUI.md**

Adapt Vespasian's `docs/GUI.md` structure with Aurelius content:

- Intro: wraps the prerequisite check, `setup-project.sh`, the `/build-from-figma` pipeline, and the visual-QA scripts; thin orchestration layer; experimental.
- Stack, Architecture table (as in the spec), Process layer (same text, `.sh` via bash; `node`/`pnpm`/`claude` direct).
- Screens table:

| Screen | What it does | Wraps |
| --- | --- | --- |
| Prerequisites | Runs the prereq check, shows a pass/fail/warn checklist with guidance, and installs the Playwright browsers on demand. | `scripts/check-prerequisites.sh`, `scripts/setup-playwright.sh` |
| Setup wizard | Name + framework (Next.js, Vite, Astro, SvelteKit, Expo), optional dry run; streams the scaffold log and shows the next commands. | `scripts/setup-project.sh <name> --renderer <id> [--dry-run]` |
| Build from Figma | Validates a Figma URL and runs the autonomous pipeline in a headless Claude Code session, streaming progress. | `claude -p "/build-from-figma <url>"` |
| Visual QA | App URL + five buttons (capture baselines, regression, responsive, dark mode, cross-browser); renders the reports and PNG galleries under `.claude/visual-qa/`. | `capture-baselines.sh`, `regression-test.sh`, `check-responsive.sh`, `check-dark-mode.sh`, `cross-browser-baseline.sh compare` |

- Commands block (`pnpm gui:dev` … `pnpm gui:package`), Tests (node --test via tsx; CI `gui.yml`: lint → typecheck → tests, plus Xvfb smoke), Packaging (electron-builder.yml, unsigned, `signAndEditExecutable: false` paragraph), Versioning ("the GUI version is a `bumpFiles` entry in `.versionrc.json`, so the Release workflow bumps it with the repo and it is never hand-bumped"), the "operates on an Aurelius checkout" paragraph, First run walkthrough (Install & launch → Choose folder (the folder with `scripts/setup-project.sh`) → Prerequisites → Setup wizard → Build from Figma → Visual QA), Requirements (Git, Node 22.12+, pnpm 9, Claude Code with the Figma MCP for the pipeline; Git Bash on Windows), and the GUI-only env vars table (`AURELIUS_BASH`, `AURELIUS_DEBUG`).
- Follow-ups list: installers attached to releases (`gui-release.yml`), Canva/screenshot/conversation/InDesign steps, Lighthouse/Storybook QA steps, node-pty.

- [ ] **Step 2: packages/gui/docs/GUI-PLATFORM.md** — copy Vespasian's, retitle "GUI platform — Aurelius on the shared engine (Trajan)", first paragraph: `@aurelius/gui` is the third product on the engine (Flavian → Vespasian → Aurelius), forked through the manifest seam: one `ProductManifest` (`src/shared/product/aurelius.ts`) plus bespoke panels. Staged plan: mark stage 5 "Add Aurelius" ✅ and "you are here" at stage 4/6. Scope notes: bridge namespace `window.aurelius`, IPC `aurelius:*`; the wizard is a `bashScript` step (no in-process module); `runStep` is the generic step channel. Map table paths updated.

- [ ] **Step 3: README.md**

Insert before `## The Figma-to-React Pipeline`:

```markdown
## Desktop GUI (experimental)

Prefer not to use a terminal? A cross-platform **desktop GUI** wraps the workflow behind four screens: **Prerequisites**, **Setup wizard**, **Build from Figma**, and **Visual QA**. It's a thin orchestration layer over the existing scripts and Claude Code — the same pattern as Flavian's and Vespasian's GUIs. Run it from source with `pnpm gui:dev` (or build an installer with `pnpm gui:package`). See **[docs/GUI.md](docs/GUI.md)**.
```

Documentation Index row after "Design system export": `| Desktop GUI | `docs/GUI.md` | The experimental Electron GUI: screens, commands, packaging |`.

- [ ] **Step 4: CLAUDE.md**

- Project Structure tree: after the `packages/pipeline/` line add `│   └── gui/              # Desktop GUI (Electron + React, @aurelius/gui) — see docs/GUI.md`.
- Development Scripts: add a block

```bash
# Desktop GUI (experimental) — docs/GUI.md
pnpm gui:dev        # launch in development
pnpm gui:test       # headless core tests
pnpm gui:package    # build an installer (packages/gui/dist/)
```

- [ ] **Step 5: .versionrc.json** — add before `"scripts"`:

```json
  "bumpFiles": [
    { "filename": "package.json", "type": "json" },
    { "filename": "packages/gui/package.json", "type": "json" }
  ],
```

Verify: `CI=true npx -y pnpm@9 exec commit-and-tag-version --release-as minor --skip.tag --dry-run 2>&1 | grep bumping` prints two "bumping version in …" lines (root and packages/gui). Add to CONTRIBUTING.md Release Process, after the first paragraph: "The desktop GUI's `packages/gui/package.json` is a `bumpFiles` entry in `.versionrc.json`, so it tracks the repo version automatically."

- [ ] **Step 6: Verify docs and commit**

Run: `./scripts/check-doc-counts.sh` (agents/skills unchanged → passes), `CI=true npx -y pnpm@9 prettier --check .` (md is ignored; yml/json checked).

```bash
git add docs/GUI.md packages/gui/docs/GUI-PLATFORM.md README.md CLAUDE.md .versionrc.json CONTRIBUTING.md
git commit -m "docs(gui): desktop GUI guide, README section, release version tracking"
```

---

## Self-review

- **Spec coverage:** package + identity (T2), layering + engine changes `runStep`/bash wizard/`fillTemplate` (T3–T5), manifest table (T3), check-prerequisites.sh + count (T1), four panels (T6), error handling (validation in T4/T6, sandbox in T4), tests (T1, T3–T7), CI (T7), docs + README + CLAUDE.md + versionrc (T8). Deferred items are listed in docs/GUI.md (T8) and untouched otherwise.
- **Type consistency:** `InitInput {name, renderer, preview}` used by T4 `toSetupVars`, T5 handler, T6 WizardPanel; `runStep(screenId, stepId, vars)` in T3 bridge, T5 handler/preload, T6 `useStep`; `QaArtifacts {reports, galleries}` in T3, T4 discover, T6 QaPanel; `PipelineInput {kind:'figma', figmaUrl}` in T3, T4 pipeline-run, T6 PipelinePanel.
