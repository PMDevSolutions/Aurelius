/**
 * Font fallback resolution.
 *
 * InDesign families are mapped to web-safe / Google-Fonts stacks via
 * `config/font-map.json` (the configurable default table), with per-call
 * overrides. Unmapped families fall back to a generic stack inferred from the
 * name and are flagged so the mapper can warn.
 */
import { readFileSync } from "node:fs";

/** A user-supplied override table: family → stack (string or array). */
export type FontMapOverrides = Record<string, string | string[]>;

let cachedDefaults: Record<string, string[]> | undefined;

/** Load and memoize the default font map from `config/font-map.json`. */
export function loadDefaultFontMap(): Record<string, string[]> {
  if (cachedDefaults) return cachedDefaults;
  try {
    const url = new URL("../../config/font-map.json", import.meta.url);
    const raw = JSON.parse(readFileSync(url, "utf-8")) as Record<string, string[]>;
    cachedDefaults = raw;
  } catch {
    cachedDefaults = {};
  }
  return cachedDefaults;
}

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

/** Quote a font family for CSS when it contains spaces and is not generic. */
function cssFamily(name: string): string {
  if (GENERIC.has(name.toLowerCase())) return name;
  return /\s/.test(name) ? `"${name}"` : name;
}

/** Join a list of families into a CSS `font-family` value. */
export function formatFontStack(families: string[]): string {
  return families.map(cssFamily).join(", ");
}

function genericFor(family: string): string {
  if (/mono|courier|consol|code/i.test(family)) return "monospace";
  if (
    /serif|times|georgia|garamond|minion|caslon|baskerville|didot|bodoni|roman|book/i.test(family)
  ) {
    return "serif";
  }
  return "sans-serif";
}

function normalizeOverrides(overrides: FontMapOverrides): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [family, value] of Object.entries(overrides)) {
    out[family] = Array.isArray(value) ? value : splitStack(value);
  }
  return out;
}

function splitStack(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export interface ResolvedFont {
  stack: string;
  mapped: boolean;
}

/**
 * Resolve an InDesign font family to a CSS font stack. Looks up the merged
 * (default + overrides) map case-insensitively; on a miss, returns the family
 * followed by a generic fallback and marks the result unmapped.
 */
export function resolveFontStack(family: string, overrides: FontMapOverrides = {}): ResolvedFont {
  const merged = { ...loadDefaultFontMap(), ...normalizeOverrides(overrides) };

  const direct = merged[family];
  if (direct) return { stack: formatFontStack(direct), mapped: true };

  const lower = family.toLowerCase();
  for (const [key, stack] of Object.entries(merged)) {
    if (key.toLowerCase() === lower) return { stack: formatFontStack(stack), mapped: true };
  }

  return { stack: formatFontStack([family, genericFor(family)]), mapped: false };
}
