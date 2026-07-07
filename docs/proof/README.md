# Proof artifacts

Screenshots, videos, and other rendered evidence for a pull request live here,
under a `docs/proof/<short-scope>/` directory named for the change (for example
`docs/proof/threshold-counter-error-state/`).

## Rules

- Commit the proof files on the PR branch **before** writing the PR body.
- Embed screenshots inline in the PR description with Markdown image syntax and a
  `?raw=1` GitHub blob URL:

  ```md
  ![Descriptive alt text](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)
  ```

- Bare screenshot links, local filesystem paths, and relative paths are **not
  proof**. The proof section of `.github/pull_request_template.md` must contain
  an inline image (`![`) or the exact string `Not applicable` with a technical
  reason — the `PR quality` workflow (`scripts/validate-pr-body.mjs`) enforces
  this.
- Videos may be linked as committed artifacts, but at least one screenshot must
  render inline.

See `.claude/skills/pr-inline-screenshot-proof/SKILL.md` and
`.agents/project/DEFINITION_OF_DONE.md` for the full contract.
