#!/usr/bin/env node
/**
 * Command-line interface for the IDML parser.
 *
 * `runCli` is a pure function (no `process.exit`, returns captured output) so it
 * is unit-testable; the module tail wires it to `process` only when executed
 * directly as `aurelius-indesign`.
 */
import { pathToFileURL } from "node:url";
import { IdmlParseError } from "./errors.js";
import type { Document, Frame } from "./ir.js";
import { parseIdmlFile } from "./parser.js";
import type { ParseWarning } from "./warnings.js";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const USAGE = `aurelius-indesign — parse an InDesign IDML package into a normalized IR

Usage:
  aurelius-indesign <file.idml> [options]

Options:
  --json           Emit the full IR as JSON on stdout
  --pretty         Pretty-print JSON (use with --json)
  --dpi <number>   Pixel conversion DPI (default 96)
  --no-validate    Skip zod validation of the produced IR
  -h, --help       Show this help
`;

interface ParsedArgs {
  input?: string;
  json: boolean;
  pretty: boolean;
  validate: boolean;
  help: boolean;
  dpi?: number;
  error?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { json: false, pretty: false, validate: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--json":
        args.json = true;
        break;
      case "--pretty":
        args.pretty = true;
        break;
      case "--no-validate":
        args.validate = false;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--dpi": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value <= 0) {
          args.error = `Invalid --dpi value: ${argv[i] ?? "(missing)"}`;
        } else {
          args.dpi = value;
        }
        break;
      }
      default:
        if (arg && arg.startsWith("-")) {
          args.error = `Unknown option: ${arg}`;
        } else if (arg && args.input === undefined) {
          args.input = arg;
        }
    }
  }
  return args;
}

/** Run the CLI against an argv array, returning captured output and exit code. */
export function runCli(argv: string[]): CliResult {
  const args = parseArgs(argv);

  if (args.error) {
    return { code: 2, stdout: "", stderr: `${args.error}\n\n${USAGE}` };
  }
  if (args.help) {
    return { code: 0, stdout: USAGE, stderr: "" };
  }
  if (!args.input) {
    return { code: 2, stdout: "", stderr: `Error: no input file provided\n\n${USAGE}` };
  }

  let document: Document;
  try {
    const result = parseIdmlFile(args.input, {
      validate: args.validate,
      ...(args.dpi ? { dpi: args.dpi } : {}),
    });
    document = result.document;
  } catch (err) {
    const label = err instanceof IdmlParseError ? `Error [${err.code}]` : "Error";
    const reason = err instanceof Error ? err.message : String(err);
    return { code: 1, stdout: "", stderr: `${label}: ${reason}\n` };
  }

  const warningSummary = formatWarningSummary(document.warnings);

  if (args.json) {
    const json = JSON.stringify(document, null, args.pretty ? 2 : 0);
    return { code: 0, stdout: `${json}\n`, stderr: warningSummary };
  }

  return { code: 0, stdout: formatReport(document), stderr: warningSummary };
}

interface FrameCounts {
  text: number;
  image: number;
  graphic: number;
  group: number;
  total: number;
}

function countFrames(frames: Frame[], counts: FrameCounts): void {
  for (const frame of frames) {
    counts[frame.type]++;
    counts.total++;
    if (frame.type === "group") countFrames(frame.children, counts);
  }
}

/** Build the human-readable summary report (stdout in non-JSON mode). */
export function formatReport(document: Document): string {
  const counts: FrameCounts = { text: 0, image: 0, graphic: 0, group: 0, total: 0 };
  for (const spread of document.spreads) countFrames(spread.frames, counts);
  for (const master of document.masterSpreads) countFrames(master.frames, counts);

  const pages =
    document.spreads.reduce((n, s) => n + s.pages.length, 0) +
    document.masterSpreads.reduce((n, s) => n + s.pages.length, 0);

  const lines: string[] = [];
  lines.push("InDesign IDML → IR");
  if (document.meta.sourcePath) lines.push(`  source:        ${document.meta.sourcePath}`);
  lines.push(`  IDML version:  ${document.meta.idmlVersion ?? "(unknown)"}`);
  lines.push(`  DPI:           ${document.meta.dpi}`);
  lines.push(`  mimetype:      ${document.meta.mimetypeValid ? "valid" : "INVALID"}`);
  lines.push("");
  lines.push("Counts");
  lines.push(`  spreads:           ${document.spreads.length}`);
  lines.push(`  master spreads:    ${document.masterSpreads.length}`);
  lines.push(`  pages:             ${pages}`);
  lines.push(
    `  frames:            ${counts.total} (text: ${counts.text}, image: ${counts.image}, graphic: ${counts.graphic}, group: ${counts.group})`,
  );
  lines.push(`  stories:           ${document.stories.length}`);
  lines.push(`  swatches:          ${document.swatches.length}`);
  lines.push(`  fonts:             ${document.fonts.length}`);
  lines.push(`  paragraph styles:  ${document.paragraphStyles.length}`);
  lines.push(`  character styles:  ${document.characterStyles.length}`);
  lines.push(`  assets:            ${document.assets.length}`);
  lines.push("");
  lines.push(`Warnings (${document.warnings.length})`);
  if (document.warnings.length === 0) {
    lines.push("  none");
  } else {
    for (const warning of document.warnings) {
      lines.push(`  ${formatWarning(warning)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatWarning(warning: ParseWarning): string {
  const location = warning.path ? ` (${warning.path})` : "";
  return `[${warning.severity}] ${warning.code}: ${warning.message}${location}`;
}

function formatWarningSummary(warnings: ParseWarning[]): string {
  if (warnings.length === 0) return "";
  const errors = warnings.filter((w) => w.severity === "error").length;
  const warns = warnings.filter((w) => w.severity === "warning").length;
  const infos = warnings.filter((w) => w.severity === "info").length;
  return `${warnings.length} warning(s): ${errors} error, ${warns} warning, ${infos} info\n`;
}

/* ── Direct-execution entry point ────────────────────────────────────────── */

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const result = runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}
