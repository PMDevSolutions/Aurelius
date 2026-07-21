# Custom Agents Guide

**Last Updated:** 2026-07-21
**Total Agents:** 42
**Location:** `.claude/agents/`

Agents are auto-selected by Claude Code based on task context, or you can request one explicitly.

---

## Strategy & Research

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| brand-strategist | Brand architecture, platform, and long-term equity building | Defining purpose/values/personality, brand audits, rebrand strategy, brand-guidelines.json foundations |
| positioning-messaging | Positioning statements, message houses, and value propositions | Defining what the product is and why it wins, messaging hierarchy, claim substantiation |
| market-researcher | Category intelligence, trend detection, and audience evidence | Market sizing, trend radar, search demand analysis, voice-of-customer mining |
| competitive-analyst | Competitor monitoring, teardowns, and battlecards | Landscape mapping, competitor teardowns, win/loss synthesis, share-of-voice tracking |
| customer-persona-builder | Data-driven personas and buyer journey mapping | Persona development, journey maps, segmentation, customer language capture |

## Content

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| content-strategist | Content pillars, funnel-mapped planning, repurposing systems | Content strategy, calendar strategy, content audits, brief creation |
| copywriter | Conversion copy: headlines, landing pages, ads, CTAs, microcopy | Any copy meant to convert, headline generation, variant writing |
| blog-writer | Long-form articles with argument, evidence, and craft | Blog posts, guides, thought leadership, case-study narratives |
| seo-content-writer | Search-intent content that ranks and converts | SEO articles, on-page optimization, content refreshes, snippet targeting |
| email-marketer | Broadcast campaigns, newsletters, list health, deliverability | Campaign emails, newsletters, segmentation, subject-line testing |
| video-script-writer | Scripts for shorts, explainers, ads, and webinars | Video hooks, retention structure, production-ready scripts |
| content-creator | Cross-platform content generation and repurposing | Adapting one idea across formats, multi-format content batches |

## Channel

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| social-media-manager | Cross-platform social strategy and specialist coordination | Platform selection, social calendar, community standards, crisis protocol |
| paid-ads-specialist | Paid media across Google/Meta/LinkedIn/TikTok | Campaign architecture, audience/creative testing, budget pacing (spend gated) |
| seo-specialist | Technical SEO, architecture, keyword strategy, authority | SEO audits, keyword research direction, cannibalization checks, link strategy |
| pr-outreach | Earned media: releases, pitches, media relations | Press releases, media lists, journalist pitches, crisis communications |
| instagram-curator | Instagram content strategy and visual planning | Stories/Reels strategy, grid planning, hashtag strategy |
| tiktok-strategist | TikTok content strategy and trends | Short-form video ideas, trend participation, creator collaboration |
| twitter-engager | X/Twitter engagement and thought leadership | Threads, real-time engagement, audience growth |
| reddit-community-builder | Reddit engagement and community growth | Subreddit strategy, authentic participation, community norms |
| app-store-optimizer | App store listing optimization (ASO) | App descriptions, keyword research, screenshot strategy |

## Lifecycle & Growth

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| growth-marketer | Full-funnel growth strategy and experiment design | Growth loops, funnel optimization, channel validation, AARRR analysis |
| conversion-optimizer | CRO: landing pages, funnel friction, A/B testing | Conversion research, test design, landing page optimization |
| lifecycle-email | Automated email journeys: onboarding, nurture, winback | Welcome flows, abandonment recovery, trigger-based sequences |
| retention-specialist | Churn analysis, loyalty, advocacy, community | Cohort retention, loyalty programs, referral/advocacy systems |

## Analytics & Operations

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| marketing-analytics-reporter | Campaign metrics, reports, and insight generation | Performance reports, funnel diagnostics, measurement plans |
| attribution-analyst | Attribution models, UTM governance, incrementality | Channel truth, tracking taxonomy, holdout design, double-counting audits |
| budget-planner | Marketing budget allocation, pacing, unit economics | Channel-mix budgets, CAC/LTV analysis, spend forecasting (spend gated) |
| marketing-ops | Martech stack, workflows, data hygiene, automation | Tool evaluation, process design, naming conventions, integrations |
| brand-compliance-checker | Enforcement of brand-guidelines.json across all output | Voice/claims/visual compliance review, editorial QA verdicts |

