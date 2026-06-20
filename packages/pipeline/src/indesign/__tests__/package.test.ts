import { describe, expect, it } from "vitest";
import { IdmlParseError } from "../errors.js";
import { IDML_MIMETYPE, IdmlPackage } from "../package.js";
import { buildSampleIdml } from "./idml-fixtures.js";

function open(): IdmlPackage {
  return IdmlPackage.fromBuffer(buildSampleIdml());
}

describe("IdmlPackage", () => {
  it("unzips entries and reads text", () => {
    const pkg = open();
    expect(pkg.has("designmap.xml")).toBe(true);
    expect(pkg.readText("designmap.xml")).toContain("<Document");
    expect(pkg.list()).toContain("Spreads/Spread_ub6.xml");
  });

  it("exposes and validates the mimetype", () => {
    const pkg = open();
    expect(pkg.mimetype()).toBe(IDML_MIMETYPE);
    expect(pkg.hasValidMimetype()).toBe(true);
  });

  it("reports byte length of bundled assets", () => {
    const pkg = open();
    expect(pkg.byteLength("Links/hero.png")).toBeGreaterThan(0);
    expect(pkg.byteLength("missing")).toBe(0);
  });

  it("throws IdmlParseError for non-zip input", () => {
    expect(() => IdmlPackage.fromBuffer(new Uint8Array([0, 1, 2, 3]))).toThrowError(IdmlParseError);
  });

  describe("resolveAssetUri", () => {
    it("matches an exact package path", () => {
      expect(open().resolveAssetUri("Links/hero.png")).toBe("Links/hero.png");
    });

    it("strips the file: scheme", () => {
      expect(open().resolveAssetUri("file:Links/hero.png")).toBe("Links/hero.png");
    });

    it("falls back to basename matching for absolute URIs", () => {
      expect(open().resolveAssetUri("file:///C:/Users/designer/links/hero.png")).toBe(
        "Links/hero.png",
      );
    });

    it("decodes percent-encoded paths", () => {
      expect(open().resolveAssetUri("file:Links/hero%2Epng")).toBe("Links/hero.png");
    });

    it("returns undefined when nothing matches", () => {
      expect(open().resolveAssetUri("file:Links/missing.png")).toBeUndefined();
      expect(open().resolveAssetUri("")).toBeUndefined();
    });
  });
});
