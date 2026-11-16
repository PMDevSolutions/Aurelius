# Security Policy

## Supported Versions

Only the latest release on the `main` branch is actively supported with security updates. If you are using an older version, please update to the latest release before reporting an issue.

| Branch | Supported |
|--------|-----------|
| `main` (latest) | Yes |
| All other branches / older releases | No |

## Reporting a Vulnerability

If you discover a security vulnerability in Aurelius, please report it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

Send an email to **paul@pmds.info** with the following details:

- A clear description of the vulnerability
- Steps to reproduce the issue
- The potential impact or severity
- Any suggested fixes, if applicable

### Response Timeline

- **Acknowledgment:** Within 48 hours of receiving your report
- **Initial assessment:** Within 7 days of acknowledgment
- **Resolution:** Dependent on severity and complexity; we will keep you informed of progress

### Credit

Reporters will be credited in the release notes and changelog for the fix unless they prefer to remain anonymous. Please indicate your preference when submitting your report.

Thank you to the people who have reported issues privately:

- **Aleksandr Churilov** (November 2026): an incorrect package name in an agent skill.

## Scope

### In Scope

- Framework source code
- Scripts (all files in `scripts/`)
- Templates (all files in `templates/`)
- Agent definitions (all files in `.claude/agents/`)
- Pipeline configuration and skill definitions

### Out of Scope

- **Third-party dependencies** -- please report vulnerabilities in upstream packages through their own security reporting channels (e.g., npm advisories, GitHub Security Advisories for the respective project)
- Issues that require physical access to a user's machine
- Social engineering attacks

## Disclosure Policy

We follow a coordinated disclosure process. We ask that you give us reasonable time to investigate and address the issue before making any information public. We are committed to working with security researchers to resolve issues promptly and transparently.

---

Maintained by [PMDevSolutions](https://github.com/PMDevSolutions)
