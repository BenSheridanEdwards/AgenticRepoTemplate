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
changes: every guarded path with its exact text at the merge base and at the
head, hashed with SHA-256. On a PR event for a new head, the gate carries an
earlier approval to that head only when all of these hold:

- this PR's gate comment shows the gate's own ticked label for an earlier head,
  matched against a strict pattern and naming the approver's handle;
- the gate's own latest `enforcement-approval` status on that earlier head is
  the sign-off, and the fingerprint it names equals this head's;
- GitHub lists that earlier head as a commit of this PR;
- the PR lists fewer files than the API limit, and the earlier head's
  comparison lists fewer than 300, so no guarded file can hide;
- for a sign-off made before fingerprints, whose status names none, the gate
  reads the earlier head's guarded files from GitHub again and the two
  fingerprints are identical.

The sign-off status names the fingerprint it approved. A later run on the same
head keeps the approval only while the current fingerprint matches, so moving
the PR to another base, or any other change to the guarded text, clears it.

Any difference in any guarded file clears the tick. That includes an update
from main that itself changed a guarded file the PR also changes, because the
merge-base text differs. Only the approver's own tick creates an approval, as
before. A carried approval posts a success status on the new head that names
both commits. The reposted comment rebuilds the label from its checked parts:
who approved, when, and the commit they ticked. The commit statuses keep the
audit trail.

**Changes are named.** Lint configs and plugins name the plugins they load, the
lint rules they add or remove, and the rules they turn on, off or re-rank. Git
hooks name the commands they add, remove or replace. Product documents name the
sections they add, remove or rewrite. A line count follows unless
the named sentences account for every changed line. Every remaining fallback quotes the first changed line, for
example "Replaces `npx lint-staged` with `true`".

## Consequences

An update from main keeps the approver's tick when it leaves the guarded hunks
alone, so a ticked PR can be brought up to date and merged without a second
tick. An update from main that changes a guarded file the PR also changes needs a
new tick.
The gate makes one more API call (a compare) on PR events that may carry an
approval. Deleting the old comment removes its edit history from the PR; the
commit statuses and the new comment's label keep the record of who approved
which commit.

This decision applies from the moment it is on main, because the workflow runs
main's script. A tick given under the earlier rule carries too, because the gate
recomputes both fingerprints itself and does not rely on stored ones.
