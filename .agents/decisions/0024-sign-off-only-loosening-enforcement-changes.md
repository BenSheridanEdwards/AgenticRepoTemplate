# 24. Ben signs off only the changes that loosen enforcement

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** [0023](0023-protect-only-the-files-that-run-the-gates.md), which
  sets the guarded paths
- **Supersedes in part:** [0007](0007-protect-enforcement-paths-by-default.md),
  [0018](0018-dependency-manifests-are-not-enforcement-paths.md),
  [0023](0023-protect-only-the-files-that-run-the-gates.md)

## Context

The `enforcement-approval` gate from [ADR 0007](0007-protect-enforcement-paths-by-default.md)
asked for a sign-off on every change to a protected path.
[ADR 0023](0023-protect-only-the-files-that-run-the-gates.md) narrowed those
paths to the files that run the gates, but any change to one of them still waited
on the same tick, whether it raised a lint rule or turned it off. Any reviewer
with write access could tick the box. A tick also stayed valid across pushes
that left the protected files alone.

FLEET's lint guard ([FLEET #2202](https://github.com/BenSheridanEdwards/FLEET/pull/2202))
asks only when lint gets looser or its config is rewritten, accepts one approver,
and binds the tick to the head commit. This ADR brings the same model to this
repo's gate. The repo keeps one gate, one status, and one checkbox.

## Decision

### Who signs off, and for which commit

- `APPROVER` in [`scripts/enforcement-approval.mjs`](../../scripts/enforcement-approval.mjs)
  is `BenSheridanEdwards`. The gate turns green only on a fresh tick: the
  comment edit event whose sender is that GitHub user and whose change turns
  the current head's unticked box into a ticked one, with nothing else changed.
  The gate compares the event's `changes.body.from` and new body with the
  comment it would render for the head. It also checks that the live comment
  still has that body and that edit's `updated_at`.
- Any other edit of the comment clears the box. That covers a tick from any
  other account, which the comment then names in a one-line note, and an edit
  by Ben that keeps a tick while it changes other text. The gate writes one
  comment per PR and nothing else, so no second gate comment can be edited to
  look like an approval.
- The comment names the PR head commit, and its checkbox reads
  `Approve these enforcement changes at <sha>`. Every push gives a new head,
  merging `main` in included. The gate then rewrites the comment unticked, and
  the status for the new head stays red until Ben ticks again.
- The workflow still runs main's copy under `pull_request_target`. It reads the
  PR's changed files and their contents at the merge base and at the head
  through the API, and it never runs PR code.

### The approval label

On a fresh tick the gate rewrites the box line as
`- [x] Approve these enforcement changes at <sha> <sub><i>Approved by Ben @BenSheridanEdwards on Monday, the 12th of October, at 3 pm</i></sub>`.
The name comes from the ticker's GitHub profile, or their login when the
profile has none. The login comes from the event sender. The time is the
comment's `updated_at` in Europe/London, so it reads GMT in winter and BST in
summer. GitHub drops colour styles, so the label shows as small italic text.

The gate writes the label for people and never reads it as a sign-off. Unticking
removes it, and a new head gets an unticked comment with no label. A label typed
into the comment is an edit, so the gate clears it. A later run keeps a label
only while the gate's own latest status for the head is Ben's sign-off.

### Wrong-tick paths

Each path below could show a ticked box, or turn the status green, without a
fresh tick by Ben on the current head. The tests in
`scripts/enforcement-approval.test.ts` cover each fix.

1. **The gate carries a tick forward.** Main's copy rewrote PR #81's comment
   at 10:50:50 with the box still ticked. Now the gate builds every body from
   scratch: unticked, labelled from this edit, or the note for a PR with nothing
   to sign off. A later run leaves a labelled comment in place only when it
   matches the current head and the gate's own latest status for that head is
   Ben's sign-off. A status posted by anyone else does not count.
2. **A tick for an older head.** A tick on a comment that names an earlier
   head, including a tick that races a push, is cleared and the new head stays
   red.
3. **Someone else ticks, or leaves a tick.** Their edit is not a fresh tick, so
   the gate clears the box and names them in the comment. Main's copy posts that
   note as a second comment, which anyone with write access can edit into a
   ticked box that no run ever reads. This version posts no second comment.
4. **Ben edits other text and keeps the tick.** Only the change from unticked
   to ticked counts, so the gate clears it.
5. **A forged head, label, or sign-off line.** The new body differs from the
   ticked comment for the head, so the gate clears it.
6. **A status on another commit.** The gate reads the head live and posts there.
   It never uses the commit the event names.
7. **Runs out of order.** A tick run that finds the comment changed since the
   tick approves nothing. Any other edit clears the box, so an untick wins over
   a label written just before it. On PR #81 at 11:23 Ben's account unticked and
   re-ticked four seconds apart, and both runs of main's copy read the re-ticked
   comment and passed. This version clears both, and Ben ticks once more.
8. **A rerun of an old run.** A rerun replays the old event, so the gate checks
   it against the live comment, `updated_at` included. A rerun of a tick after
   an untick stays red, even when someone types the ticked body back. A rerun
   after the label writes nothing.
9. **A comment the gate did not write.** The gate reads only its own comment.
   An edit that removes the marker still reaches the gate, which restores the
   comment unticked. A gate comment that lost its marker but keeps the approval
   line is restored by the next run too, so no orphan stays ticked.
