// component-lanes.js — the per-item middle of the build pipelines.
//
// Called by /build-from-figma, /build-from-canva and /build-from-screenshot
// after Phase 3 (failing tests confirmed), or directly as /component-lanes with
// the same args. Two kinds of lane:
//
//   Build   one lane per component, tier by tier (ui → layout → sections →
//           pages, because higher tiers import lower ones). The converter makes
//           the component's tests pass; a separate agent then reruns the tests
//           and hashes the test file, and the script compares that hash with
//           the one the caller recorded after Phase 3. So "never modify the
//           tests" and the attempt bound are enforced here, in code.
//   Visual  at most maxVisualIterations rounds. Every page is diffed against
//           its references in parallel and the pass decision is made here from
//           the reported numbers. Fixes are grouped by component, so each
//           component has one owner per round, and every round re-checks every
//           page, so a fix to a shared component cannot quietly break a page
//           that already passed.
//
// The workflow writes no state and starts no server: the calling skill starts
// the dev server, captures the reference screenshots, records the result in
// .claude/plans/pipeline-state.json, and runs Phases 4.5-9.
//
// args = {
//   source: 'figma',                               // figma | canva | screenshot | conversation
//   converter: 'figma-react-converter',            // agent type that builds and fixes
//   testCommand: 'pnpm vitest run',                // renderer manifest → commands.test
//   lockfile: 'src/styles/design-tokens.lock.json',
//   buildSpec: '.claude/plans/build-spec.json',
//   components: [{ name, tier, dir, testFile, testSha256 }],   // tier: ui 0, layout 1, sections 2, pages 3
//   pages: [{ name, url, references: { '1440': '.claude/visual-qa/screenshots/figma/home-1440.png' } }],
//   maxBuildAttempts: 3,
//   maxVisualIterations: 5,                        // pipeline.config.json → iterationLoop
//   diffPassThreshold: 0.02,                       // fraction of pixels, as visual-diff.js reports
//   skipVisual: false,                             // the renderer excludes visual-diff (expo)
// }

export const meta = {
  name: 'component-lanes',
  description: 'Build each component in its own lane, tier by tier, then run bounded visual-diff rounds with one fixer per component (Phases 4-5 of the build pipelines).',
  whenToUse: 'After Phase 3 of /build-from-figma, /build-from-canva or /build-from-screenshot: failing tests written, the dev server running, reference screenshots captured.',
  phases: [
    { title: 'Build', detail: 'one converter lane per component, tier by tier; tests and the test file checked independently' },
    { title: 'Shared files', detail: 'one agent applies the barrel and config changes the lanes asked for' },
    { title: 'Visual', detail: 'bounded rounds: diff every page, then one fixer per component' },
    { title: 'Tests', detail: 'full test run after the last change' },
  ],
}

const input = args || {}
const components = Array.isArray(input.components) ? input.components : []
const pages = Array.isArray(input.pages) ? input.pages : []
const converter = input.converter || 'figma-react-converter'
const testCommand = input.testCommand || 'pnpm vitest run'
const lockfile = input.lockfile || 'src/styles/design-tokens.lock.json'
const buildSpec = input.buildSpec || '.claude/plans/build-spec.json'
const source = input.source || 'figma'
const maxBuildAttempts = Number.isInteger(input.maxBuildAttempts) && input.maxBuildAttempts > 0 ? input.maxBuildAttempts : 3
const maxVisualIterations = Number.isInteger(input.maxVisualIterations) && input.maxVisualIterations > 0 ? input.maxVisualIterations : 5
const threshold = typeof input.diffPassThreshold === 'number' ? input.diffPassThreshold : 0.02
if (!components.length) {
  throw new Error('component-lanes needs args.components (see the header comment); pass the build spec components with their test files')
}

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' }, description: 'Project-relative files written or edited' },
    testsPassed: { type: 'boolean', description: 'The component tests passed on your last run' },
    summary: { type: 'string', description: 'One or two sentences: what was built or changed' },
    sharedChanges: { type: 'array', items: { type: 'string' }, description: 'Edits a shared file needs (barrel export, tailwind config) that this lane did not make' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'testsPassed', 'summary'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    testSha256: { type: 'string', description: 'sha256 of the test file, lowercase hex' },
    passed: { type: 'boolean' },
    failing: { type: 'array', items: { type: 'string' }, description: 'Each failing test with its first assertion message' },
  },
  required: ['testSha256', 'passed', 'failing'],
}

