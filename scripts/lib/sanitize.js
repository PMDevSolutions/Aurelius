/**
 * sanitize.js — Input sanitization utilities for pipeline security
 *
 * Provides functions to sanitize user inputs, URLs, file paths, and other
 * potentially dangerous data before processing in the build pipeline.
 */

import path from "path";

/**
 * Sanitize a URL to prevent SSRF and injection attacks
 * @param {string} url - The URL to sanitize
 * @returns {{ valid: boolean, url: string | null, error?: string }}
 */
export function sanitizeUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return { valid: false, url: null, error: "URL must be a non-empty string" };
  }

  try {
    const parsed = new URL(url.trim());

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        url: null,
        error: `Invalid protocol: ${parsed.protocol}. Only http and https are allowed`,
      };
    }

    // Block localhost and private IP ranges in production
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^\[::1\]$/,
    ];

    const isBlocked = blockedPatterns.some((pattern) => pattern.test(hostname));

    // Allow localhost in development mode
    const isDev = process.env.NODE_ENV === "development";
    if (isBlocked && !isDev) {
      return {
        valid: false,
        url: null,
        error: "Private/local addresses are not allowed",
      };
    }

    return { valid: true, url: parsed.href };
  } catch (e) {
    return { valid: false, url: null, error: `Invalid URL: ${e.message}` };
  }
}

/**
 * Sanitize a file path to prevent directory traversal attacks
 * @param {string} filePath - The file path to sanitize
 * @param {string} baseDir - The allowed base directory
 * @returns {{ valid: boolean, path: string | null, error?: string }}
 */
export function sanitizePath(filePath, baseDir) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return { valid: false, path: null, error: "Path must be a non-empty string" };
  }

  if (typeof baseDir !== "string" || !baseDir.trim()) {
    return { valid: false, path: null, error: "Base directory must be specified" };
  }

  // Normalize paths for cross-platform compatibility
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(baseDir, filePath);

  // Ensure the resolved path is within the base directory
  if (!normalizedPath.startsWith(normalizedBase + path.sep) && normalizedPath !== normalizedBase) {
    return {
      valid: false,
      path: null,
      error: "Path traversal detected: path escapes base directory",
    };
  }

  // Block sensitive file patterns
  const blockedPatterns = [
    /\.env$/i,
    /\.env\.\w+$/i,
    /\.git\//i,
    /node_modules\//i,
    /\.ssh\//i,
    /\.aws\//i,
    /credentials/i,
    /secrets?\./i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
  ];

  const isBlocked = blockedPatterns.some((pattern) => pattern.test(filePath));
  if (isBlocked) {
    return {
      valid: false,
      path: null,
      error: "Access to sensitive files is not allowed",
    };
  }

  return { valid: true, path: normalizedPath };
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} html - The HTML content to sanitize
 * @returns {string} - Sanitized HTML with dangerous elements removed
 */
export function sanitizeHtml(html) {
  if (typeof html !== "string") {
    return "";
  }

  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "");

  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'src=""');

  // Remove data: URLs in src attributes (potential XSS vector)
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*data:[^"'>\s]*/gi, 'src=""');

  // Remove style expressions (IE-specific XSS)
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, "");

  // Remove iframe, object, embed, and form tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form)\b[^>]*>/gi, "");
  sanitized = sanitized.replace(/<\/(iframe|object|embed|form)>/gi, "");

  return sanitized;
}

/**
 * Sanitize shell command arguments to prevent command injection
 * @param {string} arg - The argument to sanitize
 * @returns {{ valid: boolean, arg: string | null, error?: string }}
 */
