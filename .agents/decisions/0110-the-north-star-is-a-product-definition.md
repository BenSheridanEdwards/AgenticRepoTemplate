# 110. The North Star is a product definition

- **Status:** Proposed
- **Date:** 2026-11-03
- **Builds on:** [0060](0060-product-intent-needs-sign-off.md),
  [0061](0061-refine-the-software-factory-philosophy.md)

## Context

On 3 November 2026 the maintainer defined AgenticRepoTemplate as a software
factory template, not a repo skeleton. The maintainer named the goals, the
product purpose, the reproducibility test, three sibling tools and the
outcome. The North Star stated only the engineering principles.

## Decision

- `docs/NORTH_STAR.md` opens as a product definition: what it is, who it is
  for, the problem, the goals, what it does, the reproducibility test,
  the sibling tools, the outcome and its measures, and the non-goals.
- StyleProof, BehaviourProof and MergeFlow are sibling tools. None of them is
  wired into this repo. MergeFlow is a separate project, and this repo
  builds none of it.
- Measures without a gate are targets. Questions only the maintainer can answer
  stay in the North Star's "Open questions".
- Principles 1 to 9 keep their numbers and headings, because lint comments and
  docs cite their anchors.
- The glossary gains **Reproducibility test**.

## Consequences

Gates and configs stay as they are. The North Star change needs the approver's
enforcement sign-off ([0060](0060-product-intent-needs-sign-off.md)).
