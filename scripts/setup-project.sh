#!/usr/bin/env bash
set -euo pipefail

# Project Setup
# Initialize a new project with standard tooling
#
# Usage:
#   ./scripts/setup-project.sh my-app                    # Interactive framework prompt
#   ./scripts/setup-project.sh my-app --renderer nextjs  # Create app for a registry renderer
#   ./scripts/setup-project.sh my-app --next             # Alias for --renderer nextjs
#   ./scripts/setup-project.sh my-app --vite             # Alias for --renderer vite
#   ./scripts/setup-project.sh my-app --react            # Create plain React app (via Vite)
#   ./scripts/setup-project.sh my-app --vue              # Create Vue 3 app
#   ./scripts/setup-project.sh my-app --svelte           # Alias for --renderer sveltekit
#   ./scripts/setup-project.sh my-app --expo             # Alias for --renderer expo
#   ./scripts/setup-project.sh my-app --astro            # Alias for --renderer astro
#
# The --renderer flag is backed by the renderer registry
# (scripts/renderer-registry.js). The legacy framework flags above are kept as
# aliases. Use --dry-run to print the resolved plan without creating anything.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="$SCRIPT_DIR/renderer-registry.js"
TEMPLATES_DIR="$SCRIPT_DIR/../templates"

# List available renderers from the registry (space-separated names).
list_renderers() {
    node "$REGISTRY" list --json 2>/dev/null \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).renderers.map(r=>r.name).join(" "))}catch(e){process.exit(1)}})'
}

usage() {
    local renderers
    renderers="$(list_renderers || echo "nextjs vite sveltekit expo astro")"
    echo "Usage: $0 <project-name> [--renderer <name>] [--dry-run]"
    echo "       $0 <project-name> [--next|--vite|--react|--vue|--svelte|--expo|--astro] [--dry-run]"
    echo ""
    echo "Options:"
    echo "  --renderer <name>  Create an app for a registry renderer (authoritative)"
    echo "                     Available renderers: ${renderers}"
    echo "  --next             Alias for --renderer nextjs"
    echo "  --vite             Alias for --renderer vite"
    echo "  --react            Create a plain React app (via Vite)"
    echo "  --vue              Create a Vue 3 app"
    echo "  --svelte           Alias for --renderer sveltekit"
    echo "  --expo             Alias for --renderer expo"
    echo "  --astro            Alias for --renderer astro"
    echo "  --dry-run          Print the resolved plan and exit without creating anything"
    echo "  -h, --help         Show this message"
}

PROJECT_NAME="${1:-}"
FRAMEWORK=""
RENDERER=""
DRY_RUN=0

if [[ -z "$PROJECT_NAME" || "$PROJECT_NAME" == "-h" || "$PROJECT_NAME" == "--help" ]]; then
    usage
    [[ -z "$PROJECT_NAME" ]] && exit 1 || exit 0
fi

# Parse flags
args=("${@:2}")
i=0
while [[ $i -lt ${#args[@]} ]]; do
    arg="${args[$i]}"
    case "$arg" in
        --renderer)
            i=$((i + 1))
            RENDERER="${args[$i]:-}"
            if [[ -z "$RENDERER" ]]; then
                echo "Error: --renderer requires a value." >&2
                usage
                exit 1
            fi
            ;;
        --next) RENDERER="nextjs" ;;
        --vite) RENDERER="vite" ;;
        --expo) RENDERER="expo" ;;
        --svelte) RENDERER="sveltekit" ;;
        --astro) RENDERER="astro" ;;
        --react) FRAMEWORK="react" ;;
        --vue) FRAMEWORK="vue" ;;
        --dry-run) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
    esac
    i=$((i + 1))
done

