# 83. Every issue starts from a form

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-31
- **Amends:** The blank-issues decision in [PRD changes start from an issue form](0056-prd-changes-start-from-an-issue-form.md).

## Context

The PRD change form asks for intent, a PRD link and a North Star outcome.
Blank issues let bugs, gate changes, tooling and docs proposals omit those
answers. Contributors need a form for changes that do not edit a PRD.

## Decision

- Set `blank_issues_enabled: false` in `.github/ISSUE_TEMPLATE/config.yml`.
- Keep the PRD change form for proposals to edit product intent.
- Add an Intent form for other changes. Require what should change, for whom
  and why; the affected `docs/prd/<feature>.md` or `None: <reason>`; and the
  North Star outcome the change moves and how.
- Use placeholders and empty initial answers in both forms. Keep JSON syntax
  in the `.yml` files so tests use `JSON.parse` without another dependency.
- Check every form in `scripts/issue-forms.test.ts` against an explicit map
  of its intent, PRD and outcome field identifiers. A new form needs a map
  entry; each mapped field must be required and have a placeholder.

## Consequences

Every issue opened through the chooser starts from a form with required
answers. Review checks whether those answers fit the proposed change.
The existing Jest suite protects the form definitions; live GitHub chooser
verification follows merge, when GitHub discovers the updated templates.
Product intent and app behaviour stay unchanged.
