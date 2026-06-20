/**
 * Published runtime schema for {@link DesignTokens}.
 *
 * Generated `tokens.ts` validates against this, satisfying the acceptance
 * criterion that emitted tokens type-check against a published schema. The
 * `_check*` functions are never executed; they fail compilation if the zod
 * schema and the hand-written model drift apart.
 */
import { z } from "zod";
import type { DesignTokens } from "./model.js";

const stringRecord = z.record(z.string());

/** Zod schema for the serializable design-token set. */
export const DesignTokensSchema = z.object({
  colors: stringRecord,
  fontFamilies: stringRecord,
  fontSizes: stringRecord,
  lineHeights: stringRecord,
  letterSpacing: stringRecord,
  spacing: stringRecord,
});

/** Parse-and-validate, throwing a `ZodError` on mismatch. */
export function validateDesignTokens(value: unknown): DesignTokens {
  return DesignTokensSchema.parse(value) as DesignTokens;
}

/** Non-throwing validation. */
export function safeValidateDesignTokens(
  value: unknown,
): z.SafeParseReturnType<unknown, DesignTokens> {
  return DesignTokensSchema.safeParse(value) as z.SafeParseReturnType<unknown, DesignTokens>;
}

/* ── Compile-time drift guards (never executed) ─────────────────────────── */

function _schemaProducesTokens(value: z.infer<typeof DesignTokensSchema>): DesignTokens {
  return value;
}
function _tokensSatisfySchema(value: DesignTokens): z.infer<typeof DesignTokensSchema> {
  return value;
}
void _schemaProducesTokens;
void _tokensSatisfySchema;
