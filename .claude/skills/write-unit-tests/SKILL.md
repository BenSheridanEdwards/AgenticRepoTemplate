---
name: write-unit-tests
description: Write Jest + React Testing Library unit/component tests that assert behaviour through the accessibility tree, not implementation detail. Use when adding logic or components, fixing a bug (write the failing test first), or raising coverage in this repository.
---

# Write unit tests

Test what users perceive through the public surface so tests survive refactors.
Use this skill for new pure functions, hooks, or components; bug fixes (write
the failing test first); and coverage below `jest.config.ts`'s 80% threshold.

## Principles

- Query by `getByRole`, `getByLabelText`, or `getByText`; use `getByTestId` only
  when no accessible query fits. Assert observable behaviour, not state, props, or classes.
- Drive with `userEvent` rather than `fireEvent` to model real interaction.
- Use one behaviour per `it`, named as a sentence about the product.
- Test logic where it lives. Test domain rules (`formatGreeting` in `domain.ts`)
  and use cases (`greet` in `application.ts`) as functions. Test procedures
  through `createCallerFactory(<name>Router)({})` from `trpc.ts`, with valid
  input and `BAD_REQUEST` rejection; see `apps/api/src/features/greeting/procedures.test.ts`.
  Test form schemas by decoding (`greetingFormSchema.test.ts`), and hooks and
  pages through rendered behaviour. See `.agents/project/ARCHITECTURE.md`.
- Render pages and hooks that call the api inside the api client's
  `TestApiProvider`, with one typed handler per procedure path
  (`{ 'greeting.greet': greet }`). Assert received input with `jest.fn` handlers;
  use a rejecting handler for errors. Run real hooks and providers, leaving
  hooks unmocked. Models: `apps/web/src/routes/greeting/GreetingPage.test.tsx`
  and `useGreeting.test.tsx` (`renderHook` with a `TestApiProvider` wrapper).
- Replace dependencies through their seams. `jest.mock` fails `pnpm lint:anti-slop`.
- Fix console warnings, console errors and Node process warnings; the Jest
  setup fails the test when it records one. A test that expects a warning
  installs `jest.spyOn(console, 'warn').mockImplementation(() => undefined)`
  itself and asserts the call. Use the same pattern for an expected console error.

## Process

1. Copy `.agents/templates/component.test.tsx.template` beside the unit as
   `<Name>.test.tsx`. Jest runs three root projects: `web` (jsdom) for
   `{apps,showcase/*}/web/src/**` and `packages/*/src/**`, `api` (node) for
   `{apps,showcase/*}/api/src/**/*.test.ts`, and `tooling` for `scripts/` and `tooling/`.
2. Cover the default state, each user action, and edge cases: empty or blank
   input, api error, validation error.
3. Run coverage and close every gap the threshold reports.

## Commands

```bash
pnpm test                 # run the suite
pnpm test:watch           # TDD loop
pnpm test:coverage        # enforce the coverage threshold
pnpm test GreetingPage     # run one file by name
pnpm test --selectProjects api   # run one Jest project
```

## Done when

`pnpm test:coverage` passes without threshold failures and every behaviour has
a test. Follow [`.agents/project/PR_QUALITY.md`](../../../.agents/project/PR_QUALITY.md).