## Creative Direction

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| art-director | Campaign creative concepts, briefs, and visual direction | Creative territories, creative briefs, data visualization, deck design |
| campaign-producer | End-to-end campaign production management | Multi-channel coordination, timelines, gate scheduling, resource allocation |

## Insights & Planning

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| feedback-synthesizer | Customer feedback analysis and insight extraction | Aggregating surveys, reviews, support themes into marketing insight |
| experiment-tracker | A/B test and campaign experiment tracking | Logging experiments, statistical validity, learning databases |
| sprint-prioritizer | Campaign cycle planning and initiative prioritization | RICE scoring, cycle planning, scope trade-offs |
| project-shipper | Launch coordination and go-to-market execution | Launch timelines, go/no-go reviews, launch-week operations |

## Operations & Support

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| legal-compliance-checker | Legal and regulatory compliance review | Claims review, privacy/GDPR, FTC disclosure, sweepstakes, regulated topics |
| support-responder | Customer support response drafting | Support replies, FAQ creation, escalation handling |

## Meta

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| agent-expert | Agent creation and configuration guidance | Creating new agents, optimizing agent prompts, agent architecture |
| command-expert | Claude Code command and configuration help | Slash commands, settings, hooks, plugin configuration |

## Bonus

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| joker | Comic relief and creative brainstorming | When you need a laugh or creative lateral thinking |
| studio-coach | Team coaching and momentum management | Complex multi-agent campaigns, morale, focus under deadline |

---

## How Agents Work

Agents are invoked through Claude Code's Task tool. They are automatically selected based on task context:

```
User: "Plan a launch campaign for our new feature"
Claude: [Uses campaign-producer + strategy agents]

User: "Write a landing page for this offer"
Claude: [Uses copywriter agent]

User: "Why did email performance drop last month?"
Claude: [Uses marketing-analytics-reporter agent]
```

You can also request a specific agent:
```
User: "Use the competitive-analyst to tear down competitor X"
```

---

## Agent + Skill Integration

Agents work alongside the 13 skills in `.claude/skills/`:

| Agent | Complementary Skill |
|-------|-------------------|
| campaign-producer | campaign-brief-intake, parallel-orchestration |
| brand-compliance-checker | brand-voice-lock, editorial-qa |
| content-strategist | content-calendar |
| copywriter | ad-copy-variants, landing-page-copy |
| seo-specialist / seo-content-writer | seo-keyword-research |
| email-marketer / lifecycle-email | email-sequence |
| social-media-manager | social-content-batching |
| competitive-analyst | competitor-teardown |
| customer-persona-builder | persona-research |
| marketing-analytics-reporter | analytics-report |
| blog-writer | editorial-qa |
| conversion-optimizer | landing-page-copy |

**Skills Documentation:** `.claude/skills/README.md`

---

## The Approval Gate

Every agent that produces external-facing output (publishing, sending, or spending) operates behind the human approval gate defined in `.claude/pipeline.config.json`. Agents draft, stage, and schedule — humans approve. No agent publishes, sends, or spends autonomously.

---

## Quick Reference

| Task | Best Agent |
|------|-----------|
| Plan a campaign | campaign-producer |
| Define positioning | positioning-messaging |
| Research the market | market-researcher |
| Build personas | customer-persona-builder |
| Tear down a competitor | competitive-analyst |
| Write conversion copy | copywriter |
| Write a blog post | blog-writer |
| Write SEO content | seo-content-writer |
| Plan the content calendar | content-strategist |
| Build an email sequence | lifecycle-email |
| Send a newsletter | email-marketer |
| Script a video | video-script-writer |
| Run paid ads | paid-ads-specialist |
| Audit SEO | seo-specialist |
| Pitch press | pr-outreach |
| Optimize conversions | conversion-optimizer |
| Reduce churn | retention-specialist |
| Report performance | marketing-analytics-reporter |
| Untangle attribution | attribution-analyst |
| Plan budgets | budget-planner |
| Check brand compliance | brand-compliance-checker |
| Direct campaign creative | art-director |
| Ship a launch | project-shipper |
