# Accessibility

The whole page meets WCAG 2.1 A and AA as axe measures it in real Chromium,
including colour contrast. Every control is a native button that keyboard users
reach with Tab, in visual order.

## Sub-features

- `a11y-axe` finds no violations for the tags `wcag2a`, `wcag2aa`, `wcag21a`,
  and `wcag21aa`.
- `a11y-keyboard` reaches `Decrease`, `Increase`, `Reset`, and `Refresh` in that
  order with Tab.

## How to get to it (user POV)

- Open `/` with a screen reader or keyboard only.
- Press Tab from the top of the page.

## Driving it with verify.mjs

Preconditions:

- `doctor` passes and the service list has loaded, so the scan covers the
  success state.

- **Scan.** Run `node $V drive accessibility --run <id>`. The first step prints
  `PASS`. A failure prints each violation as `<rule-id>: <help>`.
- **Keyboard.** The second step presses Tab four times from a fresh load. The
  focused buttons are `Decrease`, `Increase`, `Reset`, `Refresh`.
- **Proof.** The `.aria.yml` from step 1 is the accessibility tree the scan
  saw.

## Gotchas

- Scan after the list loads. A scan during loading misses the health pills,
  which carry the colour-contrast risk.
- The journey scans only the success state. To scan the error or empty state,
  write a journey that intercepts `**/api/service-status` first.
- axe opens a helper page, so its video is removed and only `video.webm` stays.
