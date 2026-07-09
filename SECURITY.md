# Security Policy

Fuchine stores user-provided API keys (BYOK), encrypted at rest with AES-256-GCM.
Because a vulnerability here can expose those keys or a self-hoster's data, we
ask you to report privately rather than opening a public issue.

## Reporting a vulnerability

Please use **GitHub Security Advisories**:

1. Go to the repository's **Security** tab → **Report a vulnerability**.
2. Describe the issue, the affected component, and steps to reproduce.

This keeps the report private until a fix is available. Do **not** file a public
issue or PR for a suspected vulnerability.

## Scope — things we especially care about

- **BYOK key handling** — the AES-GCM encryption (`packages/llm/src/crypto.ts`),
  key resolution, and anything that could log or leak a plaintext key.
- **Authentication and session handling** (Auth.js / NextAuth).
- **Import and AI endpoints** that spend money on the house key or run against
  Postgres/Redis.
- **Self-host configuration** that could expose data (env handling, defaults).

Out of scope: issues that require a malicious dependency you installed yourself,
or self-inflicted misconfiguration of your own instance.

## Response window

Fuchine is a small, solo-maintained project. We aim to **acknowledge a report
within 7 days** and to keep you updated as we work on a fix. Please allow
reasonable time to remediate before any public disclosure; we're happy to
coordinate a disclosure timeline with you.

## Supported versions

Only the latest `main` is supported. Fixes land there first.
