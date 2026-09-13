#!/usr/bin/env node

/**
 * Extracts release notes for one version from CHANGELOG.md and writes them to
 * RELEASE_NOTES.md for use as the GitHub Release body.
 *
 *   node scripts/extract-release-notes.js                # latest (first) section
 *   node scripts/extract-release-notes.js --version 2.1.0
 *   node scripts/extract-release-notes.js --version v2.1.0
 *
 * Runs as the commit-and-tag-version `postchangelog` hook (no arguments, the
 * freshly written section is first), and from the Release workflow's publish
 * job after the release PR has merged (explicit --version, since main may have
 * moved on by then).
 */

import { readFileSync, writeFileSync } from "fs";

function parseArgs(argv) {
  let version = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--version" || arg === "-v") {
      version = argv[++i];
    } else if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (version === undefined || version === "") {
    console.error("--version requires a value (e.g. --version 2.1.0)");
    process.exit(2);
  }
  return { version: version ? version.replace(/^v/, "") : null };
}

const { version } = parseArgs(process.argv.slice(2));

const changelog = readFileSync("CHANGELOG.md", "utf8");
const sections = changelog.split(/^## /m).slice(1);

if (sections.length === 0) {
  console.error("No version sections found in CHANGELOG.md");
  process.exit(1);
}

// Section headers look like "[2.1.0](compare-url) (2026-09-13)" or "2.1.0 (…)".
const headerVersion = (section) => {
  const header = section.split("\n", 1)[0];
  const match = header.match(/^\[?v?(\d+\.\d+\.\d+[^\]\s)]*)/);
  return match ? match[1] : null;
};

let section;
if (version) {
  section = sections.find((s) => headerVersion(s) === version);
  if (!section) {
    console.error(`No "## ${version}" section found in CHANGELOG.md`);
    process.exit(1);
  }
} else {
  // First section after split is the latest version
  section = sections[0];
}

// Remove the version header line, keep the rest
const notes = section.replace(/^.*\n/, "").trim();

writeFileSync("RELEASE_NOTES.md", notes);
console.log(
  `Release notes for ${version ?? headerVersion(section) ?? "latest"} extracted to RELEASE_NOTES.md`,
);
