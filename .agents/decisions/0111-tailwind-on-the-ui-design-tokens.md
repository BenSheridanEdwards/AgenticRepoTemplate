# 111. Tailwind on the `@repo/ui` design tokens

- **Status:** Proposed
- **Date:** 2026-11-03
- **Amends:** [The api, ui, greeting and contract](0032-api-ui-greeting-and-contract.md) (the `@repo/ui` styles) and [Playwright screenshot comparisons](0052-playwright-visual-regression.md) (refreshed baselines)

## Context

The greeting app and the `@repo/ui` primitives used hand-written CSS. That CSS
held hard-coded hex colours, two radii and fixed pixel sizes in two files. A
generated result had to copy that CSS or write its own values, so results could
drift from the reference look. North Star section 3 asks for one set of
global UI components and style tokens in the UI package, with lint to enforce
their use. The trial brief lets agents use Tailwind on its scale, with the
global primitives and no arbitrary values. The template must make that rule
possible and check it.

## Decision

- Add `tailwindcss` and `@tailwindcss/vite` (4.x) to `apps/web` and register the
  Vite plugin. `@repo/ui` names `tailwindcss` as a peer, because its stylesheet
  imports it.
- `packages/ui/src/styles.css` is the design system. It imports Tailwind with
  `source(none)`, lists its own `@source`, and holds the one `@theme` block. The
  block resets the default colours, radii and fonts, then defines the only
  tokens: colours `canvas`, `surface`, `raised`, `raised-hover`, `ink`, `muted`,
  `line`, `line-strong`, `focus` and `danger`; radii `lg` and `xl`; font `sans`.
  The colours keep the old hex values. It also adds the `aria-invalid` variant
  and the body colours.
- Each web result's `src/index.css` imports `@repo/ui/styles.css` and lists
  `@source "./"`. It holds no other CSS.
- Components style with Tailwind utility classes on the theme scale and the
  token names: `bg-surface`, `p-6`, `max-w-160`, `sm:py-12`.
- Two checks enforce the rule, and `pnpm verify` and the CI quality job run
  both:
  - Oxlint `policy/no-arbitrary-styles` (`pnpm lint:policy`) checks web and
    `@repo/ui` TypeScript. It rejects a string or template part with a Tailwind
    arbitrary value, property or variant (`w-[13px]`, `[mask:none]`,
    `data-[open]:p-4`), a hex or colour-function literal, and a JSX `style`
    prop. Tests and api sources are out of scope.
  - `pnpm lint:styles` (`scripts/check-styles.mjs`) checks the files Oxlint
    cannot parse. Result CSS holds only `@import` and `@source` lines. A
    `@theme` block appears only in `packages/ui/src/styles.css`. Outside that
    block, CSS has no colour literal and no arbitrary value in `@apply`. Each web
    `index.html` has no `style` attribute, arbitrary class or colour literal.
  `lint:policy` stays Oxlint alone ([ADR 0103](0103-eslint-is-retired.md)).
- Biome parses Tailwind directives (`css.parser.tailwindDirectives`).

## Consequences

- An agent changes the look in one place, the `@theme` block, and every result
  follows. A new token is a reviewed change to that block.
- With the colour reset, a default palette class such as `bg-red-500` produces
  no CSS. The checks do not reject it; review and the screenshots catch it.
- Tailwind's preflight replaces browser defaults (line height 1.5, no heading or
  list styles), so the greeting screens change slightly. The visual baselines
  are refreshed with this change and the PR shows before and after screenshots.
- A result CSS file can no longer copy reference CSS, so the inclusion test now
  proves the style check rejects hand-written CSS in a showcase result.
- The app stylesheet grows from about 1 kB to about 2.3 kB (brotli), inside the
  5 kB budget.
