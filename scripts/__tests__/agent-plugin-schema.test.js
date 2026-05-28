import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaPath = join(root, ".claude", "agent-plugin.schema.json");

let validate;
beforeAll(async () => {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
});

const base = { name: "demo-agent", version: "1.0.0", description: "A demo agent" };

describe("agent-plugin.schema.json", () => {
  it("accepts a minimal valid manifest", () => {
    expect(validate(base)).toBe(true);
  });
  it("rejects a missing name", () => {
    const { name, ...noName } = base;
    expect(validate(noName)).toBe(false);
  });
  it("rejects a non-kebab name", () => {
    expect(validate({ ...base, name: "Demo_Agent" })).toBe(false);
  });
  it("rejects an unknown hook key", () => {
    expect(validate({ ...base, hooks: { onClick: "x.sh" } })).toBe(false);
  });
  it("rejects unknown top-level keys", () => {
    expect(validate({ ...base, bogus: true })).toBe(false);
  });
});
