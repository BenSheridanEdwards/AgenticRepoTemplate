# Accessibility

The whole page meets WCAG 2.1 A and AA as axe measures it in real Chromium,
including colour contrast, with and without the validation error showing. The
`Name` field and the `Greet` button are native controls that keyboard users
reach with Tab, in visual order.

## Sub-features

- `a11y-axe` finds no violations for the tags `wcag2a`, `wcag2aa`, `wcag21a`,
  and `wcag21aa`, on the fresh page and with the `Enter a name` alert.
- `a11y-keyboard` reaches the `Name` field, then the `Greet` button, with Tab.

## How to get to it (user POV)

- Open `/` and use the keyboard only.
- Press Tab from the top of the page.

## Driving it with verify.mjs

Preconditions:

- `doctor` passes for the run.

- **Scan.** Run `node $V drive accessibility --run <id>`. The first two steps
  print `PASS`. A failure prints each violation as `<rule-id>: <help>`.
- **Keyboard.** The third step presses Tab twice from a fresh load. Focus lands
  on the `Name` field, then on `Greet`.
- **Proof.** The `.aria.yml` from each step is the accessibility tree the scan
  saw. It is also what a screen reader reads, but no screen reader runs here.

## Gotchas

- axe opens a helper page, so its video is removed and only `video.webm` stays.
- `page.goto` returns before React renders the form. Wait for the `Greet`
  button to be visible before the first Tab, or focus lands on nothing.
