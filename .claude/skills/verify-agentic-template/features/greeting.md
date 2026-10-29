# Greeting

The Greeting page submits a name to the api. `Ada` shows `Hello, Ada!` in
`status`; a blank or whitespace name shows the `Enter a name` alert without a
request. A failed request shows `Could not load the greeting`. The api trims
names and rejects blank ones with `BAD_REQUEST`.

## Sub-features

- `greeting-success` sends one `GET /trpc/greeting.greet` and shows its answer.
- `greeting-validation` uses the form's Effect schema to stop blank names before a request.
- `greeting-error` shows the request error when the api fails.

## How to get to it (user POV)

- Open `/`. The `Greeting` heading sits above a card with `Name` and `Greet`.
- Type a name and press `Greet` or Enter.

## Driving it with verify.mjs

Require a passing `doctor`, including `greeting api answers through /trpc`,
and a fresh page with an empty status region.

- Run `node $V drive greeting --run <id>`. Every step prints `PASS`; the last line reads `PASS journey=greeting`.
- Press `Greet` with an empty field. The alert reads `Enter a name`; no `/trpc/` request leaves.
- Type `Ada` and press `Greet`. Status reads `Hello, Ada!`, the alert clears,
  and `manifest.json` lists one `/trpc/greeting.greet` response with status 200.
- Run `node $V drive greeting-validation --run <id>`: spaces show `Enter a name`,
  set `aria-invalid="true"`, and send no request.
- Run `node $V drive greeting-error --run <id>`: answer `**/trpc/**` with 500
  and check the `Could not load the greeting` alert.
- `03-a-name-gets-its-greeting-from-the-api.png` shows `Hello, Ada!`; its `.aria.yml` shows `status: Hello, Ada!`.

## Gotchas

- The greeting query has no retries, so request errors show at once.
- tRPC batches calls: `/trpc/greeting.greet?batch=1&input=...`.
- Submit the same name again to retry the api after a request error.
