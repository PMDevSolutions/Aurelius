#!/usr/bin/env node

/**
 * Extracts release notes for the latest version from CHANGELOG.md.
 * Writes the result to RELEASE_NOTES.md for use in GitHub Releases.
 */

import { readFileSync, writeFileSync } from "fs";

const changelog = readFileSync("CHANGELOG.md", "utf8");
const sections = changelog.split(/^## /m).slice(1);

if (sections.length === 0) {
  console.error("No version sections found in CHANGELOG.md");
  process.exit(1);
}

// First section after split is the latest version
const latestSection = sections[0];
// Remove the version header line, keep the rest
const notes = latestSection.replace(/^.*\n/, "").trim();

writeFileSync("RELEASE_NOTES.md", notes);
console.log("Release notes extracted to RELEASE_NOTES.md");
