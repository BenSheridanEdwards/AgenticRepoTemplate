---
name: verify-agentic-template
description: Launch, drive, and prove the Agentic Project Template web app (Vite + React, one page with Capacity and Service status) the way a user does, in real Chromium, from a dev server or a CI-built dist artifact. Use to capture screenshots, ARIA snapshots, and video of a running instance as PR proof, or to check that an instance is worth driving. For the Playwright behaviour map that CI runs, use run-e2e-tests.
---

# Verify the Agentic Project Template app

The app is one page at `/`: a `Capacity` region (threshold counter) and a
`Service status` region (async list from `GET /api/service-status`). Vite serves
that endpoint from `vite.config.ts` in dev and preview, so a launched instance
shows real data without mocks. The browser is the only user surface.

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
`doctor` compares it to `HEAD`.

Keep the download outside the repo. `pnpm verify` runs react-doctor over the
working tree, and it flags the minified bundle.

`launch` picks a free port on `127.0.0.1` and starts Vite with `--strictPort`.
It returns only when the page answers 200, the API returns a JSON list, and
Chromium renders the `Agentic Project Template` heading with three services.
It prints `READY run=<id> mode=<dev|preview> url=<url> pid=<pid>`. Omit `--run`
to get a timestamped id. Two runs with different ids run side by side.

## Doctor

Run it first, and again whenever a result looks wrong:

```bash
node $V doctor --run pr-123
```

It is read-only and exits 1 on any `FAIL`. It checks that the pid is alive and
is this run's Vite on this run's port, the page and API answer, and the app
renders in Chromium. It also checks that the build it serves matches `HEAD`:
the launch commit in dev mode, or `--sha` in preview mode.

## Drive

```bash
node $V drive <journey> --run pr-123
```

Built-in journeys, one per recipe in [`features/`](features/README.md):

| Journey | Proves |
| --- | --- |
| `capacity` | Counter floors at 0 and walks Healthy, Approaching limit, At capacity, then Reset. |
| `service-status` | The live list shows three services with health, and Refresh calls the API again. |
| `service-status-states` | Loading, empty, error, and recovery states through the API boundary. |
| `accessibility` | axe finds no WCAG A or AA violations, and Tab reaches every button. |

For behaviour a PR adds, write a journey module and pass its path. It default-exports
`{ id, feature, run }`, where `run({ page, step, expect })` uses Playwright's
`page` and `expect`. Copy the shape from `scripts/journeys.mjs`:

```js
export default {
  id: 'reset-from-capacity',
  feature: 'capacity',
  async run({ page, step, expect }) {
    const region = page.getByRole('region', { name: 'Capacity' });
    await step('reach at capacity', async () => {
      await page.goto('/');
      for (let press = 0; press < 8; press += 1) await region.getByRole('button', { name: 'Increase' }).click();
      await expect(region.getByRole('status')).toHaveText('At capacity');
    });
  },
};
```

```bash
node $V drive ./path/to/journey.mjs --run pr-123
```

Locate by role and accessible name: `region` by its heading, `status` for the
live regions, `button` by label. Scope to a region first, because the page has
two `status` regions.

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
  `/api/` response with its status, console errors, and uncaught page errors.

An uncaught page error fails the journey even when every assertion passes.

Proof standards:

- Drive the real user path. Click buttons by name, and change state only through
  the UI.
- Intercept the network only at `/api/service-status`. That is the boundary to
  the backend. It is the only way to reach loading, empty, and error states.
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

`cleanup` stops the process group of the pid in `instance.json`, only after it
confirms that pid is this run's Vite on this run's port. It deletes
`.verify/<run-id>/instance/` and keeps `.verify/<run-id>/evidence/`. Run it
after every failed launch too. Stop Vite only through that confirmed pid, because
other agents and the user's `pnpm dev` on `:5173` may share the machine.

## Keep the map current

When a PR adds or changes a user-visible path, update the matching file in
`features/` and its journey in `scripts/journeys.mjs` in the same PR. For a full pass, use the pstack
`/maintain-verification-skill` skill when it is installed. The CI suite in `e2e/` is the
behaviour contract. This skill is the tool to drive the app and show proof.
