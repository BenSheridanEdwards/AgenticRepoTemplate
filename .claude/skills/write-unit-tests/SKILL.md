---
name: write-unit-tests
description: Write Jest + React Testing Library unit/component tests that assert behaviour through the accessibility tree, not implementation detail. Use when adding logic or components, fixing a bug (write the failing test first), or raising coverage in this repository.
---

# Write unit tests

Unit and component tests here verify *units* cheaply and survive refactors,
because they assert what a **user perceives** — never implementation detail.

## When to use this skill

- You added a pure function, a hook, or a component.
- You are fixing a bug — write the failing test first, then make it pass.
- Coverage dropped below the threshold in `jest.config.ts` (80%).

## Principles (React Testing Library)

- **Query the way a user finds things:** `getByRole`, `getByLabelText`,
  `getByText`. Reach for `getByTestId` only when no accessible query fits.
- **Assert observable behaviour**, not internal state, props, or class names.
- **Drive with `userEvent`**, not `fireEvent` — it models real interaction.
- **One behaviour per `it`.** The test name reads as a sentence about the
  product.
- **Test logic where it lives.** Pure rules (e.g. `statusForCount`) are tested
  as functions; hooks/components are tested through rendered behaviour. See
  `.agents/project/ARCHITECTURE.md`.

## Process

1. Copy `.agents/templates/component.test.tsx.template` next to the unit under
   test as `<Name>.test.tsx`.
2. Cover the default state, each user action, and the edge cases (empty, floor,
   ceiling, error path).
3. Run with coverage and close any gap the threshold reports.

## Commands

```bash
pnpm test                 # run the suite
pnpm test:watch           # TDD loop
pnpm test:coverage        # enforce the coverage threshold
pnpm test ThresholdCounter   # run one file by name
```

## Done when

`pnpm test:coverage` passes (no threshold failure) and each behaviour has a
test. Cross-check `.agents/project/DEFINITION_OF_DONE.md`.
