# 35. Compare the three Todo results within the spec freedoms

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Implements:** [0034](0034-trial-harness-and-evidence.md)
- **Adds to:** [0014](0014-fallow-owns-architecture-checks.md), superseding none of it

## Context

The brief asks for three independent Todo runs that each pass the unweakened
checks, and for a comparison of their structure, public API, dependencies,
component boundaries and conventions in which every difference sits within a
spec freedom. It also asks for the full pass count, with failed runs kept.
[0034](0034-trial-harness-and-evidence.md) runs one trial and records its
evidence. Nothing yet reads the three records and results together.

[0014](0014-fallow-owns-architecture-checks.md) measures architecture
consistency between `main` and a pull request head. This ADR measures
something else, the consistency between independent generations of one
brief, so it adds to 0014 and supersedes none of it.

## Decision

**One generated report.** `node tooling/trial/compare.mjs` reads every
`docs/trials/<id>.json` through `validateEvidence`, each passed run's
committed `showcase/<id>/`, and each failed run's `docs/trials/<id>.patch`,
and writes `docs/trials/comparison.md`. `tooling/trial/compare.test.ts`
regenerates the report and fails when the committed copy differs, so
`pnpm verify` keeps it current. It reads committed files: its one git call is
`git ls-files`, which lists a passed run's tracked files, and the only
packages it loads are the repo's own devDependencies (`typescript` for the
syntax-only parse), so it runs the same on a shallow CI checkout. It accepts
only records with `agent.fake: false`, and stops on any other record before
the report renders.

**Landed code is checked against its evidence.** Before it compares, the
script checks that the code it reads is the code each record names: the run's
files (a passed run's tracked files under `showcase/<id>`, a failed run's
patch files) equal `result.changedPaths` under `showcase/<id>/`, the stream at
`stream.path` hashes to `stream.sha256`, and the result folders under
`showcase/` are the passed runs, compared as sets. A mismatch fails the script
and names the field.

**Failed runs are compared too.** A failed run keeps its JSON and patch and
stays out of `showcase/` ([0034](0034-trial-harness-and-evidence.md)). The
report reads its result from the patch, which holds only new files, compares
it like the others and marks it failed with the recorded reason. For each
path in `outsideReads` it quotes the first tool call input in the run's
committed stream that names the path, and states the harness rule it broke: a
tool call that names a path outside the workdir that existed before the agent
ran fails the run ([0034](0034-trial-harness-and-evidence.md)). It then lists
the `/tmp` paths each run's tool calls name, and says which ones were new
during their run and which existed before it. A failure that every run
shares in behaviour reads as such. The cause of a pre-existing path is not in
the evidence, so the author states it in `OUTSIDE_PATH_CAUSES` in
`compare.mjs`, and a cause that names no recorded outside path fails the
script.

**Pass count and verdict.** The report opens with `Full pass count x/n`,
the number of records with status `passed` over the number of records, and
a line on each failed run's cause. The consistency verdict follows,
separately: `consistent` when every difference is `identical` or
`spec-freedom`, else `inconsistent`. One table per dimension comes next, as
PLAN orders it. The runs, the baseline, the method, the departures and the
diagrams follow the tables.

**Shared baseline.** The report proves the runs shared one baseline: equal
scaffold revision, enforcement revision, lockfile hash, prompt template hash,
harness hash, CLI version, resolved model and user config hash, the template
file's hash equal to the recorded one, each recorded prompt re-rendered from
the template with `renderPrompt`, and distinct session ids. A field that
differs shows `no`, and the verdict states that the baseline differs. A fake
agent needs no row: such a record stops the script first. Next to the table,
the report names the enforcement revision the runs recorded and gives the
author's account of what trunk changed since, from `TRUNK_DRIFT` in
`compare.mjs`. CI checks out one commit, so the script cannot read the head's
enforcement revision from git. `TRUNK_DRIFT` names the revision it starts
from, and the script fails when that is not the one every run recorded, so a
new baseline makes the author rewrite it. A gate change since the recorded
revision is the new-baseline rule of [0034](0034-trial-harness-and-evidence.md),
so the reader sees whether the gates that judged the runs still judge the
head.

**Dimensions.** Each dimension compares a normalized form, so a name alone
makes no difference. Facts come from the committed generated artifacts
(`architecture.mmd`, `etc/*.api.md`, `package.json`) and, where no artifact
holds the fact, from a syntax-only parse of the result's source. The report
also shows each run's generated diagram without its header, so a reader sees
the shapes the Structure rows compare.

| Dimension | Normalized form | Must be identical |
| --- | --- | --- |
| Structure | Diagram roles and role edges, file and test count per role, the text of each other file outside every role | Role set and role edges |
| Public API | Procedures by kind and operation, with input and output shapes and field names kept; export names and kinds per scaffold-role API report, export kind counts per other API report | One list query and three mutations for create, toggle and delete; create takes `title: string`; toggle and delete take `id`; the item shape has exactly `id`, `title` and `completed: boolean` |
| Dependencies | Dependency names and ranges per package | Equal sets |
| Component boundaries | Components per role, props shape, `@repo/ui` primitives used | Page in `web-routes`; form controls from `@repo/ui` where a primitive exists; feature components only in `web-routes` and `ui` |
| Conventions | Hook calls per hook, `effectTsResolver` use, storage role | Server state in `use*` hooks through `useTrpc`; one form through React Hook Form and Effect Schema; storage in `api-integrations` |

