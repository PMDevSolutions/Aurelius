/**
 * IDML package abstraction.
 *
 * An `.idml` file is a zip archive. This class unzips it into an in-memory map
 * of normalized entry paths and offers typed accessors plus link-URI resolution
 * used to map placed images back to bundled assets.
 */
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { IdmlParseError } from "./errors.js";

/** The media type stored in the `mimetype` entry of a valid IDML package. */
export const IDML_MIMETYPE = "application/vnd.adobe.indesign-idml-package";

const decoder = new TextDecoder("utf-8");

export class IdmlPackage {
  private readonly entries: Map<string, Uint8Array>;

  constructor(entries: Map<string, Uint8Array>) {
    this.entries = entries;
  }

  /** Unzip an in-memory buffer. Throws {@link IdmlParseError} when not a zip. */
  static fromBuffer(buffer: Uint8Array): IdmlPackage {
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(buffer);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new IdmlParseError(`Input is not a valid zip/IDML package: ${reason}`, "NOT_A_ZIP");
    }
    const entries = new Map<string, Uint8Array>();
    for (const [path, data] of Object.entries(unzipped)) {
      // Directory entries have zero-length data and a trailing slash; skip them.
      if (path.endsWith("/")) continue;
      entries.set(normalizePath(path), data);
    }
    return new IdmlPackage(entries);
  }

  /** Read and unzip a file from disk. Throws {@link IdmlParseError} on IO error. */
  static fromFile(path: string): IdmlPackage {
    let buffer: Uint8Array;
    try {
      buffer = readFileSync(path);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new IdmlParseError(`Cannot read IDML file "${path}": ${reason}`, "FILE_READ_ERROR");
    }
    return IdmlPackage.fromBuffer(buffer);
  }

  has(path: string): boolean {
    return this.entries.has(normalizePath(path));
  }

  read(path: string): Uint8Array | undefined {
    return this.entries.get(normalizePath(path));
  }

  readText(path: string): string | undefined {
    const data = this.read(path);
    return data ? decoder.decode(data) : undefined;
  }

  /** Byte size of an entry, or 0 when absent. */
  byteLength(path: string): number {
    return this.read(path)?.byteLength ?? 0;
  }

  /** All entry paths, normalized. */
  list(): string[] {
    return [...this.entries.keys()];
  }

  /** Entry paths matching a predicate. */
  filter(predicate: (path: string) => boolean): string[] {
    return this.list().filter(predicate);
  }

  /** The raw `mimetype` entry contents, trimmed. */
  mimetype(): string | undefined {
    const data = this.read("mimetype");
    return data ? decoder.decode(data).trim() : undefined;
  }

  hasValidMimetype(): boolean {
    return this.mimetype() === IDML_MIMETYPE;
  }

  /**
   * Resolve a link URI to a package-relative entry path. Matches by exact
   * (percent-decoded) path first, then by basename. Returns `undefined` when no
   * bundled entry corresponds — the link is external.
   */
  resolveAssetUri(uri: string): string | undefined {
    if (!uri) return undefined;
    const cleaned = decodePath(stripFileScheme(uri));
    for (const candidate of [cleaned, normalizePath(cleaned)]) {
      if (this.entries.has(candidate)) return candidate;
    }
    const base = basename(cleaned);
    if (base) {
      for (const key of this.entries.keys()) {
        if (basename(key) === base) return key;
      }
    }
    return undefined;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\/\/?/i, "").replace(/^file:/i, "");
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
