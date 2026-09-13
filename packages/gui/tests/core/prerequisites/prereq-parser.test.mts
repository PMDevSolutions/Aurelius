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
    optionalInstalled: 4,
    optionalTotal: 4,
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

  const env = report.items.find((i) => i.key === "env");
  assert.equal(env?.status, "pass");
  assert.equal(env?.group, "wix-credentials");

  assert.ok(!report.items.some((i) => i.status === "fail"), "no failures");
  // The trailing "1. 2. 3." footer must NOT have leaked into the last item's hints.
  const os = report.items.find((i) => i.key === "os");
  assert.ok(!os?.hints.some((h) => /setup wizard/.test(h)), "footer steps must not be hints");
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
  const envWarn = report.items.find((i) => i.key === "env");
  assert.equal(envWarn?.status, "warn");
  assert.equal(envWarn?.group, "wix-credentials");
  const playwrightWarn = report.items.find((i) => i.key === "playwright" && i.status === "warn");
  assert.ok(playwrightWarn, "playwright browser warning parsed");
});

test("with-skips fixture → optional skips + credential warning stay non-blocking", async () => {
  const report = parsePrereqOutput(await fixture("prereq-with-skips.txt"), 0);

  assert.equal(report.ready, true, "warnings and skips do not block readiness");
  const wix = report.items.find((i) => i.key === "wix");
  assert.equal(wix?.status, "skip");
  assert.equal(wix?.group, "optional-software");
  const env = report.items.find((i) => i.key === "env");
  assert.equal(env?.status, "warn");
  assert.ok(
    env?.hints.some((h) => /AURELIUS_DRY_RUN/.test(h)),
    "dry-run hint attached",
  );
  assert.equal(report.summary.optionalInstalled, 0);
  assert.equal(report.summary.optionalTotal, 3);
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
