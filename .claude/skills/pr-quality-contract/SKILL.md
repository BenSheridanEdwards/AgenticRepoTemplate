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
   changed files. Keep unrelated local changes out of the PR.
2. **Run local proof.** Prefer `pnpm verify` and `pnpm e2e`. If a narrower
   command is appropriate, name why it is enough and list what remains unproven.
   Before every push, run `pnpm lint:anti-slop` and
   `pnpm lint:anti-slop:changed` on the committed branch and clear every
   finding. List both exact commands and their results in the PR body.
3. **Collect visual proof.** For UI-visible or CSS changes, attach screenshots
   or video. For non-UI changes, write `Not applicable` with the reason instead of
   pretending visual proof exists.
4. **Separate proof layers.** Keep local command proof, GitHub Actions status,
   deploy/runtime proof, and pending gaps in separate sentences.
5. **Fill the template.** Use `.github/pull_request_template.md` exactly. The
   body must contain, in order, `Why does this feature exist?`, `What changed?`,
   `Behavioural Proof (with video and screenshots)`, and `Verification Summary`.
   Replace placeholder comments, explain each unticked checkbox, and name
   commands in place of summaries such as "all tests pass". `scripts/validate-pr-body.mjs` (the
   `PR quality` workflow) rejects a body that omits a section, leaves one
   placeholder-only, lacks proof, carries a non-Conventional-Commits title, or
   names a `- Head commit:` other than the PR head. After every push, re-check
   the whole body against the new head, then update `- Head commit:`.
6. **Gate completion.** Report the work complete once the latest-sha CI checks
   are green, or name the checks that are still pending or failing.

## Failure Rules

- If a gate fails, report the exact command and failure, then fix the cause.
- Keep every hook, the TypeScript/Biome/Jest config, and every budget at full
  strength; a green PR comes from fixing the cause.
- Keep private project names, secrets, tokens, and local-only paths out of a
  public PR body.

## Ready Output

When handing off the PR, include:

- PR URL and branch;
- one-sentence change summary;
- exact local commands run;
- latest GitHub Actions status;
- visual proof or `Not applicable` with the reason;
- any residual risk or unverified surface.