export function sanitizeShellArg(arg) {
  if (typeof arg !== "string") {
    return { valid: false, arg: null, error: "Argument must be a string" };
  }

  // Block dangerous shell metacharacters
  const dangerousPatterns = [/[;&|`$(){}[\]<>]/, /\n/, /\r/, /\0/];

  const hasDangerous = dangerousPatterns.some((pattern) => pattern.test(arg));
  if (hasDangerous) {
    return {
      valid: false,
      arg: null,
      error: "Argument contains dangerous shell metacharacters",
    };
  }

  // Escape remaining special characters for shell safety
  const escaped = arg.replace(/'/g, "'\\''");

  return { valid: true, arg: `'${escaped}'` };
}

/**
 * Sanitize Figma/Canva design URLs
 * @param {string} url - The design URL to validate
 * @returns {{ valid: boolean, url: string | null, type: string | null, error?: string }}
 */
export function sanitizeDesignUrl(url) {
  const urlResult = sanitizeUrl(url);
  if (!urlResult.valid) {
    return { ...urlResult, type: null };
  }

  const parsed = new URL(urlResult.url);
  const hostname = parsed.hostname.toLowerCase();

  // Figma URLs
  if (hostname === "www.figma.com" || hostname === "figma.com") {
    const figmaPattern = /^\/(?:file|design|proto)\/([a-zA-Z0-9]+)/;
    if (figmaPattern.test(parsed.pathname)) {
      return { valid: true, url: urlResult.url, type: "figma" };
    }
    return { valid: false, url: null, type: null, error: "Invalid Figma URL format" };
  }

  // Canva URLs
  if (hostname === "www.canva.com" || hostname === "canva.com") {
    const canvaPattern = /^\/design\/([a-zA-Z0-9_-]+)/;
    if (canvaPattern.test(parsed.pathname)) {
      return { valid: true, url: urlResult.url, type: "canva" };
    }
    return { valid: false, url: null, type: null, error: "Invalid Canva URL format" };
  }

  // Generic URL (for screenshot pipeline)
  return { valid: true, url: urlResult.url, type: "generic" };
}

/**
 * Sanitize JSON input to prevent prototype pollution
 * @param {string} jsonString - The JSON string to parse safely
 * @returns {{ valid: boolean, data: any, error?: string }}
 */
export function sanitizeJson(jsonString) {
  if (typeof jsonString !== "string") {
    return { valid: false, data: null, error: "Input must be a string" };
  }

  try {
    const data = JSON.parse(jsonString);

    // Check for prototype pollution attempts
    const checkPrototypePollution = (obj, path = "") => {
      if (obj === null || typeof obj !== "object") {
        return null;
      }

      const dangerousKeys = ["__proto__", "constructor", "prototype"];

      for (const key of Object.keys(obj)) {
        if (dangerousKeys.includes(key)) {
          return `Prototype pollution attempt detected at ${path}${key}`;
        }

        const nested = checkPrototypePollution(obj[key], `${path}${key}.`);
        if (nested) {
          return nested;
        }
      }

      return null;
    };

    const pollutionError = checkPrototypePollution(data);
    if (pollutionError) {
      return { valid: false, data: null, error: pollutionError };
    }

    return { valid: true, data };
  } catch (e) {
    return { valid: false, data: null, error: `Invalid JSON: ${e.message}` };
  }
}

/**
 * Rate limiting helper for pipeline operations
 */
export class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  /**
   * Check if a request is allowed
   * @param {string} key - Identifier for the requester
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old entries
    const entries = this.requests.get(key) || [];
    const validEntries = entries.filter((timestamp) => timestamp > windowStart);

    if (validEntries.length >= this.maxRequests) {
      const oldestValid = Math.min(...validEntries);
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestValid + this.windowMs - now,
      };
    }

    validEntries.push(now);
    this.requests.set(key, validEntries);

    return {
      allowed: true,
      remaining: this.maxRequests - validEntries.length,
      resetMs: this.windowMs,
    };
  }

  /**
   * Reset rate limit for a key
   * @param {string} key - Identifier to reset
   */
  reset(key) {
    this.requests.delete(key);
  }
}

export default {
  sanitizeUrl,
  sanitizePath,
  sanitizeHtml,
  sanitizeShellArg,
  sanitizeDesignUrl,
  sanitizeJson,
  RateLimiter,
};
