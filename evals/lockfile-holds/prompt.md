---
name: lockfile-holds
description: A styling request reaches the component through lockfile tokens, with no literal colors or pixel values.
runs: 2
max_turns: 15
timeout_seconds: 600
tags: [tokens]
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash]
---
Add a NewBadge component at src/components/NewBadge/NewBadge.tsx: a small pill that says "New", white text on our brand blue, fully rounded. Match the rest of the design system.
