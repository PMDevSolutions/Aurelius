/**
 * Fatal errors for the IDML parser.
 *
 * Unlike {@link import("./warnings.js").ParseWarning}, an `IdmlParseError`
 * represents an unrecoverable condition (the input is not a zip, `designmap.xml`
 * is absent, etc.) that prevents producing any intermediate representation.
 */
export class IdmlParseError extends Error {
  readonly code: string;

  constructor(message: string, code = "IDML_PARSE_ERROR") {
    super(message);
    this.name = "IdmlParseError";
    this.code = code;
    // Restore the prototype chain for instanceof checks across transpile targets.
    Object.setPrototypeOf(this, IdmlParseError.prototype);
  }
}
