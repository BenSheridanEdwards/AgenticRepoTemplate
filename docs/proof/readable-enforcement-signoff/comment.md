<!-- enforcement-approval -->
## Enforcement sign-off

This PR loosens or rewrites what the gates enforce, or changes product intent:

| File | Area | Change |
| --- | --- | --- |
| `.github/workflows/ci.yml` | CI workflows | Adds the job `visual`; Removes the step `Install Chromium`; Bumps `actions/setup-node` from `2499707` (`v6.5.0`) to `0123456` (`v7.1.0`); Changes the step `Architecture gate`; Adds the step `Run anti-slop lint` |
| `.husky/new-hook` | Git hooks | Adds this file |
| `.husky/old-hook` | Git hooks | Deletes this file |
| `biome.json` | Biome config | Sets `linter.enabled` to `false` |
| `docs/NORTH_STAR.md` | Product intent | Changes 3 lines: adds 2, removes 1 |

@maintainer signs off by ticking the box below in GitHub. The tick counts for commit `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` only. A new push clears it, and a tick from any other account is cleared.
- [ ] Approve these enforcement changes at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
