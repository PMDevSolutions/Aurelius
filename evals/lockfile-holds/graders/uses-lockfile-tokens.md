---
type: regex
pattern: 'bg-primary\b|text-primary-foreground|var\(--color-primary'
target:
  source: file
  path: src/components/NewBadge/NewBadge.tsx
---
The colors come from the lockfile's primary tokens.