const DIAG_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { width: { type: 'integer' }, mismatchPct: { type: 'number', description: 'Fraction, as visual-diff.js reports it (0.02 = 2%)' }, diffImage: { type: 'string' } },
        required: ['width', 'mismatchPct'],
      },
    },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          component: { type: 'string', description: 'Name of the component whose code causes the difference' },
          width: { type: 'integer' },
          region: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string', description: 'A precise change, naming the lockfile token to use' },
        },
        required: ['component', 'issue', 'fix'],
      },
    },
  },
  required: ['results', 'fixes'],
}

const SHARED_SCHEMA = {
  type: 'object',
  properties: { files: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } },
  required: ['files', 'summary'],
}

const TESTS_SCHEMA = {
  type: 'object',
  properties: { passed: { type: 'boolean' }, total: { type: 'integer' }, failed: { type: 'integer' }, failing: { type: 'array', items: { type: 'string' } } },
  required: ['passed', 'failing'],
}

const pct = (x) => `${(x * 100).toFixed(2)}%`
const tierOf = (c) => (Number.isInteger(c.tier) ? c.tier : 0)
const byName = new Map(components.map((c) => [c.name, c]))

function buildPrompt(c, attempt, lastCheck) {
  return [
    `Build the ${c.name} component (source: ${source}) so its tests pass. Attempt ${attempt} of ${maxBuildAttempts}.`,
    `Read ${buildSpec} for its entry and ${lockfile} for every value: colors, spacing, type and text come from the lockfile through Tailwind tokens or CSS variables, never as literals.`,
    `The tests are ${c.testFile}. They are the specification: never edit, rename or delete a test file. A changed test file fails this lane.`,
    `Write only inside ${c.dir}. Other lanes are building the other components at the same time, so leave shared files (barrel exports, tailwind config, tokens.css, the lockfile) alone and list any change they need in sharedChanges.`,
    lastCheck && !lastCheck.passed ? `The previous attempt still failed:\n${lastCheck.failing.map((f) => `- ${f}`).join('\n')}` : '',
    `Run ${testCommand} ${c.testFile} before returning. Do not deploy, publish or push anything.`,
  ].filter(Boolean).join('\n\n')
}

function checkPrompt(c) {
  return [
    `Check the ${c.name} component without changing any file.`,
    `1. Run: shasum -a 256 ${c.testFile}   and report the hash.`,
    `2. Run: ${testCommand} ${c.testFile}   and report whether every test passed, listing each failing test with its first assertion message.`,
  ].join('\n')
}

function diagnosePrompt(p, round) {
  const widths = Object.keys(p.references || {})
  return [
    `Visual check of the ${p.name} page, round ${round} of ${maxVisualIterations}. Diagnose only: do not edit any source file in this lane.`,
    `For each width in ${widths.join(', ')}: capture ${p.url} at that viewport width (full page) to .claude/visual-qa/screenshots/chromium/${p.name}-<width>.png, using Playwright (npx playwright screenshot --viewport-size=<width>,900 --full-page ${p.url} <file>) or the Chrome DevTools MCP.`,
    `Compare each capture with its reference: ${widths.map((w) => `${w} → ${p.references[w]}`).join('; ')}. Use node scripts/visual-diff.js <capture> <reference> --threshold ${threshold} --json and report mismatchPct as the fraction it prints.`,
    `For every width above ${pct(threshold)}, read the diff regions and name the component whose code causes each difference, with a precise fix that uses a lockfile token from ${lockfile}. Known components: ${components.map((c) => c.name).join(', ')}.`,
  ].join('\n\n')
}

function fixPrompt(c, fixes, round) {
  return [
    `Fix the ${c.name} component (${c.dir}) for these visual differences found in round ${round}:`,
    fixes.map((f) => `- ${f.page}${f.width ? ` @${f.width}px` : ''}${f.region ? ` (${f.region})` : ''}: ${f.issue} → ${f.fix}`).join('\n'),
    `Use only tokens from ${lockfile}. Write only inside ${c.dir}, and never edit a test file. Other components are being fixed at the same time.`,
    `Run ${testCommand} ${c.testFile} before returning; the tests must still pass.`,
  ].join('\n\n')
}

