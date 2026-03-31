# Troubleshooting FAQ

Common issues, error messages, and solutions when working with the Aurelius framework.

---

## Setup Issues

### pnpm is not recognized / command not found

**Problem:** Running `pnpm install` returns "command not found".

**Solution:**
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

If `corepack` is not available, install pnpm directly:
```bash
npm install -g pnpm
```

> Aurelius requires pnpm. npm and yarn are not supported.

---

### setup-project.sh fails with permission denied

**Problem:** `./scripts/setup-project.sh` returns "Permission denied".

**Solution:**
```bash
chmod +x scripts/*.sh
./scripts/setup-project.sh my-app --vite
```

On Windows with Git Bash, scripts should work without `chmod`. If they do not, run:
```bash
bash scripts/setup-project.sh my-app --vite
```

---

### Playwright browsers not installed

**Problem:** Cross-browser tests fail with "browser not found" or "executable doesn't exist".

**Solution:**
```bash
./scripts/setup-playwright.sh
```

This installs Chromium, Firefox, and WebKit browser engines. It only needs to be run once per machine.

---

## Pipeline Issues

### Phase 3 (TDD) blocks Phase 4 -- "test files do not exist"

**Problem:** The pipeline will not proceed to the component build phase.

**Cause:** TDD enforcement is a hard gate. Phase 4 cannot start until Phase 3 has created test files for every component listed in `build-spec.json`.

**Solution:** This is by design. The pipeline writes tests first (RED phase), then builds components to pass them (GREEN phase). If Phase 3 is failing:

1. Check `build-spec.json` for the list of expected components
2. Verify the `tdd-from-figma` skill has write access to the test directory
3. Check for TypeScript errors in generated test files

To see the TDD configuration:
```bash
cat .claude/pipeline.config.json | grep -A 10 '"tdd"'
```

---

### Visual diff keeps failing / never reaches 2% threshold

**Problem:** Phase 5 iterates 5 times and still reports pixel mismatch above threshold.

**Solutions:**

1. **Check if the design has complex gradients or shadows.** These are hard to match pixel-perfectly. Consider relaxing the threshold temporarily:
   ```json
   "iterationLoop": { "diffPassThreshold": 0.05 }
   ```

2. **Font rendering differences.** System fonts render differently across OS. Use web fonts (Google Fonts, Fontsource) to ensure consistency.

3. **Anti-aliasing issues.** Ensure `antialiasing: true` is set in `visualDiff` config.

4. **View the diff images.** Check `.claude/visual-qa/diffs/` for highlighted differences. The magenta overlay shows exactly which pixels differ.

5. **Sub-pixel classification.** If diffs are mostly sub-pixel (cosmetic), the pipeline should classify them as such. Check the diff report for "sub-pixel" vs "structural" categorization.

---

### Token verification fails -- "hardcoded values detected"

**Problem:** `verify-tokens.sh` reports hardcoded colors, spacing, or font values in component files.

**Cause:** Components are using raw values (like `#3B82F6` or `16px`) instead of design tokens from the lockfile.

**Solution:**

1. Check which values are flagged:
   ```bash
   ./scripts/verify-tokens.sh
   ```

2. Replace hardcoded values with Tailwind utility classes that reference your design tokens:
   ```tsx
   // Bad: hardcoded color
   <div className="bg-[#3B82F6]">

   // Good: design token via Tailwind config
   <div className="bg-primary-500">
   ```

3. If the lockfile is outdated, re-sync:
   ```bash
   ./scripts/sync-tokens.sh
   ```

---

### Lighthouse scores below threshold

**Problem:** Quality gate fails because Lighthouse scores are under the configured minimums.

**Default thresholds:** Performance 80, Accessibility 90, Best Practices 90, SEO 90.

**Common fixes:**

