/**
 * Public API for the InDesign IDML parser and intermediate representation.
 *
 * @example
 * ```ts
 * import { parseIdmlFile } from "@aurelius/pipeline/indesign";
 *
 * const { document, warnings } = parseIdmlFile("brochure.idml", { dpi: 96 });
 * console.log(document.swatches, document.paragraphStyles, warnings);
 * ```
 */
export type * from "./ir.js";
export {
  parseIdml,
  parseIdmlFile,
  parsePackage,
  DEFAULT_DPI,
  type ParseOptions,
  type ParseResult,
} from "./parser.js";
export { DocumentSchema, validateDocument, safeValidateDocument } from "./schema.js";
export { IdmlPackage, IDML_MIMETYPE } from "./package.js";
export { IdmlParseError } from "./errors.js";
export {
  WarningCode,
  WarningCollector,
  type ParseWarning,
  type WarningSeverity,
  type WarningCodeValue,
} from "./warnings.js";
export { runCli, formatReport, type CliResult } from "./cli.js";
export { ptToPx, parseTransform, compose, applyMatrix } from "./units.js";
