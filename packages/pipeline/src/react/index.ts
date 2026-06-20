/**
 * Public API for the React component generator.
 *
 * @example
 * ```ts
 * import { parseIdmlFile } from "@aurelius/pipeline/indesign";
 * import { mapDocumentToTokens } from "@aurelius/pipeline/tokens";
 * import { generateComponents } from "@aurelius/pipeline/react";
 *
 * const { document } = parseIdmlFile("brochure.idml");
 * const tokens = mapDocumentToTokens(document);
 * const { files, report } = generateComponents(document, tokens, { styleMode: "tailwind" });
 * // files: [{ path: "Spread1.tsx", contents }, { path: "Spread1.stories.tsx", … }, …]
 * ```
 */
export { generateComponents, REPORT_FILENAME } from "./generator.js";
export { buildComponentPlans } from "./plan.js";
export { emitComponentTsx, emitComponentCss, emitStoriesTsx, emitIndexTs } from "./emit.js";
export { buildReport } from "./report.js";
export type * from "./model.js";
