# Conventions

Each convention below names the check that enforces it. The error message of
each check names the fix. The judgment calls at the end are the conventions no
check can decide; reviewers hold those. When in doubt, copy the reference
feature.

## Enforced conventions

| Convention | Enforced by |
| --- | --- |
| Folders under `src/` are kebab-case (`threshold-counter`). | ESLint `policy/folder-names` |
| Identifiers: `camelCase` functions and variables, `PascalCase` types and components, `SCREAMING_SNAKE_CASE` for true configuration constants. | Biome `style/useNamingConvention` (`src/**`) |
| File names are camelCase, PascalCase, or the name of their export. | Biome `style/useFilenamingConvention` (`src/**`) |
| A component or hook lives in the file of the same name (`ThresholdCounter.tsx`, `useThresholdCounter.ts`). | ESLint `policy/file-matches-export` |
| One React component per file. | ESLint `policy/one-component-per-file` |
| Function components only. | ESLint `react-doctor/prefer-function-component` |
| `useState`, `useReducer`, and effects run only inside a named custom `use*` hook. | ESLint `policy/state-and-effects-in-hooks` ([ADR 0012](../decisions/0012-local-state-inside-custom-hooks.md)) |
| Derived values are computed during render instead of copied into state by an effect. | ESLint `react-hooks/set-state-in-effect`, `react-doctor/no-derived-state`, `react-doctor/no-mirror-prop-effect` |
| Functions defined inside a component start with `handle` (`handleReset`). | ESLint `policy/handler-names` |
| Callback props start with `on` (`onReset`). | ESLint `policy/callback-prop-names` |
| Page components live in `src/routes/<route-name>/`. | ESLint `policy/pages-in-routes`, Fallow `routes` zone |
| Another module imports a feature, route, or shared module only through its `index.ts`. | ESLint `no-restricted-imports` |
| `strict` TypeScript with `noUncheckedIndexedAccess` and `noUnusedLocals`. | `pnpm typecheck`; loosening `tsconfig.json` needs Ben's enforcement sign-off |
| `unknown` and narrowing in place of `any`. | Biome `suspicious/noExplicitAny` |
| `import type` for type-only imports. | Biome `style/useImportType`, `verbatimModuleSyntax` |
| `interface` for object shapes, `type` for unions and aliases. | Biome `style/useConsistentTypeDefinitions` |
| Import order. | Biome `organizeImports` |
| Every block has a body; a handled error does something observable. | Biome `suspicious/noEmptyBlockStatements` |
| Every lint or type suppression names its rule and carries its reason. | `pnpm check:suppressions`; Biome for `biome-ignore` |
| Accessible, labelled controls and status regions. | Biome `a11y/*`, jest-axe, `@axe-core/playwright`, Lighthouse |

## Judgment calls

- **Full words in identifiers.** Write `count` and `request`. The name is the
  cheapest documentation an agent has. Established acronyms such as E2E, CI,
  ADR, UI, IO, and URL are fine.
- **Hooks wire state, components render, pure functions hold logic.** See
  [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Validate data at an IO boundary.** Parse network, storage, and environment
  data before trusting its type. A type assertion is a claim, and validation is
  proof.
- **Fail loudly at boundaries.** `main.tsx` throws when `#root` is missing.
- **Co-locate tests.** Each test sits beside its subject as `<Name>.test.tsx`.

## Enforced commit and branch conventions

| Convention | Enforced by |
| --- | --- |
| Commits use Conventional Commits, `type(scope): subject`, lower case with no trailing period. | commitlint on `commit-msg` |
| PR titles use Conventional Commits. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| Branches are `<type>/<short-kebab-summary>`, for example `feat/threshold-reset`. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with a new ADR that names it. | `pnpm check:adr` in `pnpm verify` and CI |

## Commit judgment

- Write the subject in the imperative mood.
- Keep one logical change per commit, so the diff stays reviewable.