# A --renderer (or its alias) is authoritative and is resolved via the registry.
# It maps onto an internal FRAMEWORK identity that drives dependency installation
# and template copying below.
TEMPLATE_PATH=""
if [[ -n "$RENDERER" ]]; then
    # Validate the renderer name against the registry and resolve its manifest.
    if ! MANIFEST_JSON="$(node "$REGISTRY" resolve "$RENDERER" --json 2>/dev/null)"; then
        AVAILABLE="$(list_renderers || echo "")"
        echo "Error: unknown renderer '$RENDERER'." >&2
        [[ -n "$AVAILABLE" ]] && echo "Available renderers: $AVAILABLE" >&2
        exit 1
    fi

    # Extract manifest.template (e.g. "templates/astro") from the resolved manifest.
    TEMPLATE_PATH="$(printf '%s' "$MANIFEST_JSON" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).template||"")}catch(e){process.exit(1)}})')"

    # Map the renderer onto the internal FRAMEWORK identity used for dep install.
    case "$RENDERER" in
        nextjs) FRAMEWORK="next" ;;
        vite) FRAMEWORK="vite" ;;
        sveltekit) FRAMEWORK="svelte" ;;
        expo) FRAMEWORK="expo" ;;
        astro) FRAMEWORK="astro" ;;
        *) FRAMEWORK="$RENDERER" ;;
    esac
fi

# Interactive prompt if nothing was specified
if [[ -z "$FRAMEWORK" && -z "$RENDERER" ]]; then
    echo "Select a framework:"
    echo "  1) Next.js"
    echo "  2) Vite + React"
    echo "  3) Plain React (via Vite)"
    echo "  4) Vue 3"
    echo "  5) SvelteKit"
    echo "  6) Expo (React Native)"
    echo "  7) Astro (hybrid islands)"
    echo ""
    read -rp "Enter choice [1-7]: " CHOICE

    case "$CHOICE" in
        1) RENDERER="nextjs"; FRAMEWORK="next" ;;
        2) RENDERER="vite"; FRAMEWORK="vite" ;;
        3) FRAMEWORK="react" ;;
        4) FRAMEWORK="vue" ;;
        5) RENDERER="sveltekit"; FRAMEWORK="svelte" ;;
        6) RENDERER="expo"; FRAMEWORK="expo" ;;
        7) RENDERER="astro"; FRAMEWORK="astro" ;;
        *)
            echo "Invalid choice. Exiting."
            exit 1
            ;;
    esac
fi

# Determine the template directory for the framework.
# A registry-resolved renderer supplies its own template path (manifest.template,
# relative to the repo root); otherwise fall back to the legacy mapping.
FRAMEWORK_TEMPLATE="$FRAMEWORK"
case "$FRAMEWORK" in
    react) FRAMEWORK_TEMPLATE="vite" ;;
    svelte) FRAMEWORK_TEMPLATE="sveltekit" ;;
esac
if [[ -n "$TEMPLATE_PATH" ]]; then
    # manifest.template is "templates/<name>"; strip the leading "templates/".
    FRAMEWORK_TEMPLATE="${TEMPLATE_PATH#templates/}"
fi

echo ""
echo "=== Project Setup ==="
echo "Project: $PROJECT_NAME"
[[ -n "$RENDERER" ]] && echo "Renderer: $RENDERER"
echo "Framework: $FRAMEWORK"
echo "Template: templates/$FRAMEWORK_TEMPLATE"
echo ""

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] No project created. Would scaffold '$PROJECT_NAME' using:"
    echo "[dry-run]   renderer:  ${RENDERER:-<none>}"
    echo "[dry-run]   framework: $FRAMEWORK"
    echo "[dry-run]   template:  templates/$FRAMEWORK_TEMPLATE"
    echo "[dry-run]   shared:    templates/shared"
    exit 0
fi

