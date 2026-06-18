# Agentic Project Template

[![CI](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/ci.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/codeql.yml/badge.svg)](https://github.com/BenSheridanEdwards/AgenticProjectTemplate/actions/workflows/codeql.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A reference scaffold for agentic engineering.** It shows the files, gates, and
context that make AI-written code consistent and enterprise-grade — the
scaffolding we want in place when we start a new project, or when we land in a
brownfield one and want to shift how it is built.

It is **principles first** and **stack-agnostic**. The principles are the
product. TypeScript + React is just a small, runnable feature so you can see the
machinery actually fire — `pnpm verify` and watch every gate run on real code.

---

## The thesis

Agents write a lot of code, quickly. Left unconstrained, that means *fast
inconsistency*: every file a slightly different shape, standards applied only
where someone remembered to look. The answer is not to slow the agent down — it
is to make the standards **executable** and the context **explicit**, so the
right way is the only way that passes.

Four pillars do that. Each is a principle, and each maps to files in this repo.

### 1. Map behaviour with end-to-end tests

The contract of *what the product does* lives in
[`e2e/app.spec.ts`](e2e/app.spec.ts), driven through the real UI and asserted
via the accessibility tree. Because it is decoupled from implementation, an
agent can refactor freely and trust the map to catch any change in behaviour.
New behaviour is specified here first.

### 2. Enforce quality with gates, not good intentions

Every standard is an executable gate, run at the earliest point it can fail:

| Stage | Gate | Files |
| --- | --- | --- |
| **pre-commit** | type check · Biome (lint + format + imports) · Fallow code intelligence · staged secret scan | [`.husky/pre-commit`](.husky/pre-commit) |
| **commit-msg** | Conventional Commits | [`.husky/commit-msg`](.husky/commit-msg), [`commitlint.config.ts`](commitlint.config.ts) |
| **pre-push** | unit/component tests (coverage) · build smoke · E2E behaviour map (incl. axe a11y) | [`.husky/pre-push`](.husky/pre-push) |
| **CI** | all of the above + dependency & secret audit · CodeQL SAST · bundle-size budget · Lighthouse · **StyleProof** visual gate | [`.github/workflows/`](.github/workflows) |

Local hooks and CI run the *same* checks, so "works on my machine" and "passes
CI" converge. The one local command is `pnpm verify`.

### 3. Make context explicit — `AGENTS.md`, `CLAUDE.md`, and `.agents/`

So that the *way* code is written is consistent, the repo carries its own brain:

- [`AGENTS.md`](AGENTS.md) — the tool-agnostic operating contract (the
  [agents.md](https://agents.md) convention; write for the agent).
- [`CLAUDE.md`](CLAUDE.md) — the Claude-Code-specific layer; defers to
  `AGENTS.md`, adds skills, settings, and the audit slash-commands.
- [`.agents/`](.agents) — the single source of detail: architecture,
  conventions, Definition of Done, glossary, ADRs, and copy-from templates.

Root files stay thin and point inward, so there is exactly one place to maintain
when the way we work changes.

### 4. Package processes as skills

Repeatable processes are captured as skills so they run the same way every time:
[`.claude/skills/run-e2e-tests`](.claude/skills/run-e2e-tests) and
[`.claude/skills/write-unit-tests`](.claude/skills/write-unit-tests). Repo-health
audits come from the external [ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook).

---

## Every file, and why it earns its place

```
AGENTS.md / CLAUDE.md     Agent contract. Thin entry points → .agents/.
.agents/                  The repo's brain (read before writing).
  project/ARCHITECTURE.md   The pattern agents MUST follow.
  project/CONVENTIONS.md    Naming, imports, errors, state.
  project/DEFINITION_OF_DONE.md  "Done" = these gates are green.
  project/TECH_STACK.md     One tool per concern; what NOT to add.
  project/GLOSSARY.md       Ubiquitous language (pairs with graphify).
  decisions/                ADRs — why each constraint exists.
  templates/                Scaffolds for components, tests, E2E, StyleProof.
.claude/
  settings.json             Permission allowlist + PreToolUse hook.
  hooks/block-gate-bypass.sh  Refuses --no-verify. Gates aren't optional.
  skills/                   This repo's own packaged processes.
.husky/                     pre-commit · commit-msg · pre-push gates.
.github/
  dependabot.yml            Weekly npm + GitHub-Actions dependency updates.
  workflows/
    ci.yml                  Quality · tests · build+size · e2e · security.
    codeql.yml              CodeQL SAST (security-events).
    lighthouse.yml          Performance + a11y budget on PRs.
    styleproof.yml          Computed-style visual gate (PR head vs base).
    styleproof-approve.yml  Per-change visual sign-off (on default branch).
SECURITY.md                 Vulnerability-disclosure policy.
biome.json                  Lint + format + import order (one tool).
commitlint.config.ts        Conventional Commits.
jest.config.ts / jest.setup.ts  Unit + component tests (RTL + jest-axe), coverage gate.
playwright.config.ts        One browser harness for E2E + StyleProof.
.size-limit.json            Bundle-size budget.
lighthouserc.json           Lighthouse CI budget (a11y floor + perf).
.fallowrc.jsonc             Fallow config — ignores runtime-loaded plugins.
pnpm-workspace.yaml         pnpm settings — trusted builds + security overrides.
tsconfig.json               strict + extra strictness; the first gate.
vite.config.ts              The runnable carrier.
scripts/
  setup-agentic-toolkit.sh  Installs ArchitectPlaybook, Fallow skills, graphify.
  fallow-audit.sh           Base-aware Fallow audit (introduced-issue gate).
  secret-scan.sh            Staged secret scan (gitleaks, conditional).
  verify-gates.sh           Local mirror of the CI gate suite.
e2e/
  app.spec.ts               The behaviour map.
  accessibility.spec.ts     Real-browser axe scan (WCAG A/AA, incl. contrast).
  styleproof.spec.ts        StyleProof surfaces (computed-style capture).
src/features/threshold-counter/  The one minimal-but-real feature.
.architect-audits/          Committed ArchitectPlaybook reports (5 audits, 0 violations).
graphify-out/GRAPH_REPORT.md  Knowledge-graph report (god nodes, communities) — rebuild with graphify.
```

---

## What this repo is designed to showcase

**1 · Health-check a repo.** Run the
[ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
audits to grade architecture, agentic setup, quality gates, and non-functionals
— the same lens we apply when assessing any codebase:

```bash
pnpm setup:agents      # installs the playbook + Fallow skills, checks graphify
# then, in Claude Code:
/pre-audit-setup
/agentic-audit  /quality-gates-audit  /architecture-audit  /testing-audit  /security-audit
```

This template is built to score well on those audits — it *is* what "good" looks
like through that lens. The proof is committed: the
[`.architect-audits/`](.architect-audits) reports are real, graph-enriched runs
of all five audits with **zero violations** across architecture, testing,
agentic setup, quality gates, and security. (They were not always green — the
first pass found real issues; the committed history shows the find → fix →
re-audit loop.)

**2 · Keep agent output enterprise-grade.** The context files and gates make an
agent's code follow the patterns in
[`.agents/project/ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md) and pass the
[Definition of Done](.agents/project/DEFINITION_OF_DONE.md) — automatically, on
every change, whoever or whatever wrote it.

---

## Quick start

```bash
pnpm install
pnpm setup:agents     # one-time: external agentic toolkit
pnpm dev              # http://localhost:5173
pnpm verify           # typecheck → biome → fallow → tests+coverage → build → size
pnpm e2e              # behaviour map + axe a11y scan (Playwright)
```

Requires **Node ≥ 20** and **pnpm**. See [`.nvmrc`](.nvmrc).

---

## Adopt it

**Greenfield** — clone, `pnpm install`, `pnpm setup:agents`, then build inside
`src/features/*` using the templates. The gates are live from the first commit.

**Brownfield** — copy the scaffolding into the existing repo:

```
AGENTS.md  CLAUDE.md  .agents/  .claude/  .husky/  .github/  (workflows + dependabot)
biome.json  commitlint.config.ts  .fallowrc.jsonc  SECURITY.md
```

Then run `/pre-audit-setup` and the audits to see where the repo falls short of
the standards, and close the gaps gate by gate — exactly the find → fix →
re-audit loop the committed [`.architect-audits/`](.architect-audits) reports
demonstrate on this repo.

---

## The ecosystem this builds on

| Tool | Role | Link |
| --- | --- | --- |
| **Fallow** | Code intelligence (dead code, cycles, complexity, drift) | <https://github.com/fallow-rs/fallow> |
| **StyleProof** | Computed-style visual regression gate | <https://github.com/BenSheridanEdwards/styleproof> |
| **ArchitectPlaybook** | Repo health-check audit skills | <https://github.com/BenSheridanEdwards/ArchitectPlaybook> |
| **graphify** | Codebase knowledge graph | <https://graphify.net> |

## License

[MIT](LICENSE).
