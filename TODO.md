# TODO

Forward-handoff work, each item with an acceptance criterion precise enough that
a reviewer can tell when it is done. Keep this honest: an item stays here until
its acceptance criterion is met and proven.

## Re-run the architecture audits against current HEAD

The committed reports under `.architect-audits/` graded an older commit
(`02d36ecca8746812e4265a3f6534a2c2cdbeefb2`) and cite the repo's former name
`AgenticProjectTemplate`. They are stale (see `.architect-audits/README.md`).

- **Acceptance:** each audit under `.architect-audits/*/metadata.json` records the
  current repo name (`AgenticRepoTemplate`) and a commit reachable from `main` at
  the time of the run; `findings.md` no longer references the former name; the
  re-run is reproducible via the documented `/…-audit` commands in `README.md`.

## Enforce the architecture-drift claim with fallow boundary zones

The README and audits claim architecture drift is caught, but `.fallowrc.jsonc`
defines no boundary zones, so cross-feature back-imports are not actually gated —
only asserted.

- **Acceptance:** `.fallowrc.jsonc` declares boundary zones (e.g. features may not
  import each other's internals; only barrels are public) that match
  `.agents/project/ARCHITECTURE.md`; `pnpm fallow:audit` fails on a deliberate
  cross-feature back-import and passes on the clean tree; the new gate is a
  documented, runnable check, not a claim.

## Grow the carrier app with a second, async feature

There is one synchronous feature (`threshold-counter`), so the E2E, a11y, and
visual gates never exercise loading or error states, and the architecture audit
cannot measure cross-feature coupling.

- **Acceptance:** a second `src/features/*` slice with an async/route surface
  exists, built from the templates; `e2e/app.spec.ts` covers its loading and
  error states through roles and visible text; jest-axe and `@axe-core/playwright`
  pass on it; a StyleProof surface captures it; and the architecture audit now has
  cross-feature coupling to measure.
