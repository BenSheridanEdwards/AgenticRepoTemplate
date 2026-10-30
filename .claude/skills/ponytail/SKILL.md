---
name: ponytail
description: >-
  Optional. Use for coding, review, refactor or design to choose deletion,
  existing patterns and stdlib or platform features before abstractions or
  dependencies.
---

# Ponytail

This skill is optional. No gate requires it.
The simplicity rules in [AGENTS.md](../../../AGENTS.md) and
[REVIEW.md](../../../REVIEW.md#scope-and-simplicity) apply whether you use it or not.

## Checks

- Keep the smallest diff that delivers the change. Move unrelated churn,
  renames or reformatting to their own PR.
- Check whether deleting code solves the problem before adding code.
- Look for an existing pattern in the repo before introducing another one.
- Check stdlib and native platform features before adding an abstraction
  or dependency.
- Confirm one logical change per PR so a reviewer can hold the whole change
  in mind.
- For a new dependency, confirm an ADR names it and explains why it earns
  its place against these checks.
- Use `map`, `filter`, `flatMap` or `reduce` where they express a transform
  instead of loops, `let` accumulators or in-place mutation.

Keep behaviour and the task's scope intact while applying these checks.
