#!/usr/bin/env node
/**
 * validate-content-calendar.js — Structural validation of content-calendar.json.
 *
 * Checks:
 *   - required fields, unique IDs, known statuses
 *   - date ordering: draftDue ≤ qaDue ≤ approvalDue < publish
 *   - approval lead time ≥ calendar.leadTimes.approvalToPublishDays
 *   - dependencies exist and publish before their dependents
 *   - per-channel maxPerDay cadence caps
 *   - overdue entries still sitting in working statuses (warning)
 *
 * Usage:
 *   node scripts/validate-content-calendar.js [--file <path>] [--json]
 *
 * Exit codes: 0 = valid (warnings allowed), 1 = errors found, 2 = usage/IO error.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const CONFIG_PATH = join(repoRoot, ".claude", "pipeline.config.json");

const STATUSES = ["planned", "drafting", "in-qa", "approved", "scheduled", "published", "cancelled"];
const WORKING = new Set(["planned", "drafting", "in-qa", "approved", "scheduled"]);
const DATE_KEYS = ["draftDue", "qaDue", "approvalDue", "publish"];

function parseArgs(argv) {
  const out = { file: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = resolve(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") {
      const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
      for (const line of src.split("\n").slice(1)) {
        if (!line.startsWith(" *")) break;
        console.log(line.replace(/^ \*\/?\s?/, ""));
      }
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function loadJson(path, label) {
  if (!existsSync(path)) {
    console.error(`✗ ${label} not found: ${path}`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`✗ ${label} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function parseDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.slice(0, 10) + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = existsSync(CONFIG_PATH) ? loadJson(CONFIG_PATH, "pipeline config") : {};
  const calCfg = config.calendar ?? {};
  const file = args.file ?? join(repoRoot, calCfg.file ?? "content-calendar.json");
  const calendar = loadJson(file, "content calendar");

  const errors = [];
  const warnings = [];
  const entries = Array.isArray(calendar.entries) ? calendar.entries : null;
  if (!entries) {
    errors.push({ id: null, message: "calendar.entries missing or not an array" });
  }

  const byId = new Map();
  const perChannelDay = new Map(); // `${channel}|${date}` → count
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const minApprovalLead = calCfg.leadTimes?.approvalToPublishDays ?? 1;
  const assetTypes = config.assetTypes ?? {};

  for (const e of entries ?? []) {
    const id = e.id ?? "(missing id)";
    for (const field of ["id", "assetType", "channel", "ownerAgent", "status", "dates"]) {
      if (e[field] === undefined) errors.push({ id, message: `missing field "${field}"` });
    }
    if (e.id !== undefined) {
      if (byId.has(e.id)) errors.push({ id, message: "duplicate entry id" });
      byId.set(e.id, e);
    }
    if (e.status !== undefined && !STATUSES.includes(e.status)) {
      errors.push({ id, message: `unknown status "${e.status}" (expected: ${STATUSES.join(", ")})` });
    }
    if (e.assetType && Object.keys(assetTypes).length && !assetTypes[e.assetType]) {
      warnings.push({ id, message: `assetType "${e.assetType}" not defined in pipeline.config.json` });
    }

    const dates = {};
    for (const key of DATE_KEYS) {
      const raw = e.dates?.[key];
      if (raw === undefined) continue;
      const d = parseDate(raw);
      if (!d) errors.push({ id, message: `dates.${key} is not a valid YYYY-MM-DD date: "${raw}"` });
      else dates[key] = d;
    }
    if (dates.draftDue && dates.qaDue && dates.draftDue > dates.qaDue)
      errors.push({ id, message: "draftDue is after qaDue" });
    if (dates.qaDue && dates.approvalDue && dates.qaDue > dates.approvalDue)
      errors.push({ id, message: "qaDue is after approvalDue" });
    if (dates.approvalDue && dates.publish) {
      if (dates.approvalDue >= dates.publish)
        errors.push({ id, message: "approvalDue must be before publish" });
      else if (daysBetween(dates.approvalDue, dates.publish) < minApprovalLead)
        errors.push({
          id,
          message: `approval lead time ${daysBetween(dates.approvalDue, dates.publish)}d < required ${minApprovalLead}d`,
        });
    }
    if (dates.publish && e.status === undefined) {
      // nothing — missing status already reported
    }
    if (dates.publish && e.channel) {
      const key = `${e.channel}|${e.dates.publish.slice(0, 10)}`;
      perChannelDay.set(key, (perChannelDay.get(key) ?? 0) + 1);
    }
    if (dates.publish && dates.publish < today && WORKING.has(e.status)) {
      warnings.push({
        id,
        message: `publish date ${e.dates.publish} is in the past but status is "${e.status}"`,
      });
    }
  }

  // Dependency checks (need the full id map first).
  for (const e of entries ?? []) {
    for (const dep of e.dependencies ?? []) {
      const target = byId.get(dep);
      if (!target) {
        errors.push({ id: e.id, message: `dependency "${dep}" does not exist` });
        continue;
      }
      const depPub = parseDate(target.dates?.publish);
      const ownPub = parseDate(e.dates?.publish);
      if (depPub && ownPub && depPub > ownPub) {
        errors.push({ id: e.id, message: `publishes before its dependency "${dep}"` });
      }
    }
  }

  // Cadence caps.
  const caps = calCfg.cadenceDefaults ?? {};
  for (const [key, count] of perChannelDay) {
    const [channel, date] = key.split("|");
    const cap = caps[channel]?.maxPerDay;
    if (cap && count > cap) {
      errors.push({ id: null, message: `${channel} has ${count} publishes on ${date} (maxPerDay ${cap})` });
    }
  }

  const ok = errors.length === 0;
  if (args.json) {
    console.log(
      JSON.stringify(
        { ok, entries: entries?.length ?? 0, errors, warnings },
        null,
        2
      )
    );
  } else {
    console.log(`Validating ${file}`);
    console.log(`Entries: ${entries?.length ?? 0}`);
    for (const e of errors) console.log(`  ✗ ${e.id ? `[${e.id}] ` : ""}${e.message}`);
    for (const w of warnings) console.log(`  ⚠ ${w.id ? `[${w.id}] ` : ""}${w.message}`);
    console.log(
      ok
        ? `✓ Calendar valid (${warnings.length} warning(s)).`
        : `✗ ${errors.length} error(s), ${warnings.length} warning(s).`
    );
  }
  process.exit(ok ? 0 : 1);
}

main();
