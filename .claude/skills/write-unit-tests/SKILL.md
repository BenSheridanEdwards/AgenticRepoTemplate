---
name: write-unit-tests
description: Write Jest + React Testing Library unit/component tests that assert behaviour through the accessibility tree, not implementation detail. Use when adding logic or components, fixing a bug (write the failing test first), or raising coverage in this repository.
---

# Write unit tests

Unit and component tests here verify *units* cheaply and survive refactors,
because they assert what a **user perceives**, through the public surface.

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
- **Test logic where it lives.** Api domain rules (`formatGreeting` in
  `domain.ts`) and use cases (`greet` in `application.ts`) are tested as
  functions. Procedures are tested through `createCallerFactory(<name>Router)({})`
  from `trpc.ts`, covering valid input and the `BAD_REQUEST` rejection (see
  `apps/api/src/features/greeting/procedures.test.ts`). Form schemas are tested
  by decoding (`greetingFormSchema.test.ts`). Hooks and pages are tested
  through rendered behaviour. See `.agents/project/ARCHITECTURE.md`.
- **Reach the api through `TestApiProvider`.** A page or hook that calls the api
  renders inside `TestApiProvider` from the api client, with one typed handler
  per procedure path (`{ 'greeting.greet': greet }`). Use `jest.fn` handlers to
  assert the input the api received, and a rejecting handler for the error
  state. The real hooks and providers run; leave hooks unmocked. Models:
  `apps/web/src/routes/greeting/GreetingPage.test.tsx` and
  `useGreeting.test.tsx` (`renderHook` with a `TestApiProvider` wrapper).

## Process

1. Copy `.agents/templates/component.test.tsx.template` next to the unit under
   test as `<Name>.test.tsx`. Jest runs three projects from the repo root:
   `web` (jsdom) for `{apps,showcase/*}/web/src/**` and `packages/*/src/**`,
   `api` (node) for `{apps,showcase/*}/api/src/**/*.test.ts`, and `tooling`
   for `scripts/` and `tooling/`.
2. Cover the default state, each user action, and the edge cases (empty or
   blank input, api error, validation error).
3. Run with coverage and close any gap the threshold reports.

## Commands

```bash
pnpm test                 # run the suite
pnpm test:watch           # TDD loop
pnpm test:coverage        # enforce the coverage threshold
pnpm test GreetingPage     # run one file by name
pnpm test --selectProjects api   # run one Jest project
```

## Done when

`pnpm test:coverage` passes (no threshold failure) and each behaviour has a
test. Cross-check `.agents/project/DEFINITION_OF_DONE.md`.
