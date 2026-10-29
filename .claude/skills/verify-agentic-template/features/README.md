# Agentic Project Template verification map

Read this index before driving the app, then follow the matching feature recipe
for the template's user-visible behaviour.

## Baseline preconditions

- Launch with `node $V launch --run <id>`, where `V=.agents/skills/verify-agentic-template/scripts/verify.mjs`.
- Require `PASS` on every line of `node $V doctor --run <id>`.
- Use the printed `url` at `/` on `127.0.0.1` and a free port. There is no auth or stored data.
- The api runs beside it; `GET /trpc/greeting.greet` with `{"name":"Ada"}` answers `Hello, Ada!` through the web proxy.
- Drive only an instance this run launched.

## Driving conventions

- Start each recipe from a fresh page load; reload resets all state.
- Locate by role and accessible name: `Name` textbox, `Greet` button, `status` greeting, `alert` error.
- Each recipe bullet names a journey step; `drive` prints it with `PASS` or `FAIL`.
- Run built-ins with `node $V drive <journey> --run <id>`; run new behaviour with `node $V drive ./journey.mjs --run <id>`.
- Intercept only at `**/trpc/**`.

## Proof and skip reporting

- Each passing step writes a screenshot and ARIA snapshot to `.verify/<id>/evidence/<journey>/`.
- `manifest.json` records result, git `HEAD`, mode, and every `/trpc/` call.
- Report failed steps with `NN-<step>.failed.png` and the error line.
- Claim verification only for paths you drove.

## Feature entry contract

Start each feature file with an H1 title and a paragraph of user-visible
behaviour. Follow with four H2 sections in order: `Sub-features`,
`How to get to it (user POV)`, `Driving it with verify.mjs`, `Gotchas`.

## Features

- [Greeting](./greeting.md): api greeting, blank-name validation, and request error.
- [Accessibility](./accessibility.md): whole-page axe WCAG scan and keyboard reach.
