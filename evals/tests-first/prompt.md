---
name: tests-first
description: A new component gets its failing test before its implementation.
runs: 2
max_turns: 15
timeout_seconds: 600
tags: [tdd]
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash]
---
Add a Toggle component at src/components/Toggle/Toggle.tsx: an accessible on/off switch with a visible label that calls onChange with the new value.
