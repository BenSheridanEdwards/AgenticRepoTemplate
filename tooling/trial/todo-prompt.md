# Todo trial {{ID}}

You are running trial {{N}} of three independent Todo trials in this repository. Work alone in this one session. Nobody will answer a question or correct you, so make every decision from the repository's own docs and checks, and repair your own mistakes until the checks pass.

## What to build

Build the Todo result in `showcase/{{ID}}/`. The brief, word for word:

> Todo brief: create (nonblank title), list, toggle complete, delete; id/title/completed; in-memory storage; no auth/filter/sort/collab/external services/generic CRUD; use GUARDRAILS state+form conventions.

Read it this way.

- A todo has exactly three fields, `id`, `title` and `completed`.
- A user creates a todo with a title that is not blank, sees the list of todos, toggles a todo between complete and not complete, and deletes a todo.
- The api keeps the todos in memory, inside the api process.
- Leave out authentication, filtering, sorting, collaboration, external services and generic CRUD helpers.
- "GUARDRAILS state+form conventions" means the rules in `.agents/README.md`, `.agents/project/ARCHITECTURE.md` and `.agents/project/CONVENTIONS.md`. Server state goes through TanStack Query and tRPC, forms through React Hook Form with the Effect Schema resolver, and local state only inside custom `use*` hooks.

## Where it goes

- `showcase/{{ID}}/web` is the web package `@{{ID}}/web`, and `showcase/{{ID}}/api` is the api package `@{{ID}}/api`. Give them the same layout, roles, scripts and dependencies as `apps/web` and `apps/api`, which hold the reference greeting feature. Use `@repo/ui` for the primitives it has.
- Read only inside this clone. Write only inside `showcase/{{ID}}/`. `pnpm install` may update `pnpm-lock.yaml` for your two packages. Leave every other file as it is.
- Use only dependencies that `apps/web` and `apps/api` already declare, at the same ranges.
- Each `package.json` equals its reference package except the name and the dependencies.
- Put the result's own Playwright specs in `showcase/{{ID}}/web/e2e/`.
- `showcase/{{ID}}/` holds only `web/`, `api/` and its generated `architecture.mmd`. Add no tool config beyond the reference's, no symlink and no suppression directive. `node tooling/architecture/structure.mjs` checks this layout, and `pnpm verify` runs it.
- Run `pnpm arch:diagram` to write `showcase/{{ID}}/architecture.mmd`, and keep the written diagram.

## The page

The fixed acceptance test `tooling/trial/acceptance/todo.spec.ts` drives your page. Make it pass.

- `/` shows a level-one heading `Todos`.
- A text field labelled `Title` and a button named `Add` create a todo.
- Submitting a blank title adds nothing and shows an alert.
- The todos appear in a list named `Todos`. Each item has a checkbox named by the todo's title, which toggles it, and a button named `Delete <title>`, which deletes it.
- Todos survive a page reload while the api runs.
- The page reaches the api through `/trpc`, as the reference does.

## Done

Done means `pnpm verify` and `pnpm e2e` pass with every gate as it is, per `.agents/project/DEFINITION_OF_DONE.md`. Run them, fix what they report, and run them again until they pass. Leave your work uncommitted. The harness commits it when you finish.
