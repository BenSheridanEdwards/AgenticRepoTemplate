# Agentic Project Template verification map

This directory is the maintained source for verifying the user-facing behaviour
of the template app. Read this index before driving the app, then use the
matching feature file as the recipe.

## Baseline preconditions

- Launch with `node $V launch --run <id>`, where
  `V=.claude/skills/verify-agentic-template/scripts/verify.mjs`.
- Require `PASS` on every line of `node $V doctor --run <id>`.
- The app is at the printed `url`, on `127.0.0.1` and a free port. The page is
  `/` for Greeting or `/todos` for Todos. Todos use api-process memory.
- The api runs beside it, and `GET /trpc/greeting.greet` with the input
  `{"name":"Ada"}` answers `Hello, Ada!` through the web server's proxy.
- Drive only an instance that this run launched.

## Driving conventions

- Every recipe starts from a fresh page load. A reload resets the greeting;
  todos persist while the api runs.
- Locate by ARIA role and accessible name: the `Name` textbox, the `Greet`
  button, the `status` greeting and the `alert` error.
- Each bullet in a recipe names one step of the journey. `drive` prints that
  step with `PASS` or `FAIL`.
- Run a built-in journey with `node $V drive <journey> --run <id>`. Run new
  behaviour with `node $V drive ./journey.mjs --run <id>`.
- Intercept the network only at `**/trpc/**`.

## Proof and skip reporting

- Each passing step writes a screenshot and an ARIA snapshot to
  `.verify/<id>/evidence/<journey>/`.
- `manifest.json` records the result, git `HEAD`, mode, and every `/trpc/` call.
- Report a failed step with its `NN-<step>.failed.png` and the error line.
- Report a path as verified only after driving that same path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behaviour. It then has four H2 sections in this order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs`,
and `Gotchas`.

## Features

- [Greeting](./greeting.md) covers the greeting from the api, the blank-name
  validation, and the request error.
- [Accessibility](./accessibility.md) covers the axe WCAG scan and keyboard
  reach on the whole page.
- [Todos](./todos.md) covers validation, creation, completion, reload and deletion.
