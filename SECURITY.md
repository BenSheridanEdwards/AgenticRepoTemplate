# Security Policy

## Supported versions

This is a reference template, not a deployed product. The `main` branch is the
only supported version; adopters fork from it and own their copy thereafter.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a
vulnerability.

- Preferred: open a [GitHub private security advisory](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/security/advisories/new)
  (Security → Report a vulnerability).
- Or email **ben@codewalnut.com** with the details and a way to reproduce.

You can expect an acknowledgement within a few working days. Once a fix is ready
we will coordinate disclosure.

## What this repo does to stay secure

These run automatically (see `.github/workflows/` and `.github/dependabot.yml`):

- **Dependency vulnerability audit** — `pnpm audit --audit-level=high` in CI.
- **Secret scanning** — gitleaks over history in CI, and `gitleaks protect`
  against staged content on pre-commit (when installed locally).
- **Static application security testing** — CodeQL on every push and pull request.
- **Dependency updates** — Dependabot for npm packages and GitHub Actions.

No secrets are committed; runtime configuration is documented in `.env.example`
and real `.env` files are git-ignored.
