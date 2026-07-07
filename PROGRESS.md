# Progress

A checkpoint log for multi-step work in this repo. The Agent Operating Rules
(`.agents/README.md` and the ADRs) require a checkpoint for any task longer than
three steps, so the next agent — or a human picking the work back up — can see
what is done, what proved it, and what is left.

## Convention

One block per goal, newest first. Each block carries:

- **Branch** — the branch the work lives on.
- **Scope** — the goal in one or two sentences.
- **Completed** — what actually landed, as verifiable facts.
- **Proof artifact** — the command output, test, or committed file that proves it.
- **Verification** — the exact commands run and their pass/fail result.
- **Blockers** — anything unfinished, and why.

Keep it honest: do not record a step as done until its proof exists. When a goal
ships, leave its block here as history and open the next one above it.

---

## PR body quality contract + scaffold gaps

- **Branch:** `feat/pr-proof-contract-and-scaffold-gaps`
- **Scope:** Align the repo with a proof-backed PR contract — a four-section PR
  template, a machine validator that enforces it in CI, the inline-screenshot
  proof skill, a proof-artifact convention, a vendor-neutral root manifest, and
  honest handling of the stale architecture audits and dead README badges.
- **Completed:**
  - `.github/pull_request_template.md` rewritten to the four canon sections
    (Why / What changed / Behavioural Proof / Verification Summary) with the
    repo's StyleProof, DoD, and CI checkboxes folded into Verification Summary,
    plus a PR Proof Law block.
  - `.agents/project/DEFINITION_OF_DONE.md` upgraded with the required-sections,
    required-title, behavioural-proof, and inline-proof-law content, keeping the
    repo's `pnpm verify` / `pnpm e2e` command mapping.
  - `scripts/validate-pr-body.mjs` + a `PR quality` workflow
    (`.github/workflows/pr-quality.yml`, `pull_request` types
    `[opened, edited, synchronize, reopened]`) assert section presence, order,
    non-emptiness, proof, and a Conventional-Commits title. Body and title are
    passed injection-safe via `toJSON` env vars.
  - `scripts/validate-pr-body.test.ts` (Jest) covers valid pass, missing
    section, placeholder-only section, missing proof, and bad title.
  - `.claude/skills/pr-inline-screenshot-proof/` (SKILL.md + agents/openai.yaml)
    added; `pr-quality-contract` skill aligned to name the four sections.
  - `docs/proof/README.md` and a PR Proof Law section in
    `.agents/project/PR_QUALITY.md`.
  - Root `agents/openai.yaml` vendor-neutral manifest + pointer in `AGENTS.md`.
  - `.architect-audits/README.md` records that the committed reports are stale
    (old repo name, older commit) and that re-running is tracked in `TODO.md`.
  - `package.json` gains `styleproof:capture`, `styleproof:diff`, and
    `validate:pr` scripts; `QUALITY_GATES.md` gains StyleProof operating notes;
    README gains a branch-protection checklist.
  - README badges, `package.json` `name`, and the README H1 aligned to
    `AgenticRepoTemplate`.
- **Proof artifact:** validator fail/pass terminal output (pasted in the PR body's
  Behavioural Proof section); `scripts/validate-pr-body.test.ts` (7 passing
  cases); `pnpm verify` output in the PR's Verification Summary.
- **Verification:** `pnpm typecheck`, `pnpm check`, `pnpm test:coverage`,
  `pnpm build`, `pnpm size`, `pnpm fallow:audit`, and the validator CLI run
  against a bad body (exit 1) and the real PR body (exit 0). E2E and StyleProof
  are wired in CI; not run locally (no UI surface changed).
- **Blockers:** none for this change. Follow-up work (re-run the stale audits,
  add fallow boundary zones, grow a second feature) is listed in `TODO.md`.
