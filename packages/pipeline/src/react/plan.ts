/**
 * Derive {@link ComponentPlan}s from the IR + design tokens.
 *
 * One plan per spread: frames are flattened in reading order, text frames become
 * semantic elements (tag inferred from the paragraph-style role), image frames
 * become `<img>`/`next/image`, and styling resolves to Tailwind classes or CSS
 * custom properties that match the token names emitted by the mapper. Pure and
 * deterministic — the same IR always yields the same plans.
 */
import type {
  Document,
  Frame,
  ImageFrame,
  Spread,
  Story,
  Style,
  TextFrame,
} from "../indesign/ir.js";
import { slug } from "../tokens/mapper.js";
import type { TokenMapResult } from "../tokens/model.js";
import type {
  ComponentPlan,
  ElementNode,
  Framework,
  LayoutSpec,
  PropSpec,
  StagedAsset,
  StyleMode,
} from "./model.js";

interface PlanContext {
  document: Document;
  tokens: TokenMapResult;
  styleMode: StyleMode;
  framework: Framework;
  assetPath: string;
  styleById: Map<string, Style>;
  storyById: Map<string, Story>;
  swatchNameById: Map<string, string>;
  roleByToken: Map<string, { role: "heading" | "body" | "caption"; level: number }>;
}

interface BuildOptions {
  styleMode: StyleMode;
  framework: Framework;
  assetPath: string;
}

/** Build one component plan per spread. */
export function buildComponentPlans(
  document: Document,
  tokens: TokenMapResult,
  options: BuildOptions,
): ComponentPlan[] {
  const ctx: PlanContext = {
    document,
    tokens,
    styleMode: options.styleMode,
    framework: options.framework,
    assetPath: options.assetPath,
    styleById: new Map(document.paragraphStyles.map((s) => [s.id, s])),
    storyById: new Map(document.stories.map((s) => [s.id, s])),
    swatchNameById: new Map(document.swatches.map((s) => [s.id, s.name])),
    roleByToken: buildRoleMap(tokens),
  };

  const used = new Set<string>();
  return document.spreads.map((spread, index) => planForSpread(spread, index, ctx, used));
}

function planForSpread(
  spread: Spread,
  index: number,
  ctx: PlanContext,
  usedNames: Set<string>,
): ComponentPlan {
  const name = uniqueName(componentName(spread, index), usedNames);
  const unmapped: string[] = [];
  const frames = orderForReading(flatten(spread.frames, spread.id, unmapped));

  const elements: ElementNode[] = [];
  const props: PropSpec[] = [];
  const css: Record<string, string> = {};
  const assets: StagedAsset[] = [];
  const a11y: string[] = [];
  const usedProps = new Set<string>();
  let imageIndex = 0;

  for (const frame of frames) {
    if (frame.type === "text") {
      const element = textElement(frame, ctx, usedProps, css);
      if (!element) continue;
      elements.push(element);
      props.push({ name: element.propName, default: element.defaultValue });
    } else {
      imageIndex++;
      const element = imageElement(frame, ctx, usedProps, css, name);
      elements.push(element);
      props.push({ name: element.propName, default: element.defaultValue });
      if (element.altPropName) props.push({ name: element.altPropName, default: "" });
      assets.push({ src: element.defaultValue, from: frame.image.resolvedPath ?? "(embedded)" });
      a11y.push(
        `${name}: image #${imageIndex} is missing alt text — set the \`${element.altPropName}\` prop`,
      );
    }
  }

  const layout = layoutFor(frames, ctx);
  if (ctx.styleMode === "css-modules") css["root"] = layout.cssBody;

  return { name, sourceId: spread.id, props, elements, layout, css, assets, unmapped, a11y };
}

/* ── Frame flattening & ordering ─────────────────────────────────────────── */