// One agent checks a component's tests and test file; the decision is made here.
async function verify(c, label) {
  const check = await agent(checkPrompt(c), { phase: label.startsWith('fix') ? 'Visual' : 'Build', label: `check:${c.name}:${label}`, schema: CHECK_SCHEMA, effort: 'low' })
  if (!check) return { status: 'MISSING', failing: ['the check agent did not return'] }
  if (c.testSha256 && String(check.testSha256).toLowerCase() !== String(c.testSha256).toLowerCase()) {
    return { status: 'TEST_TAMPERED', failing: [`${c.testFile} changed (sha256 ${check.testSha256}, expected ${c.testSha256})`] }
  }
  return check.passed ? { status: 'GREEN', failing: [] } : { status: 'FAILING', failing: check.failing }
}

async function buildLane(c) {
  let last = null
  const shared = []
  for (let attempt = 1; attempt <= maxBuildAttempts; attempt++) {
    const built = await agent(buildPrompt(c, attempt, last), { agentType: converter, phase: 'Build', label: `build:${c.name}:a${attempt}`, schema: BUILD_SCHEMA })
    if (!built) return { name: c.name, status: 'MISSING', attempts: attempt, failing: ['the converter did not return'], sharedChanges: shared }
    shared.push(...(built.sharedChanges || []))
    const v = await verify(c, `a${attempt}`)
    if (v.status === 'GREEN' || v.status === 'TEST_TAMPERED' || v.status === 'MISSING') {
      return { name: c.name, status: v.status, attempts: attempt, failing: v.failing, files: built.files, sharedChanges: shared, openQuestions: built.openQuestions || [] }
    }
    last = { passed: false, failing: v.failing }
  }
  return { name: c.name, status: 'NEEDS_REVIEW', attempts: maxBuildAttempts, failing: last ? last.failing : [], sharedChanges: shared }
}

// --- Build: tier by tier ----------------------------------------------------
// A barrier between tiers is needed: a section imports the primitives below it.
const results = new Map()
const tiers = [...new Set(components.map(tierOf))].sort((a, b) => a - b)
for (const t of tiers) {
  const lane = components.filter((c) => tierOf(c) === t)
  log(`Tier ${t}: building ${lane.length} component(s) in parallel`)
  const out = await pipeline(lane, (c) => buildLane(c))
  out.forEach((r, i) => results.set(lane[i].name, r || { name: lane[i].name, status: 'MISSING', attempts: 0, failing: ['the lane failed'] }))
  const shared = out.filter(Boolean).flatMap((r) => (r.sharedChanges || []).map((s) => `${r.name}: ${s}`))
  if (shared.length) {
    const applied = await agent([
      `Apply these shared-file changes that the tier ${t} component lanes asked for (barrel exports, tailwind config and similar):`,
      shared.map((s) => `- ${s}`).join('\n'),
      `Values come from ${lockfile}; never edit a test file. Run ${testCommand} afterwards and report the files you changed.`,
    ].join('\n\n'), { agentType: converter, phase: 'Shared files', label: `shared:tier${t}`, schema: SHARED_SCHEMA })
    if (!applied) log(`Tier ${t}: the shared-file agent did not return; ${shared.length} change(s) still pending`)
  }
  const green = lane.filter((c) => results.get(c.name).status === 'GREEN').length
  log(`Tier ${t}: ${green}/${lane.length} green`)
}

// --- Visual: bounded rounds ---------------------------------------------------
const pageStatus = {}
const checkable = pages.filter((p) => p && p.url && p.references && Object.keys(p.references).length)
for (const p of pages) if (!checkable.includes(p)) pageStatus[p.name] = { status: 'SKIPPED', reason: 'no url or no reference screenshots' }
if (pages.length > checkable.length) log(`Visual: ${pages.length - checkable.length} page(s) skipped for lack of a url or references`)

