# 122. The sign-off follows the guarded changes, stays last, and names what changed

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-04
- **Amends:** [0024](0024-sign-off-only-loosening-enforcement-changes.md),
  [0119](0119-describe-enforcement-changes-in-plain-english.md)

## Context

The maintainer reported three problems with the enforcement sign-off:

- The gate edits its comment in place, so on a long PR the newest sign-off sits
  at its first position, far up the conversation. On one PR it could not be
  found, and its checkbox could not be ticked.
- The tick is bound to one head commit. Updating a ticked PR with main makes a
  new head, so the tick is lost even when the guarded changes are the same, and
  the approver has to tick again after every update.
- Lint configs, lint plugins, Git hooks and product documents fell back to a
  line count such as "Changes 134 lines: adds 134, removes 0", which says
  nothing about what changed.

## Decision

**The newest sign-off is last.** On a PR event, when the comment's text or its
commit changes, the gate posts the comment fresh at the bottom of the PR and
deletes every older gate comment. An edit event (a tick, an untick, or an edit
the gate reverts) still updates the comment in place.

**Approval follows the guarded changes.** The gate fingerprints the guarded
changes: each guarded file's path, status, old path and GitHub patch, with the
hunk line numbers removed, hashed with SHA-256. On a PR event for a new head,
the gate carries an earlier approval to that head only when all of these hold:

- this PR's gate comment shows a ticked, labelled box for an earlier head;
- the gate's own latest `enforcement-approval` status on that earlier head is
  the sign-off;
- the gate reads the earlier head's guarded changes from GitHub again, and the
  two fingerprints are identical.

Any guarded patch that changes, including a context line, or a guarded file
without a patch, clears the tick. Only the approver's own tick creates an
approval, as before. A carried approval posts a success status on the new head
that names both commits, and the reposted comment repeats who approved, when,
and the commit they ticked. The commit statuses keep the audit trail.

**Changes are named.** Lint configs and plugins name the plugins they load, the
lint rules they add or remove, and the rules they turn on, off or re-rank. Git
hooks name the commands they add, remove or replace. Product documents name the
sections they add, remove or rewrite. A line count follows only when more than
two lines changed. Every remaining fallback quotes the first changed line, for
example "Replaces `npx lint-staged` with `true`".

## Consequences

An update from main keeps the approver's tick when it leaves the guarded hunks
alone, so a ticked PR can be brought up to date and merged without a second
tick. An update that touches a guarded hunk, or its context, needs a new tick.
The gate makes one more API call (a compare) on PR events that may carry an
approval. Deleting the old comment removes its edit history from the PR; the
commit statuses and the new comment's label keep the record of who approved
which commit.

This decision applies from the moment it is on main, because the workflow runs
main's script. A tick given under the earlier rule carries too, because the gate
recomputes both fingerprints itself and does not rely on stored ones.
