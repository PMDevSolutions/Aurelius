# RFC 0001 — Plugin Architecture for Custom Agents

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| **RFC**      | 0001                                                                   |
| **Title**    | Plugin Architecture for Custom Agents                                  |
| **Status**   | **Proposed** — awaiting review & acceptance                            |
| **Milestone**| v2.0.0                                                                  |
| **Tracking** | #79                                                                    |
| **Author**   | Aurelius maintainers                                                   |
| **Created**  | 2026-06-20                                                             |
| **Informs**  | the v1 brainstorm in `docs/plans/2026-05-27-agent-plugin-system-design.md` |

> **Acceptance gate.** Per #79, this RFC must be **reviewed and accepted** before
> any further v2.0.0 plugin-architecture implementation begins. The status moves
> `Proposed → Accepted` on maintainer sign-off (see §14). The already-shipped v1
> local tooling (§4) predates this RFC and is the foundation it builds on.

---

## 1. Summary

Aurelius already ships a **v1 local** plugin system for authoring, validating,
dependency-resolving, and installing custom Claude Code agents (§4). This RFC
ratifies that architecture as the design of record and specifies the v2.0.0
evolution across the six areas the milestone requires — **discovery, manifest
format, lifecycle hooks, sandboxing, versioning, distribution** — plus a precise
**compatibility contract with the built-in agents**.

The two genuinely new and highest-risk pieces are a **trust/sandbox model** that
governs what a third-party plugin may execute, and a **distribution channel**
(remote sources → curated registry) with integrity and provenance. Everything
else is an additive, backward-compatible extension of v1.

## 2. Motivation

