# Service status

The Service status card loads the monitored services from
`GET /api/service-status` and lists each one with a health pill: `Operational`,
`Degraded`, or `Down`. `Refresh` loads the list again. The card shows a loading
message while the request is pending, an empty message for an empty list, and
an error message when the request fails.

## Sub-features

- `status-list` shows each service name with its health label.
- `status-refresh` sends a new request and shows the new answer.
- `status-loading` shows `Loading service status…` while the request is pending.
- `status-empty` shows `No services are being monitored yet.` for `[]`.
- `status-error` shows `Could not load service status.` and the reason for a
  failed request.
- `status-recover` shows the list again after a failed request and a refresh.

## How to get to it (user POV)

- Open `/`. The Service status card is under the Capacity card and loads by
  itself.
- Press the `Refresh` button in the card header.

## Driving it with verify.mjs

Preconditions:

- `doctor` passes, which includes `service API answers (3 services)`.

- **Live list.** Run `node $V drive service-status --run <id>`. The list has
  three items: `Web application Operational`, `Public API Degraded`, and
  `Background jobs Down`.
- **Refresh.** The journey presses `Refresh` and waits for a new request to
  `/api/service-status`. The list still has three items. `manifest.json` lists
  every `GET .../api/service-status 200` with the load calls first.
- **States.** Run `node $V drive service-status-states --run <id>`. It holds the
  first request, then answers `[]`, then `500`, then lets the real endpoint
  answer.
- **Loading.** While the request is held, the status reads
  `Loading service status…`.
- **Empty.** After the `[]` answer, the card reads
  `No services are being monitored yet.`
- **Error.** After `Refresh` with a `500` answer, the card reads
  `Could not load service status. Service status request failed with HTTP 500`.
- **Recover.** After `Refresh` with the real endpoint, the list has three items.
- **Proof.** `03-a-failing-api-shows-the-error-message.png` shows the red error
  line. `manifest.json` shows the `500` response.

## Gotchas

- React StrictMode in dev can fetch twice on mount. Count requests as the change
  since a click.
- Loading, empty, and error states need interception at
  `**/api/service-status`. The real endpoint always answers with three services.
- An intercepted `500` logs a `Failed to load resource` console error. It is
  expected and listed in `consoleErrors`.
- The list and the messages live inside one unnamed `status` region. Scope to
  `getByRole('region', { name: 'Service status' })`.
