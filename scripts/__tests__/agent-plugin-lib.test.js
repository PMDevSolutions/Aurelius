import { describe, it, expect } from "vitest";
import { parseFrontmatter, countExamples } from "../agent-plugin-lib.js";

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
});

describe("countExamples", () => {
  it("counts <example> blocks", () => {
    expect(countExamples("a <example>x</example> b <example>y</example>")).toBe(2);
    expect(countExamples("none")).toBe(0);
  });
});
