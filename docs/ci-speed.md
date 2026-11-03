# CI speed: tune the jobs, then buy runners

Agents push, wait for CI, fix the red check and push again. Every minute CI
takes is a minute every agent session waits, so treat CI as a product. This
page is the repository's best current knowledge on making CI fast: how to
measure it, the bar a repository meets before paying for faster runners
([ADR 0116](../.agents/decisions/0116-tune-ci-jobs-before-buying-faster-runners.md)),
the techniques that work with their measured gains, and the baseline for the
repositories we run. Update it when a measurement or a source changes.

## Measure first

```bash
pnpm ci:audit owner/repo                                  # the last 150 completed runs
pnpm ci:audit owner/repo 300                              # a longer window
pnpm ci:audit owner/repo 150 --until 2026-11-03T15:00:00Z # a frozen before snapshot
pnpm ci:audit owner/repo 150 --since 2026-11-04T00:00:00Z # runs after a change merged
pnpm ci:audit owner/repo --json                           # machine-readable, for comparing two snapshots
```

`scripts/ci-audit.mjs` reads every job of each run attempt and splits it into:

- **Waiting**: the job was created and no runner had started it.
- **Setup**: steps whose names match checkout, toolchain, install, cache or restore.
- **Work**: the rest, after setup and teardown (post steps, uploads, cache saves).

It prints a Markdown table per job, busiest first, then each workflow's pull
request wall-clock: from the run's creation to its last finished job, which is
how long a PR actually waits. Freeze the before window with `--until` before
changing anything, so the window stays fixed as new runs arrive, and paste
both tables into the pull request. The classifier reads step names, so name
each step after what it does and keep install and test in separate steps. A job cancelled before any runner took it counts as waiting only. A single
step that installs and tests inside a container or `dagger call` reads as work,
so read its log for the install time.

Boardy's biggest single fix came from this kind of audit: half their test jobs
missed the dependency cache all year, because GitHub scopes PR caches to their
branch and nothing filled one from main. Agents retried the slow runs instead
of reporting them, so read the audit yourself rather than trusting green runs.

## The bar before paying for runners

A repository's CI is tuned when all of these hold:

- Each job's setup takes 8 seconds or less at p50.
- Each piece of work runs in one job per run.
- A check with less work than setup shares a job with other such checks.
- Every job sets `timeout-minutes`, at about three times its p90.

Then judge a paid runner service on the waiting time the audit reports. Shorter
jobs free runner slots, so tune the jobs before resizing local runner pools.

## Where the time goes, and what to do about it

Each technique lists its measured gain and its status in this template.

### 1. Waiting for a machine

| Technique | Evidence | Template |
| --- | --- | --- |
| Set `timeout-minutes` on every job | Our audit: cancelled jobs held local runners for 24 h, 7 h and 5.3 h | Open |
| Cancel superseded runs with `concurrency: cancel-in-progress` | Each push frees the slots of the run it replaces | Done |
| Move every job when changing runner, the small ones too | Boardy left two 5-second jobs behind; each waited 10 minutes and became the slowest part of the run | Applies when moving |
| Put light jobs of 15 minutes or less on `ubuntu-slim` (1 vCPU container, GA January 2026) | Frees full VMs for heavy lanes; untested here | Open: try for `up-to-date` and `required-gates` |
| Use free arm64 hosted runners (`ubuntu-24.04-arm`, 4 vCPU) in public repositories | Free there like x64; check tool support first | Open: measure |
| Use runners outside GitHub's default pool when waiting dominates | Boardy: up to 11 min waiting down to 8 s. Linear: jobs 34% faster like for like, `tsc` 52% faster | Public repos start in 3 s; not needed |

### 2. Setup

