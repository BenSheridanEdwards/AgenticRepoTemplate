# Agentic Repo Template

[![CI](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/ci.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/codeql.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/workflows/codeql.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A template repository that installs a complete method for building software with
agents: the context files, quality gates, definition of done, and PR contract
that make AI-written code consistent, proven, and safe to merge. The principles
come first and the stack does not matter. TypeScript, React and tRPC are here only as
a small, runnable greeting feature (a name goes in, the api greets it back), so
every gate fires on real code.

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
   the claim. A passing build and green types are necessary, and proof
   completes them. Every user-visible change ships screenshots and video, inline in
   the PR.
4. **Agents must see.** An agent QAs the user experience and validates its own
   work by looking at screenshots. Vision is a requirement of the
   proof loop, not an optimisation.

And one fixed rule: **a human merges and a human deploys.**
Humans hold both ends of the loop, the intent and the merge. Every line is
owned by a named engineer, whoever or whatever wrote it.

## The method

The same order every time, whether the repository is new or twenty years old:

1. **Map the behaviour first.** Write the user-visible contracts down as
   end-to-end tests. Nothing else is safe to assess or change without them.
2. **Install the agentic infrastructure.** The context files, skills, hooks,
   gates, and PR contract in this template. This is the base plate, not the
   starting point; it locks in each later fix so it stays fixed.
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

- [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) are the only agent
  files at the root, and both are pointers. `CLAUDE.md` points to `AGENTS.md`
  ([agents.md](https://agents.md) convention), which points to the start-here
  guide.
- [`.agents/README.md`](.agents/README.md) is the start-here guide: the
  tool-agnostic operating contract, with golden rules, commands, and a map of
  the rest. [`CLAUDE_CODE.md`](.agents/CLAUDE_CODE.md) adds the Claude Code
  layer, and [`openai.yaml`](.agents/openai.yaml) lists the same entry points
  for other vendors, so the method is not welded to one AI supplier.
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
- [`PROGRESS.md`](.agents/PROGRESS.md) and [`TODO.md`](.agents/TODO.md) are the memory layer:
  checkpointed work with verification status, and forward handoffs with
  acceptance criteria. They give agents audit-grade memory across sessions.

The root files stay short and point inward, so there is exactly one place to
update when the way you work changes. The standard ships as files, not written
guidelines: adopt it by copying these files rather than retyping them, because
retyped standards drift.

### The quality gates: standards that always run

Feedback speed determines placement. Fast checks run early, expensive checks
run later, and local hooks mirror CI so "works on my machine" and "passes CI"
mean the same thing. A green PR means "this change introduced nothing new".

| Stage | What it enforces | Where |
| --- | --- | --- |
| **On commit** | The branch contains main, type safety, consistent style and imports, code intelligence (dead code, cycles, complexity), no secrets committed, and the commit-message standard | [`.husky/pre-commit`](.husky/pre-commit), [`.husky/commit-msg`](.husky/commit-msg) |
| **On push** | The branch contains the latest main, then everything `pnpm verify` checks (types, lint, policy, architecture, logic tested with a coverage floor, a production build, bundle size), the behaviour map (E2E), and accessibility. Nothing leaves the machine until these are green, including a clean merge from main | [`.husky/pre-push`](.husky/pre-push) |
| **In CI** | Everything before, re-run on a clean checkout, plus dependency, secret, and license audits, static security analysis, a bundle-size budget, performance and accessibility budgets, and PR-body validation | [`.github/workflows/`](.github/workflows) |

The gates always run. A
[PreToolUse hook](.claude/hooks/block-gate-bypass.sh) refuses the common ways to
skip the git hooks (`--no-verify`, `git commit -n`, `HUSKY=0`, and rewrites of
`core.hooksPath`, git aliases, or config includes), CI on a clean checkout is
the backstop for the rest, and weakening type, lint, or test configuration to turn red green is a named
violation. Honest red beats dishonest green.

### The definition of done: done is mechanical

The [Definition of Done](.agents/project/DEFINITION_OF_DONE.md) removes
judgment from the word "done". A task is finished when the gates are green and
the proof is present, and at no other time. Every item on the list is
mechanically checkable, so an agent honestly reports a task complete only
once `pnpm verify` and `pnpm e2e` pass, no matter who or what wrote the code.

### The PR contract: proof, not claims

The [pull request template](.github/pull_request_template.md) requires four
sections in order: why the change exists, what changed, behavioural proof, and
a verification summary listing exact commands and results, separating
pre-existing failures from introduced ones. The contract has teeth:
[`pr-quality.yml`](.github/workflows/pr-quality.yml) runs
[`scripts/validate-pr-body.mjs`](scripts/validate-pr-body.mjs) on every PR
event and rejects missing sections, placeholders, unrenderable or linked
images, `Not applicable` without a reason, non-conventional titles, branch
names outside `<type>/<short-kebab-summary>`, and a `- Head commit:` that is
not the PR head.

Proof means committed evidence. Screenshots live under
[`docs/proof/`](docs/proof) on the PR branch and are embedded inline in the PR
body; bare links, local paths, and "see attached" are not proof. Flows with
motion include video. If no rendered proof applies, the PR says `Not
applicable` with the technical reason. And every bug fix ships, in the same
change, with the test that would have caught it, asserting the user-visible
symptom. A reviewer reads exactly what was verified.

### Visual style checking

The behaviour map in [`apps/web/e2e/greeting.spec.ts`](apps/web/e2e/greeting.spec.ts) drives the product
through the real interface using roles and visible text. Visual style checking
returns once [StyleProof](https://github.com/BenSheridanEdwards/styleproof) is
fixed.

### Skills: processes with exactly one job

A skill is a documented, executable process with exactly one job; if two skills
could be selected for the same reason, rename or split them. This repo ships
its own under [`.claude/skills/`](.claude/skills): the PR quality contract, the
inline-screenshot proof law, and installers for the guidance and gate layers.
Each carries a vendor-neutral manifest.

## Truth rules

Binding on this repository and any repository built from it:

- Claim a gate only when its hook, script, or workflow exists and runs on a
  clean checkout.
- Describe current architecture as fact, and label aspirations as targets.
- Report "installed" once the command, hook, or workflow runs; filesystem
  presence alone is a claim.
- Claim enforcement for a gate that depends on platform settings once those
  settings are on. "The repo is right" and "the repo is enforced" are
  different claims, which is why the post-clone checklist below exists.

## The audit loop: health has an order

Health does not start with the agentic setup. It starts with the behaviour map
and end-to-end tests, because nothing else is safe to assess or change without
them. Then structure, then maintainability, then security, then the
non-functionals, in that order, because a weak floor makes everything above it
shaky. The agentic infrastructure is not the headline; it is what locks each
fix in so it stays fixed.

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
in the reports themselves and in [`TODO.md`](.agents/TODO.md). Honest history is a
feature; the loop is the point, not the passing grade at the end.

Non-functionals are held continuously, not only at audit time: Lighthouse keeps
an accessibility floor of 0.9 and a performance target of 0.8 (median of three
runs) in [`lighthouserc.json`](lighthouserc.json), a bundle-size budget lives in
[`.size-limit.json`](.size-limit.json), and Fallow checks dead code, cycles,
and complexity drift on every commit. Fallow also owns the architecture graph,
gate, the architecture contract's rule pack, and role diagram, all read from
`.fallowrc.jsonc`, and API Extractor keeps a committed report of each public
module's exports, per package.

## Quick start

```bash
pnpm install
pnpm setup:agents     # one time: external agentic toolkit
pnpm dev              # web at http://localhost:5173 and api at :3001
pnpm lint:policy      # ESLint policy, React hooks, and React Compiler rules
pnpm verify           # typecheck, biome, eslint, react doctor, fallow, architecture, tests with coverage, build, size
pnpm e2e              # behaviour map and axe accessibility scan (Playwright)
```

Requires Node 22.18 or higher and pnpm. See [`.nvmrc`](.nvmrc). If `nvm use`
picks an installed Node 22 older than 22.18, run `nvm install`.

### Post-clone setup checklist

Workflow files report results; platform settings decide whether they block a
merge. Follow [hosted security and merge enforcement](docs/hosted-security.md)
before claiming protection is installed:

- [ ] **Confirm hosted prerequisites for the destination repository.** Public
      repositories qualify for branch protection and code scanning; private
      repositories need an eligible plan and Code Security entitlement.
- [ ] **Require the exact checks in [the inventory](docs/required-gates.md), plus
      `enforcement-approval`,** through an authorised maintainer, then verify a
      failing check actually prevents merging.
- [ ] **Assess native secret scanning and Dependabot settings separately.**
      Gitleaks and `pnpm audit` run in CI.
      Add `.github/dependabot.yml` to configure scheduled
      Dependabot version updates; this template currently provides CI auditing.

## Adopt it

For a new project, press **Use this template**, run `pnpm install` and
`pnpm setup:agents`, then build routes in `apps/web/src/routes/*` and api
features in `apps/api/src/features/*` using the templates in
[`.agents/templates/`](.agents/templates) and the greeting feature as the model
([`.agents/project/ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md)). Local hooks and
workflow definitions are included; hosted prerequisites and merge enforcement
still need the post-clone checks above.

For a brownfield project, copy the scaffolding into the existing repo:

```
AGENTS.md  CLAUDE.md  .agents/  .claude/  .husky/  .github/  (workflows and PR template)
biome.json  eslint.config.js  commitlint.config.ts  .fallowrc.jsonc  SECURITY.md
```

Then run `/pre-audit-setup` and the audits to see where the repo falls short,
and close the gaps one gate at a time, in the order above: behaviour map first,
optimise last. This is the same find, fix, and re-audit loop the committed
[`.architect-audits/`](.architect-audits) reports show on this repo.

## Every file, and why it is here

```
AGENTS.md / CLAUDE.md     Pointers: CLAUDE.md → AGENTS.md → .agents/README.md.
.agents/                  Every agent doc (read before writing).
  README.md                 Start here: commands, golden rules, and the map.
  CLAUDE_CODE.md            Claude Code skills, settings, hooks, and tooling.
  GITNEXUS.md               GitNexus impact analysis and change detection.
  NORTH_STAR.md             Where the repo is heading and why.
  PROGRESS.md / TODO.md     Checkpoint log and forward-handoff work with acceptance criteria.
  openai.yaml               Vendor-neutral manifest of the same entry points.
  project/AGENTIC_INFRASTRUCTURE.md  How guidance, gates, workflows, and skills fit together.
  project/ARCHITECTURE.md   The pattern agents must follow.
  project/CONVENTIONS.md    Naming, imports, errors, state.
  project/DEFINITION_OF_DONE.md  "Done" means these gates are green.
  project/QUALITY_GATES.md  Which gate runs where, and which tool owns it.
  project/PR_QUALITY.md     Proof required before a PR is ready.
  project/TECH_STACK.md     One tool per concern, and what not to add.
  project/GLOSSARY.md       Shared language (pairs with graphify).
  decisions/                Decision records: why each constraint exists.
  templates/                Scaffolds for components, tests, and E2E.
.claude/
  settings.json             Permission allowlist and PreToolUse hook.
  hooks/block-gate-bypass.sh  Refuses common hook bypasses. CI is the backstop.
  skills/                   This repo's own packaged processes (some vendored).
    build-agent-guidance/           Create or update AGENTS.md, CLAUDE.md, and .agents guidance.
    build-quality-gates/            Create or update Husky, CI, and the lint/type/test gate matrix.
    gitnexus/                       GitNexus impact analysis and change detection over the code graph.
    install-agentic-infrastructure/ Install or upgrade the guidance, gate, and PR-proof layers.
    pr-inline-screenshot-proof/     Render screenshots, video, and proof inline in the PR body.
    pr-quality-contract/            Turn the Definition of Done into a proof-backed PR body.
    run-e2e-tests/                  Map a behaviour to a Playwright E2E test and run it against the app.
    show-me/                        Explain the current topic with diagrams and focused HTML artifacts.
    verify-agentic-template/        Drive the app in real Chromium and capture PR proof.
    write-unit-tests/               Write Jest + RTL tests that assert through the accessibility tree.
.husky/                     pre-commit, commit-msg, pre-push gates.
.github/
  pull_request_template.md  Proof-backed PR handoff template.
  workflows/
    ci.yml                  Quality, tests, build and size, e2e, security.
    pr-quality.yml          Validates the PR body and title (scripts/validate-pr-body.mjs).
    codeql.yml              CodeQL static analysis (security-events).
    lighthouse.yml          Performance and accessibility budget on UI-relevant PRs.
    enforcement-approval.yml  Ben's sign-off on changes that loosen enforcement (main's copy judges each PR).
SECURITY.md                 Vulnerability disclosure policy.
biome.json                  Format, import order, and general lint.
eslint.config.js            Policy, React hooks, React Compiler, and React Doctor rules.
tooling/eslint-plugin-policy.js  The repository's own ESLint policy rules (ADR 0019).
commitlint.config.ts        Conventional Commits.
jest.config.ts / jest.setup.ts  Unit and component tests (RTL and jest-axe), coverage gate.
playwright.config.ts        Browser harness for the E2E behaviour map: one project and two servers per result.
.size-limit.json            Bundle-size budget.
lighthouserc.json           Lighthouse budget (accessibility floor and performance).
.fallowrc.jsonc             Fallow config: the role zones and rules, the contract rule pack, plus runtime-loaded plugins.
pnpm-workspace.yaml         Workspace packages (apps/*, packages/*, showcase/*/web, showcase/*/api), trusted builds, and security overrides.
vendor/                     Vendored dependency patches (braces, extract-zip), wired via pnpm overrides until upstream ships fixes.
tsconfig.base.json          strict, with extra strictness; the first gate.
tsconfig.json               The browser program: web packages and packages/ui.
tsconfig.node.json          The Node program for root configs, Vite configs and e2e specs.
tsconfig.api.json           The api program: api packages, .ts import extensions, erasable syntax only.
tsconfig.domain.json        The domain program: api domain modules with no Node types.
tooling/
  results.mjs               Lists the results (apps/ and each showcase/<id>/) for the per-result gates.
  architecture/contract.rules.jsonc  The contract's banned imports, calls and effects per role.
  architecture/contract.mjs  The roles and directions of .fallowrc.jsonc as data.
  architecture/graph.mjs    Reads Fallow's import graph, the files and the results.
  architecture/diagram.mjs  Writes docs/architecture/roles.mmd and each result's architecture.mmd.
  architecture/structure.mjs  Validates every result's structure against the contract.
  trial/                    The Todo trial harness: runs a trial, checks acceptance, records evidence, and compares results.
scripts/
  setup-agentic-toolkit.sh  Installs ArchitectPlaybook, Fallow skills, graphify, GitNexus, Ponytail.
  fallow-audit.sh           Base-aware Fallow audit (catches new issues).
  api-report.mjs            Writes and checks each package's etc/*.api.md API Extractor reports.
  secret-scan.sh            Staged secret scan (gitleaks, conditional).
  license-check.mjs         License-compliance gate (pnpm licenses and allow-list).
  check-suppressions.mjs    Every type suppression is a @ts-expect-error with a reason.
  validate-pr-body.mjs      Validates the PR body sections, proof, and title (pnpm validate:pr).
  enforcement-approval.mjs  Finds loosening changes, keeps the head-bound sign-off comment, sets the status.
  required-gates.mjs        The required-check contract and the Required gates decision.
  verify-gates.sh           Local mirror of the CI gate suite.
docs/architecture/roles.mmd  Generated canonical role diagram (pnpm arch:diagram).
docs/required-gates.md      Generated required-check inventory (pnpm gates:inventory).
docs/proof/                 Committed screenshot/video proof, embedded inline in PRs.
docs/prd/                   Committed PRDs: each states a feature's intent and links every behaviour to its E2E test (ADR 0045).
docs/trials/                Committed Todo-trial records, redacted agent streams, patches, and the comparison report.
apps/                       The reference result. Root configs own every gate.
  architecture.mmd          The reference result's generated diagram (pnpm arch:diagram).
  web/                      @repo/web: the Vite + React app.
    index.html              The page shell Vite serves.
    vite.config.ts          The runnable carrier; proxies /trpc to the api in dev and preview.
    src/main.tsx, App.tsx   Composition root: mounts the greeting route inside ApiProvider.
    src/api-client/         The one door to the api: useTrpc, ApiProvider, TestApiProvider.
    src/routes/greeting/    The greeting page, its form, hooks, and Effect Schema form schema.
    e2e/
      greeting.spec.ts      The behaviour map: the greeting journeys through the real api.
      accessibility.spec.ts Real-browser axe scan (WCAG A and AA, including contrast).
    etc/                    Generated API Extractor reports (pnpm api:report).
  api/                      @repo/api: the tRPC api, run by Node's native type stripping.
    src/server.ts           The HTTP server on PORT (default 3001), at /trpc.
    src/router.ts           appRouter and the AppRouter type the web imports.
    src/trpc.ts             The tRPC base: router, procedure, createCallerFactory.
    src/features/greeting/  index, procedures, application and domain for greeting.greet.
    etc/                    Generated API Extractor reports.
packages/ui/                @repo/ui: Button, TextField, and styles.css, with no business logic.
showcase/<id>/              Where each generated trial result goes, with the same web/ and api/ shape (`todo-01` to `todo-03` by Claude, `todo-codex-01` to `todo-codex-03` by Codex).
.architect-audits/          Committed ArchitectPlaybook reports (5 audits).
graphify-out/               Generated knowledge-graph output (god nodes, communities). Ignored; rebuild with graphify or /pre-audit-setup.
.gitnexus/                  Local execution-flow index. Rebuild with gitnexus analyze.
```

## The tools this builds on

| Tool | Role | Link |
| --- | --- | --- |
| **Fallow** | Code intelligence: dead code, cycles, complexity, architecture gate and role diagram | <https://github.com/fallow-rs/fallow> |
| **ArchitectPlaybook** | Repo health-check audits | <https://github.com/BenSheridanEdwards/ArchitectPlaybook> |
| **graphify** | Token-efficient codebase context for the audits | <https://graphify.net> |
| **GitNexus** | Local execution-flow and impact index | <https://github.com/abhigyanpatwari/GitNexus> |
| **Ponytail** | Shortest-working-diff discipline for coding and review tasks | local Codex plugin |

## License

[MIT](LICENSE).
