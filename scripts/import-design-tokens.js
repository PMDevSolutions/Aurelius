#!/usr/bin/env node
/**
 * import-design-tokens.js
 *
 * Reconstruct a design-tokens.lock.json from an exported @scope/design-tokens
 * package — the inverse of export-design-system.js and the reference consumer of
 * the export.
 *
 * The export ships four token artifacts; only two are lossless:
 *   - tokens.json          verbatim JSON snapshot of the lockfile  (LOSSLESS)
 *   - tokens.ts            `export const tokens = <lockfile> as const` (lossless)
 *   - tokens.css           flattened CSS custom properties          (derived/lossy)
 *   - tailwind-preset.ts   colors/spacing/radii/font subset         (derived/lossy)
 *
 * This tool reads the lossless tokens.json only, so
 *   lock -> export -> import  round-trips to a byte-identical lockfile.
 * tokens.css / tailwind-preset.ts are consumer-facing views and cannot be
 * reversed faithfully, so they are never used for reconstruction.
 *
 * Exit codes: 0 ok, 1 output exists / verify mismatch, 2 tokens.json not found /
 * unreadable, 3 input is not a valid token lockfile.
 */
import fs from "node:fs";
import path from "node:path";

function die(msg, code = 1) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    from: "dist/design-system",
    out: "design-tokens.lock.json",
    verify: null,
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--from":
        args.from = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--verify":
        args.verify = next();
        break;
      case "--force":
        args.force = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith("--")) die(`Unknown flag: ${a}`, 1);
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Usage: import-design-tokens.js [options]

Reconstruct design-tokens.lock.json from an exported @scope/design-tokens package.
Reads the lossless tokens.json snapshot (never the derived tokens.css).

Options:
  --from <path>    Export root, tokens package dir, or a tokens.json file
                   (default: dist/design-system)
  --out <path>     Where to write the lockfile ("-" for stdout)
                   (default: design-tokens.lock.json)
  --verify <path>  Compare the reconstructed lockfile against a reference
                   lockfile; exit 0 if identical, 1 if not (writes nothing)
  --force          Overwrite --out if it already exists
  --json           Emit a machine-readable summary
  -h, --help       Show this help
`);
}

// Locate the lossless tokens.json under --from (file used directly, or a dir
// probed in export-root → package-dir order).
function resolveTokensJson(from) {
  let stat;
  try {
    stat = fs.statSync(from);
  } catch {
    die(`--from path does not exist: ${from}`, 2);
  }
  if (stat.isFile()) {
    if (!from.endsWith(".json")) {
      die(`--from file must be a .json tokens snapshot: ${from}`, 2);
    }
    return from;
  }
  const candidates = [
    path.join(from, "packages", "design-tokens", "src", "tokens.json"),
    path.join(from, "packages", "design-tokens", "dist", "tokens.json"),
    path.join(from, "src", "tokens.json"),
    path.join(from, "dist", "tokens.json"),
    path.join(from, "tokens.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  die(
    `No tokens.json found under ${from}. Looked at: ${candidates
      .map((c) => path.relative(from, c))
      .join(", ")}.`,
    2,
  );
}

function readJson(p, notFoundCode = 2) {
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    die(`Cannot read ${p}: ${e.message}`, notFoundCode);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    die(`Failed to parse JSON at ${p}: ${e.message}`, 3);
  }
}

// A token lockfile must carry at least one recognized token section.
const TOKEN_SECTIONS = ["colors", "typography", "spacing", "borderRadius", "radii"];
function assertLockfile(obj, source) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    die(`${source} is not a token lockfile (expected a JSON object).`, 3);
  }
  if (!TOKEN_SECTIONS.some((k) => k in obj)) {
    die(
      `${source} does not look like a design-tokens lockfile (needs one of: ${TOKEN_SECTIONS.join(
        ", ",
      )}).`,
      3,
    );
  }
}

// Canonicalize key order so equality/diff are order-independent.
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}

function deepEqual(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function diffKeys(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(canonical(a && a[k])) !== JSON.stringify(canonical(b && b[k]))) {
      out.push(k);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tokensJsonPath = resolveTokensJson(args.from);
  const lock = readJson(tokensJsonPath);
  assertLockfile(lock, tokensJsonPath);

  const serialized = JSON.stringify(lock, null, 2) + "\n";

  // Verify mode: compare against a reference lockfile, write nothing.
  if (args.verify) {
    const ref = readJson(args.verify);
    assertLockfile(ref, args.verify);
    const identical = deepEqual(lock, ref);
    if (args.json) {
      process.stdout.write(
        JSON.stringify({ tokensJson: tokensJsonPath, verify: args.verify, identical }) + "\n",
      );
    } else if (identical) {
      process.stdout.write(`✓ Round-trip identical: ${tokensJsonPath} matches ${args.verify}\n`);
    } else {
      const keys = diffKeys(lock, ref);
      process.stderr.write(
        `✗ Round-trip mismatch: ${tokensJsonPath} differs from ${args.verify}\n`,
      );
      if (keys.length) {
        process.stderr.write(`  Differing top-level sections: ${keys.join(", ")}\n`);
      }
    }
    process.exit(identical ? 0 : 1);
  }

  // Stdout mode: the reconstructed lockfile IS the output.
  if (args.out === "-") {
    process.stdout.write(serialized);
    return;
  }

  // Write mode.
  const outPath = path.resolve(args.out);
  if (fs.existsSync(outPath) && !args.force) {
    die(`Output file already exists: ${outPath}. Pass --force to overwrite or use --out -.`, 1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized);

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ tokensJson: tokensJsonPath, out: outPath, identical: null }) + "\n",
    );
  } else {
    process.stdout.write(
      `Reconstructed design-tokens.lock.json from ${tokensJsonPath}\n  Written: ${outPath}\n`,
    );
  }
}

main();
