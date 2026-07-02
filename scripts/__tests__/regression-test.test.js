import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "regression-test.sh");
const COMMON = join(__dirname, "..", "lib", "common.sh");

function run(args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 15000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: err.status,
    };
  }
}

describe("regression-test.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    // --help must come after the URL arg (first positional is consumed as URL)
    const result = run(["http://localhost:0", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--update-baselines");
    expect(result.stdout).toContain("--json");
  });
});

// The baseline directory is shared with visualBaselines (RFC 0002): committed
// firefox/webkit baselines must not surface as SKIP noise in the chromium
// regression walk, so the walk is restricted to regressionTesting.browsers.
describe("common_find_baselines — browser-filtered baseline walk", () => {
  let tmp;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "find-baselines-"));
    for (const rel of [
      "chromium/home/mobile_375px.png",
      "chromium/about/desktop_1440px.png",
      "firefox/home/mobile_375px.png",
      "webkit/home/mobile_375px.png",
    ]) {
      const p = join(tmp, ...rel.split("/"));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, "png");
    }
    writeFileSync(join(tmp, "manifest.json"), "{}");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function findBaselines(csv) {
    const stdout = execFileSync(
      "bash",
      ["-c", `source "$1" && common_find_baselines "$2" "$3"`, "bash", COMMON, tmp, csv],
      { encoding: "utf-8", timeout: 15000 },
    );
    return stdout.split("\n").filter(Boolean);
  }

  it("lists only the requested browsers' PNGs, sorted", () => {
    const files = findBaselines("chromium");
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.includes("chromium"))).toBe(true);
    expect(files).toEqual([...files].sort());
  });

  it("supports multiple browsers and ignores missing directories", () => {
    const files = findBaselines("chromium, webkit, nonexistent");
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.includes("webkit"))).toBe(true);
    expect(files.some((f) => f.includes("firefox"))).toBe(false);
  });

  it("prints nothing for an empty browser list", () => {
    expect(findBaselines("")).toHaveLength(0);
  });
});

describe("baseline writers keep provenance in sync", () => {
  it("regression-test.sh walks via common_find_baselines and syncs the manifest after --update-baselines", () => {
    const source = readFileSync(SCRIPT, "utf-8");
    expect(source).toMatch(/common_find_baselines/);
    expect(source).toMatch(/baseline-manifest\.js.+sync/);
  });

  it("capture-baselines.sh syncs the manifest after capture", () => {
    const source = readFileSync(join(__dirname, "..", "capture-baselines.sh"), "utf-8");
    expect(source).toMatch(/baseline-manifest\.js.+sync/);
  });
});
