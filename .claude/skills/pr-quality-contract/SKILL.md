---
name: pr-quality-contract
description: >-
  Use before opening, updating, or marking a pull request ready. It turns the
  repo Definition of Done into a proof-backed PR body with exact local checks,
  visual evidence, CI status, and explicit unverified gaps.
---

# PR Quality Contract

Use this skill any time you prepare a PR, update a PR body, respond to review
asking for proof, or decide whether work is ready to report complete.

## Read First

- `.agents/project/DEFINITION_OF_DONE.md`
- `.agents/project/PR_QUALITY.md`
- `.github/pull_request_template.md`
- `git status --short --branch`
- the current diff against the intended base branch

## Process

1. **Confirm scope.** Identify the intended base branch, current branch, and
   changed files. Do not include unrelated local changes in the PR.
2. **Run local proof.** Prefer `pnpm verify` and `pnpm e2e`. If a narrower
   command is appropriate, name why it is enough and list what remains unproven.
3. **Collect visual proof.** For UI-visible or CSS changes, attach screenshots,
   video, or a StyleProof report. For non-UI changes, write `N/A` with the
   reason instead of pretending visual proof exists.
4. **Separate proof layers.** Keep local command proof, GitHub Actions status,
   deploy/runtime proof, and pending gaps in separate sentences.
5. **Fill the template.** Use `.github/pull_request_template.md`; do not leave
   placeholder comments, empty checkboxes with no explanation, or vague
   summaries such as "all tests pass".
6. **Gate completion.** Do not report the work complete until the latest-sha CI
   checks are green, or until you have clearly said which checks are still
   pending or failing.

## Failure Rules

- If a gate fails, report the exact command and failure, then fix the cause.
- Never use `--no-verify`, remove a hook, weaken TypeScript/Biome/Jest config,
  or lower a budget to get a green PR.
- Keep private project names, secrets, tokens, and local-only paths out of a
  public PR body.

## Ready Output

When handing off the PR, include:

- PR URL and branch;
- one-sentence change summary;
- exact local commands run;
- latest GitHub Actions status;
- visual proof link or explicit `N/A`;
- any residual risk or unverified surface.
