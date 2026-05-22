#!/usr/bin/env bash
set -euo pipefail

# Incremental Build Runner
# Orchestrates pipeline with caching, profiling, and performance optimization
#
# Usage:
#   ./scripts/incremental-build.sh [phase|all] [--force] [--profile] [--no-cache]
#
# Features:
#   - Hash-based cache checking before each phase
#   - Automatic phase skipping when cache is valid
#   - Stage profiling and metrics collection
#   - Performance dashboard generation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/colors.sh
source "$SCRIPT_DIR/lib/colors.sh"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# Configuration
CACHE_SCRIPT="$SCRIPT_DIR/pipeline-cache.js"
PROFILER_SCRIPT="$SCRIPT_DIR/stage-profiler.js"
DASHBOARD_SCRIPT="$SCRIPT_DIR/metrics-dashboard.js"

# Parse arguments
PHASE="all"
FORCE_BUILD=false
ENABLE_PROFILING=true
ENABLE_CACHE=true
VERBOSE=false
PARALLEL=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            FORCE_BUILD=true
            shift
            ;;
        --no-profile)
            ENABLE_PROFILING=false
            shift
            ;;
        --no-cache)
            ENABLE_CACHE=false
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --parallel|-p)
            PARALLEL=true
            shift
            ;;
        --help|-h)
            echo "Incremental Build Runner"
            echo ""
            echo "Usage: ./scripts/incremental-build.sh [phase|all] [options]"
            echo ""
            echo "Phases:"
            echo "  all                 Run all phases (default)"
            echo "  lint                Run linting and formatting"
            echo "  types               Run TypeScript type checking"
            echo "  tests               Run tests with coverage"
            echo "  build               Run production build"
            echo "  bundle              Check bundle size"
            echo "  a11y                Run accessibility checks"
            echo "  tokens              Verify design tokens"
            echo "  quality             Run full quality gate"
            echo ""
            echo "Options:"
            echo "  --force, -f         Force rebuild, ignore cache"
            echo "  --no-profile        Disable performance profiling"
            echo "  --no-cache          Disable cache checking"
            echo "  --verbose, -v       Show detailed output"
            echo "  --parallel, -p      Run independent phases in parallel"
            echo "  --help, -h          Show this help"
            exit 0
            ;;
        *)
            PHASE="$1"
            shift
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_phase() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}▶${NC} ${CYAN}$1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if phase cache is valid
check_cache() {
    local phase="$1"

    if [[ "$ENABLE_CACHE" != true ]]; then
        return 1  # Cache disabled, run phase
    fi

    if [[ "$FORCE_BUILD" == true ]]; then
        return 1  # Force build, run phase
    fi

    if [[ -f "$CACHE_SCRIPT" ]]; then
        if node "$CACHE_SCRIPT" check "$phase" > /dev/null 2>&1; then
            return 0  # Cache valid, skip phase
        fi
    fi

    return 1  # Cache invalid or not found, run phase
}

# Update cache after successful phase
update_cache() {
    local phase="$1"
    local duration="$2"

    if [[ "$ENABLE_CACHE" == true ]] && [[ -f "$CACHE_SCRIPT" ]]; then
        node "$CACHE_SCRIPT" update "$phase" "$duration" > /dev/null 2>&1 || true
    fi
}

# Record cache hit for metrics
record_cache_hit() {
    local phase="$1"
    local saved_time="$2"

    if [[ -f "$CACHE_SCRIPT" ]]; then
        node "$CACHE_SCRIPT" hit "$saved_time" --phase "$phase" > /dev/null 2>&1 || true
    fi
}

# Start profiling a phase
start_profile() {
    local phase="$1"

    if [[ "$ENABLE_PROFILING" == true ]] && [[ -f "$PROFILER_SCRIPT" ]]; then
        node "$PROFILER_SCRIPT" start "$phase" > /dev/null 2>&1 || true
    fi
}

# End profiling a phase
end_profile() {
    local phase="$1"
    local status="${2:-pass}"

    if [[ "$ENABLE_PROFILING" == true ]] && [[ -f "$PROFILER_SCRIPT" ]]; then
        node "$PROFILER_SCRIPT" end "$phase" --status "$status" > /dev/null 2>&1 || true
    fi
}

# Run a phase with caching and profiling
run_phase() {
    local phase="$1"
    local description="$2"
    shift 2
    local command="$@"

    log_phase "$description"

    # Check cache
    if check_cache "$phase"; then
        local cached_duration
        cached_duration=$(node "$CACHE_SCRIPT" check "$phase" --json 2>/dev/null | grep -o '"duration":[0-9]*' | cut -d: -f2 || echo "0")
        log_success "Cache HIT - skipping (saved ~${cached_duration}ms)"
        record_cache_hit "$phase" "$cached_duration"
        return 0
    fi

    # Run phase with profiling
    start_profile "$phase"

    local start_time
    start_time=$(date +%s%3N)

    local status=0
    if $VERBOSE; then
        eval "$command" || status=$?
    else
        eval "$command" 2>&1 || status=$?
    fi

    local end_time
    end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    if [[ $status -eq 0 ]]; then
        end_profile "$phase" "pass"
        update_cache "$phase" "$duration"
        log_success "Completed in ${duration}ms"
    else
        end_profile "$phase" "fail"
        log_error "Failed after ${duration}ms"
        return $status
    fi
}

