import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "generate-stories.js");

let counter = 0;

/**
 * Creates a unique temp directory under scripts/__tests__/fixtures/gen-stories-*
 */
function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `gen-stories-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Runs `node scripts/generate-stories.js` with given args in given cwd.
 */
function run(cwd, args = []) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
      cwd,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * Writes a minimal tsconfig.json so ts-morph can parse .tsx files.
 */
function writeTsConfig(dir) {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: "dist",
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
}

afterAll(() => {
  const fixturesDir = join(__dirname, "fixtures");
  if (existsSync(fixturesDir)) {
    try {
      for (const entry of readdirSync(fixturesDir)) {
        if (entry.startsWith("gen-stories-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

// =============================================================================
// 1. Backward compatibility tests
// =============================================================================

describe("generate-stories.js — backward compatibility", () => {
  it("exits 0 with skip message when no src/components", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No src/components directory found");
  });

  it("generates a .stories.tsx file with correct structure", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Button.tsx"),
      `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export function Button({ children, variant = 'primary' }: ButtonProps) {
  return <button className={variant}>{children}</button>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated:");
    expect(result.stdout).toContain("Button");

    const storyFile = join(dir, "src", "components", "Button.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("import type { Meta, StoryObj }");
    expect(content).toContain("import { Button }");
    expect(content).toContain("component: Button");
    expect(content).toContain("export const Default: Story");
    expect(content).toContain("tags: ['autodocs']");
  });

  it("reports what would be generated without writing files", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Card.tsx"),
      `export interface CardProps { title: string; }
export function Card({ title }: CardProps) { return <div>{title}</div>; }`,
    );

    const result = run(dir, ["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would generate:");
    expect(result.stdout).toContain("dry run");

    const storyFile = join(dir, "src", "components", "Card.stories.tsx");
    expect(existsSync(storyFile)).toBe(false);
  });

  it("skips components that already have stories", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Nav.tsx"),
      `export function Nav() { return <nav>Nav</nav>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      `// existing story`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped (story exists)");
  });

  it("regenerates stories with --force flag", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Nav.tsx"),
      `export function Nav() { return <nav>Nav</nav>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      `// old story content`,
    );

    const result = run(dir, ["--force"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated:");

    const content = readFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      "utf-8",
    );
    expect(content).toContain("import type { Meta, StoryObj }");
  });

  it("skips files with no exported React component", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    // lowercase function — not a React component
    writeFileSync(
      join(dir, "src", "components", "utils.tsx"),
      `export function formatDate(d: Date) { return d.toISOString(); }`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped (no exported component)");
  });

  it("shows correct generated and skipped counts", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "A.tsx"),
      `export function Alpha() { return <div>A</div>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "B.tsx"),
      `export function Beta() { return <div>B</div>; }`,
    );
    // Already has story
    writeFileSync(
      join(dir, "src", "components", "C.tsx"),
      `export function Charlie() { return <div>C</div>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "C.stories.tsx"),
      `// existing`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated: 2");
    expect(result.stdout).toContain("Skipped:   1");
  });
});

// =============================================================================
// 2. argTypes generation
// =============================================================================