# Create the project
case "$FRAMEWORK" in
    next)
        echo "Creating Next.js app..."
        pnpm create next-app "$PROJECT_NAME" --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
        ;;
    vite)
        echo "Creating Vite + React app..."
        pnpm create vite "$PROJECT_NAME" --template react-ts
        ;;
    react)
        echo "Creating React app (via Vite)..."
        pnpm create vite "$PROJECT_NAME" --template react-ts
        ;;
    vue)
        echo "Creating Vue 3 app..."
        pnpm create vite "$PROJECT_NAME" --template vue-ts
        ;;
    svelte)
        echo "Creating SvelteKit app..."
        pnpm create svelte@latest "$PROJECT_NAME"
        ;;
    expo)
        echo "Creating Expo app..."
        pnpm create expo-app "$PROJECT_NAME" --template tabs
        ;;
    astro)
        # Astro ships a complete hybrid-islands starter under templates/astro
        # (full package.json + src), so scaffold from it directly — deterministic
        # and offline, unlike `pnpm create astro` which downloads the basics template.
        echo "Creating Astro app from templates/astro..."
        mkdir -p "$PROJECT_NAME"
        cp -R "$TEMPLATES_DIR/astro/." "$PROJECT_NAME/"
        # Personalize the package name.
        sed -i.bak "s/\"my-astro-app\"/\"$PROJECT_NAME\"/" "$PROJECT_NAME/package.json" \
            && rm -f "$PROJECT_NAME/package.json.bak"
        ;;
esac

echo ""
echo "Entering project directory..."
cd "$PROJECT_NAME"

# Install base dependencies
echo ""
echo "Installing dependencies..."
pnpm install

# Install additional dev dependencies
echo ""
echo "Installing additional tooling..."

ADDITIONAL_DEPS=()

case "$FRAMEWORK" in
    next)
        # Tailwind included via create-next-app; add testing + formatting
        ADDITIONAL_DEPS+=(prettier vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8 @vitejs/plugin-react)
        ;;
    vite|react)
        ADDITIONAL_DEPS+=(tailwindcss @tailwindcss/vite prettier vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8)
        ;;
    vue)
        ADDITIONAL_DEPS+=(prettier vitest @vue/test-utils @testing-library/vue jsdom @vitest/coverage-v8)
        ;;
    svelte)
        ADDITIONAL_DEPS+=(prettier vitest @testing-library/svelte jsdom @vitest/coverage-v8)
        ;;
    astro)
        # templates/astro already pins all runtime + test deps (React islands,
        # Tailwind, vitest, testing-library, jsdom); nothing extra to add.
        ;;
    expo)
        ADDITIONAL_DEPS+=(prettier jest jest-expo @testing-library/react-native)
        ;;
esac

