import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseFrontmatter,
  countExamples,
  buildCatalog,
  satisfiesRange,
  resolveDependencies,
} from "../agent-plugin-lib.js";

function makePlugin(root, name, version, deps = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "plugin.json"),
    JSON.stringify({
      name,
      version,
      description: `${name} agent`,
      dependencies: { agents: deps },
    }),
  );
  return dir;
}

describe("parseFrontmatter", () => {
  it("splits frontmatter from body", () => {
    const md = "---\nname: foo\ndescription: A test agent\ntools: Read, Write\n---\nBody here";
    const { frontmatter, body, hasFrontmatter } = parseFrontmatter(md);
    expect(hasFrontmatter).toBe(true);
    expect(frontmatter.name).toBe("foo");
    expect(frontmatter.description).toBe("A test agent");
    expect(frontmatter.tools).toBe("Read, Write");
    expect(body.trim()).toBe("Body here");
  });

  it("returns hasFrontmatter false when absent", () => {
    const { frontmatter, hasFrontmatter } = parseFrontmatter("no frontmatter");
    expect(hasFrontmatter).toBe(false);
    expect(frontmatter).toEqual({});
  });

  it("collects YAML block-list values into a comma-joined string", () => {
    const md = "---\nname: foo\ntools:\n  - Read\n  - Write\n---\nbody";
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.name).toBe("foo");
    expect(frontmatter.tools).toBe("Read, Write");
  });
});

describe("countExamples", () => {
  it("counts <example> blocks", () => {
    expect(countExamples("a <example>x</example> b <example>y</example>")).toBe(2);
    expect(countExamples("none")).toBe(0);
  });

  it("treats null/undefined as zero", () => {
    expect(countExamples(null)).toBe(0);
    expect(countExamples(undefined)).toBe(0);
  });
});

describe("buildCatalog + satisfiesRange", () => {
  it("indexes plugins by name with version and deps", () => {
    const root = mkdtempSync(join(tmpdir(), "plg-"));
    try {
      makePlugin(root, "alpha", "1.0.0");
      makePlugin(root, "beta", "2.1.0", { alpha: "^1.0.0" });
      const catalog = buildCatalog(root);
      expect(Object.keys(catalog).sort()).toEqual(["alpha", "beta"]);
      expect(catalog.beta.version).toBe("2.1.0");
      expect(catalog.beta.deps).toEqual({ alpha: "^1.0.0" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns empty catalog for a missing root", () => {
    expect(buildCatalog(join(tmpdir(), "does-not-exist-xyz"))).toEqual({});
  });

  it("satisfiesRange wraps semver", () => {
    expect(satisfiesRange("1.2.0", "^1.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
  });
});

describe("resolveDependencies", () => {
  const catalog = {
    a: { version: "1.0.0", deps: {} },
    b: { version: "1.0.0", deps: { a: "^1.0.0" } },
    c: { version: "1.0.0", deps: { b: "^1.0.0", a: "^1.0.0" } },
  };

  it("orders dependencies before dependents", () => {
    const { order, errors } = resolveDependencies(catalog, "c");
    expect(errors).toEqual([]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    expect(order[order.length - 1]).toBe("c");
  });

  it("flags a missing dependency", () => {
    const { errors } = resolveDependencies({ x: { version: "1.0.0", deps: { y: "^1.0.0" } } }, "x");
    expect(errors.some((e) => e.code === "missing")).toBe(true);
  });

  it("flags a version mismatch", () => {
    const c = { p: { version: "1.0.0", deps: { q: "^2.0.0" } }, q: { version: "1.0.0", deps: {} } };
    const { errors } = resolveDependencies(c, "p");
    expect(errors.some((e) => e.code === "version")).toBe(true);
  });

  it("detects a cycle", () => {
    const c = {
      m: { version: "1.0.0", deps: { n: "^1.0.0" } },
      n: { version: "1.0.0", deps: { m: "^1.0.0" } },
    };
    const { errors } = resolveDependencies(c, "m");
    expect(errors.some((e) => e.code === "cycle")).toBe(true);
  });
});
