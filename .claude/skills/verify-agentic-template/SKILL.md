---
name: verify-agentic-template
description: Launch, drive, and prove the Agentic Project Template web app (Vite + React greeting page backed by the tRPC api) the way a user does, in real Chromium, from a dev server or a CI-built dist artifact. Use to capture screenshots, ARIA snapshots, and video of a running instance as PR proof, or to check that an instance is worth driving. For the Playwright behaviour map that CI runs, use run-e2e-tests.
---

# Verify the Agentic Project Template app

At `/`, a user enters a `Name` and presses `Greet`. The `Greeting` page calls `GET /trpc/greeting.greet`;
Vite proxies `/trpc` to `apps/api/src/server.ts` in dev and preview. Use real data without mocks.
The browser is the only user surface.

`scripts/verify.mjs` owns the loop. Runs live in gitignored `.verify/<run-id>/`:
`instance/` holds server state; `evidence/` holds proof.

```bash
V=.agents/skills/verify-agentic-template/scripts/verify.mjs
```

## Setup

Run once per checkout:

```bash
pnpm install
pnpm e2e:install
```

`pnpm e2e:install` downloads the pinned `@playwright/test` Chromium build. Missing browsers fail drives with `Executable doesn't exist`.

## Launch

From source, with hot reload:

```bash
node $V launch --run pr-123
```

From the `dist` artifact of CI's `Production build` job:

```bash
SHA=$(git rev-parse HEAD)
gh run list --workflow CI --commit "$SHA" --status success --json databaseId --jq '.[0].databaseId'
DIST=$(mktemp -d)
gh run download <run-id> -n dist -D "$DIST"
node $V launch --run pr-123-ci --dist "$DIST" --sha "$SHA"
```

`--dist` requires `--sha`, the built commit, which `doctor` compares to `HEAD`. Relative paths resolve
from `apps/web`: `--dist dist` serves `apps/web/dist/`; absolute paths work as is. Keep downloads
outside the repo: `pnpm verify` runs react-doctor, which flags minified bundles in the working tree.

`launch` chooses two free `127.0.0.1` ports. It starts `node apps/api/src/server.ts` with `PORT`,
then Vite from `apps/web` (`apps/web/node_modules/.bin/vite`) with `--strictPort` and `API_ORIGIN`
pointing `/trpc` to that api. It waits for page status 200, `Hello, Ada!` from `/trpc/greeting.greet`
through the proxy, and the `Greeting` heading and `Name` field in Chromium, then prints
`READY run=<id> mode=<dev|preview> url=<url> pid=<pid> api=<port> apiPid=<pid>`.
Omit `--run` for a timestamped id; different ids can run side by side.

To serve a showcase result:

```bash
node $V launch --run todo-01 --result todo-01
```

`--result <id>` accepts any `tooling/results.mjs` id; `reference` is the default. It starts
`<result>/api/src/server.ts` and Vite from `<result>/web` on the result's ports (5183 and 3011 for the
first showcase result). Pass `--port` and `--api-port` to run beside `pnpm e2e`. Ready means the page
answers 200, the api answers on its port, and Chromium renders a level-one heading.
`doctor` and `cleanup` read the result from the run's `instance.json`.

## Doctor

Run before driving and whenever a result looks wrong:

```bash
node $V doctor --run pr-123
```

This read-only command exits 1 on any `FAIL`. It checks both pids are alive: Vite belongs to this run
and port; the api runs this checkout's `apps/api/src/server.ts`. It checks the page and greeting api
answer and Chromium renders the app. The served build must match `HEAD`: launch commit in dev, `--sha` in preview.

## Drive

```bash
node $V drive <journey> --run pr-123
```

Built-in journeys have recipes in [`features/`](features/README.md):

| Journey | Proves |
| --- | --- |
| `greeting` | A blank name shows `Enter a name` and sends nothing; `Ada` shows `Hello, Ada!` from one api call. |
| `greeting-validation` | A whitespace name shows `Enter a name`, marks the field invalid, and sends nothing. |
| `greeting-error` | A 500 from `/trpc` shows `Could not load the greeting`. |
| `accessibility` | axe finds no WCAG A or AA violations, with and without the error; Tab reaches the field, then the button. |

For new behaviour, pass a journey module's path. Default-export `{ id, feature, run }`;
`run({ page, step, expect })` uses Playwright's `page` and `expect`. Copy `scripts/journeys.mjs`:

```js
export default {
  id: 'greeting-grace',
  feature: 'greeting',
  async run({ page, step, expect }) {
    await step('greet Grace', async () => {
      await page.goto('/');
      await page.getByRole('textbox', { name: 'Name' }).fill('Grace');
      await page.getByRole('button', { name: 'Greet' }).click();
      await expect(page.getByRole('status')).toHaveText('Hello, Grace!');
    });
  },
};
```

```bash
node $V drive ./path/to/journey.mjs --run pr-123
```

Locate by role and accessible name: labelled `textbox` and `button`, `status` for the greeting, `alert` for errors.

## Evidence

`drive` writes `.verify/<run-id>/evidence/<journey-id>/`:

- `NN-<step>.png` and `NN-<step>.aria.yml` after each passing step show each action and result.
- `NN-<step>.failed.png` captures a failed step; `video.webm` records the whole journey.
- A re-run of the same journey replaces its folder. Use a new `--run` to keep both.
- `manifest.json` records result, URL, mode, build commit, checkout `HEAD`, steps,
  every `/trpc/` response and status, console errors, and uncaught page errors.

Uncaught page errors fail journeys even if assertions pass. Drive real user paths with named buttons;
leave hooks and component state to the app. Intercept only at `**/trpc/**`, the backend boundary
and only way to reach the request error state. Check side effects as well as the screen:
`manifest.json` lists the API calls caused by a click.

For a PR, copy screenshots that prove the claim into `docs/proof/<scope>/`. Read each PNG before
citing it; embed it per [`.agents/skills/pr-quality-contract/SKILL.md`](../pr-quality-contract/SKILL.md).

## Cleanup

```bash
node $V cleanup --run pr-123
```

`cleanup` stops only the two pid process groups in `instance.json`, after confirming this run's Vite
and port and this checkout's api. It deletes `.verify/<run-id>/instance/` and keeps
`.verify/<run-id>/evidence/`. Run it after failed launches too. Stop only confirmed Vite and api pids:
other agents and the user's `pnpm dev` on `:5173` and `:3001` may share the machine.

## Keep the map current

Update the matching `features/` file and `scripts/journeys.mjs` journey in the same PR as each user-visible path change.
For a full pass, use pstack's `/maintain-verification-skill` when installed. `apps/web/e2e/` is the behaviour
contract; this skill drives the app and captures proof.