10. **A run that never ran.** GitHub cancels a queued run when a newer one
    joins the concurrency group, and anyone with write access can cancel a run.
    The group sits on the job, so an edit of any other comment, whose job is
    skipped, no longer cancels a queued gate run. A forged tick or label whose
    own run never ran is cleared by the next gate run, because the gate's status
    for the head is not the sign-off.

Four paths stay open:

- Anyone acting with Ben's GitHub credentials ticks as Ben.
- Anyone with write access can post an `enforcement-approval` status on a
  commit. The gate ignores statuses from people. A workflow on any branch of
  this repository, in a PR or not, posts statuses and edits comments as GitHub
  Actions, the same author as the gate. Neither the gate nor a branch-protection
  rule can tell those apart, so such a workflow can show a green status and a
  labelled box. Closing this needs an author that only the gate can use, which
  is a repository settings change.
- Between an edit and the run that clears it, the comment shows what the
  editor typed. The status is the record, not the comment.
- An edit that lands in the second between the gate reading the comment and
  writing it is overwritten, and a cancelled queued run drops Ben's tick. Both
  fail closed. Ben ticks again.

### What asks for a sign-off

ADR 0023 decides which files are guarded, and this record adds the gate's own
script and test to them. This record decides which changes to them ask. The gate compares each guarded file at the merge base with the same
file at the head. The guard table `GUARDS` lists the guarded files in order, and
the first match decides the rule.

| Area | Files | Asks for sign-off when |
| --- | --- | --- |
| Enforcement-approval gate | `.github/workflows/enforcement-approval.yml`, `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts` | any edit |
| CI workflows | the rest of `.github/workflows/**` | any edit |
| Git hooks | `.husky/**` | any edit |
| Lint config | `eslint.config.js`, `commitlint.config.ts`, `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs` | any edit |
| Biome config | `biome.json` | the config rules below |

Code can loosen a gate in ways a text comparison cannot rank, and the gate never
runs PR code, so any edit to a workflow, a hook, the gate's own script or test,
or a JavaScript or TypeScript lint file asks for a sign-off. Deleting a guarded file also asks.

The config rules read `biome.json` (comments and trailing commas allowed) and
compare each value at the merge base with the same value at the head:

1. **Ignore lists.** Adding an entry to a list whose key contains `ignore` or
   `exclude` asks for a sign-off. Removing one passes.
2. **Include lists** (`include`, `includes`, `files`). Adding a positive entry
   or removing a `!` negation passes. Removing a positive entry or adding a `!`
   negation asks. Creating an include list where none existed asks, because an
   absent list covers every file. Inside `overrides`, any change to the files an
   override covers asks.
3. **Rule severity** under a `rules` key, ranked `off`, `info`, `warn` and `on`,
   then `error`. Lowering a rule asks, and so do adding a rule below `error` and
   removing a rule above `off`. Raising a rule, adding a rule at `error`, and
   removing an `off` rule pass.
4. **Strictness flags.** Setting `enabled` or `recommended` to `false` asks, and
   so does removing one that was `true` or setting it to `null`. Setting
   `useIgnoreFile` or `ignoreUnknown` to `true` asks. `STRICT_WHEN_TRUE` and
   `LOOSE_WHEN_TRUE` in the script hold the lists.
5. **Neutral settings pass.** These are `$schema` and the `formatter` and
   language `formatter` settings.
6. **Any other added, removed, or changed value asks.** Examples are `extends`,
   `assist` actions, and rule options.

A PR that lists 3000 files or more, the most the files API returns, asks for a
sign-off, because the gate cannot see every guarded file.

A change to any other file passes without a comment. That includes app code,
docs, `package.json`, `tsconfig.json`, `.claude/`, `.gitignore`, and the rest
of `scripts/`, as ADR 0023 decides.
When a PR stops loosening enforcement, the gate replaces its comment
with a short note that has no checkbox.

### What this replaces

- From ADR 0007, this record replaces the content checks and the sign-off by
  any reviewer with write access. ADR 0023 replaced its protected-path list.
- From ADR 0018, nothing more: ADR 0023 replaced it, and `package.json` and
  `pnpm-lock.yaml` stay outside the gate.
- From ADR 0023, this record keeps the path set, adds the gate's own script and
  test to it, and replaces the rest: the
  approver is Ben alone, the tick is bound to the head commit and resets on each
  push, and only a change that loosens or rewrites a guarded file asks.

## Consequences

- Only a change to a hook, a workflow, or a lint file can ask. Tightening
  `biome.json` merges without a tick, for example raising a rule to `error`.
- Anyone acting with Ben's GitHub credentials can tick the box, a tool or an
  agent included. GitHub sends `BenSheridanEdwards` as the sender, and the gate
  accepts it.
- The workflow runs main's copy of the script, so the approver, the head-bound
  tick and the label take effect once this record's change is on main.
- The status context stays `enforcement-approval`. Branch protection does not
  require it today, so the gate reports without blocking until a maintainer
  requires it.
- The gate reads text and JSON. A loosening hidden in a `package.json` script,
  `tsconfig.json`, or another script a workflow runs stays with the reviewer, as
  ADR 0023 records.

## Resolved: the gate guards its own script and test

ADR 0023 left `scripts/enforcement-approval.mjs` and its test out of the guarded
set, so a PR that changed the approver, `GUARDS`, or the judges reached main on
review alone. Ben resolved this: the gate's own script and test are now guarded.
They join `.github/workflows/enforcement-approval.yml` in the
Enforcement-approval gate area, and any edit to them asks for a sign-off. Main's
copy still judges every PR, so a change to the script takes effect once it
merges, and Ben's tick comes first. ADR 0023's path set otherwise stands.
