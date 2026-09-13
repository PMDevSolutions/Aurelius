/**
 * Product registry + the single switch point for which product the shell drives.
 *
 * Main and the renderer both import `activeManifest` from here, and `getScreen` /
 * `getStep` / `soleStep` are the typed lookups the engine uses instead of
 * hard-coding product specifics.
 *
 * ── Extension point ─────────────────────────────────────────────────────────────
 * Adding another product is:
 *   1. author packages/gui/src/shared/product/<product>.ts (another ProductManifest);
 *   2. register it in PRODUCTS below;
 *   3. flip ACTIVE_PRODUCT_ID (or, for the unified Trajan app, choose it at runtime).
 * No engine/core/renderer change is required. See docs/GUI-PLATFORM.md.
 * ────────────────────────────────────────────────────────────────────────────────
 */
import { aureliusManifest } from "./aurelius";
import type { ProductId, ProductManifest, ProductScreen, ProductStep, ScreenId } from "./manifest";

export type { ProductManifest, ProductScreen, ProductStep, ScreenId, ProductId } from "./manifest";

/** Every product the engine knows how to render. */
export const PRODUCTS: Readonly<Record<string, ProductManifest>> = {
  aurelius: aureliusManifest,
};

/** The product this build ships. The unified Trajan app will select this at runtime. */
export const ACTIVE_PRODUCT_ID: ProductId = "aurelius";

/** The manifest the engine renders. */
export const activeManifest: ProductManifest = PRODUCTS[ACTIVE_PRODUCT_ID];

/** Look up a screen by id (throws on a misconfigured manifest — a programming error). */
export function getScreen(manifest: ProductManifest, id: ScreenId): ProductScreen {
  const screen = manifest.screens.find((s) => s.id === id);
  if (!screen) throw new Error(`Product "${manifest.id}" has no "${id}" screen.`);
  return screen;
}

/** Look up a step within a screen by id (throws if absent). */
export function getStep(screen: ProductScreen, id: string): ProductStep {
  const step = screen.steps.find((s) => s.id === id);
  if (!step) throw new Error(`Screen "${screen.id}" has no "${id}" step.`);
  return step;
}

/** The sole step of a single-operation screen (prereq, wizard). */
export function soleStep(manifest: ProductManifest, screenId: ScreenId): ProductStep {
  const screen = getScreen(manifest, screenId);
  const step = screen.steps[0];
  if (!step) throw new Error(`Screen "${screenId}" has no steps.`);
  return step;
}