- Aurelius ships a large first-party agent catalog (**56** built-in agents today;
  there were 48 at the time #79 was filed). Teams want to add their own agents and
  share them across projects.
- A **v1 local** system already exists (§4): a `plugin.json` manifest + JSON
  Schema, four CLIs, transitive semver dependency resolution, management-lifecycle
  hooks, and a static assertion test framework. It deliberately deferred the
  riskiest concerns as **non-goals**: no sandboxing, no network/marketplace fetch,
  no runtime hooks.
- v2.0.0 commits to a "plugin architecture for custom agents." It is the
  **highest-risk** milestone item because it introduces **third-party prompts and
  install-time code** into a system whose agents can drive tools with real side
  effects (file writes, shell, MCP). The point of an RFC-before-code is to fix the
  **trust boundary** and **supply-chain integrity** model first.

## 3. Goals and non-goals

**Goals**

- Specify plugin **discovery**, **manifest**, **lifecycle hooks**, **sandboxing**,
  **versioning**, and **distribution** as one coherent architecture.
- Define **compatibility** between plugin agents and the built-in agents
  (namespace, collisions, dependencies, dispatch, tool/permission parity).
- Provide a phased **migration** path from v1 that never breaks existing plugins.
- Be implementable as small, additive changes to the existing CLIs.

**Non-goals (v2.0.0)**

- A custom **agent runtime / loader**. Agents remain Markdown prompt files that
  Claude Code reads directly from `.claude/agents/`. A plugin packages an agent;
  it does not introduce a new execution engine.
- **Invocation-time agent hooks** (`onBeforeInvoke`, …). Claude Code does not fire
  per-agent runtime hooks; the only harness hooks are the existing
  `settings.json` `PostToolUse`-style hooks, which are operator-owned.
- **Auto-executing untrusted code.** Untrusted plugins never run install hooks
  (§9).
- **Multi-tenant hosting / a public package manager.** v2.0.0 targets a curated
  registry, not an open npm-scale marketplace.

## 4. Background: the shipped v1 system (what we build on)

Implemented and documented in `docs/guides/agent-plugins.md`. Summary so this RFC
is self-contained:

- **Layout.** A plugin is a directory `.claude/agent-plugins/<name>/` containing
  `plugin.json` (manifest), `agent.md` (YAML frontmatter + prompt — the
  deliverable), optional `hooks/` (`.sh`), and `tests/plugin.test.json`.
- **Manifest** (`.claude/agent-plugin.schema.json`, strict
  `additionalProperties:false`): `name` (kebab-case, must match dir + agent
  frontmatter), `version` (semver), `description` (required), optional `author`,
  `license`, `agent` (default `agent.md`), `dependencies` (`agents` →
  name→semver-range, `skills`, `tools`), `hooks`
  (pre/post install/uninstall), `tests`.
- **Four CLIs** (ESM Node + `.sh` wrappers, `--json`, exit `0/1/2`, sharing
  `scripts/agent-plugin-lib.js`): `create-agent-plugin.js` (scaffold),
  `validate-agent-plugin.js` (schema + structural checks),
  `agent-registry.js` (`list`/`resolve`/`install`/`uninstall` with transitive
  resolution, topological install order, cycle/version/missing detection),
  `test-agent-plugin.js` (a fixed catalog of pure, deterministic assertions over
  the plugin's files — no Claude invocation).
- **Install** copies `agent.md` → `.claude/agents/<name>.md` (where Claude Code
  reads it) and records `{version, sourceHash, installedAt}` in
  `.claude/agent-plugins/installed.json`. Idempotent; refuses to remove a plugin a
  dependent still needs.
- **Hooks** attach to the plugin-**management** lifecycle and run via `bash` with
  `PLUGIN_NAME`/`PLUGIN_DIR`/`PLUGIN_VERSION`.

The v1 non-goals this RFC now revisits: **sandboxing**, **distribution**, and the
**built-in-compatibility** surface.

## 5. Architecture overview

```
author ──► package ──► distribute ──────────► discover ──► validate ──► install ──► dispatch
           (dir +      (local | git/url |       (scan +     (schema +    (sandboxed   (Claude Code
            manifest)   registry/marketplace)    registry)   structural)  by trust)    reads .md)
                                                                                │
                                              trust tier gates hooks + tools + permissions
```

A plugin is authored as a directory, distributed through one of three channels,
discovered and validated, then installed **under a trust tier** that governs which
install hooks run and which tools/permissions its agent may carry. After install
the agent is an ordinary `.claude/agents/<name>.md` file that Claude Code
dispatches like any built-in.

## 6. Plugin discovery

1. **Local (v1, exists).** Scan `.claude/agent-plugins/*/plugin.json`. Installed
   provenance lives in `installed.json`.
2. **Remote sources (v2).** `agent-registry.js add <source>` resolves a plugin
   into `agent-plugins/` from: a local path, a **git URL** (`git+https://…#ref`),
   a **tarball URL**, or a **registry name** (`name@range`). Every remote fetch is
   integrity-checked (§11).
3. **Registry index (v2).** A curated registry exposes a searchable index
   (`registry.json`: `name → versions → {tarball, sha256, signature?, trust}`).
   `agent-registry.js search <q>` / `install <name>@<range>`.
4. **Lockfile.** Resolved plugins are pinned in
   `.claude/agent-plugins/plugins.lock.json` (name → version → integrity hash) for
   **reproducible, offline** installs. Discovery must work offline against the
   cache + lockfile.

Discovery is deterministic: given the same lockfile, the same plugin set installs
byte-for-byte. Auto-discovery never **auto-installs** — discovery surfaces
candidates; installation is an explicit operator action.

## 7. Manifest format

The v2 manifest is the v1 schema **plus optional, backward-compatible fields**.
Existing v1 manifests remain valid. A `schemaVersion` is added and the JSON Schema
`$id` is versioned.

```jsonc
{
  // ── v1 (unchanged) ──────────────────────────────────────────────
  "name": "react-perf-expert",
  "version": "1.2.0",
  "description": "…",
  "author": "…",
  "license": "MIT",
  "agent": "agent.md",
  "dependencies": {
    "agents": { "asset-cataloger": "^1.0.0" }, // name → semver range
    "skills": ["react-testing-workflows"],
    "tools":  ["scripts/visual-diff.js"]
  },
  "hooks": { "preInstall": "hooks/check.sh", "postInstall": "hooks/reg.sh" },
  "tests": "tests/plugin.test.json",

  // ── v2 additions (all optional) ─────────────────────────────────
  "schemaVersion": 2,
  "compatibility": {                  // §10 — checked at install
    "aurelius": ">=2.0.0 <3.0.0",     // framework semver range
    "claudeCode": ">=1.0.0"           // optional harness floor
  },
  "capabilities": {                   // §9 — declared, allow-listed at install
    "tools": ["Read", "Grep", "Glob"],// must equal the agent frontmatter `tools`
    "permissionMode": "default"       // "bypassPermissions" requires trust ≥ trusted
  },
  "integrity": { "sourceHash": "sha256-…" },  // recorded at publish + verified at install
  "signature": "…",                    // optional detached signature (verified tier)
  "keywords": ["react", "performance"],
  "homepage": "https://…",
  "repository": "git+https://…"
}
```

The schema stays **strict** (`additionalProperties:false`) so typos are rejected.
`capabilities.tools` MUST equal the agent's frontmatter `tools` — the manifest is
the machine-checkable mirror the sandbox enforces against.

## 8. Lifecycle hooks

Two distinct hook surfaces; this RFC keeps them separate on purpose.

1. **Plugin-management hooks (v1, exists).** `preInstall` / `postInstall` /
   `preUninstall` / `postUninstall`, run by the registry via `bash`. `pre*`
   failures abort; `post*` failures warn. **These run arbitrary code** and are the
   primary install-time risk → gated by trust tier (§9): they **do not run for
   untrusted plugins**.
2. **Harness hooks (`settings.json`).** Aurelius already supports `PostToolUse`
   hooks registered in `.claude/settings.json` (see `.claude/hooks/`). A plugin
   MAY ship such scripts, but **registering them into `settings.json` requires
   explicit operator consent** (`agent-registry.js install --with-harness-hooks`)
   and is never automatic. A plugin that wants a harness hook must declare it; the
   installer prints the exact scripts and the operator approves.

There are **no invocation-time agent hooks** — Claude Code does not fire them
(unchanged from v1).

## 9. Sandboxing & trust model (the high-risk core)

A plugin presents two execution surfaces:

- **A — install-time hook scripts** (arbitrary `bash`).
- **B — the agent's runtime tools**, which Claude Code may invoke. These are
  already gated by the harness permission system, but the agent's declared
  `tools` and `permissionMode` set the *scope* of what can be auto-approved.

### Trust tiers

| Tier          | Source                                   | Hooks (§8.1) | Tools                                  | `permissionMode`                         | Integrity                |
| ------------- | ---------------------------------------- | ------------ | -------------------------------------- | ---------------------------------------- | ------------------------ |
| **untrusted** | default for any remote/unsigned plugin   | **never run**| intersected with the **allow-list**    | `bypassPermissions` **stripped/denied**  | sha256 verified          |
| **trusted**   | operator-approved (`--trust`) / first-party local | run | declared tools honored                 | `default`/`acceptEdits`; bypass on opt-in| sha256 verified          |
| **verified**  | signed + provenance-checked              | run          | declared tools honored                 | as trusted                               | sha256 **+ signature**   |

Default posture is **untrusted / default-deny**. A plugin earns capability by
being explicitly trusted or cryptographically verified — never by merely being
installed.

### Mechanisms

- **Capability allow-listing.** The installer intersects the agent's `tools`
  against a configurable policy allow-list (`pipeline.config.json` →
  `plugins.allowedTools`). Tools that grant code execution or external reach
  (`Bash`, `mcp__*`) are **not** on the untrusted allow-list; requesting them
  forces a higher tier or an explicit operator override. A plugin that requests a
  disallowed tool fails validation with a clear message.
- **`permissionMode` policy.** A plugin declaring `bypassPermissions` is
  **rejected at untrusted tier** — an untrusted plugin can never silently
  auto-approve its own tool calls. Bypass is only honored for trusted/verified
  plugins and only with an explicit operator flag.
- **Hook execution.** Honestly, `bash` is **not a real sandbox**; the effective
  control is *not running untrusted hooks at all*. When hooks do run (trusted+),
  the registry runs them with a timeout, `set -u`, a restricted env, and (where
  the platform supports it) no-network — but the security guarantee comes from the
  trust gate, not from sandboxing bash.
- **Integrity.** `integrity.sourceHash` is verified before install; the
  **verified** tier additionally checks a detached signature against a configured
  key set.
- **Prompt-injection awareness.** The agent prompt is *data*, but a hostile prompt
  could instruct Claude to misuse tools. The mitigation is the **tool allow-list +
  the human-in-the-loop permission prompts** — an untrusted plugin's agent simply
  cannot hold dangerous tools, so the blast radius is bounded regardless of prompt
  content. This is called out so reviewers do not assume "prompts are harmless."

## 10. Versioning & compatibility with the built-in agents

### Plugin versioning

- **Semver** (v1). One plugin resolves to exactly **one installed version** (no
  side-by-side — open question §15). Add an optional `deprecated` field that the
  registry surfaces.
- **Framework compatibility.** `compatibility.aurelius` (semver range) is checked
  at install against the framework version; a mismatch is a hard error (override
  with `--ignore-compat`, which lowers trust).

### Compatibility with the built-in agents (AC #3)

This is the contract that lets plugin agents and the built-in agents coexist.

1. **Shared namespace.** Installing a plugin copies its `agent.md` into
   `.claude/agents/<name>.md` — the **same** directory Claude Code reads
   built-ins from. Therefore a plugin agent **is** a first-class agent after
   install, dispatched identically (by frontmatter `name`) via the `Task`/agent
   mechanism. There is no second agent runtime.
2. **Reserved built-in names / no silent shadowing.** The built-in agent names are
   **reserved**. `agent-registry.js install` **refuses** to install a plugin whose
   `name` collides with a built-in (or with an already-installed plugin) — silent
   shadowing is a footgun that breaks reproducibility. Intentional override is
   explicit: a `namespace` manifest field (or `install --as <name>`) installs the
   agent under `<namespace>-<name>`, keeping both addressable.
3. **Built-in agents as dependencies.** Plugins may already depend on agents by
   `name → semver`. To resolve those against built-ins (not only sibling plugins),
   v2 publishes a generated **`.claude/agents.catalog.json`** mapping every
   built-in agent → its version. This makes the built-in catalog a first-class,
   versioned dependency target and is a concrete v2 deliverable. (Built-in agents
   are currently unversioned — see §15.)
4. **Uniform contract.** Plugin agents use the identical frontmatter contract as
   built-ins (`name`, `description`, `tools`, optional `model`/`permissionMode`),
   so tooling (`check-doc-counts`, frontmatter validation in CI, the agent
   catalog) treats them uniformly. The **only** differences are provenance
   (recorded in `installed.json`) and trust tier (§9).
5. **Count-independence.** The compatibility model keys off agent **names and
   versions**, never a count. The "48 vs 56" delta is irrelevant to the contract.

## 11. Distribution

Phased, integrity-first:

1. **Phase 1 — local (exists).** Plugin directories under `.claude/agent-plugins/`.
2. **Phase 2 — remote sources.** `agent-registry.js add <git|tarball|path>` with
   **mandatory sha256** verification and optional signature. Pinned in
   `plugins.lock.json`.
3. **Phase 3 — curated registry.** A hosted index (`registry.json`) +
   `search`/`install <name>@<range>`. First-party plugins are **verified**;
   community submissions are **untrusted** until reviewed and promoted.
4. **Publishing.** `agent-registry.js publish` computes `sourceHash`, optionally
   signs, and emits a tarball + an index entry. Provenance (`repository`, author)
   is recorded.

Integrity (hash) is **mandatory** for any non-local source; signatures gate the
**verified** tier. The lockfile guarantees reproducible installs across machines
and CI, offline.

## 12. Security considerations (consolidated)

| Threat                              | Mitigation                                                            |
| ----------------------------------- | -------------------------------------------------------------------- |
| Malicious install hook              | Hooks never run for untrusted plugins (§8/§9)                        |
| Over-broad agent tools              | Tool allow-list intersection; `Bash`/`mcp__*` excluded untrusted     |
| Silent auto-approval                | `bypassPermissions` denied for untrusted plugins                     |
| Prompt injection via the prompt     | Bounded blast radius — untrusted agents can't hold dangerous tools   |
| Supply-chain tampering              | Mandatory sha256; signatures for verified tier; lockfile pinning     |
| Dependency confusion / name squat   | Reserved built-in names; no silent shadowing; explicit namespacing   |
| Non-reproducible installs           | `plugins.lock.json` pins versions + integrity hashes                 |

Overall posture: **default-deny, untrusted-by-default, human-in-the-loop.**

## 13. Migration / phasing

v1 plugins stay valid (every new field is optional). Implementation is gated and
sequenced; **nothing beyond the shipped v1 lands before this RFC is Accepted.**

- **Phase A (additive to CLIs).** `schemaVersion`/`compatibility`/`capabilities`
  fields; trust tiers; tool allow-list enforcement; reserved-name / no-shadow
  enforcement; generate `agents.catalog.json` for built-in versioning.
- **Phase B (distribution).** Remote sources + mandatory integrity + lockfile.
- **Phase C (registry + signing).** Hosted index, `publish`, signature
  verification, the **verified** tier.

Each phase is its own implementation issue, reviewed independently.

## 14. Acceptance & sign-off

This RFC is **Proposed**. It is **Accepted** when a maintainer approves the PR and
updates the Status row to `Accepted` with the date and approver. Until then, no
v2.0.0 plugin-architecture implementation (beyond the already-shipped v1 tooling)
should be merged. Record the decision here on acceptance:

- Decision: _pending_
- Approver / date: _pending_

## 15. Alternatives considered & open questions

**Alternatives**

- _Full runtime agent loader / WASM sandbox._ Rejected — agents are prompts Claude
  Code reads directly; a loader is over-engineering with no execution model to
  contain.
- _npm as the distribution channel._ The manifest is intentionally npm-adjacent,
  but adopting npm wholesale (registry, semantics, JS-centricity) is heavier than
  v2.0.0 needs; revisit post-2.0.
- _Allow silent built-in shadowing (override by name)._ Rejected — breaks
  reproducibility and is a security footgun; intentional override is explicit
  namespacing instead.
- _Run all hooks always (status quo)._ Rejected — that is the core security gap.

**Open questions (for reviewers)**

1. The exact default **tool allow-list** for untrusted plugins.
2. The **signing** scheme for the verified tier (sigstore / minisign / GPG).
3. **Where** the registry is hosted and **who governs** promotion to `verified`.
4. Do we ever need **side-by-side** plugin versions? (v1 says no.)
5. **Source of truth** for built-in agent versions feeding `agents.catalog.json`.

## References

- Existing v1 system: `docs/guides/agent-plugins.md`,
  `.claude/agent-plugin.schema.json`, `scripts/agent-plugin-lib.js`,
  `scripts/agent-registry.js`, `scripts/{create,validate,test}-agent-plugin.js`.
- Prior design notes: `docs/plans/2026-05-27-agent-plugin-system-design.md`.
- Harness hooks: `.claude/hooks/`, `.claude/settings.json`, `docs/guides/hooks.md`.
- Tracking issue: #79 · Milestone: v2.0.0.
