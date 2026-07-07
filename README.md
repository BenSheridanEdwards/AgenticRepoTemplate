# Agentic Repo Template

[![CI](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/ci.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/codeql.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/codeql.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A template repository that installs a complete method for building software with
agents: the context files, quality gates, definition of done, and PR contract
that make AI-written code consistent, proven, and safe to merge. The principles
come first and the stack does not matter. TypeScript and React are here only as
a small, runnable feature, so every gate fires on real code.

Press **Use this template** and the method is live from your first commit.

## Why this exists

Agents write code faster than humans can review it. Left alone, that speed
produces inconsistency and slop. The fix is not to slow the agent down. The fix
is to make the standards executable and the context explicit, so the correct
way to write code is also the only way that passes.

Four beliefs shape every file in this repository:

1. **Executable standards beat written standards.** Documented guidelines are
   advisory; hooks, CI gates, and machine-validated PR bodies are law. Give the
   agent the team's standards before it writes, and make those standards
   impossible to skip after it writes. "Done" and "the gates are green" are the
   same statement.
2. **Consistency is infrastructure.** The codebase itself is the largest prompt
   the agent ever reads. If it holds three fetching patterns and three ways to
   style an element, the context the agent works from is 90% mess and 10%
   intent, and it follows the mess. No `AGENTS.md` outvotes an inconsistent
   codebase.
3. **Proof, not claims.** A change is done only when committed evidence matches
   the claim. A passing build or green types are necessary but never
   sufficient. Every user-visible change ships screenshots and video, inline in
   the PR.
4. **Agents must see.** An agent that cannot look at a screenshot cannot QA the
   user experience or validate its own work. Vision is a requirement of the
   proof loop, not an optimisation.

And one rule that never bends: **the agent never merges and never deploys.**
Humans hold both ends of the loop, the intent and the merge. Every line is
owned by a named engineer, whoever or whatever wrote it.

## The method

The same order every time, whether the repository is new or twenty years old:

1. **Map the behaviour first.** Write the user-visible contracts down as
   end-to-end tests. Nothing else is safe to assess or change without them.
2. **Install the agentic infrastructure.** The context files, skills, hooks,
   gates, and PR contract in this template. This is the base plate, not the
   starting point; it locks in each later fix so it cannot regress.
3. **Align standards and architecture.** Run the audits, fix what they surface,
   re-run. The loop is the point, not the passing grade at the end.
4. **Accelerate with proof.** Now agents build features. Every PR carries
   inline evidence and passes the gate ladder, and review becomes
   approve-or-redirect.

For brownfield codebases the order inside step 3 is not negotiable: safety net
and target first, then refactor with confidence, then tighten and simplify,
then prune and upgrade dependencies, and optimise last. Optimising before the
foundation is consistent only bakes the mess in deeper.

## What is installed, and what it means

### The context layer: what the agent knows before it writes

An agent walking into a codebase needs the same things a new engineer does: how
to run it, what the architecture is, what not to touch, and where the failure
modes are. One set of files serves both. The test of this layer: a new
engineer, or a new agent, is productive and safe within minutes of cloning,
without asking anyone anything.

- [`AGENTS.md`](AGENTS.md) is the tool-agnostic operating contract, written for
  any agent. Golden rules, commands, and pointers into `.agents/`. It follows
  the [agents.md](https://agents.md) convention and stays thin.
- [`CLAUDE.md`](CLAUDE.md) is a vendor adapter. It defers to `AGENTS.md` and
  adds only vendor-specific skills and tooling.
  [`agents/openai.yaml`](agents/openai.yaml) does the same for other vendors,
  so the method is not welded to one AI supplier.
- [`.agents/`](.agents) is the single source of detail: the
  [architecture pattern](.agents/project/ARCHITECTURE.md) agents must follow,
  the [conventions](.agents/project/CONVENTIONS.md) for naming, imports,
  errors, and state, the
  [tech stack](.agents/project/TECH_STACK.md) and what not to add to it, the
  [glossary](.agents/project/GLOSSARY.md) of shared language, the
  [Definition of Done](.agents/project/DEFINITION_OF_DONE.md), the
  [quality-gate matrix](.agents/project/QUALITY_GATES.md), the
  [PR quality contract](.agents/project/PR_QUALITY.md), the
  [decision records](.agents/decisions) that mark the difference between a
  mistake and a deliberate act, and [templates](.agents/templates) so the
  correct pattern is the path of least resistance.
- [`PROGRESS.md`](PROGRESS.md) and [`TODO.md`](TODO.md) are the memory layer:
  checkpointed work with verification status, and forward handoffs with
  acceptance criteria. They give agents audit-grade memory across sessions.

The root files stay short and point inward, so there is exactly one place to
update when the way you work changes. The standard ships as files, not written
guidelines: adopt it by copying these files, never by retyping them, because
retyped standards drift.

### The quality gates: standards you cannot skip

Feedback speed determines placement. Fast checks run early, expensive checks
run later, and local hooks mirror CI so "works on my machine" and "passes CI"
mean the same thing. A green PR means "this change introduced nothing new".

| Stage | What it enforces | Where |
| --- | --- | --- |
| **On commit** | Type safety, consistent style and imports, code intelligence (dead code, cycles, complexity), no secrets committed, and the commit-message standard | [`.husky/pre-commit`](.husky/pre-commit), [`.husky/commit-msg`](.husky/commit-msg) |
| **On push** | Logic tested with a coverage floor, a production build, the behaviour map (E2E), and accessibility. Nothing leaves the machine until these are green | [`.husky/pre-push`](.husky/pre-push) |
| **In CI** | Everything before, re-run on a clean checkout, plus dependency, secret, and license audits, static security analysis, a bundle-size budget, performance and accessibility budgets, PR-body validation, and visual regression | [`.github/workflows/`](.github/workflows) |
| **Before merge** | Human visual sign-off: the visual gate flips green only when a reviewer ticks every per-change checkbox, bound to the exact commit | [`styleproof-approve.yml`](.github/workflows/styleproof-approve.yml) plus branch protection |

The gates cannot be skipped. A
[PreToolUse hook](.claude/hooks/block-gate-bypass.sh) refuses any `--no-verify`,
and weakening type, lint, or test configuration to turn red green is a named
violation. Honest red beats dishonest green.

### The definition of done: done is mechanical

The [Definition of Done](.agents/project/DEFINITION_OF_DONE.md) removes
judgment from the word "done". A task is finished when the gates are green and
the proof is present, and at no other time. Every item on the list is
mechanically checkable, so an agent cannot honestly report a task complete
until `pnpm verify` and `pnpm e2e` pass, no matter who or what wrote the code.

### The PR contract: proof, not claims

The [pull request template](.github/pull_request_template.md) requires four
sections in order: why the change exists, what changed, behavioural proof, and
a verification summary listing exact commands and results, separating
pre-existing failures from introduced ones. The contract has teeth:
[`pr-quality.yml`](.github/workflows/pr-quality.yml) runs
[`scripts/validate-pr-body.mjs`](scripts/validate-pr-body.mjs) on every PR
event and rejects missing sections, placeholders, and non-conventional titles.

Proof means committed evidence. Screenshots live under
[`docs/proof/`](docs/proof) on the PR branch and are embedded inline in the PR
body; bare links, local paths, and "see attached" are not proof. Flows with
motion include video. If no rendered proof applies, the PR says `Not
applicable` with the technical reason. And every bug fix ships, in the same
change, with the test that would have caught it, asserting the user-visible
symptom. A reviewer should never have to guess what was actually verified.

### The visual gate: behaviour and looks are separate truths

Behaviour tests are blind to visual drift, and screenshots are blind to runtime
failure, so this template runs both. The behaviour map in
[`e2e/app.spec.ts`](e2e/app.spec.ts) drives the product through the real
interface using roles and visible text. Beside it,
[`e2e/styleproof.spec.ts`](e2e/styleproof.spec.ts), built on
[StyleProof](https://github.com/BenSheridanEdwards/styleproof), reads the
browser's computed styles and compares the PR against its base branch at three
widths, catching hover and focus states, between-breakpoint rules, and
sub-pixel drift that pixel snapshots miss. A refactor is safe when the
behaviour suite stays green and the style diff is zero or every change is
deliberately approved.

### Skills: processes with exactly one job

A skill is a documented, executable process with exactly one job; if two skills
could be selected for the same reason, rename or split them. This repo ships
its own under [`.claude/skills/`](.claude/skills): the PR quality contract, the
inline-screenshot proof law, and installers for the guidance and gate layers.
Each carries a vendor-neutral manifest.

## Truth rules

Binding on this repository and any repository built from it:

- Do not claim a gate exists unless the hook, script, or workflow exists and
  runs on a clean checkout.
- Do not describe target architecture as current fact; label aspirations as
  targets.
- Never report "installed" from filesystem presence alone; prove the command,
  hook, or workflow runs.
- Do not claim enforcement from repository files alone when the gate depends on
  platform settings. "The repo is right" and "the repo is enforced" are
  different claims, which is why the post-clone checklist below exists.

## The audit loop: health has an order

Health does not start with the agentic setup. It starts with the behaviour map
and end-to-end tests, because nothing else is safe to assess or change without
them. Then structure, then maintainability, then security, then the
non-functionals, in that order, because a weak floor makes everything above it
shaky. The agentic infrastructure is not the headline; it is what locks each
fix in so it cannot regress.

This repo grades itself with the
[ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
audits and commits the reports, including the imperfect ones, in
[`.architect-audits/`](.architect-audits):

```bash
pnpm setup:agents      # installs the playbook and Fallow skills
# then, in Claude Code:
/pre-audit-setup
/testing-audit  /architecture-audit  /security-audit  /quality-gates-audit  /agentic-audit
```

The committed history shows the loop working: the first run found real problems
(missing static analysis, a live dependency advisory, weak test selectors) and
each one being closed. Known deliberate trade-offs and open gaps are recorded
in the reports themselves and in [`TODO.md`](TODO.md). Honest history is a
feature; the loop is the point, not the passing grade at the end.

Non-functionals are held continuously, not only at audit time: Lighthouse keeps
an accessibility floor of 0.9 and a performance target of 0.8 in
[`lighthouserc.json`](lighthouserc.json), a bundle-size budget lives in
[`.size-limit.json`](.size-limit.json), and Fallow checks dead code, cycles,
and complexity drift on every commit.

## Quick start

```bash
pnpm install
pnpm setup:agents     # one time: external agentic toolkit
pnpm dev              # http://localhost:5173
pnpm verify           # typecheck, biome, fallow, tests with coverage, build, size
pnpm e2e              # behaviour map and axe accessibility scan (Playwright)
```

Requires Node 20 or higher and pnpm. See [`.nvmrc`](.nvmrc).

### Post-clone setup checklist

Some enforcement lives in platform settings and cannot be committed, so a fresh
repository has to finish this list before the gates truly block:

- [ ] **Require the `StyleProof` commit status in branch protection.** The
      visual gate posts a `StyleProof` status and a `<!-- styleproof-report -->`
      review comment, but a red status only blocks a merge once a
      branch-protection rule on `main` requires it. Add the rule under Settings
      → Branches → "Require status checks to pass", selecting `StyleProof` (see
      the operating notes in
      [`.agents/project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md)).
- [ ] **Also require the `PR quality` and CI status checks**, so the PR-body
      contract and the gate suite block merges too.
- [ ] **Keep `styleproof-approve.yml` on the default branch.** The approval
      workflow is an `issue_comment` workflow, so it only runs from `main`.
- [ ] **Turn on secret scanning and Dependabot** in the repository's security
      settings.

## Adopt it

For a new project, press **Use this template**, run `pnpm install` and
`pnpm setup:agents`, then build inside `src/features/*` using the templates in
[`.agents/templates/`](.agents/templates). The gates are live from the first
commit.

For a brownfield project, copy the scaffolding into the existing repo:

```
AGENTS.md  CLAUDE.md  .agents/  .claude/  .husky/  .github/  (workflows and dependabot)
biome.json  commitlint.config.ts  .fallowrc.jsonc  SECURITY.md
```

Then run `/pre-audit-setup` and the audits to see where the repo falls short,
and close the gaps one gate at a time, in the order above: behaviour map first,
optimise last. This is the same find, fix, and re-audit loop the committed
[`.architect-audits/`](.architect-audits) reports show on this repo.

## Every file, and why it is here

```
AGENTS.md / CLAUDE.md     Agent contract. Thin entry points into .agents/.
agents/openai.yaml        Vendor-neutral manifest; points at AGENTS.md and .agents/.
PROGRESS.md / TODO.md     Checkpoint log and forward-handoff work with acceptance criteria.
.agents/                  The repo's knowledge (read before writing).
  project/AGENTIC_INFRASTRUCTURE.md  How guidance, gates, workflows, and skills fit together.
  project/ARCHITECTURE.md   The pattern agents must follow.
  project/CONVENTIONS.md    Naming, imports, errors, state.
  project/DEFINITION_OF_DONE.md  "Done" means these gates are green.
  project/QUALITY_GATES.md  Which gate runs where, and which tool owns it.
  project/PR_QUALITY.md     Proof required before a PR is ready.
  project/TECH_STACK.md     One tool per concern, and what not to add.
  project/GLOSSARY.md       Shared language (pairs with graphify).
  decisions/                Decision records: why each constraint exists.
  templates/                Scaffolds for components, tests, E2E, StyleProof.
.claude/
  settings.json             Permission allowlist and PreToolUse hook.
  hooks/block-gate-bypass.sh  Refuses --no-verify. Gates are not optional.
  skills/                   This repo's own packaged processes.
    install-agentic-infrastructure/  Install repo guidance, hooks, CI, and PR proof.
    build-quality-gates/    Build pre-commit, pre-push, and CI gates.
    build-agent-guidance/   Build truthful AGENTS.md, CLAUDE.md, and .agents context.
    pr-quality-contract/    PR proof, CI status, risk, and handoff workflow.
    pr-inline-screenshot-proof/  Embed committed proof inline in the PR body.
.husky/                     pre-commit, commit-msg, pre-push gates.
.github/
  pull_request_template.md  Proof-backed PR handoff template.
  dependabot.yml            Weekly npm and GitHub Actions updates.
  workflows/
    ci.yml                  Quality, tests, build and size, e2e, security.
    pr-quality.yml          Validates the PR body and title (scripts/validate-pr-body.mjs).
    codeql.yml              CodeQL static analysis (security-events).
    lighthouse.yml          Performance and accessibility budget on PRs.
    styleproof.yml          Computed-style visual gate (PR head vs base).
    styleproof-approve.yml  Per-change visual sign-off on the default branch.
SECURITY.md                 Vulnerability disclosure policy.
biome.json                  Lint, format, import order (one tool).
commitlint.config.ts        Conventional Commits.
jest.config.ts / jest.setup.ts  Unit and component tests (RTL and jest-axe), coverage gate.
playwright.config.ts        One browser harness for E2E and StyleProof.
.size-limit.json            Bundle-size budget.
lighthouserc.json           Lighthouse budget (accessibility floor and performance).
.fallowrc.jsonc             Fallow config; ignores runtime-loaded plugins.
pnpm-workspace.yaml         pnpm settings: trusted builds and security overrides.
tsconfig.json               strict, with extra strictness; the first gate.
vite.config.ts              The runnable carrier.
scripts/
  setup-agentic-toolkit.sh  Installs ArchitectPlaybook, Fallow skills, graphify, GitNexus, Ponytail.
  fallow-audit.sh           Base-aware Fallow audit (catches new issues).
  secret-scan.sh            Staged secret scan (gitleaks, conditional).
  license-check.mjs         License-compliance gate (pnpm licenses and allow-list).
  validate-pr-body.mjs      Validates the PR body sections, proof, and title (pnpm validate:pr).
  verify-gates.sh           Local mirror of the CI gate suite.
docs/proof/                 Committed screenshot/video proof, embedded inline in PRs.
e2e/
  app.spec.ts               The behaviour map.
  accessibility.spec.ts     Real-browser axe scan (WCAG A and AA, including contrast).
  styleproof.spec.ts        StyleProof surfaces (computed-style capture).
src/features/threshold-counter/  The one small but real feature.
.architect-audits/          Committed ArchitectPlaybook reports (5 audits).
graphify-out/GRAPH_REPORT.md  Knowledge-graph report (god nodes, communities). Rebuild with graphify.
.gitnexus/                  Local execution-flow index. Rebuild with gitnexus analyze.
```

## The tools this builds on

| Tool | Role | Link |
| --- | --- | --- |
| **Fallow** | Code intelligence: dead code, cycles, complexity, drift | <https://github.com/fallow-rs/fallow> |
| **StyleProof** | Computed-style visual regression gate | <https://github.com/BenSheridanEdwards/styleproof> |
| **ArchitectPlaybook** | Repo health-check audits | <https://github.com/BenSheridanEdwards/ArchitectPlaybook> |
| **graphify** | Token-efficient codebase context for the audits | <https://graphify.net> |
| **GitNexus** | Local execution-flow and impact index | <https://github.com/abhigyanpatwari/GitNexus> |
| **Ponytail** | Shortest-working-diff discipline for coding and review tasks | local Codex plugin |

## License

[MIT](LICENSE).
