# Progress

A checkpoint log for multi-step work in this repo. The Agent Operating Rules
(`.agents/START_HERE.md` and the ADRs) require a checkpoint for any task longer than
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

Keep it honest: record a step as done once its proof exists. When a goal
ships, leave its block here as history and open the next one above it.

---

## Consistent Todo contract (#126)

- **Branch:** `feat/consistent-todo-contract`
- **Scope:** Enforce application/domain value crossings, type-only integrations
  imports and the reference scaffold API surface; prepare one rerun baseline.
- **Completed:** Removed the six old results and live evidence in a separate
  scaffold commit. Added Fallow and structure rules, shared the comparison's
  import classifier, regenerated the canonical diagram and recorded ADR 0054.
  Addressed PR #127's export-parser review with explicit rejection of unsupported
  export lines and documented the missing-report hand-off to `pnpm api:check`.
  The follow-up review now reports unsupported lines as structure findings,
  filters undefined feature paths and documents side-effect value crossings.
- **Proof artifact:** `docs/proof/consistent-todo-contract/phase1.txt` records
  the expected old-result failures and positive/negative Fallow export controls.
  The architecture tests cover the new rules; comparison tests stay unchanged.
- **Verification:** Boundary/contract tests passed (64 tests). Full local
  `pnpm verify`, `pnpm e2e` and latest-head CI are tracked in the PR.
- **Phase 2:** Ben authorised Colima on 23 October 2026. The local Linux VM
  runs and the container runtime is being prepared for the unchanged harness.
  Ben approved ADR 0054 and the paired `RouterInputs` / `RouterOutputs`
  Fallow exemption at 11:44 BST: "Approve ADR 0054 and the Fallow exemption".
- **Blockers:** The six new trials and `consistent` acceptance proof remain
  outstanding. Keep the PR draft until the comparison has zero outside-spec
  aspects. Merge the removal commit only with all six replacement records and
  comparison, with every check green.

## macOS verification portability (#122)

- **Branch:** `fix/macos-verification`
- **Scope:** Make the existing verify and pre-push suites pass on macOS with
  every test, assertion, threshold and hook preserved.
- **Completed:** Fixture roots use physical paths, matching child processes,
  Git, ESLint and Jest. The trial test adapter preserves an omitted environment
  so the system adapter supplies its toolchain PATH. The Jest allowlist names
  CoreFoundation's locale variable explicitly, with a nearby unknown name
  still rejected.
- **Proof artifact:** `tooling/coverage-by-result.test.ts`,
  `tooling/trial/inclusion.test.ts`, `tooling/trial/run-trial.test.ts` and
  `scripts/jest-env.test.ts` retain the ten assertions that failed on macOS.
- **Verification:** Baseline: four suites, ten failures on Node 22.23.4.
  Corrected targeted suites passed (124 tests); `pnpm verify` passed (88 suites,
  1,585 tests, coverage, build and size); `pnpm e2e` passed (80 tests) on macOS.
  The PR records the actual pre-push result and latest-head hosted checks.
- **Blockers:** None locally; hosted verification and Claude Opus review/merge
  are tracked in the PR.

## Sarah's anti-slop lint rules (#114)

- **Branch:** `feat/sarah-anti-slop`
- **Scope:** Audit Sarah's policies and enforce missing applicable source rules.
- **Completed:** Comment and nesting ceilings plus shared-control enforcement,
  seeded CLI tests and ADR 0050 with the audit and scope decisions.
- **Proof artifact:** `scripts/eslint-policy.test.ts`.
- **Verification:** `pnpm lint:policy` passed; `pnpm e2e` passed (80 tests).
  The PR records the full-suite result and current hosted checks.
- **Blockers:** Enforcement edits require Ben's head-specific sign-off.

## Project-local verification skill

- **Branch:** `feat/verify-app-skill`
- **Scope:** Give agents one scripted way to launch the app, drive it in
  Chromium like a user, and keep proof for a PR.
- **Completed:** `.claude/skills/verify-agentic-template/` with `SKILL.md`, a
  feature map for Capacity, Service status, and Accessibility, and
  `scripts/verify.mjs` with `launch`, `doctor`, `drive`, and `cleanup`.
- **Proof artifact:** `docs/proof/verify-agentic-template/transcript.txt`, plus
  screenshots, a video, and journey manifests in the same folder.
- **Verification:** `pnpm verify` passed. All five journeys passed on a dev
  instance. The CI `dist` artifact from main passed `service-status` in preview
  mode.
- **Blockers:** None.
- **Since then:** [ADR 0032](decisions/0032-api-ui-greeting-and-contract.md)
  replaced the Capacity and Service status demos with the greeting feature.

## PR body quality contract + scaffold gaps

- **Branch:** `feat/pr-proof-contract-and-scaffold-gaps`
- **Scope:** Align the repo with a proof-backed PR contract — a four-section PR
  template, a machine validator that enforces it in CI, the inline-screenshot
  proof skill, a proof-artifact convention, a vendor-neutral root manifest, and
  honest handling of the stale architecture audits and dead README badges.
- **Completed:**
  - `.github/pull_request_template.md` rewritten to the four canon sections
    (Why / What changed / Behavioural Proof / Verification Summary) with the
    repo's DoD and CI checkboxes folded into Verification Summary,
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
  - `package.json` gains the `validate:pr` script; README gains a
    branch-protection checklist.
  - README badges, `package.json` `name`, and the README H1 aligned to
    `AgenticRepoTemplate`.
- **Proof artifact:** validator fail/pass terminal output (pasted in the PR body's
  Behavioural Proof section); `scripts/validate-pr-body.test.ts` (7 passing
  cases); `pnpm verify` output in the PR's Verification Summary.
- **Verification:** `pnpm typecheck`, `pnpm check`, `pnpm test:coverage`,
  `pnpm build`, `pnpm size`, `pnpm fallow:audit`, and the validator CLI run
  against a bad body (exit 1) and the real PR body (exit 0). E2E is wired in
  CI; not run locally (no UI surface changed).
- **Blockers:** none for this change. Follow-up work (re-run the stale audits,
  add fallow boundary zones, grow a second feature) went to `TODO.md`. The
  boundary zones have since landed (ADR 0014, ADR 0032), and the greeting
  feature with its api replaced the demos (ADR 0032).
