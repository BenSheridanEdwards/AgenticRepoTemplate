# Agentic Project Template verification map

This directory is the maintained source for verifying the user-facing behaviour
of the template app. Read this index before driving the app, then use the
matching feature file as the recipe.

## Baseline preconditions

- Launch with `node $V launch --run <id>`, where
  `V=.claude/skills/verify-agentic-template/scripts/verify.mjs`.
- Require `PASS` on every line of `node $V doctor --run <id>`.
- The app is at the printed `url`, on `127.0.0.1` and a free port. The page is
  `/`. It has no routes, auth, or stored data.
- `GET /api/service-status` returns `Web application` (Operational),
  `Public API` (Degraded), and `Background jobs` (Down).
- Never drive an instance that this run did not launch.

## Driving conventions

- Every recipe starts from a fresh page load. A reload resets all state.
- Locate by ARIA role and accessible name. Scope to a region before you look
  for `status`, because the page has two.
- Each bullet in a recipe names one step of the journey. `drive` prints that
  step with `PASS` or `FAIL`.
- Run a built-in journey with `node $V drive <journey> --run <id>`. Run new
  behaviour with `node $V drive ./journey.mjs --run <id>`.
- Intercept the network only at `**/api/service-status`.

## Proof and skip reporting

- Each passing step writes a screenshot and an ARIA snapshot to
  `.verify/<id>/evidence/<journey>/`.
- `manifest.json` records the result, git `HEAD`, mode, and every `/api/` call.
- Report a failed step with its `NN-<step>.failed.png` and the error line.
- Do not report a path as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behaviour. It then has four H2 sections in this order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs`,
and `Gotchas`.

## Features

- [Capacity](./capacity.md) covers the threshold counter, its three status
  levels, the zero floor, and reset.
- [Service status](./service-status.md) covers the live list, refresh, and the
  loading, empty, and error states.
- [Accessibility](./accessibility.md) covers the axe WCAG scan and keyboard
  reach on the whole page.
