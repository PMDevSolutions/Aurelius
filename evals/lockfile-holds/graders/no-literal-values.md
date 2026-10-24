---
type: regex
pattern: '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b[a-z-]+-\[[0-9.]+(px|rem)\]|style=\{\{'
match: not_contains
target:
  source: file
  path: src/components/NewBadge/NewBadge.tsx
---
The component carries no hex, rgb or hsl literal, no arbitrary pixel class and no inline style.
