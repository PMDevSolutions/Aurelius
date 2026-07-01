# Custom Agents Guide

**Last Updated:** 2026-06-11
**Total Agents:** 56
**Location:** `.claude/agents/`

Agents are auto-selected by Claude Code based on task context, or you can request one explicitly.

---

## Engineering

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| frontend-developer | React component implementation, styling, and client-side logic | Building UI components, pages, Tailwind styling, client-side state |
| backend-architect | API design, server architecture, and data modeling | Designing REST/GraphQL APIs, database schemas, server-side patterns |
| ai-engineer | AI/ML integration, prompt engineering, and model pipelines | Adding AI features, LLM integrations, embeddings, inference workflows |
| devops-automator | CI/CD pipelines, Docker, deployment automation | Setting up GitHub Actions, containerization, deployment scripts |
| mobile-app-builder | React Native and mobile-first development | Building cross-platform mobile apps, responsive mobile experiences |
| rapid-prototyper | Quick proof-of-concept implementations | Validating ideas fast, throwaway prototypes, spike solutions |
| test-writer-fixer | Write tests, run them, fix failures iteratively | Unit tests, integration tests, increasing coverage, fixing flaky tests |
| error-boundary-architect | Error handling strategy, React error boundaries, fallback UIs, Sentry integration | Making React apps resilient to runtime failures, graceful degradation |
| migration-specialist | Framework upgrades, dependency migrations, codemods | Upgrading React/Next.js versions, CRA to Vite, Redux to Zustand, Jest to Vitest |
| i18n-engineer | Internationalization setup, translation management, RTL support | Adding i18n (next-intl, react-i18next, vue-i18n, svelte-i18n, expo-localization), locale formatting, RTL layouts |
| animation-optimizer | Animation performance profiling, jank elimination, reduced-motion compliance | Optimizing animations for 60fps, motion design systems, framework-specific animation patterns |
| bundle-analyzer | Bundle size analysis, tree-shaking audits, code splitting optimization | Analyzing bundle composition, finding oversized dependencies, enforcing bundle budgets |

## Design

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| ui-designer | UI component design, layout systems, visual hierarchy | Designing component libraries, page layouts, design system tokens |
| ux-researcher | User experience research, usability analysis | User flow analysis, heuristic evaluation, accessibility reviews |
| brand-guardian | Brand consistency enforcement across assets | Ensuring colors, typography, tone, and imagery match brand guidelines |
| visual-storyteller | Data visualization and narrative-driven UI | Charts, dashboards, infographics, storytelling through design |
| whimsy-injector | Micro-interactions, animations, delightful UI details | Adding loading animations, transitions, easter eggs, playful touches |

## Design-to-Code

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| figma-react-converter | Figma-to-React conversion pipeline orchestration | Converting Figma designs into React components with Tailwind CSS |
| canva-react-converter | Canva-to-React conversion from screenshots | Converting Canva designs into React components with Tailwind CSS |
| astro-converter | Design-to-Astro hybrid conversion (zero-JS .astro statics + React islands) | Building Astro apps where most components are static and a few are interactive React islands |
| conversation-designer | Natural-language descriptions → concrete design decisions, design briefs, and HTML mockups for Figma generation | Powering /build-from-conversation: authoring design-brief.json and the mockups captured into Figma |
| asset-cataloger | Image/asset semantic mapping and validation | Mapping hash-named exports to meaningful names, validating asset usage |
| indesign-to-react | InDesign (IDML/PDF) → typed React components, design tokens, and Storybook stories via @aurelius/pipeline | Converting an exported `.idml` or PDF handoff into a React starting point |

## Testing & QA

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| api-tester | API endpoint testing and validation | Testing REST/GraphQL endpoints, response schemas, error handling |
| performance-benchmarker | Performance profiling and optimization | Bundle size analysis, Lighthouse audits, runtime profiling |
| test-results-analyzer | Test suite analysis and trend reporting | Analyzing CI test results, identifying flaky tests, coverage trends |
| tool-evaluator | Evaluate libraries, frameworks, and tools | Comparing NPM packages, assessing dependencies, tech stack decisions |
| workflow-optimizer | Development process improvement | Streamlining build pipelines, reducing dev friction, automation gaps |
| visual-qa-agent | Visual regression testing and cross-browser verification | Comparing rendered output against Figma designs, screenshot diffing |
| accessibility-auditor | WCAG 2.1 AA compliance auditing (React, Vue, Svelte, React Native) | Color contrast, ARIA labels, keyboard navigation, Lighthouse a11y, framework-specific a11y |