describe("generate-stories.js — argTypes generation", () => {
  it("maps string props to text control", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Label.tsx"),
      `export interface LabelProps {
  /** The label text */
  text: string;
}

export function Label({ text }: LabelProps) {
  return <span>{text}</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Label.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("argTypes");
    expect(content).toContain("text");
    expect(content).toContain("control: 'text'");
  });

  it("maps number props to number control", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Counter.tsx"),
      `export interface CounterProps {
  count: number;
}

export function Counter({ count }: CounterProps) {
  return <span>{count}</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Counter.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("argTypes");
    expect(content).toContain("count");
    expect(content).toContain("control: 'number'");
  });

  it("maps boolean props to boolean control", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Toggle.tsx"),
      `export interface ToggleProps {
  enabled: boolean;
}

export function Toggle({ enabled }: ToggleProps) {
  return <input type="checkbox" checked={enabled} />;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Toggle.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("argTypes");
    expect(content).toContain("enabled");
    expect(content).toContain("control: 'boolean'");
  });

  it("maps string literal union to select control with options", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Badge.tsx"),
      `export interface BadgeProps {
  variant: 'info' | 'success' | 'warning' | 'error';
}

export function Badge({ variant }: BadgeProps) {
  return <span className={variant}>badge</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Badge.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("argTypes");
    expect(content).toContain("variant");
    expect(content).toContain("control: 'select'");
    expect(content).toContain("options: ['info', 'success', 'warning', 'error']");
  });

  it("includes description from JSDoc comments", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Tooltip.tsx"),
      `export interface TooltipProps {
  /** The tooltip message to display */
  message: string;
}

export function Tooltip({ message }: TooltipProps) {
  return <div title={message}>{message}</div>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Tooltip.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("argTypes");
    expect(content).toContain("description: 'The tooltip message to display'");
  });
});

// =============================================================================
// 3. Action args for callbacks
// =============================================================================

describe("generate-stories.js — action args for callbacks", () => {
  it("wires onClick and onChange as action args", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Btn.tsx"),
      `export interface BtnProps {
  label: string;
  onClick?: () => void;
  onChange?: (value: string) => void;
}

export function Btn({ label, onClick, onChange }: BtnProps) {
  return <button onClick={onClick}>{label}</button>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Btn.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    // onClick -> action: 'clicked'
    expect(content).toContain("onClick");
    expect(content).toContain("action: 'clicked'");
    // onChange -> action: 'changed'
    expect(content).toContain("onChange");
    expect(content).toContain("action: 'changed'");
  });
});

// =============================================================================
// 4. Variant story generation
// =============================================================================

describe("generate-stories.js — variant story generation", () => {
  it("generates one story per string literal union value", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Chip.tsx"),
      `export interface ChipProps {
  size: 'sm' | 'md' | 'lg';
  label: string;
}

export function Chip({ size, label }: ChipProps) {
  return <span className={size}>{label}</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Chip.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    // One story per union value
    expect(content).toContain("export const Sm: Story");
    expect(content).toMatch(/Sm.*args.*size.*['"]sm['"]/s);
    expect(content).toContain("export const Md: Story");
    expect(content).toMatch(/Md.*args.*size.*['"]md['"]/s);
    expect(content).toContain("export const Lg: Story");
    expect(content).toMatch(/Lg.*args.*size.*['"]lg['"]/s);
  });

  it("generates True/False stories for boolean props", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Checkbox.tsx"),
      `export interface CheckboxProps {
  checked: boolean;
  label: string;
}

export function Checkbox({ checked, label }: CheckboxProps) {
  return <label><input type="checkbox" checked={checked} />{label}</label>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Checkbox.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("export const CheckedTrue: Story");
    expect(content).toContain("export const CheckedFalse: Story");
  });
});

// =============================================================================
// 5. Default values from destructuring
// =============================================================================

