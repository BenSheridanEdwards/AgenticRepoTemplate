# Notes trial {{ID}}

You are running trial {{N}} of three independent Notes trials in this repository. Work alone in this one session. Nobody will answer a question or correct you, so make every decision from the repository's own docs and checks, and repair your own mistakes until the checks pass.

## What to build

Build the Notes result in `showcase/{{ID}}/`. The brief, word for word:

> Notes brief: create (nonblank title, body text), list, delete; id/title/body; in-memory storage; no auth/edit/search/sort/collab/external services/generic CRUD; use GUARDRAILS state+form conventions.

Read it this way.

- A note has exactly three fields, `id`, `title` and `body`.
- A user creates a note with a title that is not blank and body text, sees the list of notes, and deletes a note. A blank body is allowed.
- The api keeps the notes in memory, inside the api process.
- Leave out authentication, editing, searching, sorting, collaboration, external services and generic CRUD helpers.
- "GUARDRAILS state+form conventions" means the rules in `AGENTS.md`, `.agents/project/ARCHITECTURE.md` and `.agents/project/CONVENTIONS.md`. Server state goes through TanStack Query and tRPC, forms through React Hook Form with the Effect Schema resolver, and local state only inside custom `use*` hooks.

## Where it goes

- `showcase/{{ID}}/web` is the web package `@{{ID}}/web`, and `showcase/{{ID}}/api` is the api package `@{{ID}}/api`. Give them the same layout, roles, scripts and dependencies as `apps/web` and `apps/api`, which hold the reference greeting feature. Use `@repo/ui` for the primitives it has.
- Read only inside this clone. Write only inside `showcase/{{ID}}/`. `pnpm install` may update `pnpm-lock.yaml` for your two packages. Leave every other file as it is.
- Use only dependencies that `apps/web` and `apps/api` already declare, at the same ranges.
- Follow `.agents/templates/list-route.md` for the exact Notes route files, components, props and state owners.
- Each `package.json` equals its reference package except the name and the dependencies.
- Put the result's own Playwright specs in `showcase/{{ID}}/web/e2e/`.
- `showcase/{{ID}}/` holds only `web/`, `api/` and its generated `architecture.mmd`. Add no tool config beyond the reference's, no symlink and no suppression directive. `node tooling/architecture/structure.mjs` checks this layout, and `pnpm verify` runs it.
- Run `pnpm arch:diagram` to write `showcase/{{ID}}/architecture.mmd`, and keep the written diagram.

## The page

The fixed acceptance test `tooling/trial/acceptance/notes.spec.ts` drives your page. Make it pass.

- `/` shows a level-one heading `Notes`.
- Text fields labelled `Title` and `Body` and a button named `Add` create a note. Use `TextField` for both fields, with no textarea.
- Submitting a blank title adds nothing and shows an alert. A blank body is allowed.
- The notes appear in a list named `Notes`. Each item shows its title and body and has a button named `Delete <title>`, which deletes it.
- Notes survive a page reload while the api runs.
- The page reaches the api through `/trpc`, as the reference does.

## Public API

Mount exactly these procedures under the `notes` router key. The contract in
`tooling/trial/briefs.mjs` uses these literal Effect Schema shapes (`Schema`
from `effect`); validate inputs with `.input(Schema.toStandardSchemaV1(schema))`.
Define `Note = Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String })`.

| Procedure | Kind | Input schema | Output schema |
| --- | --- | --- | --- |
| notes.list | query | `Schema.Undefined` | `Schema.Array(Note)` |
| notes.create | mutation | `Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()), body: Schema.String })` | `Note` |
| notes.delete | mutation | `Schema.Struct({ id: Schema.String })` | `Schema.Struct({ id: Schema.String })` |

`list` takes no input and returns the array directly. `create` takes exactly
`{ title: string, body: string }`, trims the title, rejects blank titles and
returns the stored `{ id, title, body }`; body is a required string that may
be empty and is preserved unchanged. `delete` takes only `{ id: string }` and
returns only `{ id: string }`, containing the deleted id. Keep these exact
fields, names and kinds, using the reference's default JSON tRPC transport
through `/trpc`. The fixed acceptance spec checks these responses over HTTP.

## Done

Run `node tooling/trial/check-scope.mjs --id {{ID}}` after installing and after the checks below. Fix every reported path or lockfile change before finishing.

Done means `pnpm verify` and `pnpm e2e` pass with every gate as it is, per `.agents/project/DEFINITION_OF_DONE.md`. Run them, fix what they report, and run them again until they pass. Leave your work uncommitted. The harness commits it when you finish.

## Shared machine

Never use `pkill -f`, `killall` or any kill-by-pattern: this machine is shared.
Stop only processes you started, by PID. Never set git `user.name` or
`user.email` in any git config. Do not push.
