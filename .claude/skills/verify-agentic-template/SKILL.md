---
name: verify-agentic-template
description: Launch, drive, and prove the Agentic Project Template web app (Vite + React greeting page backed by the tRPC api) the way a user does, in real Chromium, from a dev server or a CI-built dist artifact. Use to capture screenshots, ARIA snapshots, and video of a running instance as PR proof, or to check that an instance is worth driving. For the Playwright behaviour map that CI runs, use run-e2e-tests.
---

# Verify the Agentic Project Template app

The app is one page at `/`: the `Greeting` page. A user types a name into the
`Name` field and presses `Greet`, and the page asks the api for the greeting
through tRPC (`GET /trpc/greeting.greet`). Vite proxies `/trpc` to the api
process (`apps/api/src/server.ts`) in dev and preview, so a launched instance
answers with real data without mocks. The browser is the only user surface.

`scripts/verify.mjs` owns the whole loop. Every run lives in `.verify/<run-id>/`
(gitignored): `instance/` is server state, `evidence/` is proof.

```bash
V=.claude/skills/verify-agentic-template/scripts/verify.mjs
```

## Setup

Run once per checkout:

```bash
pnpm install
pnpm e2e:install
```

`pnpm e2e:install` downloads the Chromium build that the pinned
`@playwright/test` needs. A missing browser fails every drive with
`Executable doesn't exist`.

## Launch

From the source (dev server, hot reload):

```bash
node $V launch --run pr-123
```

From a CI-built bundle (the `dist` artifact of the `Production build` job):

```bash
SHA=$(git rev-parse HEAD)
gh run list --workflow CI --commit "$SHA" --status success --json databaseId --jq '.[0].databaseId'
DIST=$(mktemp -d)
gh run download <run-id> -n dist -D "$DIST"
node $V launch --run pr-123-ci --dist "$DIST" --sha "$SHA"
```

`--sha` is required with `--dist`. It is the commit the CI run built, and
`doctor` compares it to `HEAD`. A relative `--dist` resolves from `apps/web`,
so `--dist dist` serves a local `apps/web/dist/` build; an absolute path works
as is.

Keep the download outside the repo. `pnpm verify` runs react-doctor over the
working tree, and it flags the minified bundle.

`launch` picks two free ports on `127.0.0.1`. It starts the api on one
(`node apps/api/src/server.ts` with `PORT`) and Vite from `apps/web`
(`apps/web/node_modules/.bin/vite`) on the other with `--strictPort`, with
`API_ORIGIN` pointing its `/trpc` proxy at that api. It returns only when the
page answers 200, `/trpc/greeting.greet` through the proxy answers
`Hello, Ada!`, and Chromium renders the `Greeting` heading and the `Name` field.
It prints `READY run=<id> mode=<dev|preview> url=<url> pid=<pid> api=<port> apiPid=<pid>`.
Omit `--run` to get a timestamped id. Two runs with different ids run side by
side.

## Doctor

Run it first, and again whenever a result looks wrong:

```bash
node $V doctor --run pr-123
```

It is read-only and exits 1 on any `FAIL`. It checks that the Vite pid is alive
and is this run's Vite on this run's port, that the api pid is alive and runs
this checkout's `apps/api/src/server.ts`, that the page and the greeting api
answer, and that the app renders in Chromium. It also checks that the build it serves matches `HEAD`:
the launch commit in dev mode, or `--sha` in preview mode.

## Drive

```bash
node $V drive <journey> --run pr-123
```

Built-in journeys, one per recipe in [`features/`](features/README.md):

| Journey | Proves |
| --- | --- |
| `greeting` | A blank name shows `Enter a name` and sends nothing, then `Ada` shows `Hello, Ada!` from one api call. |
| `greeting-validation` | A whitespace name shows `Enter a name`, marks the field invalid, and sends nothing. |
| `greeting-error` | A 500 from `/trpc` shows `Could not load the greeting`. |
| `accessibility` | axe finds no WCAG A or AA violations, with and without the error, and Tab reaches the field, then the button. |

For behaviour a PR adds, write a journey module and pass its path. It default-exports
`{ id, feature, run }`, where `run({ page, step, expect })` uses Playwright's
`page` and `expect`. Copy the shape from `scripts/journeys.mjs`:

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

Locate by role and accessible name: `textbox` by its label, `button` by label,
`status` for the greeting, and `alert` for the validation or request error.

## Evidence

`drive` writes `.verify/<run-id>/evidence/<journey-id>/`:

- `NN-<step>.png` and `NN-<step>.aria.yml` after each passing step, so the proof
  shows each action and its result, not only the final screen.
- `NN-<step>.failed.png` for the step that failed.
- `video.webm` of the whole journey.
- A re-run of the same journey in the same run replaces its folder. Use a new
  `--run` to keep both.
- `manifest.json` with the result, URL, mode, the build commit, the checkout
  `HEAD`, each step, every
  `/trpc/` response with its status, console errors, and uncaught page errors.

An uncaught page error fails the journey even when every assertion passes.

Proof standards:

- Drive the real user path. Click buttons by name, and leave hooks and component
  state to the app.
- Intercept the network only at `**/trpc/**`. That is the boundary to the
  backend. It is the only way to reach the request error state.
- Check the side effect, not only the screen. `manifest.json` lists the API
  calls a click caused.
- For a PR, copy the screenshots that prove the claim into
  `docs/proof/<scope>/` and embed them per
  `.claude/skills/pr-inline-screenshot-proof/SKILL.md`. Read the PNG before you
  cite it.

## Cleanup

```bash
node $V cleanup --run pr-123
```

`cleanup` stops the process groups of the two pids in `instance.json`, only
after it confirms that one is this run's Vite on this run's port and the other
runs this checkout's api. It deletes
`.verify/<run-id>/instance/` and keeps `.verify/<run-id>/evidence/`. Run it
after every failed launch too. Stop Vite and the api only through those
confirmed pids, because other agents and the user's `pnpm dev` on `:5173` and
`:3001` may share the machine.

## Keep the map current

When a PR adds or changes a user-visible path, update the matching file in
`features/` and its journey in `scripts/journeys.mjs` in the same PR. For a full pass, use the pstack
`/maintain-verification-skill` skill when it is installed. The CI suite in `apps/web/e2e/` is the
behaviour contract. This skill is the tool to drive the app and show proof.
