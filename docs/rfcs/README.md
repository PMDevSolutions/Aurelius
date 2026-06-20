# Aurelius RFCs

Design documents for **substantial or high-risk** changes. An RFC is written and
**accepted before** the corresponding implementation work begins, so the design
is reviewed once, in one place, rather than relitigated across PRs.

Use an RFC when a change is architectural, hard to reverse, security-sensitive, or
spans many parts of the framework (e.g., the plugin architecture). Routine
features and fixes do not need one.

## Process

1. **Draft.** Add `docs/rfcs/NNNN-short-title.md` (next free number, zero-padded),
   following the structure of an existing RFC. Set **Status: Proposed**.
2. **Review.** Open a PR with just the RFC. Discussion happens on the PR.
3. **Accept.** On maintainer approval, set **Status: Accepted** and fill the
   Acceptance section (date + approver). Merge.
4. **Implement.** Implementation lands in follow-up PRs that reference the RFC.
   Material design changes go back through the RFC.

**Statuses:** `Proposed` → `Accepted` · `Rejected` · `Superseded by NNNN`.

## Index

| RFC                                       | Title                                 | Status   | Milestone |
| ----------------------------------------- | ------------------------------------- | -------- | --------- |
| [0001](0001-plugin-architecture.md)       | Plugin Architecture for Custom Agents | Proposed | v2.0.0    |
