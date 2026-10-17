# Capacity

The Capacity card counts toward a limit of 8. A status pill reads `Healthy`
below 4, `Approaching limit` from 4, and `At capacity` from 8. The count never
goes below 0, and `Reset` returns it to 0.

## Sub-features

- `capacity-increase` adds one per `Increase` press, past 8 if pressed again.
- `capacity-decrease` removes one per `Decrease` press and stops at 0.
- `capacity-status` changes the pill at 4 and at 8, in both directions.
- `capacity-reset` returns the count to 0 and the pill to `Healthy`.

## How to get to it (user POV)

- Open `/`. The Capacity card is the first card under the page heading.
- Use the `Decrease`, `Increase`, and `Reset` buttons by mouse or keyboard.

## Driving it with verify.mjs

Preconditions:

- `doctor` passes for the run.
- The page is freshly loaded, so the count is `0`.

- **Run the journey.** Run `node $V drive capacity --run <id>`. Every step
  prints `PASS` and the last line reads `PASS journey=capacity`.
- **Zero floor.** Press `Decrease` at 0. The region text contains `0/ 8` and the
  status reads `Healthy`.
- **Warning level.** Press `Increase` four times. The text contains `4/ 8` and
  the status reads `Approaching limit`.
- **Critical level.** Press `Increase` four more times. The text contains `8/ 8`
  and the status reads `At capacity`.
- **Step back down.** Press `Decrease` once. The text contains `7/ 8` and the
  status reads `Approaching limit`.
- **Reset.** Press `Reset`. The text contains `0/ 8` and the status reads
  `Healthy`.
- **Proof.** `04-four-more-increases-reach-at-capacity.png` shows the red
  `At capacity` pill. The matching `.aria.yml` shows `status: At capacity`.

## Gotchas

- The page has two `status` roles. Use
  `getByRole('region', { name: 'Capacity' }).getByRole('status')`.
- The count and limit are separate spans, so the region text reads `8/ 8`, not
  `8 / 8`. The ARIA snapshot shows `8 / 8`.
- The count lives in React state only. A reload resets it, so do every step in
  one page load.
