/**
 * Parse warnings for the IDML pipeline.
 *
 * Warnings record unsupported features, unresolved references, and recoverable
 * malformations encountered while parsing an `.idml` package. They never abort
 * the parse — they are accumulated on the {@link import("./ir.js").Document}
 * intermediate representation and surfaced by the CLI.
 */

export type WarningSeverity = "info" | "warning" | "error";

/** A single, non-fatal issue encountered while parsing an IDML package. */
export interface ParseWarning {
  /** Stable machine-readable code (see {@link WarningCode}). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** Relative importance; `error` means data was dropped but the parse continued. */
  severity: WarningSeverity;
  /** Package-relative source location, e.g. `"Stories/Story_u1.xml"`. */
  path?: string;
}

/**
 * Canonical warning codes. Kept as a const object (not a TS `enum`) so the
 * values are plain strings that survive JSON serialization unchanged.
 */
export const WarningCode = {
  /** The package `mimetype` entry was missing or did not match the IDML media type. */
  MIMETYPE_MISMATCH: "MIMETYPE_MISMATCH",
  /** A file referenced by `designmap.xml` was not present in the package. */
  MISSING_RESOURCE_FILE: "MISSING_RESOURCE_FILE",
  /** An XML document failed to parse; its contents were skipped. */
  MALFORMED_XML: "MALFORMED_XML",
  /** A page item type is not yet modelled by the IR; a generic frame was emitted. */
  UNSUPPORTED_PAGE_ITEM: "UNSUPPORTED_PAGE_ITEM",
  /** A `TextFrame`'s `ParentStory` did not resolve to a known story. */
  MISSING_PARENT_STORY: "MISSING_PARENT_STORY",
  /** An image link could not be resolved to a file inside the package. */
  UNRESOLVED_LINK: "UNRESOLVED_LINK",
  /** A color used an unknown color space or had no usable color value. */
  UNKNOWN_COLOR_SPACE: "UNKNOWN_COLOR_SPACE",
  /** A page item had no usable path geometry; its bounds default to a zero rect. */
  EMPTY_GEOMETRY: "EMPTY_GEOMETRY",
  /** A spread, page, or item was missing an expected identifier. */
  MISSING_IDENTIFIER: "MISSING_IDENTIFIER",
} as const;

export type WarningCodeValue = (typeof WarningCode)[keyof typeof WarningCode];

/** Mutable accumulator threaded through the parser. */
export class WarningCollector {
  private readonly items: ParseWarning[] = [];

  add(code: string, message: string, severity: WarningSeverity = "warning", path?: string): void {
    const warning: ParseWarning = { code, message, severity };
    if (path !== undefined) warning.path = path;
    this.items.push(warning);
  }

  info(code: string, message: string, path?: string): void {
    this.add(code, message, "info", path);
  }

  warn(code: string, message: string, path?: string): void {
    this.add(code, message, "warning", path);
  }

  error(code: string, message: string, path?: string): void {
    this.add(code, message, "error", path);
  }

  /** Returns a defensive copy of the collected warnings. */
  all(): ParseWarning[] {
    return this.items.map((w) => ({ ...w }));
  }

  get size(): number {
    return this.items.length;
  }
}
