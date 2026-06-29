# Agentic Project Template

[![CI](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/ci.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/codeql.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/codeql.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A reference scaffold for building software with agents. It holds the files,
gates, and context that keep AI-written code consistent and enterprise-grade,
whether you are starting a new project or working to improve a brownfield one.

The principles come first and the stack does not matter. TypeScript and React
are here only as a small, runnable feature, so you can run `pnpm verify` and
watch every gate run on real code.

## The idea

Agents write a lot of code, and they write it fast. Without guardrails, that
speed produces inconsistency: every file a slightly different shape, and
standards applied only where someone thought to look. The fix is not to slow the
agent down. The fix is to make the standards executable and the context
explicit, so the correct way to write code is also the only way that passes.

## Three questions this repo answers

This template is built to answer three questions you can ask of any engineering
team. Each one maps to real files and runnable proof in this repo.

### Q1. How do I get enterprise-grade pull requests from agents?

There are two parts to this. Give the agent the team's standards before it
writes, and make those standards impossible to skip after it writes.

First, make the context explicit. The repo holds its own knowledge, so the agent
inherits the team's best thinking, the layout of the project, and the things not
to do:

- [`AGENTS.md`](AGENTS.md) is the tool-agnostic operating contract, written for
  the agent. It covers the golden rules, the commands to run, and where context
  lives. It follows the [agents.md](https://agents.md) convention.
- [`CLAUDE.md`](CLAUDE.md) is the Claude-specific layer. It defers to
  `AGENTS.md` and adds skills and the audit commands.
- [`.agents/`](.agents) is the single source of detail. It holds the
  [agentic infrastructure layer model](.agents/project/AGENTIC_INFRASTRUCTURE.md), the
  [architecture pattern](.agents/project/ARCHITECTURE.md) agents must follow, the
  [conventions](.agents/project/CONVENTIONS.md) for naming, imports, errors, and
  state, the [Definition of Done](.agents/project/DEFINITION_OF_DONE.md), the
  [quality-gate matrix](.agents/project/QUALITY_GATES.md), the
  [PR quality contract](.agents/project/PR_QUALITY.md), the
  [tech stack](.agents/project/TECH_STACK.md) and what not to add to it, the
  [glossary](.agents/project/GLOSSARY.md), the [decision records](.agents/decisions)
  that explain why each rule exists, and [templates](.agents/templates) to copy
  from.

The root files stay short and point inward, so there is exactly one place to
update when the way you work changes.

Second, enforce the standards with gates rather than good intentions. Every
standard is an executable gate, and each one runs at the earliest point it can
fail:

| Stage | What it enforces | Where |
| --- | --- | --- |
| **On commit** | Type safety, consistent style and imports, code intelligence (dead code, cycles), no secrets committed, and the commit-message standard | [`.husky/pre-commit`](.husky/pre-commit), [`.husky/commit-msg`](.husky/commit-msg) |
| **On push** | Logic tested with a coverage floor, a production build, the behaviour map (E2E), and accessibility | [`.husky/pre-push`](.husky/pre-push) |
| **In CI** | Everything before re-run on a clean checkout, plus dependency, secret, and license audits, static security analysis, a bundle-size budget, a performance and accessibility budget, and visual regression | [`.github/workflows/`](.github/workflows) |

A [PreToolUse hook](.claude/hooks/block-gate-bypass.sh) refuses any attempt to
use `--no-verify`, so the gates cannot be skipped. The local hooks and CI run the
same checks, so "works on my machine" and "passes CI" mean the same thing.
"Done" is defined as "the gates are green" (see the
[Definition of Done](.agents/project/DEFINITION_OF_DONE.md)), so an agent cannot
honestly report a task finished until `pnpm verify` and `pnpm e2e` pass, no
matter who or what wrote the code.

PRs then carry that proof into review. The
[PR quality contract](.agents/project/PR_QUALITY.md) and
[pull request template](.github/pull_request_template.md) require exact local
commands, visual proof or an explicit `N/A`, latest-sha CI status, risk, and
rollback. A reviewer should never have to guess what was actually verified.

The catch is that your context files and your codebase have to speak the same
language. If the foundations hold three different patterns while `AGENTS.md`
defines one, the agent struggles to remember which it is meant to follow, and the
mess wins. So before the gates and the context can do their job, the foundations
have to be fixed, and that starts with a health check.

### Q2. How do I check the health of an enterprise codebase?

Health has an order, and it does not start with the agentic setup. It starts
with the behaviour map and end-to-end tests, because nothing else is safe to
assess or change without them. Then the architecture, then maintainability and
readability, then security, then the non-functionals. You work each layer in
that order, because a weak floor makes everything above it shaky. The agentic
infrastructure is not the headline here. It is what locks each fix in so it
cannot regress.

Consistency is the thing health is really measuring. If the codebase has three
fetching patterns and three ways to style an element, the context window an agent
works from is 90% mess and 10% intent, and it follows the mess, because the code
it reads is the largest and the last context it sees. No `AGENTS.md` outvotes an
inconsistent codebase. So the work is making the code consistent, foundation
first; the instructions only take once the code backs them up.

This repo grades itself with the
[ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
audits and commits the reports as proof in
[`.architect-audits/`](.architect-audits):

```bash
pnpm setup:agents      # installs the playbook and Fallow skills
# then, in Claude Code:
/pre-audit-setup
/testing-audit  /architecture-audit  /security-audit  /quality-gates-audit  /agentic-audit
```

The layers, audited from the foundation up:

1. **Behaviour and E2E.** What the product does, mapped through the UI by role
   and visible text. In this repo: Priority-1 selector ratio 100%, getByTestId 0%.
2. **Architecture.** Boundaries, coupling, god modules, cycles, orphans. In this
   repo: clean on every check it can assess, with 0 cycles and 0 orphans.
3. **Maintainability and readability.** One consistent pattern, low complexity, no
   dead code. In this repo: a consistent feature pattern, Fallow clean.
4. **Security.** Taint flow, static analysis, secrets, dependencies. In this repo:
   a clean code baseline, with CodeQL, Dependabot, and a secret scan in place.
5. **Non-functionals and gates.** Performance and accessibility budgets, bundle
   size, and the gates that hold them. In this repo: strong, with a few deliberate
   choices noted below.

Beneath all five sits the agentic infrastructure, the context files, gates, and
definition of done that lock each layer so it cannot regress (26 checks present,
0 violations). It is the base plate, not the starting point.

The audits run against a model of the codebase built by
[graphify](https://graphify.net), which keeps that context token-efficient, so
checks like "no circular dependencies" and "no god module" are computed from the
real structure rather than asserted. The graph is plumbing, not the point; the
point is the order of the layers above.

A few notes worth knowing before you present the grades:

- The audits use their own words. "Zero violations" is exactly true, because no
  check is graded a violation, but it does not mean everything is green.
- The quality-gates audit grades three pre-commit checks as misconfigured (Biome
  runs through `biome check --staged` rather than `lint-staged`, and the type
  check covers the whole project rather than only staged files) and two pre-push
  checks as missing by design (the full type check and lint are owned by
  pre-commit and CI). These are deliberate, documented trade-offs.
- That same report flags `license-compliance-check` as missing. The repo has
  since added [`scripts/license-check.mjs`](scripts/license-check.mjs) (run with
  `pnpm license:check`), so a fresh run closes that gap.
- The architecture audit leaves two checks marked missing because there is no
  second feature yet, so there is no cross-feature coupling or `src/shared/`
  layer to measure. That is a limit of scale, not a defect.

This is the agentic audit loop: run the audits, fix what they surface, then run
them again, making progress each pass and learning what changed since the last.
The architecture audit reads your intention files in `.agents/` as its north
star, and falls back to opinionated defaults where you have not set one. So the
grade is measured against the standard you defined, not a generic checklist.

The reports were not always green. The first run found real problems: missing
static analysis, a live `tmp` advisory, and weaker test selectors. The committed
history shows each one being closed. The loop is the point, not the passing grade
at the end.

Non-functionals and code hygiene are checked continuously, not only at audit
time. Lighthouse holds an accessibility floor of 0.9 and a performance target of
0.8 in [`lighthouserc.json`](lighthouserc.json), there is a bundle-size budget in
[`.size-limit.json`](.size-limit.json), and Fallow checks for dead code, cycles,
and complexity drift on every commit.

### Q3. How do I move a legacy brownfield codebase to modern enterprise-grade?

You do not start by refactoring. The shift has an order, and each step earns the
next:

1. **Set the safety net and the target.** Before touching a line of code, map the
   behaviours with tests, stand up the quality gates, and add visual regression
   testing. Then define the ideal architecture, patterns, and conventions in
   [`.agents/`](.agents) and set the [definition of done](.agents/project/DEFINITION_OF_DONE.md).
2. **Refactor with confidence.** Once you are sure you will not break the user
   experience, shift the internals toward the ideal pattern.
3. **Tighten and simplify.** Reduce and lower complexity. Do we need this? Can it
   be simpler?
4. **Prune and upgrade dependencies.** Audit what you depend on, remove what is
   unused, upgrade the rest.
5. **Optimise.** Performance, accessibility, and scalability come last. They are
   unlocked because the foundations are set and held in place.

The safety net in step 1 is what makes the rest safe. The behaviour map in
[`e2e/app.spec.ts`](e2e/app.spec.ts) is the contract for what the product does,
driven through the real interface and checked through the accessibility tree, so
it is deliberately separate from the implementation. It walks the counter from
Healthy, to Approaching limit, to At capacity, and back to a reset, using only
roles and visible text. Beside it, the visual gate in
[`e2e/styleproof.spec.ts`](e2e/styleproof.spec.ts), built on
[StyleProof](https://github.com/BenSheridanEdwards/styleproof), reads the
browser's computed styles and compares the pull request against its base branch
at three widths (1280, 768, and 390). It catches forced hover and focus states,
rules that only apply between breakpoints, and sub-pixel drift that pixel
snapshots miss.

With behaviour held by the end-to-end map and the look held by StyleProof, the
internals are free to be reshaped to match
[`ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md). Optimising before that
foundation is consistent only bakes the mess in deeper, which is why the order is
not negotiable. The agentic infrastructure locks each gain in place so the
codebase does not drift back, and the
[`.architect-audits/`](.architect-audits) loop measures the gap closing on each
pass.

## Every file, and why it is here

```
AGENTS.md / CLAUDE.md     Agent contract. Thin entry points into .agents/.
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
.husky/                     pre-commit, commit-msg, pre-push gates.
.github/
  pull_request_template.md  Proof-backed PR handoff template.
  dependabot.yml            Weekly npm and GitHub Actions updates.
  workflows/
    ci.yml                  Quality, tests, build and size, e2e, security.
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
  setup-agentic-toolkit.sh  Installs ArchitectPlaybook, Fallow skills, graphify.
  fallow-audit.sh           Base-aware Fallow audit (catches new issues).
  secret-scan.sh            Staged secret scan (gitleaks, conditional).
  license-check.mjs         License-compliance gate (pnpm licenses and allow-list).
  verify-gates.sh           Local mirror of the CI gate suite.
e2e/
  app.spec.ts               The behaviour map.
  accessibility.spec.ts     Real-browser axe scan (WCAG A and AA, including contrast).
  styleproof.spec.ts        StyleProof surfaces (computed-style capture).
src/features/threshold-counter/  The one small but real feature.
.architect-audits/          Committed ArchitectPlaybook reports (5 audits).
graphify-out/GRAPH_REPORT.md  Knowledge-graph report (god nodes, communities). Rebuild with graphify.
```

## Quick start

```bash
pnpm install
pnpm setup:agents     # one time: external agentic toolkit
pnpm dev              # http://localhost:5173
pnpm verify           # typecheck, biome, fallow, tests with coverage, build, size
pnpm e2e              # behaviour map and axe accessibility scan (Playwright)
```

Requires Node 20 or higher and pnpm. See [`.nvmrc`](.nvmrc).

## Adopt it

For a new project, clone the repo, run `pnpm install` and `pnpm setup:agents`,
then build inside `src/features/*` using the templates. The gates are live from
the first commit.

For a brownfield project, copy the scaffolding into the existing repo:

```
AGENTS.md  CLAUDE.md  .agents/  .claude/  .husky/  .github/  (workflows and dependabot)
biome.json  commitlint.config.ts  .fallowrc.jsonc  SECURITY.md
```

Then run `/pre-audit-setup` and the audits to see where the repo falls short of
the standards, and close the gaps one gate at a time. This is the same find, fix,
and re-audit loop that the committed [`.architect-audits/`](.architect-audits)
reports show on this repo.

## The tools this builds on

| Tool | Role | Link |
| --- | --- | --- |
| **Fallow** | Code intelligence: dead code, cycles, complexity, drift | <https://github.com/fallow-rs/fallow> |
| **StyleProof** | Computed-style visual regression gate | <https://github.com/BenSheridanEdwards/styleproof> |
| **ArchitectPlaybook** | Repo health-check audits | <https://github.com/BenSheridanEdwards/ArchitectPlaybook> |
| **graphify** | Token-efficient codebase context for the audits | <https://graphify.net> |

## License

[MIT](LICENSE).
