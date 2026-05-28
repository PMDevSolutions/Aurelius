#!/usr/bin/env node
/**
 * agent-plugin-lib.js — shared helpers for the agent-plugin tooling
 * (validate / registry / create / test). Pure, side-effect-free functions
 * over plugin files so each CLI stays thin and testable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import semver from "semver";

/** Parse simple single-line `key: value` YAML frontmatter from a Markdown string. */
export function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content, hasFrontmatter: false };
  const frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (km) frontmatter[km[1]] = km[2].trim();
  }
  return { frontmatter, body: m[2], hasFrontmatter: true };
}

/** Count `<example>` blocks in an agent description. */
export function countExamples(description = "") {
  return (description.match(/<example>/g) || []).length;
}
