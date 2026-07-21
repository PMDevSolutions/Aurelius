# Marketing Standards

The standards every asset in this repository is held to — enforced by the editorial QA loop, the verification scripts, and the approval gate. These replace the React development standards of the Aurelius ancestor.

## Truthfulness (the non-negotiables)

- **No fabrication, ever.** Statistics, studies, quotes, testimonials, reviews, user counts — if it isn't real and sourced, it doesn't exist in our copy.
- **Every claim carries a source** — linked and dated. Secondary summaries cite the primary source.
- **Estimates are labeled as estimates**, with assumptions visible. "We could not verify this" is an acceptable sentence; a confident guess is not.
- **Testimonials are real, permissioned, and documented.** Incentivized reviews and sponsored content are disclosed per FTC guidance.
- **Superlatives need substantiation.** "Best", "#1", "fastest", "guaranteed" — evidence on file or reworded.
- **Corrections are visible.** When an error ships, fix it openly; never quietly edit history.

## Brand Voice

- `brand-guidelines.json` governs; see the [Brand Setup Guide](../brand-setup/README.md)
- Banned words are hard blocks; preferred terms are warnings; product naming is exact
- Tone modulates by context (launch/support/crisis/legal) without breaking character
- One voice across channels — adaptation is re-conceiving for the platform, not changing who the brand is

## Readability

Flesch Reading Ease floors per asset type (from `pipeline.config.json → readability.targets`):

| blog | landing page | email | social | ads | press |
|------|--------------|-------|--------|-----|-------|
| ≥ 60 | ≥ 65 | ≥ 65 | ≥ 70 | ≥ 75 | ≥ 55 |

Plus sentence-length and passive-voice ceilings. The rule of thumb: expert ideas, accessible sentences. Simplify the prose, never the thinking.

## SEO

- **Intent first**: read the live SERP before outlining; one intent, one page
- On-page floor: title ≤ 60 chars (keyword in), meta ≤ 155, exactly one H1 (keyword in), clean heading hierarchy, ≥ 2 internal links, ≥ 1 cited source
- **White-hat only**: no purchased links, doorway pages, cloaking, or scaled thin content — rankings earned by being the best answer, or not at all
- Content is an asset with a maintenance schedule: decayed pages get refreshed or pruned, not abandoned

## Email

- **Consent-based sending only.** No purchased or scraped lists under any circumstances
- Every commercial send: working one-click unsubscribe (honored immediately), physical mailing address, accurate sender identity and subject
- Sunset disengaged subscribers; sending to the dead poisons deliverability for the living
- At least 3 of every 4 touches deliver value without asking
- GDPR/CASL contexts: lawful basis verified with legal-compliance-checker before send

## Social

- Platform-native or nothing — one asset pasted everywhere is a smell
- Claims travel with their sources, even at 280 characters
- Disclosure tags (#ad, partnership labels) where required
- The pause protocol: crises freeze the queue; resuming requires human review
- No bought followers, engagement pods, or astroturfing — community trust is the asset

## Paid Media

- One variable per test; pre-registered decision criteria; adequate spend before verdicts
- Message match: ad promise → landing headline read as one thought
- **No spend without the approval gate**: amount, duration, expected outcome, and kill criteria stated; kill criteria executed when hit
- Platform-reported results are directional, not truth — see the attribution standards

## Measurement

- No campaign launches unmeasured: baselines recorded, UTMs per the taxonomy, events verified
- Numbers in reports trace to provided data; gaps are findings, not blanks to fill
- Statistical honesty: confidence intervals on tests, "directional" labels on small samples, seasonality acknowledged before credit is taken
- Triangulate channel truth (platform vs analytics vs incrementality); publish the double-counting tax monthly

## Legal & Compliance Review

Route to legal-compliance-checker **before** the approval gate:
- Regulated topics: health, finance, legal, employment, housing
- Named-competitor comparisons and trademark use
- Sweepstakes, contests, and promotions
- Testimonials, endorsements, and influencer relationships
- Personal data collection and privacy-affecting tracking

## The Approval Gate

Publish, send, spend, and schedule are human decisions:
- Per-asset sign-off recorded in the campaign's approval package
- QA evidence (lint, readability, fact-check, claim-source list) attached to every request
- Waivers are logged; fabrication is never waivable
- No timeout-approval, no default-approval, no urgency exception