| Issue | Category | Fix |
|-------|----------|-----|
| Large bundle | Performance | Code split with `React.lazy()`, analyze with `./scripts/check-bundle-size.sh` |
| Missing alt text | Accessibility | Add `alt` attributes to all `<img>` elements |
| No meta description | SEO | Add `<meta name="description">` to `<head>` |
| HTTP resources on HTTPS | Best Practices | Use HTTPS for all external resources |
| Missing viewport meta | Accessibility | Add `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| Render-blocking CSS | Performance | Inline critical CSS or use `media` attributes |

Run a standalone audit to see detailed recommendations:
```bash
# Using Chrome DevTools MCP or Lighthouse CLI
npx lighthouse http://localhost:3000 --output html --output-path ./lighthouse-report.html
```

---

### Cross-browser screenshots differ too much

**Problem:** Firefox or WebKit screenshots diverge from Chromium beyond the 3% threshold.

**Common causes:**
- Font rendering (Firefox renders text differently from Chromium)
- Scrollbar styling (WebKit does not support `::-webkit-scrollbar` in Firefox)
- CSS feature gaps (check with `./scripts/audit-cross-browser-css.sh`)

**Solutions:**
1. Use the CSS reset template: `templates/shared/css/cross-browser-reset.css`
2. Audit CSS compatibility: `./scripts/audit-cross-browser-css.sh --json`
3. Relax the threshold if differences are cosmetic:
   ```json
   "e2e": { "crossBrowserDiffThreshold": 0.05 }
   ```

---

### Pipeline hangs or seems stuck

**Problem:** A pipeline phase appears to hang without progress.

**Possible causes:**

1. **Dev server not starting.** Check if port 3000/5173 is already in use:
   ```bash
   lsof -i :3000  # macOS/Linux
   netstat -ano | findstr :3000  # Windows
   ```

2. **Playwright waiting for element.** E2E tests have a 30-second timeout. If the page is slow to render, increase:
   ```json
   "e2e": { "timeoutMs": 60000 }
   ```

3. **Network idle wait.** Screenshot capture waits for network idle. If the page makes ongoing requests (WebSocket, polling), increase or disable:
   ```json
   "screenshotCapture": { "waitForNetworkIdle": false, "waitAfterLoadMs": 3000 }
   ```

---

## Agent Issues

### Claude Code does not use the expected agent

**Problem:** You ask Claude to do something, but it does not invoke the specialized agent you expected.

**Explanation:** Agents are selected based on task context, not explicit invocation. Claude Code reads your prompt and chooses the most relevant agent.

**Tips:**
- Be specific about what you want: "Build a React hero component" triggers `frontend-developer`
- Mention the domain: "Write Playwright E2E tests" triggers `test-writer-fixer` or `api-tester`
- For design conversion, provide the URL: "Convert this Figma design" triggers `figma-react-converter`

---

### Agent runs out of context

**Problem:** A complex agent task fails partway through because the context window fills up.

**Solutions:**
- Break the task into smaller steps
- Use the `/session-handoff` skill to create a handoff document for the next session
- For large codebases, point the agent to specific files rather than asking it to explore broadly

---

## MCP Server Issues

### Figma MCP cannot connect

**Problem:** Figma pipeline fails with "MCP connection failed" or "server not available".

**Solution:**

1. Ensure the Figma desktop app is running (required for Figma Desktop MCP)
2. Check that port 3845 is not blocked:
   ```bash
   curl http://localhost:3845/health
   ```
3. The remote Figma MCP is a fallback -- ensure your Figma access token is configured in `.claude/settings.json`

---

### Canva MCP returns empty results

**Problem:** Canva pipeline intake phase finds no designs.

**Solutions:**
1. Verify the Canva URL is a direct design link (format: `canva.com/design/DAG.../`)
2. Check that the Canva AI Connector MCP server is configured and running
3. The Canva pipeline retries up to 3 times with exponential backoff -- check logs for retry messages

---

## Design Token Issues

### Token drift detected by sync-tokens.sh

**Problem:** `sync-tokens.sh` reports that design tokens in source code have drifted from the lockfile.

**What this means:** Someone (or an agent) modified token values in the Tailwind config or CSS variables without updating the lockfile, or the Figma design changed.

**Solution:**
```bash
# See what drifted
./scripts/sync-tokens.sh --dry-run --json

# To update the lockfile from current source (if source is correct)
# Re-run the design-token-lock skill with the Figma URL

# To update source from lockfile (if lockfile is correct)
# The pipeline will auto-correct during the next build phase
```

---

### build-spec.json is missing or invalid

**Problem:** Pipeline phases fail because `build-spec.json` does not exist or has unexpected structure.

**Cause:** The intake phase (Phase 1) either did not run or failed silently.

**Solution:**
1. Re-run the intake skill manually:
   ```
   # For Figma
   /build-from-figma <URL>

   # The intake phase will re-discover the design
   ```

2. If manually creating `build-spec.json`, ensure it has these required fields:
   - `appType`: `"web-app"`, `"chrome-extension"`, `"pwa"`, or `"react-native"`
   - `outputTarget`: `"react"`, `"vue"`, `"svelte"`, or `"react-native"`
   - `components`: array of component definitions
   - `e2eFlows`: array of test flow definitions

---

## Script Issues

### Scripts fail on Windows

**Problem:** Shell scripts do not run on Windows outside of Git Bash or WSL.

**Solution:** Use Git Bash (included with Git for Windows) or WSL. All scripts are written for bash and use Unix-style paths.

```bash
# In Git Bash or WSL
./scripts/lint-and-format.sh
```

---

### check-dead-code.sh reports false positives

**Problem:** `check-dead-code.sh` flags files or exports that are actually used.

**Cause:** knip (the dead code detector) may not detect dynamic imports or framework-specific patterns.

**Solution:** The config excludes test, story, and E2E files by default. If you have additional patterns to exclude, update `pipeline.config.json`:
```json
"deadCode": {
  "ignorePatterns": [
    "**/*.stories.*",
    "**/*.test.*",
    "**/*.e2e.*",
    "**/your-pattern.*"
  ]
}
```

---

## Git and PR Issues

### Pre-commit hook blocks commit with token violations

**Problem:** The pre-commit token guard hook prevents your commit.

**Cause:** Your changes contain hardcoded design values that should use tokens from the lockfile.

**Solution:**
1. Run `./scripts/verify-tokens.sh` to see the violations
2. Replace hardcoded values with Tailwind token classes
3. Commit again

> Do not bypass hooks with `--no-verify`. The token guard exists to prevent design inconsistencies.

---

### Bundle size guard warns on commit

**Problem:** The bundle size hook warns that the build output exceeds `maxSizeKb`.

**Solution:**
1. Check your bundle: `./scripts/check-bundle-size.sh`
2. Look for large dependencies: `pnpm why <package-name>`
3. Consider code splitting, tree-shaking, or replacing heavy libraries
4. The default limit is 200KB. Adjust in `pipeline.config.json` if your app legitimately needs more:
   ```json
   "bundleSize": { "maxSizeKb": 300 }
   ```

---

## Still Stuck?

1. **Check existing docs:** The [Architecture Overview](architecture.md) and [Pipeline Configuration](pipeline-configuration.md) may have the answer
2. **Search past conversations:** Use the `episodic-memory` plugin to search previous Claude Code sessions for similar issues
3. **Open an issue:** [GitHub Issues](https://github.com/PMDevSolutions/Aurelius/issues) for bugs and feature requests
4. **Start a discussion:** [GitHub Discussions](https://github.com/PMDevSolutions/Aurelius/discussions) for questions and ideas
