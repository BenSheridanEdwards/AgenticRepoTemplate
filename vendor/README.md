# Vendored dependency patches

Upstream has not published patched releases for these advisories yet. Until they
do, we vendor the community fixes with bumped versions so `pnpm audit
--audit-level=high` stays green without ignoring the GHSAs.

| Package | Vendored version | Advisory | Source |
| --- | --- | --- | --- |
| `braces` | 3.0.4 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | [FSDevelop/braces@28d440b](https://github.com/FSDevelop/braces/commit/28d440b5dd449dbf1fe6f3506cf94ecca4d02660) (PR micromatch/braces#72) |
| `extract-zip` | 2.0.2 | [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | [Seal-Integrations/extract-zip@148750a](https://github.com/Seal-Integrations/extract-zip/commit/148750acb10c574818906de2a99aa13d457d5329) (PR max-mapper/extract-zip#160) |

Wired via `overrides` in `pnpm-workspace.yaml`. Delete this directory and the
matching `file:vendor/...` overrides once npm publishes real `braces@>=3.0.4`
and `extract-zip@>=2.0.2`.
