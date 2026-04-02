#!/usr/bin/env bash
set -euo pipefail

# Project Setup
# Initialize a new project with standard tooling
#
# Usage:
#   ./scripts/setup-project.sh my-app              # Interactive framework prompt
#   ./scripts/setup-project.sh my-app --next        # Create Next.js app
#   ./scripts/setup-project.sh my-app --vite        # Create Vite + React app
#   ./scripts/setup-project.sh my-app --react       # Create plain React app (via Vite)
#   ./scripts/setup-project.sh my-app --vue         # Create Vue 3 app
#   ./scripts/setup-project.sh my-app --svelte      # Create SvelteKit app
#   ./scripts/setup-project.sh my-app --expo        # Create Expo (React Native) app

PROJECT_NAME="${1:-}"
FRAMEWORK=""

if [[ -z "$PROJECT_NAME" ]]; then
    echo "Usage: $0 <project-name> [--next|--vite|--react|--vue|--svelte|--expo]"
    echo ""
    echo "Options:"
    echo "  --next     Create a Next.js app"
    echo "  --vite     Create a Vite + React app"
    echo "  --react    Create a plain React app (via Vite)"
    echo "  --vue      Create a Vue 3 app"
    echo "  --svelte   Create a SvelteKit app"
    echo "  --expo     Create an Expo (React Native) app"
    exit 1
fi

# Parse framework flag
for arg in "${@:2}"; do
    case "$arg" in
        --next) FRAMEWORK="next" ;;
        --vite) FRAMEWORK="vite" ;;
        --react) FRAMEWORK="react" ;;
        --vue) FRAMEWORK="vue" ;;
        --svelte) FRAMEWORK="svelte" ;;
        --expo) FRAMEWORK="expo" ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Interactive prompt if no framework specified
if [[ -z "$FRAMEWORK" ]]; then
    echo "Select a framework:"
    echo "  1) Next.js"
    echo "  2) Vite + React"
    echo "  3) Plain React (via Vite)"
    echo "  4) Vue 3"
    echo "  5) SvelteKit"
    echo "  6) Expo (React Native)"
    echo ""
    read -rp "Enter choice [1-6]: " CHOICE

    case "$CHOICE" in
        1) FRAMEWORK="next" ;;
        2) FRAMEWORK="vite" ;;
        3) FRAMEWORK="react" ;;
        4) FRAMEWORK="vue" ;;
        5) FRAMEWORK="svelte" ;;
        6) FRAMEWORK="expo" ;;
        *)
            echo "Invalid choice. Exiting."
            exit 1
            ;;
    esac
fi

echo ""
echo "=== Project Setup ==="
echo "Project: $PROJECT_NAME"
echo "Framework: $FRAMEWORK"
echo ""

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
    expo)
        ADDITIONAL_DEPS+=(prettier jest jest-expo @testing-library/react-native)
        ;;
esac

if [[ ${#ADDITIONAL_DEPS[@]} -gt 0 ]]; then
    pnpm add -D "${ADDITIONAL_DEPS[@]}"
fi

# Copy template configs from the framework repo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/../templates"

# Determine the template directory for the framework
FRAMEWORK_TEMPLATE="$FRAMEWORK"
case "$FRAMEWORK" in
    react) FRAMEWORK_TEMPLATE="vite" ;;
    svelte) FRAMEWORK_TEMPLATE="sveltekit" ;;
esac

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
                    vue)
                        # Vue has its own tailwind.config.ts with Vue file extensions
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
    expo) echo "  - React Native Tools" ;;
esac
