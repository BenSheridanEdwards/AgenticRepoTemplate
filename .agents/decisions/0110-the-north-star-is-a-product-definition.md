# 110. The North Star is a product definition

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-11-03
- **Builds on:** [0060](0060-product-intent-needs-sign-off.md),
  [0061](0061-refine-the-software-factory-philosophy.md)

## Context

On 3 November 2026 Ben defined AgenticRepoTemplate as his software factory
template, not a repo skeleton. He named three goals, the product purpose, the
reproducibility test, three sibling tools and the outcome he wants. The North
Star stated only the engineering principles.

## Decision

- `docs/NORTH_STAR.md` opens as a product definition: what it is, who it is
  for, the problem, Ben's three goals, what it does, the reproducibility test,
  the sibling tools, the outcome and its measures, and the non-goals.
- StyleProof, BehaviourProof and MergeFlow are sibling tools. None of them is
  wired into this repo. MergeFlow is not Ben's project to build.
- Measures without a gate are targets. Questions only Ben can answer stay in
  the North Star's "Open questions for Ben".
- Principles 1 to 9 keep their numbers and headings, because lint comments and
  docs cite their anchors.
- The glossary gains **Reproducibility test**.

## Consequences

Gates and configs stay as they are. The North Star change needs Ben's
enforcement sign-off ([0060](0060-product-intent-needs-sign-off.md)).
