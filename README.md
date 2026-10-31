# Agentic Repo Template

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What it is

A template for building software with coding agents. It gives agents the
context, patterns and checks they need to work in the same codebase.
Executable standards beat written promises. Consistency is infrastructure.
The TypeScript, React and tRPC greeting app gives every gate real code to check.
A person owns the change, reviews the proof, merges and deploys.

## Quick start

Requires Node 22.18 or higher and pnpm. Start with [AGENTS.md](AGENTS.md)
for the operating contract and full command list.

```bash
pnpm install          # install dependencies
pnpm dev              # web at http://localhost:5173 and api at :3001
pnpm lint:policy      # policy, React hooks, and React Compiler rules
pnpm arch:check       # architecture, structure, diagrams, and API reports
pnpm verify           # the full local gate suite
pnpm e2e              # every result's behaviour map and accessibility scans
```

The greeting is deliberately small: enter a name and the api greets it back.
Follow that slice when adding a feature.

## What's inside

| Start here | What it covers |
| --- | --- |
| [Context](AGENTS.md) and [harnesses](.agents/HARNESSES.md) | Agent entry points, commands, hooks and settings. |
| [Quality gates](.agents/project/QUALITY_GATES.md) | Local and CI checks, with the [required-check inventory](docs/required-gates.md). |
| [Ten-minute software factory tour](docs/software-factory-tour.md) | Seven screen-share stops with measured timings, positive/negative controls and explicit enforcement limits. |
| [Definition of Done and PR contract](.agents/project/PR_QUALITY.md) | Completion criteria and the proof a reviewer needs. |
| [Architecture](.agents/project/ARCHITECTURE.md) and [conventions](.agents/project/CONVENTIONS.md) | Module roles, allowed imports and code patterns; [templates](.agents/templates/) to copy. |
| [Product intent](docs/prd/greeting.md) and [North Star](docs/NORTH_STAR.md) | The greeting's promises and the template's direction; [ADRs](.agents/decisions/) record decisions. |
| [Visual regression](apps/web/e2e/__screenshots__/README.md) | How the reference app's Playwright baselines are captured and updated. |
| [Skills](.agents/skills/) | Workflows for adoption, tests, browser verification and PR proof. |
| [Trials](.agents/TRIALS.md) | Running the Todo and Notes trials and reading their evidence. |

## Adopt it

Choose **Use this template** for a new project, or use the [adoption skill](.agents/skills/adopt-the-factory/SKILL.md) in an existing repo.
Follow the [hosted setup checklist](.github/SECURITY.md) to configure security and merge enforcement.

## Tools it builds on

[Fallow](https://github.com/fallow-rs/fallow) checks dead code, cycles,
complexity and architecture. It also supplies the import graph for the role diagram.
Install the Fallow skill in Claude Code with `/install fallow-rs/fallow-skills`.

## License

[MIT](LICENSE).
