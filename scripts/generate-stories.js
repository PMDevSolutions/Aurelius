#!/usr/bin/env node
/**
 * generate-stories.js — AST-based Storybook story generator
 *
 * Uses ts-morph to parse React component files and generate:
 * - .stories.tsx files with Meta, argTypes/controls, variant stories, action args, default args
 * - .mdx documentation files with Meta, Canvas, Controls, ArgTypes blocks
 *
 * Phase 4.5 of the Figma-to-React pipeline (non-blocking)
 */

import { Project, SyntaxKind } from "ts-morph";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative, basename, dirname } from "path";

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** Escape single quotes for safe interpolation into single-quoted strings */
function esc(s) {
  return s.replace(/'/g, "\\'");
}

/** Convert a string to a valid JS identifier for story export names */
function toIdentifier(s) {
  // Capitalize first letter
  let name = s.charAt(0).toUpperCase() + s.slice(1);
  // Replace non-alphanumeric with underscore
  name = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  // Prefix with _ if starts with a digit
  if (/^\d/.test(name)) name = `_${name}`;
  return name;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name) {
  return args.includes(name);
}

function getOption(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}

const srcDir = getOption("--src-dir", "src/components");
const configPath = getOption("--config", ".claude/pipeline.config.json");
const force = getFlag("--force");
const dryRun = getFlag("--dry-run");
const noMdx = getFlag("--no-mdx");
const jsonOutput = getFlag("--json");

// ---------------------------------------------------------------------------
// Logging (suppressed in --json mode)
// ---------------------------------------------------------------------------

function log(msg) {
  if (!jsonOutput) {
    console.log(msg);
  }
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadConfig(configFilePath) {
  const defaults = {
    autoGenerate: true,
    includeResponsiveViewports: false,
    viewports: ["mobile", "tablet", "desktop"],
    skipPatterns: [],
    generateMdx: true,
    maxVariantsPerProp: 10,
  };

  if (!existsSync(configFilePath)) {
    return { storybook: defaults, visualDiff: { breakpoints: {} } };
  }

  try {
    const raw = JSON.parse(readFileSync(configFilePath, "utf-8"));
    const sb = { ...defaults, ...raw.storybook };
    return { storybook: sb, visualDiff: raw.visualDiff || { breakpoints: {} } };
  } catch {
    return { storybook: defaults, visualDiff: { breakpoints: {} } };
  }
}

// ---------------------------------------------------------------------------
// File scanning — recursively find .tsx files
// ---------------------------------------------------------------------------

function walkDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      // Skip known non-component directories
      if (entry === "node_modules" || entry === "__tests__" || entry === "__mocks__") {
        continue;
      }
      results.push(...walkDir(fullPath));
    } else if (stat.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function findComponentFiles(srcDirectory) {
  const allFiles = walkDir(srcDirectory);
  return allFiles.filter((f) => {
    const name = basename(f);
    if (!name.endsWith(".tsx")) return false;
    if (name.endsWith(".test.tsx")) return false;
    if (name.endsWith(".stories.tsx")) return false;
    if (name.endsWith(".d.ts") || name.endsWith(".d.tsx")) return false;
    if (name === "index.tsx") return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Glob-like pattern matching for skipPatterns
// ---------------------------------------------------------------------------

function matchesSkipPattern(filePath, patterns) {
  const name = basename(filePath);
  for (const pattern of patterns) {
    // Strip leading **/ for basename matching
    const simple = pattern.replace(/^\*\*\//, "");
    // Convert glob to regex
    const regexStr = simple.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const re = new RegExp(`^${regexStr}$`);
    if (re.test(name)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// AST Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Find the first exported component (function or const starting with uppercase)
 * Returns { name, isDefault, node } or null
 */
function findExportedComponent(sourceFile) {
  // Check exported function declarations
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name || !/^[A-Z]/.test(name)) continue;
    if (fn.isExported() || fn.isDefaultExport()) {
      return {
        name,
        isDefault: fn.isDefaultExport(),
        node: fn,
      };
    }
  }

  // Check exported variable declarations (arrow function components)
  for (const varStatement of sourceFile.getVariableStatements()) {
    if (!varStatement.isExported()) continue;
    for (const decl of varStatement.getDeclarations()) {
      const name = decl.getName();
      if (/^[A-Z]/.test(name)) {
        return {
          name,
          isDefault: varStatement.isDefaultExport(),
          node: decl,
        };
      }
    }
  }

  // Check default export assignments
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const name = defaultExport.getName();
    if (name && /^[A-Z]/.test(name) && name !== "default") {
      return { name, isDefault: true, node: null };
    }
  }

  return null;
}

/**
 * Find the props interface for a component.
 * Convention: ComponentNameProps
 */
function findPropsInterface(sourceFile, componentName) {
  const propsName = `${componentName}Props`;

  // Check interfaces
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.getName() === propsName) {
      return iface;
    }
  }

  // Check type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.getName() === propsName) {
      return typeAlias;
    }
  }

  return null;
}

/**
 * Extract prop information from an interface declaration
 */
function extractPropsFromInterface(iface) {
  const props = [];
  if (!iface) return props;

  // Handle interface declarations
  if (iface.getKind() === SyntaxKind.InterfaceDeclaration) {
    for (const prop of iface.getProperties()) {
      const info = extractPropInfo(prop);
      if (info) props.push(info);
    }
  }

  return props;
}

/**
 * Extract individual prop info from a property signature
 */
function extractPropInfo(prop) {
  const name = prop.getName();
  const isOptional = prop.hasQuestionToken();
  const typeNode = prop.getTypeNode();

  // Get JSDoc comment
  const jsDocs = prop.getJsDocs();
  let description = "";
  if (jsDocs.length > 0) {
    description = jsDocs[0].getDescription().trim();
  }

  // Determine control type
  let controlType = "text"; // default
  let options = null;
  let isCallback = false;
  let actionName = "";
  let literalValues = [];

  if (typeNode) {
    const typeText = typeNode.getText();

    if (typeText === "string") {
      controlType = "text";
    } else if (typeText === "number") {
      controlType = "number";
    } else if (typeText === "boolean") {
      controlType = "boolean";
    } else if (isStringLiteralUnion(typeNode)) {
      controlType = "select";
      literalValues = extractLiteralValues(typeNode);
      options = literalValues;
    } else if (isFunctionType(typeNode, typeText)) {
      controlType = "function";
      isCallback = /^on[A-Z]/.test(name);
      if (isCallback) {
        // onClick -> clicked, onChange -> changed
        const eventPart = name.slice(2); // Remove 'on'
        const lowerEvent = eventPart.charAt(0).toLowerCase() + eventPart.slice(1);
        // Make past tense: click -> clicked, change -> changed
        if (lowerEvent.endsWith("e")) {
          actionName = lowerEvent + "d";
        } else {
          actionName = lowerEvent + "ed";
        }
      }
    }
  } else {
    // No explicit type node — try to infer from the type string
    const typeStr = prop.getType().getText();
    if (typeStr === "string") controlType = "text";
    else if (typeStr === "number") controlType = "number";
    else if (typeStr === "boolean") controlType = "boolean";
  }

  return {
    name,
    isOptional,
    controlType,
    options,
    description,
    isCallback,
    actionName,
    literalValues,
  };
}

function isStringLiteralUnion(typeNode) {
  if (typeNode.getKind() === SyntaxKind.UnionType) {
    const types = typeNode.getTypeNodes();
    return types.every(
      (t) =>
        t.getKind() === SyntaxKind.LiteralType &&
        t.getLiteral().getKind() === SyntaxKind.StringLiteral,
    );
  }
  return false;
}

function extractLiteralValues(typeNode) {
  if (typeNode.getKind() === SyntaxKind.UnionType) {
    return typeNode.getTypeNodes().map((t) => {
      const literal = t.getLiteral();
      return literal.getLiteralText();
    });
  }
  return [];
}

function isFunctionType(typeNode, typeText) {
  if (typeNode.getKind() === SyntaxKind.FunctionType) return true;
  if (typeText.includes("=>")) return true;
  return false;
}

/**
 * Extract default values from function parameter destructuring patterns.
 * e.g., ({ label = 'tag', size = 'md' }: Props) => { label: 'tag', size: 'md' }
 */
function extractDefaultValues(sourceFile, componentName) {
  const defaults = {};

  // Find the component function
  for (const fn of sourceFile.getFunctions()) {
    if (fn.getName() === componentName) {
      extractDefaultsFromParams(fn, defaults);
      return defaults;
    }
  }

  // Check variable declarations for arrow functions
  for (const varStatement of sourceFile.getVariableStatements()) {
    for (const decl of varStatement.getDeclarations()) {
      if (decl.getName() === componentName) {
        const initializer = decl.getInitializer();
        if (
          initializer &&
          (initializer.getKind() === SyntaxKind.ArrowFunction ||
            initializer.getKind() === SyntaxKind.FunctionExpression)
        ) {
          extractDefaultsFromParams(initializer, defaults);
        }
        return defaults;
      }
    }
  }

  return defaults;
}

function extractDefaultsFromParams(fnNode, defaults) {
  const params = fnNode.getParameters();
  if (params.length === 0) return;

  const firstParam = params[0];
  const nameNode = firstParam.getNameNode();

  if (nameNode && nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
    for (const element of nameNode.getElements()) {
      const propName = element.getName();
      const initializer = element.getInitializer();
      if (initializer) {
        const text = initializer.getText();
        // Parse string literals
        if (
          (text.startsWith("'") && text.endsWith("'")) ||
          (text.startsWith('"') && text.endsWith('"'))
        ) {
          defaults[propName] = text.slice(1, -1);
        } else if (text === "true") {
          defaults[propName] = true;
        } else if (text === "false") {
          defaults[propName] = false;
        } else if (!isNaN(Number(text))) {
          defaults[propName] = Number(text);
        } else {
          defaults[propName] = text;
        }
      }
    }
  }
}

/**
 * Get JSDoc description from an interface or function
 */
function getComponentDescription(sourceFile, componentName) {
  // Check for JSDoc on the props interface
  const propsName = `${componentName}Props`;
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.getName() === propsName) {
      const jsDocs = iface.getJsDocs();
      if (jsDocs.length > 0) {
        return jsDocs[0].getDescription().trim();
      }
    }
  }

  // Check for JSDoc on the component function itself
  for (const fn of sourceFile.getFunctions()) {
    if (fn.getName() === componentName) {
      const jsDocs = fn.getJsDocs();
      if (jsDocs.length > 0) {
        return jsDocs[0].getDescription().trim();
      }
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Story content generation
// ---------------------------------------------------------------------------

function generateStoryContent(
  componentName,
  componentBasename,
  storyTitle,
  isDefault,
  props,
  defaults,
  config,
) {
  const lines = [];
  const maxVariants = config.storybook.maxVariantsPerProp || 10;
  const includeViewports = config.storybook.includeResponsiveViewports || false;
  const viewports = config.storybook.viewports || [];
  const breakpoints = (config.visualDiff && config.visualDiff.breakpoints) || {};

  // Imports
  lines.push("import type { Meta, StoryObj } from '@storybook/react';");
  if (isDefault) {
    lines.push(`import ${componentName} from './${componentBasename}';`);
  } else {
    lines.push(`import { ${componentName} } from './${componentBasename}';`);
  }
  lines.push("");

  // Meta
  lines.push(`const meta: Meta<typeof ${componentName}> = {`);
  lines.push(`  title: '${storyTitle}',`);
  lines.push(`  component: ${componentName},`);
  lines.push("  tags: ['autodocs'],");

  // argTypes
  if (props.length > 0) {
    lines.push("  argTypes: {");
    for (const prop of props) {
      if (prop.isCallback) {
        lines.push(`    ${prop.name}: { action: '${prop.actionName}' },`);
      } else if (prop.controlType === "select" && prop.options) {
        const optStr = prop.options.map((o) => `'${o}'`).join(", ");
        if (prop.description) {
          lines.push(`    ${prop.name}: {`);
          lines.push(`      control: 'select',`);
          lines.push(`      options: [${optStr}],`);
          lines.push(`      description: '${esc(prop.description)}',`);
          lines.push("    },");
        } else {
          lines.push(`    ${prop.name}: { control: 'select', options: [${optStr}] },`);
        }
      } else {
        if (prop.description) {
          lines.push(
            `    ${prop.name}: { control: '${prop.controlType}', description: '${esc(prop.description)}' },`,
          );
        } else {
          lines.push(`    ${prop.name}: { control: '${prop.controlType}' },`);
        }
      }
    }
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");
  lines.push("export default meta;");
  lines.push(`type Story = StoryObj<typeof ${componentName}>;`);
  lines.push("");

  // Default story
  const hasDefaults = Object.keys(defaults).length > 0;
  if (hasDefaults) {
    lines.push("export const Default: Story = {");
    lines.push("  args: {");
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === "string") {
        lines.push(`    ${key}: '${esc(value)}',`);
      } else {
        lines.push(`    ${key}: ${value},`);
      }
    }
    lines.push("  },");
    lines.push("};");
  } else {
    lines.push("export const Default: Story = {};");
  }

  // Variant stories
  const variantNames = [];

  for (const prop of props) {
    if (prop.controlType === "select" && prop.literalValues.length > 0) {
      const values = prop.literalValues.slice(0, maxVariants);
      for (const val of values) {
        const storyName = toIdentifier(val);
        variantNames.push(storyName);
        lines.push("");
        lines.push(`export const ${storyName}: Story = {`);
        lines.push("  args: {");
        lines.push(`    ${prop.name}: '${val}',`);
        lines.push("  },");
        lines.push("};");
      }
    } else if (prop.controlType === "boolean") {
      const trueName = `${prop.name.charAt(0).toUpperCase() + prop.name.slice(1)}True`;
      const falseName = `${prop.name.charAt(0).toUpperCase() + prop.name.slice(1)}False`;
      variantNames.push(trueName, falseName);
      lines.push("");
      lines.push(`export const ${trueName}: Story = {`);
      lines.push("  args: {");
      lines.push(`    ${prop.name}: true,`);
      lines.push("  },");
      lines.push("};");
      lines.push("");
      lines.push(`export const ${falseName}: Story = {`);
      lines.push("  args: {");
      lines.push(`    ${prop.name}: false,`);
      lines.push("  },");
      lines.push("};");
    }
  }

  // Responsive viewport stories
  if (includeViewports) {
    for (const vp of viewports) {
      const width = breakpoints[vp];
      if (!width) continue;
      const name = vp.charAt(0).toUpperCase() + vp.slice(1);
      variantNames.push(name);
      lines.push("");
      lines.push(`export const ${name}: Story = {`);
      lines.push("  parameters: {");
      lines.push("    viewport: {");
      lines.push(`      defaultViewport: '${vp}',`);
      lines.push("    },");
      lines.push("  },");
      lines.push("};");
    }
  }

  lines.push("");
  return { content: lines.join("\n"), variantNames };
}

// ---------------------------------------------------------------------------
// MDX content generation
// ---------------------------------------------------------------------------

function generateMdxContent(componentName, componentBasename, description, variantNames) {
  const lines = [];

  lines.push("import { Meta } from '@storybook/blocks';");
  lines.push("import { Canvas } from '@storybook/blocks';");
  lines.push("import { Controls } from '@storybook/blocks';");
  lines.push("import { ArgTypes } from '@storybook/blocks';");
  lines.push(`import * as Stories from './${componentBasename}.stories';`);
  lines.push("");
  lines.push("<Meta of={Stories} />");
  lines.push("");
  lines.push(`# ${componentName}`);
  lines.push("");

  if (description) {
    lines.push(description);
    lines.push("");
  }

  lines.push("<Canvas of={Stories.Default} />");
  lines.push("");
  lines.push("<Controls of={Stories.Default} />");
  lines.push("");

  // Variant canvases
  for (const varName of variantNames) {
    lines.push(`<Canvas of={Stories.${varName}} />`);
    lines.push("");
  }

  lines.push("<ArgTypes of={Stories} />");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const cwd = process.cwd();
  const fullSrcDir = join(cwd, srcDir);
  const fullConfigPath = join(cwd, configPath);

  // Check source directory exists
  if (!existsSync(fullSrcDir)) {
    log(`No ${srcDir} directory found`);
    if (jsonOutput) {
      console.log(JSON.stringify({ generated: 0, skipped: 0, files: [] }));
    }
    process.exit(0);
  }

  // Load config
  const config = loadConfig(fullConfigPath);
  const skipPatterns = config.storybook.skipPatterns || [];
  const generateMdxFlag = !noMdx && config.storybook.generateMdx !== false;

  // Find component files
  const componentFiles = findComponentFiles(fullSrcDir);

  if (componentFiles.length === 0) {
    log("No component files found");
    if (jsonOutput) {
      console.log(JSON.stringify({ generated: 0, skipped: 0, files: [] }));
    }
    process.exit(0);
  }

  // Set up ts-morph project
  const tsconfigPath = join(cwd, "tsconfig.json");
  let project;
  if (existsSync(tsconfigPath)) {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true,
    });
  } else {
    project = new Project({
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
        jsx: 4, // react-jsx
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
  }

  let generated = 0;
  let skipped = 0;
  const generatedFiles = [];

  for (const filePath of componentFiles) {
    const relPath = relative(cwd, filePath);
    const fileDir = dirname(filePath);
    const componentBasename = basename(filePath, ".tsx");

    // Check skip patterns
    if (matchesSkipPattern(filePath, skipPatterns)) {
      log(`Skipped (config pattern): ${relPath}`);
      skipped++;
      continue;
    }

    // Check for existing story file
    const storyFilePath = join(fileDir, `${componentBasename}.stories.tsx`);
    if (existsSync(storyFilePath) && !force) {
      log(`Skipped (story exists): ${relPath}`);
      skipped++;
      continue;
    }

    // Parse with ts-morph
    let sourceFile;
    try {
      const fileContent = readFileSync(filePath, "utf-8");
      sourceFile = project.createSourceFile(filePath, fileContent, {
        overwrite: true,
      });
    } catch {
      log(`Skipped (parse error): ${relPath}`);
      skipped++;
      continue;
    }

    // Find exported component
    const component = findExportedComponent(sourceFile);
    if (!component) {
      log(`Skipped (no exported component): ${relPath}`);
      skipped++;
      continue;
    }

    const { name: componentName, isDefault } = component;

    // Find props interface and extract prop info
    const propsInterface = findPropsInterface(sourceFile, componentName);
    const props = extractPropsFromInterface(propsInterface);
    const defaults = extractDefaultValues(sourceFile, componentName);

    // Build story title from relative path
    const relToSrc = relative(fullSrcDir, filePath);
    const storyTitle = `Components/${relToSrc.replace(/\.tsx$/, "").replace(/\\/g, "/")}`;

    // Generate story content
    const { content: storyContent, variantNames } = generateStoryContent(
      componentName,
      componentBasename,
      storyTitle,
      isDefault,
      props,
      defaults,
      config,
    );

    if (dryRun) {
      log(`Would generate: ${relative(cwd, storyFilePath)}`);
    } else {
      writeFileSync(storyFilePath, storyContent, "utf-8");
      log(`Generated: ${relative(cwd, storyFilePath)}`);
    }
    generatedFiles.push(relative(cwd, storyFilePath));

    // Generate MDX
    if (generateMdxFlag) {
      const mdxFilePath = join(fileDir, `${componentBasename}.mdx`);
      const description = getComponentDescription(sourceFile, componentName);
      const mdxContent = generateMdxContent(
        componentName,
        componentBasename,
        description,
        variantNames,
      );

      if (dryRun) {
        log(`Would generate: ${relative(cwd, mdxFilePath)}`);
      } else {
        writeFileSync(mdxFilePath, mdxContent, "utf-8");
      }
      generatedFiles.push(relative(cwd, mdxFilePath));
    }

    generated++;
  }

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify({ generated, skipped, files: generatedFiles }));
  } else {
    log("");
    if (dryRun) {
      log(`Generated: ${generated}`);
      log(`Skipped:   ${skipped}`);
      log("(dry run — no files written)");
    } else {
      log(`Generated: ${generated}`);
      log(`Skipped:   ${skipped}`);
    }
  }
}

main();
