# Proof artifacts

Screenshots, videos, and other rendered evidence for a pull request live here,
under a `docs/proof/<short-scope>/` directory named for the change (for example
`docs/proof/greeting-error-state/`).

## Rules

- Commit the proof files on the PR branch **before** writing the PR body.
- Embed screenshots inline in the PR description with Markdown image syntax and a
  `?raw=1` GitHub blob URL:

  ```md
  ![Descriptive alt text](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)
  ```

- The `PR quality` workflow (`scripts/validate-pr-body.mjs`) checks that the
  proof section embeds an image or says `Not applicable` with a reason, and
  that every image is an absolute `https://` URL GitHub can render.
- Link videos as committed artifacts, alongside at least one inline screenshot.

See `.claude/skills/pr-quality-contract/SKILL.md` and
`.agents/project/DEFINITION_OF_DONE.md` for the full contract.
