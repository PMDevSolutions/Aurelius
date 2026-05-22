# Milestone Description Proposals

This document proposes canonical descriptions for open GitHub milestones in
`PMDevSolutions/Aurelius`. It is a **proposal only** — no milestone descriptions
on GitHub have been edited.

## Canonical Format

Each milestone description should follow this structure:

1. A one-sentence summary of the milestone.
2. A bullet list of 3–6 themes.
3. A single `Focus:` line at the end.

---

## Milestone #1 — `v1.1.0`

- **Number:** 1
- **Due on:** 2026-05-31
- **Open issues:** 4
- **Closed issues:** 49

### Current description

> First feature release — expanded pipeline robustness, Chrome extension and PWA E2E improvements, Canva pipeline stabilization, additional agent coverage, and developer onboarding documentation. Focus: making the framework production-ready for early adopters.

### Proposed description

```
First feature release that expands pipeline robustness and broadens framework coverage on top of the v1.0.0 foundation.

- Chrome extension and PWA E2E improvements
- Canva pipeline stabilization
- Additional agent coverage across engineering, design, and testing
- Developer onboarding documentation and quick-start guides
- Pipeline robustness fixes for the autonomous Figma-to-React flow

Focus: making the framework production-ready for early adopters.
```

### Rationale

The current description is a single dense paragraph with the themes
comma-separated. The proposal preserves all themes and the existing `Focus:`
sentence verbatim, but reshapes them into the canonical
one-sentence-summary + bullet-list + `Focus:` line format for consistency with
other milestones.

---

## Milestone #2 — `v2.0.0`

- **Number:** 2
- **Due on:** 2026-08-31
- **Open issues:** 9
- **Closed issues:** 0

### Current description

> Major release — multi-framework output (Next.js, Vite, Astro), Storybook auto-generation, mutation testing integration, design system export, and plugin architecture for custom agents. This release expands Aurelius beyond React into a general-purpose frontend framework.

### Proposed description

```
Major release that expands Aurelius beyond React into a general-purpose frontend framework.

- Multi-framework output targets (Next.js, Vite, Astro)
- Storybook auto-generation across all output targets
- Mutation testing integration via Stryker
- Design system export as a publishable workspace
- Plugin architecture for custom agents

Focus: positioning Aurelius as a multi-framework, extensible frontend toolkit.
```

### Rationale

The current description has the summary sentence at the end ("This release
expands…") and lacks an explicit `Focus:` line. The proposal reorders the
content so the summary leads, the themes become a bullet list, and a new
`Focus:` line is derived from the original summary sentence. No themes are
added or removed.

---

## Summary

| # | Title  | Status                |
| - | ------ | --------------------- |
| 1 | v1.1.0 | Proposed rewrite      |
| 2 | v2.0.0 | Proposed rewrite      |

Neither current description already matches the canonical format, so both are
proposed rewrites. No descriptions were edited on GitHub.
