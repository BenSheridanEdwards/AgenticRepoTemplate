# TODO

Forward-handoff work, each item with an acceptance criterion precise enough that
a reviewer can tell when it is done. Keep this honest: an item stays here until
its acceptance criterion is met and proven.

## Re-run the interactive (LLM-graded) architecture audits against current HEAD

The committed reports under `.architect-audits/` graded an older commit
(`02d36ecca8746812e4265a3f6534a2c2cdbeefb2`) and cite the repo's former name
`AgenticProjectTemplate`. They are stale (see `.architect-audits/README.md`).

The **deterministic, headless** signals have since been re-run at commit
`9d91a70b269d5eaba95b6abeb1b6d5a30a109226` and their real results recorded in
`.architect-audits/DETERMINISTIC_RECHECK.md` (typecheck, Biome, fallow audit and
health, coverage, build, size, license, secret scan, dependency audit, all
green). What remains is the interactive pass.

- **Acceptance:** each audit under `.architect-audits/*/metadata.json` records the
  current repo name (`AgenticRepoTemplate`) and a commit reachable from `main` at
  the time of the run; `findings.md` no longer references the former name; the
  re-run is reproducible via the documented `/…-audit` commands in `README.md`.
  This item is only done once the five LLM-graded audits themselves are
  re-generated, not merely the deterministic recheck above.
