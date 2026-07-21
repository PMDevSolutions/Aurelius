---
name: email-sequence
description: Designs and drafts multi-step email sequences — welcome, nurture, launch, abandonment, winback — as a structured spec plus per-email drafts, with compliance checks and approval-gate staging built in. Keywords: email sequence, drip campaign, welcome flow, nurture sequence, winback, email automation
---

# Email Sequence — Journey Design and Drafting

## Purpose

Produce complete, staging-ready email sequences: a machine-readable sequence spec (triggers, timing, branches, exits) plus per-email drafts that pass editorial QA. Whether it's a launch sequence or an always-on flow, the output is ready for the human approval gate — never auto-activated.

## When to Use

- `/build-email-sequence` end to end
- Campaign email components inside `/build-campaign`
- Designing or overhauling lifecycle flows (with the lifecycle-email agent)

## Inputs

- **Required:** Sequence goal + audience (from campaign-brief.json or direct)
- **Required:** `brand-guidelines.json` (voice + compliance rules)
- **Optional:** Existing flow inventory (collision check), offer details, product event list (for triggers)

## Process

### Step 1: Define the Sequence Contract

```
1. Job: the ONE outcome this sequence causes (activation, purchase, recovery…)
2. Audience & entry trigger: event-based where possible (signup, abandonment,
   inactivity threshold) — calendar delays only when no event exists
3. Exit conditions: goal met / disqualified / unsubscribed (always immediate)
4. Suppressions: who never enters (active customers in a trial sequence, etc.)
5. Collision check: overlap with existing flows and campaign broadcasts —
   confirm frequency caps hold
```

### Step 2: Design the Arc

```
1. Length: as few emails as the job allows (welcome 3-5, nurture 4-6,
   abandonment 2-3, winback 3 then stop)
2. Per-email job: each email removes ONE obstacle or delivers ONE value
3. Timing: purposeful gaps (abandonment: hours; nurture: days)
4. Branching: engaged vs unengaged paths where behavior data allows
5. Escalation shape: value → value → proof → ask (never four asks)
```

### Step 3: Write the Sequence Spec

```jsonc
// .claude/plans/email-sequences/<slug>.json
{
  "version": "1.0.0",
  "sequence": "post-trial-welcome",
  "job": "Activate trial users to first successful workflow",
  "goalMetric": "activation rate (first workflow created)",
  "entry": { "trigger": "event:trial_started", "delay": "immediate" },
  "exits": ["event:workflow_created", "unsubscribe", "trial_converted"],
  "suppressions": ["existing customers", "team invitees"],
  "frequencyGuard": "pauses weekly newsletter while active",
  "steps": [
    {
      "id": "e1",
      "timing": "immediate",
      "job": "Deliver promised value + set expectations",
      "subject": "Your workspace is ready",
      "preview": "Here's the 2-minute first step",
      "cta": { "label": "Create your first workflow", "url": "…", "utm": "…" },
      "branch": null
    },
    {
      "id": "e2",
      "timing": "+2 days if !workflow_created",
      "job": "Remove the most common blocker",
      "branch": { "if": "opened:e1 == false", "then": "resend-variant-subject" }
    }
  ],
  "approval": { "required": true, "approvedAt": null, "approver": null }
}
```

### Step 4: Draft Every Email

For each step, draft to the email standard:
- Subject + preview written as a pair; mobile-first body; one primary CTA
- Trigger-contextual opening ("You started a trial" beats "Hi there")
- Compliance block: unsubscribe, physical address, correct sender identity
- Voice per brand-guidelines.json

### Step 5: Run Editorial QA

Route the full sequence through the `editorial-qa` skill: brand lint, readability (email target: Flesch ≥ 65), fact-check on every claim, compliance elements present. Sequences QA as a set — arc coherence and cumulative ask:give ratio are reviewed, not just individual emails.

### Step 6: Stage for Approval

Present at the human approval gate: the spec (visualized as a flow), every draft, audience definition and counts, and collision analysis. **The sequence is built OFF/paused; activation happens only after explicit approval — and going live is logged.**

## Output

| Artifact | Purpose |
|----------|---------|
| `.claude/plans/email-sequences/<slug>.json` | Sequence spec (triggers, timing, branches) |
| Per-email drafts (subject, preview, body, CTA) | Ready for the sending platform |
| QA report + approval package | Gate evidence |

## Error Handling

- **No event data for triggers:** Fall back to time-based with a note recommending event instrumentation to marketing-ops
- **Sequence collides with existing flows:** Present the collision; resolve before drafting continues
- **Goal unmeasurable:** Push for a proxy metric; flag prominently if none exists
- **Regulated audience/content (GDPR/CASL, minors, health/finance):** Route to legal-compliance-checker before the approval gate

## Integration

- **Consumed by:** `/build-email-sequence`, `/build-campaign` email components
- **Uses:** email-marketer agent (broadcasts), lifecycle-email agent (flows), `editorial-qa`, brand-guidelines.json
- **Never:** activates a sequence, imports a list, or sends a test to real subscribers without approval
