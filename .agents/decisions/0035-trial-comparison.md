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
and writes `docs/trials/COMPARISON.md`. `tooling/trial/compare.test.ts`
regenerates the report and fails when the committed copy differs, so
`pnpm verify` keeps it current. It reads committed files only, with no git
history and no installed packages, so it runs the same on a shallow CI
checkout. It accepts only records with `agent.fake: false`.

**Failed runs are compared too.** A failed run keeps its JSON and patch and
stays out of `showcase/` ([0034](0034-trial-harness-and-evidence.md)). The
report reads its result from the patch, which holds only new files, compares
it like the others and marks it failed with the recorded reason.

**Pass count and verdict.** The report opens with `Full pass count x/n`,
the number of records with status `passed` over the number of records. The
consistency verdict follows, separately: `consistent` when every difference
is `identical` or `spec-freedom`, else `inconsistent`.

**Shared baseline.** The report proves the runs shared one baseline: equal
scaffold revision, enforcement revision, lockfile hash, prompt template hash,
harness hash, CLI version, resolved model and user config hash, the template
file's hash equal to the recorded one, each recorded prompt re-rendered from
the template with `renderPrompt`, real agents and distinct session ids. A
field that differs shows `no`, and the verdict states that the baseline
differs.

**Dimensions.** Each dimension compares a normalized form, so a name alone
makes no difference. Facts come from the committed generated artifacts
(`architecture.mmd`, `etc/*.api.md`, `package.json`) and, where no artifact
holds the fact, from a syntax-only parse of the result's source. The report
also shows each run's generated diagram without its header, so a reader sees
the shapes the Structure rows compare.

| Dimension | Normalized form | Must be identical |
| --- | --- | --- |
| Structure | Diagram roles and role edges, file and test count per role | Role set and role edges |
| Public API | Procedures by kind and operation, with input and output shapes and field names kept; export kinds per API report | One list query and three mutations for create, toggle and delete; create takes `title: string`; toggle and delete take `id`; the item shape has exactly `id`, `title` and `completed: boolean` |
| Dependencies | Dependency names and ranges per package | Equal sets |
| Component boundaries | Components per role, props shape, `@repo/ui` primitives used | Page in `web-routes`; form controls from `@repo/ui` where a primitive exists; feature components only in `web-routes` and `ui` |
| Conventions | Hook calls per hook, `effectTsResolver` use, storage role | Server state in `use*` hooks through `useTrpc`; one form through React Hook Form and Effect Schema; storage in `api-integrations` |

The operation of a procedure comes from its shape: the query with no input
lists, the mutation that takes a title creates, and of the two that take an
id, the one that returns the item toggles. A router key decides only a tie.
The scaffold's own components (`App`, the api providers) sit outside
`web-routes` in the reference too, so the boundary rule reads "feature
components".

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
author may move one into a freedom only by a ruling in `RULINGS` in
`compare.mjs` that names the freedom and the reason. The report shows each
ruling as the author's, and a ruling that matches no `outside-spec`
difference fails the script. `compare.test.ts` holds this list equal to the
script's.

## Consequences

- The first report reads `Full pass count 2/3` and `inconsistent`. todo-01
  failed because its agent wrote `/tmp/verify.log`, a file that existed before
  the run, and the harness counts any tool call naming such a path. Its four
  checks exited 0. todo-03 holds one difference outside the spec freedoms: a
  type-only edge from `api-procedures` to `api-domain`, which the contract
  allows and the other two runs leave out. The freedom list names no edge, so
  the report keeps it outside the spec rather than widening a freedom after
  seeing the results.
- One ruling lands. todo-02's api-client leaves out the `RouterInputs` type
  alias the reference and the other runs export, because its route hook types
  its inputs from `RouterOutputs`. The ruling places it under freedom 2.
- Changing a freedom, a dimension or a ruling changes the report, and the
  drift test asks for the regenerated report in the same change.
- The template hash row reads `tooling/trial/todo-prompt.md` as committed, so
  a later prompt change shows that row as `no`. That is the new-baseline rule
  of [0034](0034-trial-harness-and-evidence.md) at work: new trials, new
  records, a new report.
- The source parse is syntax-only, so it reads a type the result declares in
  its own files and treats any other type name as written.
- No dependency is added.
