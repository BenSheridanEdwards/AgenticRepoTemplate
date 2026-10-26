# Anti-slop provenance

- Upstream: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`.
- Mapping: `src/<path>` → `vendor/anti-slop/<path>`; upstream `LICENSE` →
  `vendor/anti-slop/LICENSE`. Tests, docs, skill, scripts and examples are
  intentionally not vendored, except the nested Stylistic provenance notice.
- Copied files are unmodified upstream bytes, checked against `UPSTREAM.sha256`.
  This provenance file and the two manifests are repository metadata.

Some files arrive in line-range parts across PRs. `UPSTREAM.prefixes` records
SHA-256, first-N-line count and repository-relative path for those prefixes.
`pnpm check:anti-slop-vendor` and the Jest tooling suite check every present
file. Before the root `.oxlintrc.json` exists, absent files and declared prefixes
are allowed. Once it exists, every listed file must be present and whole.

Security cleared this upstream revision with caveats on 25 October 2026:
copy only from the verified snapshot, preserve hashes and licences, install
dependencies with scripts disabled, and review the native bindings before use.
The later wiring must pin `oxlint` and `@oxlint/plugins` to `1.78.0`, retain
lockfile integrity, and omit optional peers and native-library overrides.

To update, obtain Security review first for the new commit and dependencies,
copy the approved upstream files without modification, regenerate whole-file
and applicable prefix hashes, update this record, and run the provenance tests.