## Product

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| sprint-prioritizer | Backlog prioritization and sprint planning | Ordering features by impact, planning sprints, scope management |
| feedback-synthesizer | User feedback analysis and insight extraction | Aggregating survey data, support tickets, feature requests |
| trend-researcher | Market and technology trend analysis | Researching competitors, emerging tech, industry benchmarks |

## Marketing

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| content-creator | Marketing copy, blog posts, and content strategy | Writing landing pages, blog content, email campaigns |
| growth-hacker | Growth experiments and conversion optimization | A/B test ideas, funnel analysis, user acquisition strategies |
| app-store-optimizer | App store listing optimization (ASO) | Writing app descriptions, keyword research, screenshot strategy |
| instagram-curator | Instagram content strategy and visual planning | Post scheduling, hashtag strategy, visual grid planning |
| reddit-community-builder | Reddit engagement and community growth | Subreddit strategy, authentic engagement, community building |
| tiktok-strategist | TikTok content strategy and trends | Video content ideas, trending sounds, audience targeting |
| twitter-engager | Twitter/X engagement and thought leadership | Tweet threads, engagement strategy, audience growth |

## Project Management

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| studio-producer | End-to-end project production management | Coordinating multi-phase projects, resource allocation, timelines |
| project-shipper | Getting projects from 90% to shipped | Final polish, launch checklists, shipping blockers, release prep |
| experiment-tracker | A/B test and experiment tracking | Logging experiments, tracking results, statistical significance |

## Operations

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| analytics-reporter | Metrics dashboards and data reporting | Building analytics views, KPI tracking, report generation |
| finance-tracker | Financial tracking and budget management | Cost tracking, subscription management, budget forecasting |
| infrastructure-maintainer | Server and infrastructure maintenance | Monitoring, uptime, dependency updates, security patches |
| legal-compliance-checker | Legal and regulatory compliance review | Privacy policies, GDPR, terms of service, license compliance |
| support-responder | Customer support response drafting | Drafting support replies, FAQ creation, escalation handling |

## Documentation

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| docusaurus-expert | Docusaurus documentation site creation | Building docs sites, MDX content, versioned documentation |

## Meta

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| agent-expert | Agent creation and configuration guidance | Creating new agents, optimizing agent prompts, agent architecture |
| command-expert | Claude Code command and configuration help | Slash commands, settings, hooks, plugin configuration |

## Bonus

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| joker | Comic relief and creative brainstorming | When you need a laugh or creative lateral thinking |
| studio-coach | Development coaching and mentorship | Code review mentoring, learning paths, skill development |

---

## How Agents Work

Agents are invoked through Claude Code's Task tool. They are automatically selected based on task context:

```
User: "Help me optimize this component's rendering"
Claude: [Uses performance-benchmarker agent]

User: "Convert this Figma design to React"
Claude: [Uses figma-react-converter agent]

User: "Write tests for the auth hook"
Claude: [Uses test-writer-fixer agent]
```

You can also request a specific agent:
```
User: "Use the accessibility-auditor agent to check this page"
```

---

## Agent + Skill Integration

Agents work alongside the 24 custom skills in `.claude/skills/`:

| Agent | Complementary Skill |
|-------|-------------------|
| figma-react-converter | figma-to-react-workflow |
| frontend-developer | react-component-development |
| test-writer-fixer | react-testing-workflows |
| performance-benchmarker | react-performance-optimization |
| accessibility-auditor | react-accessibility |
| visual-qa-agent | visual-qa-verification |
| error-boundary-architect | (works with Sentry integration in pipeline.config.json) |
| migration-specialist | (uses WebSearch for changelog/codemod lookup) |
| i18n-engineer | (works with frontend-developer for component i18n) |
| animation-optimizer | animation-motion |
| bundle-analyzer | react-performance-optimization |
| canva-react-converter | canva-token-inference |
| conversation-designer | conversation-intake, design-brief-to-figma |

**Skills Documentation:** `.claude/skills/README.md`

---

## Quick Reference

| Task | Best Agent |
|------|-----------|
| Build a React component | frontend-developer |
| Convert Figma to React | figma-react-converter |
| Write unit tests | test-writer-fixer |
| Optimize bundle size | bundle-analyzer |
| Optimize animations | animation-optimizer |
| WCAG compliance audit | accessibility-auditor |
| Visual regression check | visual-qa-agent |
| Map exported assets | asset-cataloger |
| Design a component | ui-designer |
| Set up CI/CD | devops-automator |
| API endpoint testing | api-tester |
| Create documentation site | docusaurus-expert |
| Add error boundaries | error-boundary-architect |
| Upgrade React/Next.js | migration-specialist |
| Add internationalization | i18n-engineer |
| Convert Canva to React | canva-react-converter |
| Build an app from a description | conversation-designer (via /build-from-conversation) |
| Ship a release | project-shipper |
