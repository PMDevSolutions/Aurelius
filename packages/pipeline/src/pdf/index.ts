/**
 * Public API for the PDF ingestion path.
 *
 * Produces the same {@link import("../indesign/ir.js").Document} IR as the IDML
 * parser, so the token mapper and component generator are source-agnostic.
 *
 * @example
 * ```ts
 * import { parsePdfFile } from "@aurelius/pipeline/pdf";
 * import { mapDocumentToTokens } from "@aurelius/pipeline/tokens";
 *
 * const { document, warnings } = await parsePdfFile("brochure.pdf", { assetDir: "public/assets" });
 * const { tokens } = mapDocumentToTokens(document);
 * ```
 */
export {
  parsePdf,
  parsePdfFile,
  PdfWarningCode,
  DEFAULT_DPI as PDF_DEFAULT_DPI,
  type PdfParseOptions,
} from "./parser.js";
export { derivePalette, type PaletteOptions } from "./palette.js";
export {
  clusterTextRuns,
  type TextBlock,
  type ClusterLine,
  type ClusterResult,
} from "./text-cluster.js";
export { buildStyleBuckets, type StyleBuckets } from "./style-buckets.js";
export {
  loadPdfPages,
  type RawPage,
  type RawTextRun,
  type RawImage,
  type RawPixels,
} from "./pdf-document.js";