# Phase implementations
phase_lint() {
    run_phase "lint" "Lint & Format" \
        "$SCRIPT_DIR/lint-and-format.sh"
}

phase_types() {
    run_phase "types" "TypeScript Type Check" \
        "$SCRIPT_DIR/check-types.sh"
}

phase_tests() {
    run_phase "tests" "Tests with Coverage" \
        "$SCRIPT_DIR/run-tests.sh"
}

phase_build() {
    run_phase "build" "Production Build" \
        "pnpm build"
}

phase_bundle() {
    run_phase "bundle" "Bundle Size Analysis" \
        "$SCRIPT_DIR/check-bundle-size.sh"
}

phase_a11y() {
    run_phase "a11y" "Accessibility Checks" \
        "$SCRIPT_DIR/check-accessibility.sh"
}

phase_tokens() {
    run_phase "tokens" "Design Token Verification" \
        "$SCRIPT_DIR/verify-tokens.sh"
}

# Quality gate runs multiple checks
phase_quality() {
    log_phase "Quality Gate"

    local failed=0
    local phases_run=0
    local phases_skipped=0
    local phases_failed=0

    # Run independent phases
    if [[ "$PARALLEL" == true ]]; then
        log_info "Running quality checks in parallel..."

        # Run in background
        (phase_lint) &
        local lint_pid=$!

        (phase_types) &
        local types_pid=$!

        # Wait for all
        wait $lint_pid || ((phases_failed++))
        wait $types_pid || ((phases_failed++))

        # Run dependent phases sequentially
        phase_tests || ((phases_failed++))
        phase_build || ((phases_failed++))

        # Run post-build checks in parallel
        (phase_bundle) &
        local bundle_pid=$!

        (phase_a11y) &
        local a11y_pid=$!

        (phase_tokens) &
        local tokens_pid=$!

        wait $bundle_pid || ((phases_failed++))
        wait $a11y_pid || ((phases_failed++))
        wait $tokens_pid || ((phases_failed++))
    else
        # Sequential execution
        phase_lint || ((phases_failed++))
        phase_types || ((phases_failed++))
        phase_tests || ((phases_failed++))
        phase_build || ((phases_failed++))
        phase_bundle || ((phases_failed++))
        phase_a11y || ((phases_failed++))
        phase_tokens || ((phases_failed++))
    fi

    echo ""
    if [[ $phases_failed -eq 0 ]]; then
        log_success "Quality gate passed!"
    else
        log_error "Quality gate failed ($phases_failed phase(s) failed)"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}          ${MAGENTA}Incremental Build System${NC}                           ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Phase: $PHASE"
    log_info "Cache: $(if [[ "$ENABLE_CACHE" == true ]]; then echo "enabled"; else echo "disabled"; fi)"
    log_info "Profiling: $(if [[ "$ENABLE_PROFILING" == true ]]; then echo "enabled"; else echo "disabled"; fi)"
    log_info "Parallel: $(if [[ "$PARALLEL" == true ]]; then echo "enabled"; else echo "disabled"; fi)"

    # Record overall start
    local overall_start
    overall_start=$(date +%s%3N)

    # Run requested phase(s)
    case "$PHASE" in
        lint)
            phase_lint
            ;;
        types)
            phase_types
            ;;
        tests)
            phase_tests
            ;;
        build)
            phase_build
            ;;
        bundle)
            phase_bundle
            ;;
        a11y)
            phase_a11y
            ;;
        tokens)
            phase_tokens
            ;;
        quality|all)
            phase_quality
            ;;
        *)
            log_error "Unknown phase: $PHASE"
            echo "Run with --help for usage information"
            exit 1
            ;;
    esac

    local overall_end
    overall_end=$(date +%s%3N)
    local overall_duration=$((overall_end - overall_start))

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log_success "Total time: ${overall_duration}ms"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Complete profiler run
    if [[ "$ENABLE_PROFILING" == true ]] && [[ -f "$PROFILER_SCRIPT" ]]; then
        node "$PROFILER_SCRIPT" complete > /dev/null 2>&1 || true

        # Generate dashboard after significant runs
        if [[ -f "$DASHBOARD_SCRIPT" ]]; then
            log_info "Updating metrics dashboard..."
            node "$DASHBOARD_SCRIPT" generate --format md > /dev/null 2>&1 || true
        fi
    fi

    # Show cache status
    if [[ "$ENABLE_CACHE" == true ]] && [[ -f "$CACHE_SCRIPT" ]]; then
        echo ""
        log_info "Cache status:"
        node "$CACHE_SCRIPT" status 2>/dev/null | head -15 || true
    fi
}

# Run main
main "$@"
