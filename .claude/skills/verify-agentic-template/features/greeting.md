# Greeting

The Greeting page takes a name and shows the api's greeting for it. Submitting
`Ada` shows `Hello, Ada!` in the `status` region. A blank or whitespace name
shows the alert `Enter a name` and sends no request. A failed request shows the
alert `Could not load the greeting`. The api trims the name and answers a blank
one with `BAD_REQUEST`.

## Sub-features

- `greeting-success` sends one `GET /trpc/greeting.greet` and shows the
  greeting from its answer.
- `greeting-validation` checks the name in the form with its Effect schema, so
  a blank name never reaches the api.
- `greeting-error` shows the request error when the api fails.

## How to get to it (user POV)

- Open `/`. The `Greeting` heading sits above one card with the `Name` field
  and the `Greet` button.
- Type a name and press `Greet` or Enter.

## Driving it with verify.mjs

Preconditions:

- `doctor` passes for the run, including `greeting api answers through /trpc`.
- The page is freshly loaded, so the status region is empty.

- **Run the journey.** Run `node $V drive greeting --run <id>`. Every step
  prints `PASS` and the last line reads `PASS journey=greeting`.
- **Blank name.** Press `Greet` with an empty field. The alert reads
  `Enter a name` and the journey sees no `/trpc/` request.
- **Success.** Type `Ada` and press `Greet`. The status reads `Hello, Ada!`, the
  alert is gone, and `manifest.json` lists one `/trpc/greeting.greet` response
  with status 200.
- **Whitespace.** Run `node $V drive greeting-validation --run <id>`. A name of
  spaces shows `Enter a name`, the field has `aria-invalid="true"`, and no
  request leaves.
- **Request error.** Run `node $V drive greeting-error --run <id>`. It answers
  `**/trpc/**` with a 500, and the alert reads `Could not load the greeting`.
- **Proof.** `03-a-name-gets-its-greeting-from-the-api.png` shows
  `Hello, Ada!`, and its `.aria.yml` shows `status: Hello, Ada!`.

## Gotchas

- The greeting query does not retry, so the request error shows at once.
- tRPC batches calls, so the request URL reads
  `/trpc/greeting.greet?batch=1&input=...`.
- Submitting the same name again asks the api again, which is how a user
  retries after a request error.
