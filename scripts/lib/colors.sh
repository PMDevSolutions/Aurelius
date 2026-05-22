# colors.sh — ANSI terminal color constants
#
# Source this file to get color variables. Define COLORS_DISABLE=1 (or set
# NO_COLOR per the no-color.org convention) to emit empty strings instead of
# escape codes, so output stays clean when piped or written to logs.
#
# Usage:
#   source "$SCRIPT_DIR/lib/colors.sh"
#   echo -e "${RED}error${NC}"

# Avoid redefining if sourced multiple times.
if [[ -n "${__COLORS_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
__COLORS_SH_LOADED=1

if [[ -n "${NO_COLOR:-}" ]] || [[ -n "${COLORS_DISABLE:-}" ]] || [[ ! -t 1 ]]; then
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  MAGENTA=''
  CYAN=''
  BOLD=''
  DIM=''
  NC=''
else
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'
  MAGENTA=$'\033[0;35m'
  CYAN=$'\033[0;36m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  NC=$'\033[0m'
fi