| Technique | Evidence | Template |
| --- | --- | --- |
| Clone blobless (`filter: blob:none`), not shallow | Boardy: checkout 36 s to 12; shallow clones break tools that read history | Done |
| Cap fetch depth, and skip checkout in jobs that need no working tree | Linear: slowest gate 94 s to 20; checkout removal 27 s to 7 | Done for depth |
| Fill the dependency cache from main | Boardy: cache misses fell from half of PR runs to 1% | Done ([ADR 0106](../.agents/decisions/0106-ci-caches-save-only-from-manual-main-runs.md)) |
| Install only the packages a job needs (`pnpm install --filter <pkg>...`) | Linear: install 44 to 73 s down to 16 to 18 | Open: tooling and contract lanes |
| Measure `node_modules` caching against a filtered install | Boardy: a 13 s restore beat a 33 s install. Linear: a 28 s restore lost to a 7.5 s filtered install. Measure yours | Open |
| Bake system packages into a base image or job container | Linear: 7 to 8 s of apt per shard removed | Open: e2e spends about 47 s on setup, mostly `playwright install-deps` |
| Run browser jobs in the official Playwright container image | Playwright's docs prefer this to caching browsers, since a cache restore takes about as long as a download | Open: compare with the current cache ([ADR 0091](../.agents/decisions/0091-parallel-e2e-and-browser-cache.md)) |
| Load a schema snapshot instead of replaying migrations | Linear: database setup 12 s to 1 or 2 per container | Applies when a result has a database |
| Keep the cache inside GitHub's limits | 10 GB per repository and 7 days by default, least recently used entries evicted hourly; larger limits are billed | Watch the store size |

### 3. Work

| Technique | Evidence | Template |
| --- | --- | --- |
| Lint with Oxlint, and keep lint rules free of type information | Boardy: lint 2 min to 5 s. Linear: type-free rules cut lint 55 to 68% | Done ([ADR 0103](../.agents/decisions/0103-eslint-is-retired.md)) |
| Switch typechecker whenever a faster one ships | Boardy: 70 s on `tsc`, 13 on TypeScript 7, under 5 on `bun check`. Linear: 73% faster with `tsgo` | Done: TypeScript 7 ([ADR 0105](../.agents/decisions/0105-typescript-7-is-the-only-typechecker.md)) |
| Transform tests with SWC instead of Babel or type-checking `ts-jest` | One team halved CI time by dropping type-checking from its Jest transform | Done: `@swc/jest` |
| Let test files share a module registry where safe | Vitest `isolate: false`: Boardy 100 s to 35 per shard; Linear slowest shard 379 s to 195. Jest isolates every file and has no such switch | Open: measure module load per Jest file |
| Reset shared state after every file when isolation is off, and tell agents what a test cleans up | Both teams needed this to stop tests leaking into each other | Applies with the item above |
| Split very large test files | Runners balance shards by file, so one huge file holds up its shard (Linear) | Watch |
| Add shards only while the fixed cost per shard stays low | Linear: at 110 to 140 s of setup, eight shards would spend 15 to 19 min on setup alone | Done: three tooling shards |
| Prefer more cores per shard to more shards | Boardy: shards spent most CPU loading modules, so they bought cores | Fixed cores on hosted runners |
| Match worker counts to the runner's cores | Boardy: halving concurrency on 4 vCPU was as fast and removed a flaky test | Open: measure |
| Run short checks concurrently inside one job | Linear: seven jobs became two, saving 11.8% of all CI minutes | Partly: `quality` runs ten checks in one job, one after another |

### 4. The critical path

| Technique | Evidence | Template |
| --- | --- | --- |
| Run lint, typecheck, build and tests as parallel lanes | A PR takes as long as its slowest lane | Done: eleven lanes |
| Move extra work out of the slowest lane | Boardy: 2 min saved by moving migration checks out of shard 1 | Watch the slowest lane |
| Move non-gating work after the gate | Linear: 42 s saved per PR by writing cache markers after the shards | Watch |
| Run only what a PR touches, with a full run on main | Boardy uses `nx affected` with a nightly full suite | Partly: docs-only PRs skip lane work |
| Test the skip logic itself | Boardy hid a change from Nx on purpose; six shards skipped and reported green | Done: `docs-only-scope.test.ts` |

### 5. Before CI

| Technique | Evidence | Template |
| --- | --- | --- |
| Run format, lint and typecheck in a hook before every push | Boardy: 9 s locally beats a CI round trip; agents skip steps written only in AGENTS.md | Done: pre-commit and pre-push hooks |

## Baseline, 3 November 2026

The last 150 runs of each repository, 2,564 jobs in all. The private
repositories run on two local Macs ([local runner setup](architecture/OPTIONAL_LOCAL_MINI_FLEET_ARCHITECTURE.md))
and are named by role, since this repository is public.

