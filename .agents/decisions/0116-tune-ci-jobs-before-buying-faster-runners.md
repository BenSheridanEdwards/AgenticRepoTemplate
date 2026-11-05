# 116. Tune CI jobs before buying faster runners

- **Status:** Proposed
- **Date:** 2026-11-03

## Context

Agents push, wait for CI, fix the red check and push again, so CI time is
agent time. Paid runner services such as Blacksmith mainly remove the wait
for a machine. Paying for that while each job still spends its time on setup
buys speed for work that should not run.

An audit on 3 November 2026 split 2,564 jobs from the last 150 runs of seven
repositories into waiting, setup and work. The two public repositories on
GitHub-hosted runners waited 3 seconds at p50. The five private repositories
on the Mac mini and Mac Studio runners waited up to 336 seconds at p50 and
over two hours at p90. Checks with under 30 seconds of work spent as long
on setup. One job with no `timeout-minutes` hung for 3.7 hours on a local
runner.

## Decision

Measure each repository before changing its CI. From its last 150 runs,
split every job into waiting (created to started), setup (checkout, toolchain,
install and cache steps) and work (the rest). Repeat the measurement after
each change and put the before and after numbers in the pull request.

Call a repository's CI tuned when all of these hold:

- Each job's setup takes 8 seconds or less at p50.
- Each piece of work runs in one job per run.
- A check whose work takes less time than its setup shares a job with
  other such checks.
- Every job sets `timeout-minutes`, at about three times its p90 and at
  least 5 minutes.

Evaluate a paid runner service for a repository only once its CI is tuned,
and judge it on the waiting time the audit reports. Report waiting time on
local runners; leave pool sizes and placement in the runner controller as
they are while tuning jobs, since shorter jobs free slots.

Keep public repositories on GitHub-hosted runners, which cost nothing there,
unless a paid service runs public repositories free of charge.

Keep the best current knowledge on CI speed in this repository, and update
it when a measurement or a source changes: the audit script
(`scripts/ci-audit.mjs`, run as `pnpm ci:audit`), and the techniques with
their measured gains, runner costs and the baseline in
[docs/ci-speed.md](../../docs/ci-speed.md). Other repositories get pull
requests that cite that page and record no CI notes of their own. Name private repositories there by role, not by name, since
this repository is public.

## Consequences

Each repository's pull requests show the measured gain of each change. The
setup classifier matches step names, so it misreads a step that installs and
tests in one command. GitHub-hosted runners have fixed cores, so public
repositories gain from setup and duplicate-work fixes, not larger machines.
Private repositories keep their local runners until a tuned repository's
waiting time justifies the cost.
