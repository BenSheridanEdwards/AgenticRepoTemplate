---
name: pr-quality-contract
description: >-
  Use before opening, updating, or marking a pull request ready. It turns the
  repo Definition of Done into a proof-backed PR body with exact local checks,
  inline screenshot proof, visual evidence, and explicit unverified gaps.
---

# PR quality contract

Use this skill to prepare a PR or body, answer a request for proof, or decide whether work is complete.

Read `.agents/project/PR_QUALITY.md`, `.github/pull_request_template.md`,
`git status --short --branch`, and the diff against the intended base.

## Process

1. Confirm the base, branch, and changed files. Keep unrelated changes out.
2. Run local proof per [.agents/project/PR_QUALITY.md](../../../.agents/project/PR_QUALITY.md#evidence-rules).
   Prefer `pnpm verify` and `pnpm e2e`. Explain any narrower check and what it
   leaves unproven. Before each push, clear `pnpm lint:anti-slop`
   on the committed branch and list the result.
3. Collect screenshots or video for UI-visible or CSS changes. Otherwise,
   write `Not applicable` with the technical reason.
4. State local proof, deploy/runtime proof, and unverified gaps separately.
5. Fill `.github/pull_request_template.md` exactly, following the
   [PR contract checks](../../../.agents/project/PR_QUALITY.md#pr-contract-checks).
   Replace placeholders, explain unticked boxes, and name exact commands.
   `scripts/validate-pr-body.mjs` (the `PR quality` workflow) checks sections,
   content, proof, title, and `- Head commit:`. After each push, re-check the
   whole body against the new head and update that field.
6. Report completion once latest-sha CI checks are green; keep CI status out of the body.

## Inline visual proof

Capture the changed behaviour from the current branch and real runtime using this repo and server.
Replace stale or mock-only captures. Inspect each image, then save and commit proof on the PR branch,
normally in `docs/proof/<short-scope>/`. Push the proof commit before publishing its URLs.

Embed screenshots in `Behavioural Proof (with video and screenshots)` with descriptive alt text
and published HTTPS URLs. Keep images on the branch under review:

```md
![Descriptive alt text](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)
```

GitHub blob URLs need `?raw=1`; videos may link to committed artifacts. After an authorized PR creation or edit, read the body:

```sh
gh pr view <number> --json body --jq .body
```

Confirm inline images appear in the proof section. When no rendered or behavioural proof surface exists,
use the exact text `Not applicable` with a technical reason. Bare image links and local paths fail.

## Failures and handoff

Follow the [evidence rules](../../../.agents/project/PR_QUALITY.md#evidence-rules): report the exact failed command,
fix its cause, and keep hooks, TypeScript/Biome/Jest config, and budgets at full strength.
Keep private names, secrets, tokens, and local-only paths out of public bodies.

Hand off the PR URL and branch, a one-sentence summary, exact local commands, latest GitHub Actions status,
visual proof or `Not applicable` with a reason, and residual risk or unverified surfaces.
