<!-- enforcement-approval -->
## Enforcement sign-off

Ran at Friday, the 6th of November, at 11:26 am on commit `aaaaaaa`.

This PR changes gated enforcement or product intent, so it needs sign-off.

| File | Area | Change |
| --- | --- | --- |
| `.github/workflows/ci.yml` | CI workflows | Adds the job `visual`; Removes the step `Install Chromium`; Bumps `actions/setup-node` from `2499707` (`v6.5.0`) to `0123456` (`v7.1.0`); Changes the step `Architecture gate`: run `pnpm arch:gate` → `true`; Adds the step `Run anti-slop lint` |
| `.husky/new-hook` | Git hooks | Adds this file |
| `.husky/old-hook` | Git hooks | Deletes this file |
| `.husky/pre-commit` | Git hooks | Moves 3 lines: first moved line `exit 0` |
| `biome.json` | Biome config | Sets `linter.enabled` to `false` |
| `docs/NORTH_STAR.md` | Product intent | Edits 3 lines (adds 2, removes 1), starting with `old` → `new` |

@maintainer: tick to approve.
- [ ] Approve these enforcement changes at `aaaaaaa`
<!-- enforcement-head:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -->
