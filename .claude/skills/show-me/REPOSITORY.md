# Repository guidance

These repository rules override conflicting instructions in `SKILL.md`.

- Use a view for a non-trivial pull request when it removes review ambiguity.
- Choose the smallest useful view. Verify it against the source, and name the source files, symbols, states, or commands.
- Keep trivial pull requests view-free.
- A view explains evidence. Tests, screenshots, reports, source links, warnings, and uncertainty stay alongside it.
- Prefer inline text, a diff, a tree, or Mermaid. Use HTML only when those formats leave the point unclear.
- Write permitted HTML under `.show-me/<task>/`, keep it local and uncommitted, and open it only when the user asks.
- Build views from the existing dependencies.
