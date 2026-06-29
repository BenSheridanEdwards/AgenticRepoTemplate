# Tech stack — one tool per concern

The point of this list is not the tools; it is that **each concern has exactly
one owner**. An agent never has to guess which tool to reach for, and never adds
a second tool that does the same job a different way. Adding or swapping a tool
is an ADR-level decision. See [`QUALITY_GATES.md`](QUALITY_GATES.md) for where
each owner runs locally and in CI.

| Concern | Owner | Notes |
| --- | --- | --- |
| Language | **TypeScript** (`strict`) | The first quality gate is the type system. |
| UI | **React 19** | Function components + hooks only. |
| Build / dev server | **Vite** | The runnable carrier; the scaffolding is stack-agnostic. |
| Unit / component tests | **Jest + React Testing Library** | Behaviour through the accessibility tree. |
| End-to-end tests | **Playwright** | The behaviour map; also hosts StyleProof. |
| Lint + format + import order | **Biome** | One tool, not ESLint *and* Prettier. |
| Commit format | **commitlint** | Conventional Commits on `commit-msg`. |
| Code intelligence | **Fallow** | Dead code, cycles, complexity, architecture drift. |
| Visual regression | **StyleProof** | Diffs computed styles; review-gate + certify modes. |
| Accessibility | **jest-axe + @axe-core/playwright** | axe at unit level and in the real browser (contrast). |
| Bundle-size budget | **size-limit** | Fails CI when `dist/` exceeds the budget. |
| Performance budget | **Lighthouse CI** | a11y floor + perf budget on pull requests. |
| Git hooks | **husky** | Runs the gates locally before commit/push. |
| Dependency vulnerabilities | **`pnpm audit`** | High/critical advisories fail CI. |
| Secret scanning | **gitleaks** | Staged content on pre-commit; full history in CI. |
| Static application security | **CodeQL** | SAST on every push and pull request. |
| License compliance | **pnpm licenses + allow-list** | CI fails on a dependency license outside the permissive allow-list. |
| Dependency updates | **Dependabot** | Weekly npm + GitHub-Actions update PRs. |
| Repo health audits | **ArchitectPlaybook** | Claude Code skills; the health-check (showcase #1). |
| Codebase knowledge graph | **graphify** | Powers ArchitectPlaybook's `/pre-audit-setup`. |
| Execution-flow index | **GitNexus** | Local generated index for impact, trace, and context queries. |
| Simplicity discipline | **Ponytail** | Prefer deletion, stdlib/native features, and existing patterns. |

## Boundaries to respect

- **Do not add ESLint or Prettier.** Biome owns lint + format. Two formatters is
  a guaranteed source of churn.
- **Do not add a second test runner.** Unit = Jest, E2E = Playwright. That is
  the whole matrix.
- **Visual correctness is StyleProof's job, not the unit suite's.** Unit tests
  stub stylesheets on purpose (`jest.style-stub.cjs`).

External tooling (Fallow, StyleProof, ArchitectPlaybook, graphify, GitNexus, Ponytail) is
documented in the repo root `README.md` and installed via `pnpm setup:agents`. We reference
these as living libraries rather than vendoring copies — see
[`../decisions/0004-agent-context-lives-in-dot-agents.md`](../decisions/0004-agent-context-lives-in-dot-agents.md).
