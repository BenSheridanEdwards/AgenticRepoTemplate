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

These checks are defined in `.github/workflows/`:

- **Dependency vulnerability audit**: `pnpm audit --audit-level=high` in CI.
- **Secret scanning**: gitleaks over history in CI, and `gitleaks protect`
  against staged content on pre-commit (when installed locally).
- **Static application security testing**: CodeQL on pushes to `main`, pull
  requests and a weekly schedule. Public repositories qualify for code scanning.
  For private repositories, confirm Code Security eligibility and
  enablement alongside workflow permissions.
- **Dependency updates**: add `.github/dependabot.yml` to configure scheduled
  Dependabot version updates. The dependency audit above runs in CI.

Secrets stay out of the repository; the optional `E2E_BASE_URL` override is
documented in `playwright.config.ts`, and real `.env` files are git-ignored.

# Hosted security and merge enforcement

## Onboard a repository

Public repositories qualify for branch protection and code scanning; private
repositories need an eligible plan (see below). Configure and verify hosted
settings after copying the workflow definitions.

1. Confirm the destination repository supports branch protection or rulesets.
   Private repositories need an eligible paid plan.
   See [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
2. For private repositories, confirm GitHub Code Security eligibility and
   enablement before expecting CodeQL results in the Security tab. This is
   separate from Actions permissions and from branch protection.
   See [CodeQL availability](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning).
3. Have an authorised maintainer configure and verify the required checks in
   branch protection or an applicable ruleset. Use the exact check names in
   [required-gates.md](../docs/required-gates.md), plus `enforcement-approval` for the
   existing human approval policy. Review bypass permissions as well.
4. Check a real pull request at its latest head. Confirm the checks run and the
   platform prevents merging while a required check fails or approval is absent.

Read-only checks (replace `OWNER/REPO` with your repository):

```sh
gh api repos/OWNER/REPO/branches/main/protection
gh api repos/OWNER/REPO/rulesets
gh api repos/OWNER/REPO/code-scanning/alerts
gh api repos/OWNER/REPO/branches/main/protection/required_status_checks | node scripts/required-gates.mjs --protection
```

An upgrade-required response means the platform prerequisite is unmet. An API
permission error needs investigation; verify installed protection separately.
`pnpm gates:check` validates repository files only. The generated inventory's
"Branch protection" column identifies the intended enforcement mechanism; verify
live configuration separately. Until the settings and a failing-check merge
refusal have been verified, treat these as reporting checks with a manual merge
policy.

The `Required gates` aggregate covers CI lanes. CodeQL, Lighthouse and PR
quality are separate checks. The `enforcement-approval` status is separate too:
its head-specific checkbox must be edited by the designated human approver.
Complete that checkbox action explicitly for the latest head. Keep an
unavailable security check visibly unresolved.

## Secret scanning

CI downloads the MIT-licensed Gitleaks CLI at a pinned version and verifies the
release archive against a committed SHA-256 before executing it. The CLI
provides the scanner independently of the Gitleaks Action licensing
requirements. Checkout retains full history; `scripts/secret-scan-ci.sh` scans
all fetched refs and full history, including secrets subsequently deleted. Both
findings and execution failures fail the security job. The same job first runs
`scripts/secret-scan-ci.test.sh` against clean and synthetic-secret Git history.

To reproduce with the workflow's Gitleaks version installed:

```sh
bash scripts/secret-scan-ci.test.sh
bash scripts/secret-scan-ci.sh
```

## CodeQL and dependency updates

CodeQL needs `actions: read` for private workflow-run metadata, `contents: read`
for source and `security-events: write` for upload. For private repositories,
eligibility and enablement of Code Security remain separate prerequisites. Keep
analysis and upload enabled; resolve any entitlement error with the repository
owner. Local CodeQL CLI use on private code has licensing prerequisites too, so
confirm those before local analysis.

Add `.github/dependabot.yml` to configure scheduled Dependabot version updates;
this template currently provides CI auditing. `pnpm audit --audit-level=high`
remains the dependency vulnerability gate. GitHub-hosted Dependabot
alerts/security updates and native secret scanning are separate repository
settings to assess with the owner.
