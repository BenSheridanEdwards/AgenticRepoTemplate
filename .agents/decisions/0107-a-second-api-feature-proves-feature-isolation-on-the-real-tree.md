# 107. A second api feature proves feature isolation on the real tree

- **Status:** Accepted (merged in #289)
- **Date:** 2026-11-02

## Context

The maintainer chose a small recent greetings feature with in-memory storage on 31 October.
The greeting feature has no integrations file, and the existing isolation tests
use fixture features. A second feature gives the template a working example
of storage and lets the policy tests use real source.

## Decision

Add recent greetings with domain, application, procedures, integrations and a
public index. Keep its validation schema inside its own procedures. Mount it
beside greeting without changing greeting behaviour.

Use greeting as the stateless api model and recent greetings as the storage
model. Its `integrations.ts` closes over an array and imports domain types only.
Its application calls the pure domain rule before writing names to storage.
The list holds ten names, newest first, and disappears on api restart.

Oxlint `policy/slice-isolation` owns api feature isolation. Fallow's api zones
follow roles, so their allowed application-to-domain edge cannot reject an
import from a sibling feature. Keep those zones unchanged.
Extend the existing single-run Oxlint fixture tree with the real application
at its real relative path, sibling-feature violations, a rejected internal
import and an allowed public entry import from the api composition layer.

Split the api feature and its proof from the follow-up change titled
"feat(web): show recent greetings on the greeting page" to keep each review
focused. Keep the working-example guidance here to avoid optional edits to
shared architecture guidance during trial merge-back.

Name the procedures map in the router's type annotation. This keeps the new
feature's generated report short enough that Git does not mistake a deleted
trial report for its source during rename detection. Keep the shared api report
and result diagram regenerated; both merge without adding trial conflicts.

## Consequences

The api now demonstrates storage without a new dependency. Tests use fresh
module stores; HTTP tests use unique names and relative order because parallel
clients share the process store. The web route landed in #290.
