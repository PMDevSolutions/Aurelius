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