The operation of a procedure comes from its shape: the query with no input
that returns an array lists, the mutation that takes a title creates, and of the two that take an
id, the one that returns the item toggles. Names reach only written forms,
with two exceptions: a router key breaks a tie between two `{ id }` mutations
whose outputs match, and a type name the result does not declare stays as
written. Every router member counts. A member of a kind other than query or
mutation, such as a subscription, or of a type the parse cannot read, is its
own unrecognized procedure, so the operations check breaks. The item shape
keeps each field's optionality, so an optional `title` breaks the item check.
A hook call counts whether it is written `useX()` or `React.useX()`.

The scaffold roles are the ones the reference fills with scaffold code:
`web-app`, `web-api-client`, `api-app` and `api-trpc`, listed once in
`SCAFFOLD_ROLES`. They are fixed, not free: a difference in their files,
components, hooks or export names is `outside-spec`, and freedom 2 covers
only the other roles. Freedom 2 is about placement. A role's components
differ inside it only when the role-wide multiset of `@repo/ui` primitives,
raw controls and hook calls is equal in every run, and a role's hooks only
when the role-wide multiset of their calls is equal. Calls to the result's
own hooks drop out of that multiset, since they only move code. A change to
what the role uses or calls is `outside-spec`. The scaffold's own components (`App`, the api
providers) sit outside `web-routes` in the reference too, so the boundary rule
reads "feature components", while the `@repo/ui` primitive rule holds the
components of every role.

Each file outside every role that no other aspect reads (not a manifest, a
generated artifact or a test; today `web/index.html` and `web/vite.config.ts`)
is compared by its text, with the result's id as `{id}`, shown as a short
SHA-256. A difference is `outside-spec`, except a change inside the `<title>`
of `web/index.html`, which is copy text under freedom 5.

Freedom 6 reads the checks: the test counts sit under it only when every
compared run's `verify` check exited `0`.

## Spec freedoms

1. Identifier and file names inside a role, including component, hook, procedure and router key names.
2. How a role splits into files, components, hooks and functions.
3. The type and generation of `id`.
4. What a mutation returns.
5. Copy text and styling outside the UI contract names.
6. Test names and the number of tests beyond what the gates require.
7. Optional roles left empty, when all three agree.

These are the only differences that keep results consistent. The script
marks every difference it cannot place in a freedom `outside-spec`. The
author writes notes in `AUTHOR_NOTES` in `compare.mjs`, each naming one
`outside-spec` aspect and a reason. A note without a freedom only explains:
the aspect stays `outside-spec`, and the note is its Why cell, marked as the
author's. A note with a freedom is a ruling: it moves the aspect into that
freedom, and the report lists it under "Rulings by the author", a section it
leaves out when no ruling lands. A ruling's freedom must be an integer
from 1 to 7, or the script fails. A note that matches no `outside-spec`
difference fails the script. `compare.test.ts` holds this list equal to the
script's.

## Consequences

- The first report reads `Full pass count 2/3` and `inconsistent`. All
  three agents redirected their check output to logs under `/tmp`. todo-02
  and todo-03 wrote to paths that were new during their runs, which the
  allowlist of [0034](0034-trial-harness-and-evidence.md) covers. todo-01
  wrote `pnpm verify > /tmp/verify.log 2>&1; …`, and `/tmp/verify.log`
  already existed from an unrelated job on the shared box. The harness fails
  a run on any tool call that names such a path, so todo-01 failed, though
  its four checks exited 0. The behaviour was the same in all three runs;
  only the leftover file differed. The count stays 2/3 under the rule as
  merged, and PLAN allows no retry once the agent has started.
- Two aspects sit outside the spec, each with an author's note and no ruling.
  todo-03 holds a type-only edge from `api-procedures` to `api-domain`: it
  annotates its toggle procedure's return type with `Todo`, imported type-only
  from `domain.ts`. The contract allows the direction, and the freedom list
  keeps role edges fixed. todo-02's api-client barrel leaves out the
  `RouterInputs` re-export the reference and the other runs have: its route
  hook types its arguments from `RouterOutputs`, `fallow audit` flagged the
  re-export as an unused type export, and the agent removed it from
  `index.ts`, while `trpc.ts` still declares it. `web-api-client` is a
  scaffold role, so its export names are fixed. The report keeps both outside
  the spec rather than widening a freedom after seeing the results.
- Changing a freedom, a dimension or a note changes the report, and the
  drift test asks for the regenerated report in the same change. The drift
  test reads every record in `docs/trials/` and every result in `showcase/`,
  so a later trial or result changes the report in the same change too.
- The template hash row reads `tooling/trial/todo-prompt.md` as committed, so
  a later prompt change shows that row as `no`. That is the new-baseline rule
  of [0034](0034-trial-harness-and-evidence.md) at work: new trials, new
  records, a new report.
- The source parse is syntax-only, so it reads a type the result declares in
  its own files and treats any other type name as written.
- No dependency is added.
