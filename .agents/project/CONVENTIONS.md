# Conventions

Concrete, mechanical rules. Most are enforced by Biome and TypeScript; the rest
are checked in review. When in doubt, copy the reference feature.

## Naming

- **Folders:** `kebab-case` (`threshold-counter`).
- **Components & component files:** `PascalCase` (`ThresholdCounter.tsx`).
- **Hooks:** `useCamelCase` in a file of the same name (`useThresholdCounter.ts`).
- **Functions & variables:** `camelCase`. **Types & interfaces:** `PascalCase`.
- **Constants** that are true configuration: `SCREAMING_SNAKE_CASE`
  (`CRITICAL_THRESHOLD`).
- **No abbreviations.** `count` not `cnt`, `request` not `req`. The name is the
  cheapest documentation an agent has.

## TypeScript

- `strict` is on, plus `noUncheckedIndexedAccess` and `noUnusedLocals`. Do not
  weaken `tsconfig.json` to make code compile — fix the code.
- **No `any`.** Biome rejects it. Reach for `unknown` and narrow.
- **`import type`** for type-only imports (`verbatimModuleSyntax` + Biome enforce
  this). It keeps the runtime graph honest.
- Prefer `interface` for object shapes, `type` for unions/aliases.
- Validate data crossing an IO boundary (network, storage, env) before trusting
  its type — a type assertion is not validation.

## React

- Function components only. No class components.
- Hooks wire state; components render; pure functions hold logic
  (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).
- Derive, don't duplicate: compute from state with `useMemo` rather than storing
  a second copy that can drift.
- Every interactive element is reachable and labelled: real `<button>`s, an
  `aria`-correct status region, visible focus styles. Accessibility is a
  correctness concern, not a polish task.

## Imports & files

- Import siblings by relative path; import a feature only via its `index.ts`.
- One component per file. Co-locate the test as `<Name>.test.tsx`.
- Biome owns import ordering — never hand-sort.

## Errors

- Fail loudly at boundaries (`main.tsx` throws if `#root` is missing) rather than
  limping on with a bad assumption.
- No empty `catch`. If you handle an error, do something observable with it.

## Commits

- **Conventional Commits**, enforced on `commit-msg`:
  `type(scope): subject` — e.g. `feat(threshold-counter): add reset action`.
- Subject in the imperative mood, lower case, no trailing period.
- One logical change per commit; keep the diff reviewable.