| Repository | Runners | Wait p50 | Wait p90 | Setup p50 | Setup share | Work p50 | Runner-min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Private A: desktop monorepo | local | 336 s | 2.1 h | 17 s | 11% | 24 s | 3,118 |
| Private B: macOS app with Linux checks | local | 28 s | 28 min | 6 s | 5% | 7 s | 4,103 |
| Private C: macOS app | local | 2 s | 17 min | 4 s | 9% | 5.1 min | 1,110 |
| Private D: website | local and hosted | 3 s | 82 s | 4 s | 3% | 6 s | 3,091 |
| Private E: Dagger pipeline | local | 40 s | 3 min | 8 s | 30% | 8 s | 157 |
| StyleProof | hosted | 3 s | 17 s | 19 s | 21% | 41 s | 716 |
| AgenticRepoTemplate | hosted | 3 s | 18 s | 3 s | 31% | 13 s | 153 |

The template's setup median counts docs-only lanes that skip install; its
installing jobs spend about 20 s on setup. Private A's 150 runs cover about one day.

### What the baseline shows

1. **Hung jobs fill local runners.** With `timeout-minutes` unset, cancelled jobs
   ran for 24 h, 7 h and 5.3 h in Private D and 5.3 h and 3.7 h in Private B,
   each holding a runner slot. Set a timeout on every job first.
2. **Tiny checks wait longest.** Private A runs nine checks as separate jobs,
   each spending 25 to 42 s on setup for 17 to 33 s of work, then waiting about
   50 minutes at p50 for a slot. Merge them into one job. Its change-detection
   job also runs in two workflows on every PR; run it once.
3. **One macOS test job is two thirds of a repository's runner time.**
   Private B's macOS Swift tests take 24 minutes of work at p50 (69% of its
   runner minutes) and wait 39 minutes at p90 for the one macOS VM slot.
   Private C's Swift gate takes 6 minutes. Cache SwiftPM and DerivedData in
   the runner image and test only the targets a PR touches.
4. **Hosted runners start fast; setup is what remains.** Both public
   repositories wait about 3 s. StyleProof spends 20 to 24 s on setup in every
   e2e and coverage shard; the template spends about 20 s in each installing job.

## Runners and cost

Prices and policies as of 3 November 2026; check the linked page before budgeting.

- **GitHub-hosted, public repositories:** standard runners, including arm64,
  are free and unlimited. Keep public repositories here unless a paid service
  runs them free of charge.
- **GitHub-hosted, private repositories:** prices fell by up to 39% on
  1 January 2026; a 2-core Linux runner is about $0.006 a minute.
- **Self-hosted runners:** free today. GitHub announced a $0.002 a minute
  platform charge for private repositories from March 2026, then postponed it
  with no new date. Re-check before relying on local runners being free.
- **Blacksmith:** 3,000 free 2-vCPU minutes a month per organisation, then
  per-minute billing. Blacksmith publishes no free plan for public
  repositories. Set a spending limit before any trial: one team was invoiced
  after the allowance ran out.
- **Others:** RunsOn is free for non-commercial use; Ubicloud lists a small free
  allowance. Depot and Namespace list trials only.
- **Expect the bill to grow with speed.** Boardy's CI bill went from $230 to
  $4,300 a month for a 20x faster loop. Tune first so that spend buys waiting
  time, not repeated setup.

## Sources

- Owen Gretzinger, [How I made our CI 20x faster](https://x.com/owengretzinger/status/2116291924219060319), 30 October 2026 (Boardy).
- Mufeez Amjad, [CI bottleneck reworked](https://linear.app/now/ci-bottleneck-reworked), 21 September 2026 (Linear).
- GitHub, [Supported runners and hardware resources](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [1 vCPU Linux runner GA](https://github.blog/changelog/2026-01-22-1-vcpu-linux-runner-now-generally-available-in-github-actions/), [cache size above 10 GB](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/), [Actions pricing update](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/).
- [Blacksmith pricing](https://docs.blacksmith.sh/blacksmith-runners/pricing), and the [free-trial invoice report](https://news.lavx.hu/article/blacksmith-s-free-trial-sent-a-1-081-invoice-and-the-fine-print-was-on-their-side).
- [Runner provider comparison](https://github.com/neysofu/awesome-github-actions-runners) for RunsOn, Ubicloud, Depot and Namespace.
