/**
 * Model for the React component generator.
 *
 * A {@link ComponentPlan} is the framework-agnostic description of one generated
 * component (its props, elements, layout, and styling), derived from a spread of
 * the IR plus the design tokens. The emitters turn plans into `.tsx`,
 * `.module.css`, and `.stories.tsx` strings.
 */
export type StyleMode = "tailwind" | "css-modules";
export type Framework = "react" | "next";

export interface GenerateOptions {
  /** Styling strategy. Default `"tailwind"`. */
  styleMode?: StyleMode;
  /** Target framework — affects `<img>` vs `next/image`. Default `"react"`. */
  framework?: Framework;
  /** Public path prefix for staged assets. Default `"/indesign"`. */
  assetPath?: string;
  /** Emit `*.stories.tsx` per component. Default `true`. */
  stories?: boolean;
}

export interface PropSpec {
  name: string;
  /** Default value (string literal content). */
  default: string;
}

export type ElementKind = "text" | "image";

export interface ElementNode {
  kind: ElementKind;
  /** Output tag: `h1`–`h6`, `p`, `figcaption`, `img`, or `Image` (next). */
  tag: string;
  /** Content prop bound to this element (text content, or image `src`). */
  propName: string;
  defaultValue: string;
  /** Tailwind classes (tailwind mode). */
  className: string;
  /** CSS Modules class key (css-modules mode). */
  cssClass: string;
  /** Alt-text prop name for images. */
  altPropName?: string;
  /** Pixel width/height for `next/image`. */
  width?: number;
  height?: number;
}

export interface LayoutSpec {
  kind: "flow" | "grid";
  columns: number;
  /** Tailwind container classes. */
  className: string;
  /** CSS body for the container in css-modules mode. */
  cssBody: string;
}

export interface ComponentPlan {
  name: string;
  /** Spread id this component was derived from. */
  sourceId: string;
  props: PropSpec[];
  elements: ElementNode[];
  layout: LayoutSpec;
  /** Selector (e.g. `"root"`, `"heading"`) → CSS body, for css-modules mode. */
  css: Record<string, string>;
  assets: StagedAsset[];
  unmapped: string[];
  a11y: string[];
}

export interface GeneratedFile {
  /** Path relative to the output directory. */
  path: string;
  contents: string;
}

export interface StagedAsset {
  /** Public `src` referenced by the component. */
  src: string;
  /** Package-relative source path the asset was resolved from. */
  from: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  componentNames: string[];
  report: string;
  assets: StagedAsset[];
  unmapped: string[];
  a11y: string[];
}
