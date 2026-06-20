/**
 * Public API for the design-token mapper and emitters.
 *
 * @example
 * ```ts
 * import { parseIdmlFile } from "@aurelius/pipeline/indesign";
 * import { mapDocumentToTokens, emitAll } from "@aurelius/pipeline/tokens";
 *
 * const { document } = parseIdmlFile("brochure.idml");
 * const { tokens, warnings } = mapDocumentToTokens(document);
 * const files = emitAll(tokens); // { "tokens.ts", "tokens.css", ... }
 * ```
 */
export type * from "./model.js";
export {
  mapDocumentToTokens,
  buildColorPalette,
  clusterTypography,
  deriveSpacing,
  buildFontFamilies,
  slug,
  MapWarningCode,
  type MapOptions,
} from "./mapper.js";
export {
  emitTokensTs,
  emitTokensCss,
  emitTailwindPreset,
  buildTailwindPreset,
  emitStyleDictionaryJson,
  emitAll,
  type EmitTsOptions,
  type EmitAllOptions,
  type TailwindPreset,
} from "./emit.js";
export { DesignTokensSchema, validateDesignTokens, safeValidateDesignTokens } from "./schema.js";
export {
  resolveFontStack,
  loadDefaultFontMap,
  formatFontStack,
  type FontMapOverrides,
  type ResolvedFont,
} from "./font-map.js";
