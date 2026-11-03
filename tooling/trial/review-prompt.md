# Anti-slop review of {{ID}}

You review one finished to-do trial result. Read the code in `showcase/{{ID}}/`. Read `AGENTS.md`, `REVIEW.md`, `.agents/project/ARCHITECTURE.md` and `.agents/project/CONVENTIONS.md` when you need the rules of this codebase. Only read. Change no file.

Judge the code by one question: would you want this code as your codebase?

Slop is code that adds words, layers or types and gives no evidence or value for them. Flag each case of slop with its file and line. Look for these cases:

- A type assertion that invents evidence, such as a chain of `as` casts, or an assertion without a `// SAFETY:` comment that the nearby code checks.
- A known value that is widened to `unknown`, `object` or an open dictionary and then narrowed again.
- An ad hoc `typeof` check where the code must parse the value at the I/O boundary.
- Module mocking where a real seam can do the work.
- A reducer that copies its accumulator, or an eager intermediate array.
- A change that only hides a lint finding, such as an assertion split across two bindings or a value sent through `unknown`.
- A wrapper, helper, abstraction or comment that adds nothing.
- Code that breaks the rules of this codebase: an arbitrary Tailwind value, an inline style, a one-off CSS value, a primitive built again instead of taken from `@repo/ui`, state outside a custom `use*` hook, or an import across a data-layer boundary.
- A name that is vague or adds noise.

Praise what is good, with its file and line: code that is simple and clear and follows this codebase.

Put each flag in a group. Give each group a short name for one kind of problem, for example `type assertions`, `boundaries`, `styling`, `state`, `tests`, `naming` or `noise`.

Give your answer as one JSON object and nothing more:

```json
{
  "wouldWant": "yes",
  "why": "One or two sentences.",
  "flags": [{ "group": "noise", "file": "showcase/{{ID}}/web/src/example.ts", "line": 12, "note": "One or two sentences." }],
  "praise": [{ "file": "showcase/{{ID}}/api/src/example.ts", "line": 3, "note": "One or two sentences." }]
}
```

Set `wouldWant` to `yes` or `no`. Set `line` to `null` when a note is about a whole file. Use an empty list when you have no flag or no praise. Write each note in one or two short sentences of standard English.
