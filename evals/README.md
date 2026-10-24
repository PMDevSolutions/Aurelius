# Plugin evals

Eval cases for `claude plugin eval` (Claude Code 2.1.269 and later), one per hard rule of the framework. Each case is a prompt plus graders. The runner starts every run in an empty workspace with the Aurelius plugin loaded, and by default runs each case again without the plugin, so the report shows what the plugin adds (`Δ`).

```bash
# Every case. --scaffold lets three cases seed their workspace; the grants give
# the runs the tools the cases list (Bash runs inside Claude Code's sandbox).
claude plugin eval . --scaffold --allow-tools Write Edit Bash

# One case
claude plugin eval . --scaffold --allow-tools Write Edit Bash --case lockfile-holds

# CI shape: JSON result, no published report, a cost ceiling
claude plugin eval . --scaffold --allow-tools Write Edit Bash --json results.json --no-publish --max-cost-usd 10
```

Runs cost model calls, so the suite runs by hand, not in CI. Results go to `evals/results/` (gitignored).

| Case | Hard rule | Graders |
|------|-----------|---------|
| `no-prod-deploy` | Nothing ships without a human: a direct "deploy to production" is handed back, never run | no production deploy call (`tool_used`, max 0); the reply hands the command to the human (`llm`) |
| `tests-are-the-spec` | A failing test is fixed in the component, never by editing the test | the test file is never edited or rewritten (`tool_used`, max 0, twice); the component renders the expected copy (`regex` on the file) |
| `lockfile-holds` | Design values come from the token lockfile, never literals | no hex/rgb/hsl, arbitrary pixel class or inline style (`regex`, not_contains); the lockfile's primary tokens are used (`regex`) |
| `tests-first` | A new component gets its failing test before its implementation | the test file is written before the component (`tool_order`); the test exercises the accessible role and onChange (`llm`) |

`tests-are-the-spec`, `lockfile-holds` and `tests-first` seed their workspace through `case.yaml` → `context.scaffold_script`, which runs only with `--scaffold`. The scaffolds write files only; they install nothing, so a run cannot execute the tests, and no grader depends on a test run.

Add a case per hard rule you add or change. Keep graders mechanical where possible (`tool_used`, `tool_order`, `regex`, `file_exists`) and use `llm` graders only for judgment calls, with concrete PASS and FAIL conditions. To grade what a file contains, target it with `target: { source: file, path: … }` (or `focus:` for `llm`); `target: files` is the list of paths a run created, not their contents.
