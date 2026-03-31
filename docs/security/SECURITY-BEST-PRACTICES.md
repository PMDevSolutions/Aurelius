# Security Best Practices

This document outlines security best practices for applications built with the Aurelius framework. Following these guidelines helps protect your application and users from common vulnerabilities.

## Table of Contents

- [Dependency Security](#dependency-security)
- [Input Sanitization](#input-sanitization)
- [Content Security Policy](#content-security-policy)
- [Authentication & Authorization](#authentication--authorization)
- [Data Protection](#data-protection)
- [API Security](#api-security)
- [CI/CD Security](#cicd-security)
- [Secure Coding Practices](#secure-coding-practices)
- [Security Checklist](#security-checklist)

---

## Dependency Security

### Automated Scanning

The framework includes automated security scanning in CI:

```bash
# Run local security audit
./scripts/check-security.sh

# Check with specific severity level
./scripts/check-security.sh --level critical

# Output as JSON for automation
./scripts/check-security.sh --json
```

### Snyk Integration

Snyk scanning runs automatically on every PR. To set up:

1. Create a Snyk account at [snyk.io](https://snyk.io)
2. Get your API token from Snyk settings
3. Add `SNYK_TOKEN` to your repository secrets
4. Snyk will scan on every push to `main` and on PRs

### Keeping Dependencies Updated

```bash
# Check for outdated packages
pnpm outdated

# Update all dependencies
pnpm update

# Update a specific package
pnpm update <package-name> --latest
```

### Lock File Best Practices

- **Always commit `pnpm-lock.yaml`** — ensures consistent installs
- **Use `--frozen-lockfile` in CI** — prevents unexpected updates
- **Review lock file changes** — watch for unexpected new dependencies

---

## Input Sanitization

### Using the Sanitization Library

Import sanitization utilities from `scripts/lib/sanitize.js`:

```javascript
import {
  sanitizeUrl,
  sanitizePath,
  sanitizeHtml,
  sanitizeShellArg,
  sanitizeDesignUrl,
  sanitizeJson,
} from './scripts/lib/sanitize.js';

// Validate URLs before fetching
const result = sanitizeUrl(userProvidedUrl);
if (!result.valid) {
  console.error(result.error);
  return;
}
fetch(result.url);

// Validate file paths to prevent directory traversal
const pathResult = sanitizePath(userPath, './uploads');
if (!pathResult.valid) {
  throw new Error(pathResult.error);
}

// Sanitize HTML to prevent XSS
const safeHtml = sanitizeHtml(userContent);

// Validate design URLs for pipeline
const designResult = sanitizeDesignUrl(figmaUrl);
if (designResult.type === 'figma') {
  // Process Figma design
}
```

### Common Vulnerabilities to Prevent

| Vulnerability | Prevention |
|---------------|------------|
| XSS (Cross-Site Scripting) | Use `sanitizeHtml()`, avoid `dangerouslySetInnerHTML` |
| SQL Injection | Use parameterized queries, ORMs |
| Command Injection | Use `sanitizeShellArg()`, avoid shell commands with user input |
| Path Traversal | Use `sanitizePath()` with a safe base directory |
| SSRF | Use `sanitizeUrl()` to block private IPs |
| Prototype Pollution | Use `sanitizeJson()` for parsing untrusted JSON |

### React-Specific Security

```jsx
// BAD: XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// GOOD: Sanitize first
import { sanitizeHtml } from './scripts/lib/sanitize.js';
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userContent) }} />

// BETTER: Use a dedicated library like DOMPurify
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// BEST: Avoid innerHTML entirely
<div>{userContent}</div> // React escapes by default
```

---

## Content Security Policy

### Configuration

The framework provides CSP configuration in `templates/shared/security-headers.config.js`:

```javascript
import { nextjsSecurityHeaders } from './security-headers.config.js';

// next.config.js
export default {
  async headers() {
    return nextjsSecurityHeaders;
  },
};
```

### CSP Directives Explained

| Directive | Purpose | Recommended Value |
|-----------|---------|-------------------|
| `default-src` | Fallback for other directives | `'self'` |
| `script-src` | JavaScript sources | `'self'` (avoid `'unsafe-inline'`) |
| `style-src` | CSS sources | `'self' 'unsafe-inline'` (for Tailwind) |
| `img-src` | Image sources | `'self' data: https:` |
| `connect-src` | Fetch/XHR destinations | `'self'` + your API domains |
| `frame-ancestors` | Who can embed your page | `'self'` or `'none'` |
| `object-src` | Plugin sources | `'none'` |

### Using Nonces for Inline Scripts

```javascript
import { generateCspNonce, getCspWithNonce } from './security-headers.config.js';

// Server-side: generate nonce per request
const nonce = generateCspNonce();
const cspDirectives = getCspWithNonce(nonce);

// Pass nonce to script tags
<script nonce={nonce}>
  // Inline script allowed with matching nonce
</script>
```

### Testing CSP

1. **Report-Only Mode**: Test without blocking
   ```javascript
   import { buildReportOnlyCsp } from './security-headers.config.js';
   res.setHeader('Content-Security-Policy-Report-Only', buildReportOnlyCsp('/api/csp-report'));
   ```

2. **Browser DevTools**: Check Console for CSP violations

3. **CSP Evaluator**: Use [csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com/)

---

## Authentication & Authorization

### Secure Session Management

```javascript
// Use secure cookie settings
const sessionOptions = {
  httpOnly: true,      // Prevents XSS access to cookies
  secure: true,        // HTTPS only
  sameSite: 'strict',  // CSRF protection
  maxAge: 3600000,     // 1 hour expiry
};
```

### JWT Best Practices

- **Short expiration times** (15 minutes for access tokens)
- **Use refresh tokens** for longer sessions
- **Store in httpOnly cookies**, not localStorage
- **Validate on every request**
- **Include audience and issuer claims**

### RBAC Implementation

```typescript
// Define roles and permissions
const permissions = {
  admin: ['read', 'write', 'delete', 'manage-users'],
  editor: ['read', 'write'],
  viewer: ['read'],
};

// Check permissions
function hasPermission(userRole: string, action: string): boolean {
  return permissions[userRole]?.includes(action) ?? false;
}
```

---

## Data Protection

### Environment Variables

```bash
# .env.example (commit this)
DATABASE_URL=postgresql://localhost/myapp
API_KEY=your-api-key-here

# .env (NEVER commit this)
DATABASE_URL=postgresql://user:pass@prod-db/myapp
API_KEY=sk-live-xxxxxxxxxxxx
```

### Secrets Management

- **Never commit secrets** to version control
- **Use environment variables** for all sensitive data
- **Rotate secrets regularly**
- **Use secret managers** (AWS Secrets Manager, Vault, etc.) in production

### Encryption

```javascript
// Use crypto for sensitive data
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), data: encrypted.toString('hex'), authTag: authTag.toString('hex') };
}
```

---

## API Security

### Rate Limiting

```javascript
import { RateLimiter } from './scripts/lib/sanitize.js';

const limiter = new RateLimiter(100, 60000); // 100 requests per minute

function apiHandler(req, res) {
  const clientId = req.ip;
  const { allowed, remaining, resetMs } = limiter.check(clientId);

  if (!allowed) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(resetMs / 1000),
    });
    return;
  }

  res.setHeader('X-RateLimit-Remaining', remaining);
  // Handle request...
}
```

### CORS Configuration

```javascript
// Restrictive CORS for production
const corsOptions = {
  origin: ['https://myapp.com', 'https://api.myapp.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
};
```

### API Input Validation

```typescript
import { z } from 'zod';

// Define schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(100),
});

// Validate input
function createUser(req, res) {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues });
  }
  // Process validated data...
}
```

---

## CI/CD Security

### GitHub Actions Security

```yaml
# .github/workflows/ci.yml
jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read      # Minimal permissions
      security-events: write
    steps:
      - uses: actions/checkout@v4

      # Pin action versions to SHA
      - uses: snyk/actions/node@8349f90127...

      # Use secrets, never hardcode
      - env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Secrets in CI

- **Use GitHub Secrets** for sensitive values
- **Limit secret scope** to specific environments
- **Rotate secrets** after any potential exposure
- **Audit secret access** regularly

### Dependency Review

```yaml
# Block PRs that introduce vulnerable dependencies
- name: Dependency Review
  uses: actions/dependency-review-action@v4
  with:
    fail-on-severity: high
    deny-licenses: GPL-3.0, AGPL-3.0
```

---

## Secure Coding Practices

### TypeScript Security

```typescript
// Use strict mode
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}

// Avoid type assertions that bypass checks
const data = untrustedInput as UserData; // BAD
const data = UserDataSchema.parse(untrustedInput); // GOOD
```

### Error Handling

```typescript
// Don't expose internal errors to users
try {
  await sensitiveOperation();
} catch (error) {
  // Log full error internally
  logger.error('Operation failed', { error, userId });

  // Return generic message to user
  res.status(500).json({ error: 'An error occurred' });
}
```

### Logging Security

```typescript
// Never log sensitive data
logger.info('User login', {
  userId: user.id,
  // email: user.email,      // BAD: PII
  // password: user.password, // NEVER
  // token: authToken,        // NEVER
});
```

---

## Security Checklist

### Before Every Release

- [ ] Run `./scripts/check-security.sh`
- [ ] Check `pnpm audit` for vulnerabilities
- [ ] Review new dependencies for security
- [ ] Verify no secrets in code or logs
- [ ] Test authentication flows
- [ ] Verify authorization on all endpoints
- [ ] Check CSP headers are set correctly
- [ ] Test rate limiting

### Periodic Reviews

- [ ] Update all dependencies monthly
- [ ] Rotate API keys and secrets quarterly
- [ ] Review access permissions
- [ ] Audit third-party integrations
- [ ] Review security logs
- [ ] Update security documentation

### Incident Response

1. **Identify** — Confirm the security issue
2. **Contain** — Limit the blast radius
3. **Investigate** — Understand scope and impact
4. **Remediate** — Fix the vulnerability
5. **Communicate** — Notify affected parties
6. **Review** — Update processes to prevent recurrence

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [React Security Best Practices](https://snyk.io/blog/10-react-security-best-practices/)
- [CSP Reference](https://content-security-policy.com/)
- [Snyk Learn](https://learn.snyk.io/)

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security concerns to the maintainers
3. Include steps to reproduce
4. Allow time for a fix before disclosure

---

*Last updated: 2026-03-30*