describe("generate-stories.js — default values from destructuring", () => {
  it("populates args with default values", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Tag.tsx"),
      `export interface TagProps {
  label: string;
  size: 'sm' | 'md' | 'lg';
}

export function Tag({ label = 'tag', size = 'md' }: TagProps) {
  return <span className={size}>{label}</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Tag.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    // Default story should contain default values in args
    expect(content).toContain("label: 'tag'");
    expect(content).toContain("size: 'md'");
  });
});

// =============================================================================
// 6. MDX documentation generation
// =============================================================================

describe("generate-stories.js — MDX documentation generation", () => {
  it("generates an .mdx file alongside the story", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Alert.tsx"),
      `/** A dismissible alert banner */
export interface AlertProps {
  /** The alert message */
  message: string;
  /** Visual severity */
  severity: 'info' | 'warning' | 'error';
}

export function Alert({ message, severity }: AlertProps) {
  return <div role="alert" className={severity}>{message}</div>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const mdxFile = join(dir, "src", "components", "Alert.mdx");
    expect(existsSync(mdxFile)).toBe(true);

    const content = readFileSync(mdxFile, "utf-8");
    // MDX should contain standard Storybook doc blocks
    expect(content).toContain("import { Meta");
    expect(content).toContain("import { Canvas");
    expect(content).toContain("import { Controls");
    expect(content).toContain("import { ArgTypes");
    expect(content).toContain("<Meta");
    expect(content).toContain("<Canvas");
    expect(content).toContain("<Controls");
    expect(content).toContain("<ArgTypes");
  });

  it("includes JSDoc description in MDX", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Banner.tsx"),
      `/** A promotional banner component */
export interface BannerProps {
  text: string;
}

export function Banner({ text }: BannerProps) {
  return <div>{text}</div>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const mdxFile = join(dir, "src", "components", "Banner.mdx");
    expect(existsSync(mdxFile)).toBe(true);

    const content = readFileSync(mdxFile, "utf-8");
    expect(content).toContain("A promotional banner component");
  });

  it("embeds variant stories in MDX", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Pill.tsx"),
      `export interface PillProps {
  color: 'red' | 'blue' | 'green';
}

export function Pill({ color }: PillProps) {
  return <span className={color}>pill</span>;
}`,
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const mdxFile = join(dir, "src", "components", "Pill.mdx");
    expect(existsSync(mdxFile)).toBe(true);

    const content = readFileSync(mdxFile, "utf-8");
    expect(content).toContain("<Canvas of={Stories.Red} />");
    expect(content).toContain("<Canvas of={Stories.Blue} />");
    expect(content).toContain("<Canvas of={Stories.Green} />");
  });

  it("skips MDX generation with --no-mdx flag", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Link.tsx"),
      `export interface LinkProps {
  href: string;
  label: string;
}

export function Link({ href, label }: LinkProps) {
  return <a href={href}>{label}</a>;
}`,
    );

    const result = run(dir, ["--no-mdx"]);
    expect(result.exitCode).toBe(0);

    // Story file should still be generated
    const storyFile = join(dir, "src", "components", "Link.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    // MDX file should NOT be generated
    const mdxFile = join(dir, "src", "components", "Link.mdx");
    expect(existsSync(mdxFile)).toBe(false);
  });
});

// =============================================================================
// 7. JSON output mode
// =============================================================================

describe("generate-stories.js — JSON output mode", () => {
  it("outputs results as JSON with --json flag", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Heading.tsx"),
      `export interface HeadingProps {
  level: number;
  text: string;
}

export function Heading({ level, text }: HeadingProps) {
  const Tag = \`h\${level}\` as keyof JSX.IntrinsicElements;
  return <Tag>{text}</Tag>;
}`,
    );

    // Pre-existing story to get a skip count
    writeFileSync(
      join(dir, "src", "components", "Footer.tsx"),
      `export function Footer() { return <footer>Footer</footer>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "Footer.stories.tsx"),
      `// existing`,
    );

    const result = run(dir, ["--json"]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty("generated");
    expect(json).toHaveProperty("skipped");
    expect(json).toHaveProperty("files");
    expect(Array.isArray(json.files)).toBe(true);
    expect(json.generated).toBe(1);
    expect(json.skipped).toBe(1);
    expect(json.files.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 8. maxVariantsPerProp config
// =============================================================================

describe("generate-stories.js — maxVariantsPerProp config", () => {
  it("caps variant stories when union has many values", () => {
    const dir = createTmpDir();
    writeTsConfig(dir);
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    mkdirSync(join(dir, ".claude"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Icon.tsx"),
      `export interface IconProps {
  name: 'home' | 'star' | 'heart' | 'bell' | 'gear' | 'user';
}

export function Icon({ name }: IconProps) {
  return <i className={name} />;
}`,
    );

    // Pipeline config with maxVariantsPerProp = 3
    writeFileSync(
      join(dir, ".claude", "pipeline.config.json"),
      JSON.stringify(
        {
          storybook: {
            autoGenerate: true,
            maxVariantsPerProp: 3,
          },
        },
        null,
        2,
      ),
    );

    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const storyFile = join(dir, "src", "components", "Icon.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");

    // Count exported stories: Default + at most 3 variant stories = 4 max
    const storyExports = content.match(/export const \w+: Story/g) || [];
    expect(storyExports.length).toBeLessThanOrEqual(4); // Default + 3 capped variants
    expect(storyExports.length).toBeGreaterThanOrEqual(2); // At least Default + 1 variant
  });
});
