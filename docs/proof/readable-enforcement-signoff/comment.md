<!-- enforcement-approval -->
## Enforcement sign-off

Ran at Friday, the 6th of November, at 11:26 am on commit `aaaaaaa`.

This PR changes gated enforcement or product intent, so it needs sign-off.

| File | What changed | How it affects |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Adds the job `visual`; Removes the step `Install Chromium`; Bumps `actions/setup-node` from `2499707` (`v6.5.0`) to `0123456` (`v7.1.0`); Changes the step `Architecture gate`: run `pnpm arch:gate` → `true`; Adds the step `Run anti-slop lint`; Changes workflow `jobs.visual.runs-on` from `not set` to `"ubuntu-latest"` | Looser: this workflow no longer requires `pnpm arch:gate` to pass; The named jobs, steps, action versions and trigger settings above determine which checks execute |
| `.husky/new-hook` | Adds hook commands `pnpm lint:anti-slop` | The hook now executes `pnpm lint:anti-slop`; their exit results participate in the hook's checks |
| `.husky/old-hook` | Removes hook commands `pnpm lint` | The hook no longer executes `pnpm lint` or their checks |
| `.husky/pre-commit` | Changes hook command order to `exit 0`, `pnpm arch:gate`, `pnpm lint:policy` | Looser: `pnpm arch:gate`, `pnpm lint:policy` become unreachable after the unconditional successful exit |
| `biome.json` | Changes `linter.enabled` from `true` to `false` | Looser: Biome stops linting covered source files |
| `docs/NORTH_STAR.md` | Adds product requirements `new`, `extra`; Removes product requirements `old` | Product intent now includes `new`, `extra` instead of `old`; implementation and behaviour tests must follow the revised intent |

@maintainer: tick to approve.
- [ ] Approve these enforcement changes at `aaaaaaa`
<!-- enforcement-head:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -->
