# Readable enforcement sign-off proof

The sample input is in `sample-changes.json`. `comment.md` is the exact output
of this branch's `enforcementProblems()` and `signoffComment()`, with a sample
head of forty `a` characters and `ENFORCEMENT_APPROVER=maintainer`.

`comment.png` renders that output through GitHub's Markdown API (`gh api
markdown`, GFM mode), with a local stylesheet for readability. It shows the
branch's generated comment, rather than the live gate comment, because the
trusted workflow runs main's script until this change merges. The checkbox
stays unticked. No live sign-off comment was edited to make this proof.

To reproduce the Markdown from the repository root:

```sh
ENFORCEMENT_APPROVER=maintainer node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { enforcementProblems, signoffComment } from './scripts/enforcement-approval.mjs';
const changes = JSON.parse(readFileSync('docs/proof/readable-enforcement-signoff/sample-changes.json', 'utf8'));
const body = signoffComment({ head: 'a'.repeat(40), problems: enforcementProblems(changes) });
writeFileSync('docs/proof/readable-enforcement-signoff/comment.md', body);
JS
```

The focused Jest suite covers the summaries, escaping, repeatability and tick
protocol. Its eleven initial summary regressions fail on the original script;
the full suite passes after the change. The app E2E map remains unchanged
because the changed surface is a GitHub automation comment, outside the app.
