# Why does this feature exist?

<!-- The problem, risk, or capability this PR addresses, in user, product, or
technical terms. Replace this comment with real content; do not leave the
section as bullets only. -->

-

# What changed?

<!-- The smallest reviewable summary of the diff. Call out new configuration,
migrations, permissions, dependencies, or public API changes. -->

-

# Behavioural Proof (with video and screenshots)

<!-- User-visible behaviour changes need screenshots and (for motion/timing)
video from THIS branch, committed under docs/proof/<short-scope>/ and embedded
inline: ![alt](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1).
Bare links, local paths, and relative paths are not proof. If nothing renders,
write `Not applicable` with the technical reason. The StyleProof visual gate
posts its per-change report as the `<!-- styleproof-report -->` PR comment —
review it there. -->

- Video:
- Screenshots:
- Behaviour tests:
- E2E mapping:

# Verification Summary

<!-- Exact commands and pass/fail results after the final code change. Keep local
proof, GitHub Actions status, and unverified gaps in separate lines. -->

- Commands run (e.g. `pnpm verify`, `pnpm e2e`):
- Results:
- Definition of Done (`.agents/project/DEFINITION_OF_DONE.md`) satisfied, or each gap named:
- [ ] `pnpm verify`
- [ ] `pnpm e2e`
- [ ] Visual proof attached or embedded inline, or `Not applicable` with reason.
- [ ] StyleProof `<!-- styleproof-report -->` comment reviewed, or `Not applicable` with reason.
- [ ] Latest-sha GitHub Actions are green; any pending or failing checks are named with a fix plan.
- [ ] Behaviour is covered by the E2E map when user-visible behaviour changed.
- [ ] Logic is unit-tested where logic changed.
- [ ] Accessibility considered and verified for interactive/UI changes.
- [ ] The diff follows `.agents/project/ARCHITECTURE.md` and `CONVENTIONS.md`; new decisions recorded as ADRs.
- [ ] No gates were bypassed or weakened.
- Known risks or skipped checks (with reason, risk, and rollback):

# PR Proof Law

- [ ] I followed `.agents/project/DEFINITION_OF_DONE.md` and `.claude/skills/pr-inline-screenshot-proof/SKILL.md`.
- [ ] Screenshots are committed and embedded inline with `![alt](...png?raw=1)`, or the proof section says `Not applicable` with the technical reason.
- [ ] The PR body has no bare screenshot links, local paths, relative paths, or proof placeholders.