function flatten(
  frames: Frame[],
  spreadId: string,
  unmapped: string[],
): (TextFrame | ImageFrame)[] {
  const out: (TextFrame | ImageFrame)[] = [];
  for (const frame of frames) {
    if (frame.type === "text" || frame.type === "image") {
      out.push(frame);
    } else if (frame.type === "group") {
      out.push(...flatten(frame.children, spreadId, unmapped));
    } else {
      unmapped.push(
        `${spreadId}: ${frame.type} frame "${frame.name ?? frame.id}" has no JSX mapping`,
      );
    }
  }
  return out;
}

function orderForReading<T extends Frame>(frames: T[]): T[] {
  return [...frames].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}

/* ── Elements ────────────────────────────────────────────────────────────── */

function textElement(
  frame: TextFrame,
  ctx: PlanContext,
  usedProps: Set<string>,
  css: Record<string, string>,
): ElementNode | undefined {
  const story = frame.storyId ? ctx.storyById.get(frame.storyId) : undefined;
  const text = (story?.plainText ?? "").trim();
  if (!text) return undefined;

  const style = resolveStyle(frame, ctx);
  const role = style ? ctx.roleByToken.get(slug(style.name)) : undefined;
  const kind = role?.role ?? "body";
  const tag = tagFor(kind, role?.level ?? 1);
  const propName = uniqueName(kind, usedProps);

  const cssClass = propName;
  if (ctx.styleMode === "css-modules") css[cssClass] = cssBodyForStyle(style, ctx);

  return {
    kind: "text",
    tag,
    propName,
    defaultValue: text,
    className: ctx.styleMode === "tailwind" ? tailwindTextClasses(style, ctx) : "",
    cssClass,
  };
}

function imageElement(
  frame: ImageFrame,
  ctx: PlanContext,
  usedProps: Set<string>,
  css: Record<string, string>,
  componentSlug: string,
): ElementNode {
  const propName = uniqueName("image", usedProps);
  const altPropName = `${propName}Alt`;
  usedProps.add(altPropName);
  const src = assetSrc(frame, ctx, `${slug(componentSlug)}-${propName}`);

  const cssClass = propName;
  if (ctx.styleMode === "css-modules") css[cssClass] = "max-width: 100%;\n  height: auto;";

  const element: ElementNode = {
    kind: "image",
    tag: ctx.framework === "next" ? "Image" : "img",
    propName,
    defaultValue: src,
    altPropName,
    className: ctx.styleMode === "tailwind" ? "max-w-full h-auto" : "",
    cssClass,
    width: Math.round(frame.bounds.width) || 1,
    height: Math.round(frame.bounds.height) || 1,
  };
  return element;
}

function assetSrc(frame: ImageFrame, ctx: PlanContext, fallbackBase: string): string {
  const resolved = frame.image.resolvedPath;
  const base = resolved ? basename(resolved) : `${fallbackBase}.png`;
  return `${ctx.assetPath}/${base}`;
}

/* ── Styling resolution ──────────────────────────────────────────────────── */

function tailwindTextClasses(style: Style | undefined, ctx: PlanContext): string {
  if (!style) return "";
  const t = ctx.tokens.tokens;
  const classes: string[] = [];
  const sizeKey = slug(style.name);
  if (t.fontSizes[sizeKey]) classes.push(`text-${sizeKey}`);
  if (t.lineHeights[sizeKey]) classes.push(`leading-${sizeKey}`);
  if (t.letterSpacing[sizeKey]) classes.push(`tracking-${sizeKey}`);

  const family = style.properties.fontFamily;
  if (family && t.fontFamilies[slug(family)]) classes.push(`font-${slug(family)}`);

  const colorKey = colorTokenKey(style, ctx);
  if (colorKey) classes.push(`text-${colorKey}`);
  return classes.join(" ");
}

