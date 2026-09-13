import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsePrereqOutput } from "../../../src/core/prerequisites/prereq-parser";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Promise<string> =>
  readFile(join(here, "..", "..", "fixtures", name), "utf8");

test("all-pass fixture → ready, groups, versions, summary", async () => {
  const report = parsePrereqOutput(await fixture("prereq-all-pass.txt"), 0);

  assert.equal(report.ready, true);
  assert.deepEqual(report.summary, {
    requiredPassed: 4,
    requiredTotal: 4,
    optionalInstalled: 3,
    optionalTotal: 3,
    systemPassed: 3,
    systemTotal: 3,
  });

  const git = report.items.find((i) => i.key === "git");
  assert.ok(git, "git item present");
  assert.equal(git?.status, "pass");
  assert.equal(git?.group, "required-software");
  assert.equal(git?.version, "2.43.0");
  assert.equal(git?.minVersion, "2.30.0");

  const pnpm = report.items.find((i) => i.key === "pnpm");
  assert.equal(pnpm?.status, "pass");
  assert.equal(pnpm?.group, "required-software");

  const playwright = report.items.find((i) => i.key === "playwright");
  assert.equal(playwright?.status, "pass");
  assert.equal(playwright?.group, "optional-software");

  assert.equal(
    report.items.find((i) => i.key === "env"),
    undefined,
    "no credentials group",
  );
  assert.ok(!report.items.some((i) => i.status === "fail"), "no failures");
  // The trailing "1. 2. 3." footer must NOT have leaked into the last item's hints.
  const os = report.items.find((i) => i.key === "os");
  assert.ok(!os?.hints.some((h) => /setup-project/.test(h)), "footer steps must not be hints");
});

test("with-failures fixture → pnpm fails with guidance + hints, not ready", async () => {
  const report = parsePrereqOutput(await fixture("prereq-with-failures.txt"), 1);

  assert.equal(report.ready, false);
  const pnpm = report.items.find((i) => i.key === "pnpm");
  assert.ok(pnpm, "pnpm item present");
  assert.equal(pnpm?.status, "fail");
  assert.ok(pnpm?.guidance, "failure should carry curated guidance");
  assert.match(pnpm?.guidance?.url ?? "", /pnpm\.io/);
  assert.ok(
    pnpm?.hints.some((h) => /corepack/.test(h)),
    "install hint attached",
  );
  assert.equal(report.summary.requiredPassed, 3);

  // [WARN] lines parse as warn items and never block readiness on their own.
  const playwrightWarn = report.items.find((i) => i.key === "playwright" && i.status === "warn");
  assert.ok(playwrightWarn, "playwright browser warning parsed");
  assert.ok(playwrightWarn?.detail.includes("setup-playwright.sh"));
});

test("with-skips fixture → optional skips + browser warning stay non-blocking", async () => {
  const report = parsePrereqOutput(await fixture("prereq-with-skips.txt"), 0);

  assert.equal(report.ready, true, "warnings and skips do not block readiness");
  const gh = report.items.find((i) => i.key === "gh");
  assert.equal(gh?.status, "skip");
  assert.equal(gh?.group, "required-accounts");
  const jq = report.items.find((i) => i.key === "jq");
  assert.equal(jq?.status, "skip");
  assert.equal(jq?.group, "optional-software");
  assert.equal(report.summary.optionalInstalled, 0);
  assert.equal(report.summary.optionalTotal, 2);
});

test("strips ANSI color codes before parsing", () => {
  const raw = "\x1b[0;32m[PASS]\x1b[0m Git \x1b[0;36m2.43.0\x1b[0m (minimum: 2.30.0)";
  const report = parsePrereqOutput(raw, 0);

  const git = report.items.find((i) => i.key === "git");
  assert.ok(git, "git parsed from ANSI-laden line");
  assert.equal(git?.status, "pass");
  assert.equal(git?.version, "2.43.0");
  assert.ok(!report.raw.includes("\x1b"), "raw output has ANSI stripped");
});
