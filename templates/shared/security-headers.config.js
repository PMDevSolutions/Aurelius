/**
 * security-headers.config.js — Security headers configuration for React apps
 *
 * This file provides CSP and other security headers for different frameworks.
 * Import and apply these headers in your framework's configuration.
 */

/**
 * Content Security Policy directives
 * Customize based on your app's requirements
 */
export const cspDirectives = {
  // Default fallback for unlisted directives
  'default-src': ["'self'"],

  // JavaScript sources
  'script-src': [
    "'self'",
    // Add 'unsafe-inline' only if absolutely necessary (e.g., for inline scripts)
    // "'unsafe-inline'",
    // Add 'unsafe-eval' only if required (e.g., for some chart libraries)
    // "'unsafe-eval'",
  ],

  // CSS sources
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for most CSS-in-JS solutions and Tailwind
  ],

  // Image sources
  'img-src': [
    "'self'",
    'data:', // For inline images and base64
    'blob:', // For dynamically generated images
    'https:', // Allow all HTTPS images
  ],

  // Font sources
  'font-src': [
    "'self'",
    'data:', // For inline fonts
  ],

  // API and fetch sources
  'connect-src': [
    "'self'",
    // Add your API endpoints here
    // 'https://api.example.com',
  ],

  // Media sources (video, audio)
  'media-src': ["'self'"],

  // Object, embed, applet sources (deprecated technologies)
  'object-src': ["'none'"],

  // Frame ancestors (who can embed this page)
  'frame-ancestors': ["'self'"],

  // Form action targets
  'form-action': ["'self'"],

  // Base URI restriction
  'base-uri': ["'self'"],

  // Upgrade insecure requests
  'upgrade-insecure-requests': [],
};

/**
 * Additional security headers
 */
export const securityHeaders = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',

  // Enable XSS filter (legacy browsers)
  'X-XSS-Protection': '1; mode=block',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions Policy (formerly Feature Policy)
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),

  // Strict Transport Security (HTTPS only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Build CSP header string from directives
 * @param {Object} directives - CSP directives object
 * @returns {string} - CSP header value
 */
export function buildCspHeader(directives = cspDirectives) {
  return Object.entries(directives)
    .filter(([, values]) => values.length >= 0)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Next.js security headers configuration
 * Add to next.config.js: headers: async () => nextjsSecurityHeaders
 */
export const nextjsSecurityHeaders = [
  {
    source: '/:path*',
    headers: [
      {
        key: 'Content-Security-Policy',
        value: buildCspHeader(),
      },
      ...Object.entries(securityHeaders).map(([key, value]) => ({
        key,
        value,
      })),
    ],
  },
];

/**
 * Vite/Express middleware for security headers
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
export function securityHeadersMiddleware(req, res, next) {
  res.setHeader('Content-Security-Policy', buildCspHeader());

  for (const [key, value] of Object.entries(securityHeaders)) {
    res.setHeader(key, value);
  }

  next();
}

/**
 * Helmet.js compatible configuration
 * Use with: app.use(helmet(helmetConfig))
 */
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: Object.fromEntries(
      Object.entries(cspDirectives).map(([key, values]) => [
        key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        values.length === 0 ? true : values,
      ])
    ),
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
};

/**
 * Development-friendly CSP (more permissive for hot reload, etc.)
 */
export const devCspDirectives = {
  ...cspDirectives,
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'", // Required for HMR
  ],
  'connect-src': [
    "'self'",
    'ws:', // WebSocket for HMR
    'wss:',
    'http://localhost:*',
    'ws://localhost:*',
  ],
};

/**
 * Report-only CSP for testing (logs violations without blocking)
 * @param {string} reportUri - Endpoint to receive CSP violation reports
 */
export function buildReportOnlyCsp(reportUri = '/api/csp-report') {
  const directives = {
    ...cspDirectives,
    'report-uri': [reportUri],
  };
  return buildCspHeader(directives);
}

/**
 * CSP nonce generator for inline scripts
 * Use with script tags: <script nonce={nonce}>...</script>
 */
export function generateCspNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString('base64');
}

/**
 * Add nonce to CSP directives
 * @param {string} nonce - The generated nonce
 */
export function getCspWithNonce(nonce) {
  return {
    ...cspDirectives,
    'script-src': [...cspDirectives['script-src'], `'nonce-${nonce}'`],
    'style-src': [...cspDirectives['style-src'], `'nonce-${nonce}'`],
  };
}

export default {
  cspDirectives,
  securityHeaders,
  buildCspHeader,
  nextjsSecurityHeaders,
  securityHeadersMiddleware,
  helmetConfig,
  devCspDirectives,
  buildReportOnlyCsp,
  generateCspNonce,
  getCspWithNonce,
};
