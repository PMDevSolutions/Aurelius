/**
 * Aurelius pipeline package root.
 *
 * Surfaces the InDesign IDML parser, the PDF parser, the design-token mapper,
 * and a source-agnostic entry point. The React component generator will be
 * exported here too.
 */
export * as indesign from "./indesign/index.js";
export * as pdf from "./pdf/index.js";
export * as tokens from "./tokens/index.js";
export {
  parseSourceFile,
  resolveSource,
  type SourcePriority,
  type ParseSourceOptions,
  type ResolvedSource,
} from "./source.js";
