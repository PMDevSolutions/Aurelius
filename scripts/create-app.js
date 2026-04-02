#!/usr/bin/env node

/**
 * Create a new app from the template
 * Usage: node scripts/create-app.js <app-name>
 *
 * This script:
 * 1. Copies the app/ directory to a new location
 * 2. Updates package.json with the new app name
 * 3. Updates manifest.json with the new app name
 * 4. Resets version to 0.1.0
 * 5. Clears CHANGELOG.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const appName = process.argv[2];

if (!appName) {
  console.error("Usage: pnpm new-app <app-name>");
  console.error("Example: pnpm new-app my-chrome-extension");
  process.exit(1);
}

// Validate app name
const validName = /^[a-z0-9-]+$/;
if (!validName.test(appName)) {
  console.error("Error: App name must be lowercase letters, numbers, and hyphens only");
  process.exit(1);
}

const sourceDir = path.join(rootDir, "app");
const targetDir = path.join(rootDir, appName);

// Check if target already exists
if (fs.existsSync(targetDir)) {
  console.error(`Error: Directory "${appName}" already exists`);
  process.exit(1);
}

// Copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules and dist
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log(`Creating new app: ${appName}`);
console.log(`Copying template from app/ to ${appName}/...`);

copyDir(sourceDir, targetDir);

// Update package.json
const packageJsonPath = path.join(targetDir, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
packageJson.name = appName;
packageJson.version = "0.1.0";
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
console.log("Updated package.json");

// Update manifest.json
const manifestPath = path.join(targetDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
manifest.name = appName
  .split("-")
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");
manifest.version = "0.1.0";
manifest.description = `${manifest.name} - Built with Claude Code React Framework`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Updated manifest.json");

// Clear CHANGELOG.md if it exists
const changelogPath = path.join(targetDir, "CHANGELOG.md");
if (fs.existsSync(changelogPath)) {
  fs.writeFileSync(
    changelogPath,
    `# Changelog

All notable changes to ${manifest.name} will be documented in this file.

## 0.1.0 (${new Date().toISOString().split("T")[0]})

### Features

* Initial release
`,
  );
  console.log("Reset CHANGELOG.md");
}

// Update .versionrc.json tagPrefix
const versionrcPath = path.join(targetDir, ".versionrc.json");
if (fs.existsSync(versionrcPath)) {
  const versionrc = JSON.parse(fs.readFileSync(versionrcPath, "utf-8"));
  versionrc.tagPrefix = `${appName}-v`;
  versionrc.header = `# Changelog\n\nAll notable changes to ${manifest.name} will be documented in this file.\n`;
  fs.writeFileSync(versionrcPath, JSON.stringify(versionrc, null, 2) + "\n");
  console.log("Updated .versionrc.json");
}

console.log("");
console.log("✅ App created successfully!");
console.log("");
console.log("Next steps:");
console.log(`  cd ${appName}`);
console.log("  pnpm install");
console.log("  pnpm dev");
console.log("");
console.log("To release a new version:");
console.log("  pnpm release        # Auto-detect version bump");
console.log("  pnpm release:patch  # Patch bump (0.1.0 → 0.1.1)");
console.log("  pnpm release:minor  # Minor bump (0.1.0 → 0.2.0)");
