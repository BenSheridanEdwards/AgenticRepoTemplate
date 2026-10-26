# Todo browser proof

Captured from this branch's working tree against its own Vite server and real
api, launched on free ports by the repository verification skill. The browser
called `/trpc`; no mock handlers or network interception were used. The two
proof servers were stopped through the skill's PID-checked cleanup.

Reproduce from the repository root:

```sh
node .claude/skills/verify-agentic-template/scripts/verify.mjs launch --run todos-proof
node .claude/skills/verify-agentic-template/scripts/verify.mjs doctor --run todos-proof
node .claude/skills/verify-agentic-template/scripts/verify.mjs drive todos --run todos-proof
node .claude/skills/verify-agentic-template/scripts/verify.mjs cleanup --run todos-proof
```

All doctor checks and all four journey steps passed:

1. Blank title shows `Enter a title` — `validation.png`.
2. Add `Read the Todo brief` through the api.
3. Complete it and reload; it remains checked — `completed-after-reload.png`.
4. Reopen it and delete it; the checkbox disappears.

`journey.webm` records the full journey. Both committed screenshots were opened
and inspected. The authoritative behaviour and WCAG checks live in
`apps/web/e2e/todos.spec.ts`; full local and latest-head CI results are recorded
in the PR body.
