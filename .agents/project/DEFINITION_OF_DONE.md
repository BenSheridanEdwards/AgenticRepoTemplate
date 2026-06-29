# Definition of Done

A change is **done** when every box below is true. This is not aspirational —
the quality gates mechanically enforce most of it, so "done" and "passes the
gates" are the same statement. An agent must not report a task complete until
`pnpm verify` and `pnpm e2e` are green.

## The checklist

- [ ] **Behaviour is specified.** New or changed behaviour is covered by
      `e2e/app.spec.ts` (the behaviour map). The product's contract is explicit.
- [ ] **Logic is unit-tested.** Pure functions and hooks have tests that assert
      behaviour through the public surface — coverage stays at/above the
      threshold in `jest.config.ts` (80%).
- [ ] **Types check.** `pnpm typecheck` passes with no `any` and no weakened
      config.
- [ ] **Lint + format clean.** `pnpm check` (Biome) passes; no disabled rules
      without a written reason.
- [ ] **Code intelligence clean.** `pnpm fallow:audit` introduces no new dead
      code, circular dependencies, or complexity/architecture violations.
- [ ] **Build succeeds.** `pnpm build` produces a clean production bundle.
- [ ] **Accessible.** No axe violations (jest-axe in unit tests, `@axe-core/playwright`
      in the E2E run); interactive elements are reachable and labelled.
- [ ] **Within budget.** `pnpm size` passes (the bundle stays under the
      `.size-limit.json` budget).
- [ ] **Visuals accounted for.** Any CSS change is either an *intended* change
      approved in the StyleProof report, or a refactor certified as zero-diff.
- [ ] **PR proof is ready.** The pull request body follows
      [`PR_QUALITY.md`](PR_QUALITY.md), with exact local commands, visual proof
      or `N/A` with a reason, CI status, risk, rollback, and no private details.
- [ ] **Patterns followed.** The change matches
      [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONVENTIONS.md`](CONVENTIONS.md);
      new files were created from [`../templates/`](../templates).
- [ ] **Decisions recorded.** Any new architectural choice is captured as an ADR
      in [`../decisions/`](../decisions).
- [ ] **Commit is conventional.** Message follows Conventional Commits.

## The one-command proof

```bash
pnpm verify   # typecheck → biome → fallow → unit tests → build
pnpm e2e      # behaviour map
```

If both are green and the checklist holds, the work is done. If either is red,
it is not — regardless of how finished the code looks.

Before opening or marking a PR ready, also complete
[`PR_QUALITY.md`](PR_QUALITY.md) through the GitHub pull request template.
