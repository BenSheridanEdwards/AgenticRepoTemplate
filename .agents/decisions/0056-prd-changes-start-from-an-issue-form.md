# 56. PRD changes start from an issue form

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-23
- **Builds on:** [0045](0045-prds-state-intent-and-link-their-specs.md)

## Context

ADR 0045 links each PRD behaviour to the E2E test that proves it. A proposal
to change that intent also needs to show the current contract, the proposed
edit, and the outcome. Free-form issues leave those details to each author.
Issue #128 adds a consistent intake route, following the North Star's rule
that the repository carries the standards across agents and harnesses.

## Decision

- Add `.github/ISSUE_TEMPLATE/prd-change.yml` for behaviour or intent changes.
  Require three answers with boolean `validations.required: true`:
  - **Which PRD does this conflict with or supersede?** A
    `docs/prd/<feature>.md` path, or `None: new PRD for <feature>`.
  - **Proposed PRD diff.** A branch compare or draft PR link that edits that
    PRD or adds the new one.
  - **Outcome.** The North Star outcome the proposal advances.
- Offer an optional field for the E2E tests that would change. Use placeholders
  rather than prefilled answers so a required field starts empty.
- Keep `blank_issues_enabled: true` in `config.yml`. The form adds an intake
  route; other issue routes remain available.
- Write both `.yml` files in JSON syntax, a YAML subset, so the Jest test can
  parse them with `JSON.parse` without a new dependency or a custom parser.
- `scripts/issue-forms.test.ts` checks every required field by its identifier,
  label, editable type and boolean requirement. It also checks chooser metadata,
  unique identifiers, empty initial answers, the optional E2E field and blank
  issues. Existing Jest discovery runs it in `pnpm test`, `pnpm verify` and CI.
- Link the form from the PRD template and PR quality guidance.

## Consequences

- GitHub refuses this form with a required answer blank. Removing a required
  field or its `required: true` makes the contract test fail.
- Required answers enforce presence, not meaning. Review still checks that the
  PRD path exists or names the intended new feature, the diff edits that PRD,
  and the outcome follows the North Star.
- GitHub discovers issue templates on the default branch. Live chooser and
  blank-submission verification follows merge; local tests protect the form's
  definition before then.
- This decision adds no PR-body requirement, product-intent approval guard,
  dependency, workflow or hook. `.github/ISSUE_TEMPLATE/**` is outside the
  enforcement-approval guards in ADRs 0023 and 0024.
