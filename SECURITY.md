# Security Policy

## Supported versions

This is a reference template, not a deployed product. The `main` branch is the
only supported version; adopters fork from it and own their copy thereafter.

## Reporting a vulnerability

Please report security issues **privately**, through a private channel in place
of a public issue.

- Preferred: open a [GitHub private security advisory](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/security/advisories/new)
  (Security → Report a vulnerability).
- Or email **ben@codewalnut.com** with the details and a way to reproduce.

You can expect an acknowledgement within a few working days. Once a fix is ready
we will coordinate disclosure.

## What this repo does to stay secure

These checks are defined in `.github/workflows/`. For platform prerequisites
and merge enforcement, see [hosted security](docs/hosted-security.md):

- **Dependency vulnerability audit** — `pnpm audit --audit-level=high` in CI.
- **Secret scanning** — gitleaks over history in CI, and `gitleaks protect`
  against staged content on pre-commit (when installed locally).
- **Static application security testing** — CodeQL on pushes to `main`, pull
  requests and a weekly schedule. Public repositories qualify for code scanning.
  For private repositories, confirm Code Security eligibility and
  enablement alongside workflow permissions.
- **Dependency updates** — add `.github/dependabot.yml` to configure scheduled
  Dependabot version updates. The dependency audit above runs in CI.

Secrets stay out of the repository; the optional `E2E_BASE_URL` override is
documented in `playwright.config.ts`, and real `.env` files are git-ignored.
