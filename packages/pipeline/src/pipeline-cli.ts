#!/usr/bin/env node
/**
 * `aurelius pipeline indesign` — end-to-end CLI.
 *
 * Orchestrates the InDesign pipeline: parse (IDML or PDF) → map design tokens →
 * generate React components, writing a project tree plus human-readable Markdown
 * and machine-readable JSON reports. Honors `aurelius.config.json` for defaults.
 *
 * `runPipelineCli` is pure (returns captured output, no `process.exit`) so it is
 * unit-testable; the module tail wires it to `process` when run as `aurelius`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateComponents } from "./react/index.js";
import type { Framework, GenerationResult, StyleMode } from "./react/model.js";
import { parseSourceFile } from "./source.js";
import { emitAll } from "./tokens/emit.js";
import { mapDocumentToTokens } from "./tokens/mapper.js";

export interface PipelineCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Target = "react" | "next" | "vite" | "astro";

const TARGETS: Target[] = ["react", "next", "vite", "astro"];
const STYLINGS: StyleMode[] = ["tailwind", "css-modules"];

const USAGE = `aurelius pipeline indesign — convert an InDesign IDML or PDF into a React project

Usage:
  aurelius pipeline indesign <file.idml | file.pdf> [options]

Options:
  --target <fw>      Output target: next | vite | astro | react (default react)
  --styling <mode>   Styling mode: tailwind | css-modules (default tailwind)
  --output <dir>     Output directory (default ./src/indesign)
  --json             Print the machine-readable JSON report on stdout
  -h, --help         Show this help

Writes components, Storybook stories, design tokens, extracted assets, and both
a Markdown and a JSON report into <output>. Honors aurelius.config.json
({ "indesign": { "target", "styling", "output" } }) when present; flags win.
`;

interface ParsedArgs {
  input?: string;
  target?: Target;
  styling?: StyleMode;
  output?: string;
  json: boolean;
  help: boolean;
  error?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--target": {
        const value = argv[++i];
        if (value && (TARGETS as string[]).includes(value)) args.target = value as Target;
        else
          args.error = `Invalid --target: ${value ?? "(missing)"} (expected ${TARGETS.join("|")})`;
        break;
      }
      case "--styling": {
        const value = argv[++i];
        if (value && (STYLINGS as string[]).includes(value)) args.styling = value as StyleMode;
        else
          args.error = `Invalid --styling: ${value ?? "(missing)"} (expected ${STYLINGS.join("|")})`;
        break;
      }
      case "--output": {
        const value = argv[++i];
        if (value) args.output = value;
        else args.error = "--output requires a directory";
        break;
      }
      default:
        if (arg && arg.startsWith("-")) args.error = `Unknown option: ${arg}`;
        else if (arg && args.input === undefined) args.input = arg;
    }
  }
  return args;
}

interface AureliusConfig {
  target?: Target;
  styling?: StyleMode;
  output?: string;
}

/** Best-effort load of `aurelius.config.json` (`indesign` section or top-level). */
function loadConfig(cwd: string): AureliusConfig {
  const path = join(cwd, "aurelius.config.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const section = (raw.indesign ?? raw) as AureliusConfig;
    const config: AureliusConfig = {};
    if (section.target && (TARGETS as string[]).includes(section.target))
      config.target = section.target;
    if (section.styling && (STYLINGS as string[]).includes(section.styling))
      config.styling = section.styling;
    if (typeof section.output === "string") config.output = section.output;
    return config;
  } catch {
    return {};
  }
}

function frameworkFor(target: Target): Framework {
  return target === "next" ? "next" : "react";
}