if (input.skipVisual) {
  for (const p of checkable) pageStatus[p.name] = { status: 'SKIPPED', reason: 'the renderer excludes visual-diff' }
} else if (checkable.length) {
  for (let round = 1; round <= maxVisualIterations; round++) {
    const diags = await pipeline(checkable, (p) => agent(diagnosePrompt(p, round), { agentType: 'visual-qa-agent', phase: 'Visual', label: `diff:${p.name}:r${round}`, schema: DIAG_SCHEMA }))
    const failing = []
    diags.forEach((d, i) => {
      const p = checkable[i]
      if (!d || !Array.isArray(d.results) || !d.results.length) {
        pageStatus[p.name] = { status: 'NEEDS_REVIEW', rounds: round, reason: 'the visual check returned no measurements' }
        return
      }
      const worst = Math.max(...d.results.map((r) => Number(r.mismatchPct) || 0))
      const pass = d.results.every((r) => Number(r.mismatchPct) <= threshold)
      pageStatus[p.name] = { status: pass ? 'PASS' : 'FAILING', rounds: round, worstMismatchPct: worst, results: d.results }
      if (!pass) failing.push({ page: p.name, fixes: d.fixes || [] })
    })
    if (!failing.length) {
      const unmeasured = checkable.filter((p) => pageStatus[p.name].status === 'NEEDS_REVIEW').length
      log(unmeasured ? `Visual: no page over ${pct(threshold)} in round ${round}, but ${unmeasured} page(s) could not be measured` : `Visual: every page within ${pct(threshold)} after round ${round}`)
      break
    }
    if (round === maxVisualIterations) {
      for (const f of failing) pageStatus[f.page].status = 'NEEDS_REVIEW'
      log(`Visual: reached the iteration bound (${maxVisualIterations}); ${failing.length} page(s) need manual review`)
      break
    }
    // Barrier: group every page's findings by component, so one agent owns each component.
    const byComponent = new Map()
    for (const f of failing) {
      for (const fix of f.fixes) {
        const name = byName.has(fix.component) ? fix.component : null
        if (!name) continue
        if (!byComponent.has(name)) byComponent.set(name, [])
        byComponent.get(name).push({ ...fix, page: f.page })
      }
    }
    const unowned = failing.reduce((n, f) => n + f.fixes.filter((x) => !byName.has(x.component)).length, 0)
    if (unowned) log(`Visual round ${round}: ${unowned} finding(s) named no known component and were left for review`)
    const owners = [...byComponent.entries()].filter(([name]) => results.get(name)?.status !== 'TEST_TAMPERED')
    if (!owners.length) {
      for (const f of failing) pageStatus[f.page].status = 'NEEDS_REVIEW'
      log(`Visual round ${round}: no fixable finding left; stopping`)
      break
    }
    log(`Visual round ${round}: ${failing.length} page(s) over ${pct(threshold)}; fixing ${owners.length} component(s)`)
    await pipeline(
      owners,
      ([name, fixes]) => agent(fixPrompt(byName.get(name), fixes, round), { agentType: converter, phase: 'Visual', label: `fix:${name}:r${round}`, schema: BUILD_SCHEMA }),
      async (fixed, [name]) => {
        const v = await verify(byName.get(name), `fix-r${round}`)
        const prev = results.get(name) || { name }
        if (v.status !== 'GREEN') results.set(name, { ...prev, status: v.status === 'FAILING' ? 'NEEDS_REVIEW' : v.status, failing: v.failing, visualRound: round })
        return { name, fixed: !!fixed, status: v.status }
      },
    )
  }
}

// --- Tests: one full run after the last change ---------------------------------
const tests = await agent(`Run the full suite with ${testCommand} and report the result without changing any file: whether every test passed, the totals, and each failing test with its first assertion message.`, { phase: 'Tests', label: 'tests:full', schema: TESTS_SCHEMA, effort: 'low' })

const list = components.map((c) => results.get(c.name) || { name: c.name, status: 'MISSING' })
const count = (s) => list.filter((r) => r.status === s).length
return {
  components: list.map(({ sharedChanges: _sharedChanges, ...r }) => r),
  pages: pageStatus,
  tests: tests || { passed: false, failing: ['the test agent did not return'] },
  summary: {
    green: count('GREEN'),
    needsReview: count('NEEDS_REVIEW'),
    tampered: count('TEST_TAMPERED'),
    missing: count('MISSING'),
    pagesPassed: Object.values(pageStatus).filter((p) => p.status === 'PASS').length,
    pagesNeedReview: Object.values(pageStatus).filter((p) => p.status === 'NEEDS_REVIEW').length,
  },
  nextStep: 'Record this in .claude/plans/pipeline-state.json (phases 4 and 5, components, pages), restore any TEST_TAMPERED test file from Phase 3, then run Phases 4.5-9 through parallel-orchestration without component-build and visual-diff.',
}
