/**
 * Source-agnostic entry point: parse either an IDML or a PDF into the IR.
 *
 * IDML and PDF are both first-class inputs. With `sourcePriority`, a caller can
 * force one path even when both a `.idml` and `.pdf` sibling exist — useful for
 * verifying parity between the two ingestion routes.
 */
import { existsSync } from "node:fs";
import { extname } from "node:path";
import type { ParseResult } from "./indesign/parser.js";
import { parseIdmlFile } from "./indesign/parser.js";
import { parsePdfFile, type PdfParseOptions } from "./pdf/parser.js";

export type SourcePriority = "auto" | "idml" | "pdf";

export interface ParseSourceOptions extends PdfParseOptions {
  /** Which path to prefer when both an `.idml` and `.pdf` are available. */
  sourcePriority?: SourcePriority;
}

export interface ResolvedSource {
  kind: "idml" | "pdf";
  path: string;
}

/** Determine which file to parse from an input path and a priority. */
export function resolveSource(input: string, priority: SourcePriority = "auto"): ResolvedSource {
  const ext = extname(input).toLowerCase();
  const base = input.replace(/\.(pdf|idml)$/i, "");
  const idmlPath = `${base}.idml`;
  const pdfPath = `${base}.pdf`;

  if (priority === "idml" && existsSync(idmlPath)) return { kind: "idml", path: idmlPath };
  if (priority === "pdf" && existsSync(pdfPath)) return { kind: "pdf", path: pdfPath };

  if (ext === ".idml") return { kind: "idml", path: input };
  if (ext === ".pdf") return { kind: "pdf", path: input };

  if (existsSync(pdfPath)) return { kind: "pdf", path: pdfPath };
  if (existsSync(idmlPath)) return { kind: "idml", path: idmlPath };

  throw new Error(`Cannot determine source type for "${input}" (expected .idml or .pdf)`);
}

/** Parse an IDML or PDF file into the IR, auto-detecting (or forcing) the path. */
export async function parseSourceFile(
  input: string,
  options: ParseSourceOptions = {},
): Promise<ParseResult> {
  const { sourcePriority, ...parseOptions } = options;
  const resolved = resolveSource(input, sourcePriority ?? "auto");
  if (resolved.kind === "idml") return parseIdmlFile(resolved.path, parseOptions);
  return parsePdfFile(resolved.path, parseOptions);
}