if [[ ${#ADDITIONAL_DEPS[@]} -gt 0 ]]; then
    pnpm add -D "${ADDITIONAL_DEPS[@]}"
fi

# Copy template configs from the framework repo
if [[ -d "$TEMPLATES_DIR" ]]; then
    echo ""
    echo "Copying template configurations..."

    # Copy shared configs (ESLint, Prettier, Vitest, Tailwind, tsconfig)
    # Expo uses its own tsconfig and doesn't use vitest/storybook
    if [[ -d "$TEMPLATES_DIR/shared" ]]; then
        for template_file in "$TEMPLATES_DIR/shared"/*; do
            if [[ -f "$template_file" ]]; then
                FILENAME=$(basename "$template_file")
                # Strip .tpl suffix (template configs renamed to avoid IDE auto-discovery)
                FILENAME="${FILENAME%.tpl}"

                # Skip shared configs that don't apply to the framework
                case "$FRAMEWORK" in
                    expo)
                        # Expo doesn't use vitest, tailwind config (uses NativeWind), or storybook
                        case "$FILENAME" in
                            vitest.config.template.ts|tailwind.config.ts) continue ;;
                        esac
                        ;;
                    vue|astro)
                        # Vue and Astro have their own tailwind config in the framework template
                        case "$FILENAME" in
                            tailwind.config.ts) continue ;;
                        esac
                        ;;
                esac

                if [[ ! -f "$FILENAME" ]]; then
                    cp "$template_file" "./$FILENAME"
                    echo "  Copied: $FILENAME"
                else
                    echo "  Skipped (already exists): $FILENAME"
                fi
            fi
        done

        # Copy Storybook config directory (not for Expo)
        if [[ "$FRAMEWORK" != "expo" ]]; then
            # Prefer framework-specific storybook config if it exists
            STORYBOOK_SRC="$TEMPLATES_DIR/$FRAMEWORK_TEMPLATE/.storybook"
            if [[ ! -d "$STORYBOOK_SRC" ]]; then
                STORYBOOK_SRC="$TEMPLATES_DIR/shared/.storybook"
            fi

            if [[ -d "$STORYBOOK_SRC" ]] && [[ ! -d ".storybook" ]]; then
                cp -r "$STORYBOOK_SRC" ./.storybook
                echo "  Copied: .storybook/ (from $(basename "$(dirname "$STORYBOOK_SRC")"))"
            fi
        fi
    fi

    # Copy framework-specific configs
    FRAMEWORK_DIR="$TEMPLATES_DIR/$FRAMEWORK_TEMPLATE"

    if [[ -d "$FRAMEWORK_DIR" ]]; then
        for template_file in "$FRAMEWORK_DIR"/*; do
            if [[ -f "$template_file" ]]; then
                FILENAME=$(basename "$template_file")
                # Strip .tpl suffix (template configs renamed to avoid IDE auto-discovery)
                FILENAME="${FILENAME%.tpl}"
                if [[ ! -f "$FILENAME" ]]; then
                    cp "$template_file" "./$FILENAME"
                    echo "  Copied: $FILENAME (${FRAMEWORK}-specific)"
                else
                    echo "  Skipped (already exists): $FILENAME"
                fi
            fi
        done
    fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Project created at: $(pwd)"
echo ""
echo "Next steps:"
echo "  cd $PROJECT_NAME"

case "$FRAMEWORK" in
    next)
        echo "  pnpm dev                  # Start development server (port 3000)"
        echo "  pnpm build                # Build for production"
        echo "  pnpm vitest               # Run tests"
        echo "  pnpm vitest --coverage    # Run tests with coverage"
        ;;
    vite|react)
        echo "  pnpm dev                  # Start development server (port 5173)"
        echo "  pnpm build                # Build for production"
        echo "  pnpm vitest               # Run tests"
        echo "  pnpm vitest --coverage    # Run tests with coverage"
        echo ""
        echo "Tailwind CSS:"
        echo "  Add '@import \"tailwindcss\";' to your main CSS file."
        echo "  Add the @tailwindcss/vite plugin to vite.config.ts."
        ;;
    vue)
        echo "  pnpm dev                  # Start development server (port 5173)"
        echo "  pnpm build                # Build for production"
        echo "  pnpm vitest               # Run tests"
        echo "  pnpm vitest --coverage    # Run tests with coverage"
        ;;
    svelte)
        echo "  pnpm dev                  # Start development server (port 5173)"
        echo "  pnpm build                # Build for production"
        echo "  pnpm vitest               # Run tests"
        echo "  pnpm vitest --coverage    # Run tests with coverage"
        ;;
    astro)
        echo "  pnpm dev                  # Start development server (port 4321)"
        echo "  pnpm build                # Build for production"
        echo "  pnpm vitest               # Run tests (React islands + Astro Container API)"
        echo "  pnpm vitest --coverage    # Run tests with coverage"
        ;;
    expo)
        echo "  pnpm start                # Start Expo dev server"
        echo "  pnpm ios                  # Run on iOS simulator"
        echo "  pnpm android              # Run on Android emulator"
        echo "  pnpm test                 # Run Jest tests"
        echo "  pnpm test:coverage        # Run tests with coverage"
        ;;
esac

echo ""
echo "Recommended VS Code extensions:"
echo "  - ESLint"
echo "  - Prettier"
echo "  - Tailwind CSS IntelliSense"

case "$FRAMEWORK" in
    next|vite|react) echo "  - Vitest" ;;
    vue) echo "  - Volar (Vue)" ; echo "  - Vitest" ;;
    svelte) echo "  - Svelte for VS Code" ; echo "  - Vitest" ;;
    astro) echo "  - Astro" ; echo "  - Vitest" ;;
    expo) echo "  - React Native Tools" ;;
esac
