#!/bin/bash
# PostToolUse Hook: Lint and format written/edited files
# Runs after frontend-developer agent writes or edits files
#
# Exit 0: Warnings only (non-blocking)
# Exit 2: Critical issues (blocking)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# No file path = not a file operation
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
    ts|tsx)
        # Run ESLint if available
        if [ -f "node_modules/.bin/eslint" ]; then
            RESULT=$(npx eslint "$FILE_PATH" --fix 2>&1)
            if [ $? -ne 0 ]; then
                echo "ESLint issues in: $FILE_PATH" >&2
                echo "$RESULT" >&2
            fi
        fi
        # Run Prettier if available
        if [ -f "node_modules/.bin/prettier" ]; then
            npx prettier --write "$FILE_PATH" 2>/dev/null
        fi
        ;;
    css)
        # Check for hardcoded colors (should use CSS custom properties or Tailwind)
        if grep -nE '#[0-9a-fA-F]{3,8}' "$FILE_PATH" 2>/dev/null | grep -v '^\s*//' | grep -v '^\s*\*'; then
            echo "CSS contains hardcoded color values. Use design tokens or Tailwind utilities instead." >&2
        fi
        ;;
    js|jsx)
        # Run ESLint if available
        if [ -f "node_modules/.bin/eslint" ]; then
            RESULT=$(npx eslint "$FILE_PATH" --fix 2>&1)
            if [ $? -ne 0 ]; then
                echo "ESLint issues in: $FILE_PATH" >&2
                echo "$RESULT" >&2
            fi
        fi
        # Basic JS checks - warn about console.log in production code
        if grep -n 'console\.log' "$FILE_PATH" 2>/dev/null; then
            echo "JavaScript contains console.log statements. Remove before production." >&2
        fi
        ;;
esac

exit 0
