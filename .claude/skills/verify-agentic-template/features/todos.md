# Todos

The visitor adds a titled todo, toggles completion and deletes it at `/todos`.
The api keeps the list in memory across page reloads for its process lifetime.

## Sub-features

- Blank-title validation with an alert.
- Create, list, complete, reopen and delete through `/trpc`.
- Persistence across reloads while the api runs.

## How to get to it (user POV)

Open `/todos` on the launched instance. The heading is `Todos`, the text field
is `Title`, and `Add` submits it. Each checkbox is named by its title and each
delete button is named `Delete <title>`.

## Driving it with verify.mjs

Run `node $V drive todos --run <id>`. The journey captures blank validation,
creation, completion after reload, then reopening and deletion.

## Gotchas

Use the api process launched for this run. Restarting it clears todos. Reloading
the browser preserves them. The greeting remains at `/`.