function cssBodyForStyle(style: Style | undefined, ctx: PlanContext): string {
  if (!style) return "";
  const t = ctx.tokens.tokens;
  const lines: string[] = [];
  const sizeKey = slug(style.name);
  if (t.fontSizes[sizeKey]) lines.push(`font-size: var(--font-size-${sizeKey});`);
  if (t.lineHeights[sizeKey]) lines.push(`line-height: var(--line-height-${sizeKey});`);
  if (t.letterSpacing[sizeKey]) lines.push(`letter-spacing: var(--letter-spacing-${sizeKey});`);

  const family = style.properties.fontFamily;
  if (family && t.fontFamilies[slug(family)]) {
    lines.push(`font-family: var(--font-family-${slug(family)});`);
  }
  const colorKey = colorTokenKey(style, ctx);
  if (colorKey) lines.push(`color: var(--color-${colorKey});`);
  return lines.join("\n  ");
}

function colorTokenKey(style: Style, ctx: PlanContext): string | undefined {
  const fillId = style.properties.fillColor;
  if (!fillId) return undefined;
  const name = ctx.swatchNameById.get(fillId);
  if (!name) return undefined;
  const key = slug(name);
  return ctx.tokens.tokens.colors[key] ? key : undefined;
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

function layoutFor(frames: Frame[], ctx: PlanContext): LayoutSpec {
  const columns = detectColumns(frames);
  const spacingKey = Object.keys(ctx.tokens.tokens.spacing)[0];
  const gapClass = spacingKey ? `gap-${spacingKey}` : "gap-6";
  const gapVar = spacingKey ? `var(--spacing-${spacingKey})` : "1.5rem";

  if (columns >= 2) {
    return {
      kind: "grid",
      columns,
      className: `grid grid-cols-${columns} ${gapClass}`,
      cssBody: `display: grid;\n  grid-template-columns: repeat(${columns}, minmax(0, 1fr));\n  gap: ${gapVar};`,
    };
  }
  return {
    kind: "flow",
    columns: 1,
    className: `flex flex-col ${gapClass}`,
    cssBody: `display: flex;\n  flex-direction: column;\n  gap: ${gapVar};`,
  };
}

function detectColumns(frames: Frame[]): number {
  const xs = [...new Set(frames.map((f) => Math.round(f.bounds.x)))].sort((a, b) => a - b);
  let bands = 1;
  for (let i = 1; i < xs.length; i++) {
    if ((xs[i] ?? 0) - (xs[i - 1] ?? 0) > 120) bands++;
  }
  return Math.min(bands, 3);
}

/* ── Names & roles ───────────────────────────────────────────────────────── */

function buildRoleMap(
  tokens: TokenMapResult,
): Map<string, { role: "heading" | "body" | "caption"; level: number }> {
  const map = new Map<string, { role: "heading" | "body" | "caption"; level: number }>();
  for (const h of tokens.typography.headings)
    map.set(h.token, { role: "heading", level: h.level ?? 1 });
  for (const b of tokens.typography.body) map.set(b.token, { role: "body", level: 0 });
  for (const c of tokens.typography.captions) map.set(c.token, { role: "caption", level: 0 });
  return map;
}

function resolveStyle(frame: TextFrame, ctx: PlanContext): Style | undefined {
  const story = frame.storyId ? ctx.storyById.get(frame.storyId) : undefined;
  const styleId = story?.paragraphs[0]?.appliedParagraphStyle;
  return styleId ? ctx.styleById.get(styleId) : undefined;
}

function tagFor(role: "heading" | "body" | "caption", level: number): string {
  if (role === "heading") return `h${Math.min(Math.max(level, 1), 6)}`;
  if (role === "caption") return "figcaption";
  return "p";
}

function componentName(spread: Spread, index: number): string {
  const page = spread.pages[0]?.name;
  const raw = page && !/^\d+$/.test(page) ? page : `Spread ${index + 1}`;
  return pascalCase(raw);
}

function pascalCase(raw: string): string {
  const parts = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[A-Za-z]/.test(name) ? name : `Component${name}`;
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base}${n++}`;
  used.add(candidate);
  return candidate;
}

function basename(path: string): string {
  const i = path.replace(/\\/g, "/").lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}
