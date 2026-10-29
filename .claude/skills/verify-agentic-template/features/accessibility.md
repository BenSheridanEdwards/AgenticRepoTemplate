# Accessibility

In real Chromium, axe finds no WCAG 2.1 A or AA violations, including colour
contrast, with and without the validation error. Tab reaches the native `Name`
field and `Greet` button in visual order.

## Sub-features

- `a11y-axe` finds no `wcag2a`, `wcag2aa`, `wcag21a`, or `wcag21aa` violations
  on the fresh page or with the `Enter a name` alert.
- `a11y-keyboard` reaches `Name`, then `Greet`, with Tab.

## How to get to it (user POV)

- Open `/` and use only the keyboard. Press Tab from the top of the page.

## Driving it with verify.mjs

Require a passing `doctor` for the run.

- Run `node $V drive accessibility --run <id>`. The two scan steps print `PASS`, or each violation as `<rule-id>: <help>`.
- The third step presses Tab twice from a fresh load: focus reaches `Name`, then `Greet`.
- Each step's `.aria.yml` is the scanned accessibility tree a screen reader would read. No screen reader runs here.

## Gotchas

- axe opens a helper page; its video is removed, leaving only `video.webm`.
- `page.goto` returns before React renders. Wait for `Greet` to be visible before the first Tab so focus reaches the form.