/** Run `aurelius pipeline indesign …`, returning captured output and exit code. */
export async function runPipelineCli(
  argv: string[],
  cwd: string = process.cwd(),
): Promise<PipelineCliResult> {
  // Allow the full `pipeline indesign …` form or just the flags.
  let rest = argv;
  if (rest[0] === "pipeline") rest = rest.slice(1);
  if (rest[0] === "indesign") rest = rest.slice(1);

  const args = parseArgs(rest);
  if (args.error) return { code: 2, stdout: "", stderr: `${args.error}\n\n${USAGE}` };
  if (args.help) return { code: 0, stdout: USAGE, stderr: "" };
  if (!args.input)
    return { code: 2, stdout: "", stderr: `Error: no input file provided\n\n${USAGE}` };

  const config = loadConfig(cwd);
  const target = args.target ?? config.target ?? "react";
  const styling = args.styling ?? config.styling ?? "tailwind";
  const output = args.output ?? config.output ?? join("src", "indesign");
  const outDir = isAbsolute(output) ? output : join(cwd, output);
  const assetDir = join(outDir, "public", "indesign");

  let document;
  try {
    const result = await parseSourceFile(args.input, { assetDir });
    document = result.document;
  } catch (err) {
    return { code: 1, stdout: "", stderr: `Error: ${toMessage(err)}\n` };
  }

  const tokenResult = mapDocumentToTokens(document);
  const tokenFiles = emitAll(tokenResult.tokens);
  const generation = generateComponents(document, tokenResult, {
    styleMode: styling,
    framework: frameworkFor(target),
  });
  const jsonReport = buildJsonReport(generation, document.meta.source, target, styling);

  try {
    mkdirSync(outDir, { recursive: true });
    for (const file of generation.files) writeFileSync(join(outDir, file.path), file.contents);
    const tokensDir = join(outDir, "tokens");
    mkdirSync(tokensDir, { recursive: true });
    for (const [name, contents] of Object.entries(tokenFiles)) {
      writeFileSync(join(tokensDir, name), contents);
    }
    writeFileSync(
      join(outDir, "indesign-pipeline-report.json"),
      JSON.stringify(jsonReport, null, 2),
    );
  } catch (err) {
    return {
      code: 1,
      stdout: "",
      stderr: `Error: cannot write to "${output}": ${toMessage(err)}\n`,
    };
  }

  if (args.json) {
    return { code: 0, stdout: `${JSON.stringify(jsonReport, null, 2)}\n`, stderr: "" };
  }
  return { code: 0, stdout: formatSummary(jsonReport, output), stderr: "" };
}

interface JsonReport {
  source: "idml" | "pdf" | "unknown";
  target: Target;
  styling: StyleMode;
  components: Array<{ name: string; files: string[] }>;
  assets: GenerationResult["assets"];
  unmapped: string[];
  accessibility: string[];
}

function buildJsonReport(
  generation: GenerationResult,
  source: "idml" | "pdf" | undefined,
  target: Target,
  styling: StyleMode,
): JsonReport {
  return {
    source: source ?? "unknown",
    target,
    styling,
    components: generation.componentNames.map((name) => ({
      name,
      files: generation.files.filter((f) => f.path.startsWith(name)).map((f) => f.path),
    })),
    assets: generation.assets,
    unmapped: generation.unmapped,
    accessibility: generation.a11y,
  };
}

function formatSummary(report: JsonReport, output: string): string {
  const lines: string[] = [];
  lines.push("aurelius pipeline indesign");
  lines.push(`  source:      ${report.source}`);
  lines.push(`  target:      ${report.target}`);
  lines.push(`  styling:     ${report.styling}`);
  lines.push(`  output:      ${output}`);
  lines.push(
    `  components:  ${report.components.length} (${report.components.map((c) => c.name).join(", ") || "none"})`,
  );
  lines.push(`  assets:      ${report.assets.length}`);
  lines.push(`  unmapped:    ${report.unmapped.length}`);
  lines.push(`  a11y TODOs:  ${report.accessibility.length}`);
  lines.push(
    `  reports:     ${join(output, "indesign-pipeline-report.md")}, indesign-pipeline-report.json`,
  );
  if (report.accessibility.length > 0) {
    lines.push("", "Accessibility TODOs");
    for (const item of report.accessibility) lines.push(`  ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ── Direct-execution entry point (bin: aurelius) ────────────────────────── */

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runPipelineCli(process.argv.slice(2))
    .then((result) => {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.code);
    })
    .catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
