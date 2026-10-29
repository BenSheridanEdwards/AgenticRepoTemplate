#!/usr/bin/env node
/**
 * Writes docs/trials/comparison.md: the full pass count, the proof that the
 * Todo trials shared one baseline, and every aspect of the results compared
 * under ADR 0035 and ADR 0037, each identical, inside a named spec freedom,
 * or outside the spec. `node tooling/trial/compare.mjs` writes it;
 * compare.test.ts holds the committed report equal to a fresh one.
 *
 * @typedef {import('./evidence.mjs').TrialEvidence} TrialEvidence
 * @typedef {import('./result-facts.mjs').ResultFacts} ResultFacts
 * @typedef {import('./dimensions.mjs').Comparison} Comparison
 * @typedef {import('./dimensions.mjs').Difference} Difference
 * @typedef {{ readonly evidence: TrialEvidence, readonly source: string, readonly facts: ResultFacts }} Run
 * @typedef {{ readonly id: string, readonly paths: readonly { readonly path: string, readonly before: boolean }[] }} TmpPaths
 *   the distinct `/tmp` paths a run's tool calls name, in first-seen order; `before`: in `result.outsideReads`
 * @typedef {{ readonly since: string, readonly text: string }} Drift
 *   the author's account of the trunk changes since the enforcement rev `since` the runs recorded
 * @typedef {{
 *   readonly label: string,
 *   readonly proof: string,
 *   readonly values: readonly string[],
 *   readonly holds: boolean,
 * }} BaselineCheck
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { listResults } from '../results.mjs';
import { andList, compareResults, REVOKED_FREEDOMS, SCAFFOLD_ROLES } from './dimensions.mjs';
import { validateEvidence } from './evidence.mjs';
import { readContract, readResultFacts, sortText, treeFromPatch } from './result-facts.mjs';
import { renderPrompt } from './run-trial.mjs';
import { streamEvents, toolInputs } from './stream.mjs';

export const REPORT_PATH = 'docs/trials/comparison.md';
const TRIALS = 'docs/trials';
const matchesBrief = (evidence, brief) =>
  (evidence.schema === 2 ? evidence.task?.name : 'todo') === brief;

/**
 * The author's notes on outside-spec aspects (PLAN, Risks). A note with a
 * `freedom` is a ruling that moves its aspect into that freedom; a note without
 * one keeps the aspect outside the spec and gives its cause.
 *
 * @type {readonly import('./dimensions.mjs').AuthorNote[]}
 */
const AUTHOR_NOTES = [];

/**
 * The author's statement of where each path came from that a run found outside
 * its workdir before its agent ran; the evidence records only that it existed.
 *
 * @type {Readonly<Record<string, string>>}
 */
const OUTSIDE_PATH_CAUSES = {
  '/tmp/verify.log': 'from an unrelated job on the shared box',
};

/**
 * The author's account of what trunk changed after the trials ran. CI checks
 * out one commit, so the report cannot read the head's enforcement rev from
 * git; `since` must equal the rev every run recorded, so a new baseline makes
 * the author rewrite it.
 *
 * @type {Drift}
 */
const TRUNK_DRIFT = {
  since: '3d35bf1c35f3b3ce16a3bfb2b4df8f3424441cc1',
  text: 'After the trials ran, trunk merged `1321f04` (#93), which changes only `scripts/enforcement-approval.mjs` and its test, the gate that asks for approval of gate changes. It then merged #94, which adds this comparison under `tooling/trial`, and #95, which keeps the trial harness tests reliable under load and finds a stray server through `/proc` in `system.mjs`. #96 (ADR 0036) moves the workspace to Effect 4. It migrates the todo-02 and todo-03 sources, tests and manifests mechanically, adds the Effect 4 runners to the contract rules and names the `Schema.toStandardSchemaV1` idiom in the ESLint policy plugin. todo-01 is a patch, so it keeps Effect 3, and the four aspects outside the spec come from that move; the trial rerun on the Effect 4 trunk replaces all three results. #97 blocks inline lint-disable comments. This change adds ADR 0037, which admits a type-only import between any two roles in `.fallowrc.jsonc` and keeps every value direction. Every gate that judged the showcase code still judges it, and the boundary rules only admit more type-only imports.',
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** ADR 0034 "New baseline" fields that every run records alike. */
const EQUAL = [
  ['Scaffold rev', (e) => e.scaffold.rev],
  ['Enforcement rev', (e) => e.scaffold.enforcementRev],
  ['Lockfile SHA-256', (e) => e.scaffold.lockfileSha256],
  ['Prompt template SHA-256', (e) => e.prompt.templateSha256],
  ['Harness SHA-256', (e) => e.harness.sha256],
  ['CLI version', (e) => e.agent.version],
  ['Resolved model', (e) => e.agent.resolvedModel ?? '(none)'],
  ['User config SHA-256', (e) => e.agent.userConfigSha256],
];

/** Session ids and clone directories vary between fresh runs of the same agent. */
function normalizedAgentArgv(evidence) {
  const { argv, sessionId } = evidence.agent;
  const cloneIndex = argv.indexOf('-C');
  const clone = cloneIndex === -1 ? null : argv[cloneIndex + 1];
  return JSON.stringify(
    argv.map((arg) => {
      let normalized = sessionId ? arg.replaceAll(sessionId, '{session}') : arg;
      if (clone) normalized = normalized.replaceAll(clone, '{clone}');
      return normalized;
    }),
  );
}

/**
 * One row per baseline field: equal across runs, one fixed value in each run,
 * re-derived from committed text, or distinct per run.
 *
 * @param {readonly TrialEvidence[]} evidences
 * @param {(path: string) => string} readText
 * @returns {readonly BaselineCheck[]}
 */
export function proveBaseline(evidences, readText) {
  const each = (label, proof, read, holds) => {
    const values = evidences.map(read);
    return { label, proof, values, holds: evidences.every((e, i) => holds(e, values[i])) };
  };
  const template = (e) => {
    const current = readText(e.prompt.path);
    // Schema 1's scaffold template predates ADR 0048's appended safety section.
    const legacy = current.split('\n## Shared machine\n')[0];
    return e.schema === 1 && sha256(legacy) === e.prompt.templateSha256 ? legacy : current;
  };
  return [
    ...EQUAL.map(([label, read]) =>
      each(
        label,
        ['CLI version', 'Resolved model', 'User config SHA-256'].includes(label) &&
          evidences.some((e) => e.schema === 2)
          ? 'equal within each agent; agent is the variable under test'
          : 'equal across runs',
        read,
        (e, value) =>
          evidences
            .filter(
              (other) =>
                !['CLI version', 'Resolved model', 'User config SHA-256'].includes(label) ||
                (other.agent.name ?? 'claude') === (e.agent.name ?? 'claude'),
            )
            .every((other) => value === read(other)),
      ),
    ),
    ...(evidences.some((e) => e.schema === 2)
      ? [
          ...[
            ['Agent CLI', (e) => e.agent.cli],
            ['Agent argv', normalizedAgentArgv],
            ['Reasoning effort', (e) => e.agent.reasoningEffort ?? '(none)'],
          ].map(([label, read]) =>
            each(
              label,
              'equal within each agent; argv excludes clone paths and session ids',
              read,
              (e, value) =>
                evidences
                  .filter((other) => (other.agent.name ?? 'claude') === (e.agent.name ?? 'claude'))
                  .every((other) => read(other) === value),
            ),
          ),
          each(
            'Task target and checks',
            'equal across runs',
            (e) =>
              JSON.stringify(
                e.task ?? {
                  name: 'todo',
                  target: null,
                  checks: ['install', 'verify', 'e2e', 'structure'],
                  land: 'showcase',
                },
              ),
            (_, value) =>
              evidences.every(
                (other) =>
                  JSON.stringify(
                    other.task ?? {
                      name: 'todo',
                      target: null,
                      checks: ['install', 'verify', 'e2e', 'structure'],
                      land: 'showcase',
                    },
                  ) === value,
              ),
          ),
        ]
      : []),
    each(
      'Harness equals the scaffold copy',
      '`true` in each run',
      (e) => String(e.harness.matchesScaffold),
      (_, v) => v === 'true',
    ),
    each(
      'Session id',
      'distinct per run',
      (e) => e.agent.sessionId,
      (_, v) => evidences.filter((other) => other.agent.sessionId === v).length === 1,
    ),
    each(
      'Template file hash',
      're-derived from the template at `prompt.path`',
      (e) => sha256(template(e)),
      (e, v) => v === e.prompt.templateSha256,
    ),
    each(
      'Rendered prompt SHA-256',
      're-derived with `renderPrompt`',
      (e) => sha256(renderPrompt(template(e), { id: e.trial.id, trial: e.trial.number })),
      (e, v) => v === e.prompt.sha256,
    ),
    each(
      'Recorded prompt text',
      're-derived from `prompt.text`',
      (e) => sha256(e.prompt.text),
      (e, v) => v === e.prompt.sha256,
    ),
  ];
}

/** A code span in running text. */
const span = (value) => `\`${value.replaceAll('`', "'")}\``;

/** A code span safe inside a table cell; long hashes shortened. */
function code(value) {
  const short = /^[0-9a-f]{40,64}$/.test(value) ? `${value.slice(0, 12)}…` : value;
  return `\`${short.replaceAll('|', '\\|').replaceAll('`', "'")}\``;
}

const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function duration(ms) {
  if (ms === null) {
    return code('(none)');
  }
  const seconds = Math.round(ms / 1000);
  return code(`${Math.floor(seconds / 60)} min ${seconds % 60} s`);
}

/** Every tool call input in a stream: a command as written, any other input as JSON. */
const toolCalls = (streamText) =>
  toolInputs(streamEvents(streamText)).map((input) =>
    typeof input.command === 'string' ? input.command : JSON.stringify(input),
  );

/** The first tool call input in a stream that names `path`, on one line, cut at 160 characters. */
function firstCallNaming(streamText, path) {
  const found = toolCalls(streamText)
    .find((input) => input.includes(path))
    ?.replace(/\s+/g, ' ')
    .trim();
  return found && found.length > 160 ? `${found.slice(0, 160)}…` : found;
}

/** For each path a failed run named outside its workdir, the tool call that first named it. */
function explainOutsideReads(evidence, readText) {
  const { outsideReads } = evidence.result;
  if (outsideReads.length === 0) {
    return [];
  }
  const stream = evidence.stream.path;
  const quotes = outsideReads.map((path) => {
    const call = stream ? firstCallNaming(readText(stream), path) : undefined;
    return call
      ? `The first tool call in ${code(stream ?? '')} that names ${code(path)} is ${span(call)}.`
      : `The committed stream holds no tool call input that names ${code(path)}.`;
  });
  return [
    `Under the harness rule (ADR 0034), a tool call that names a path outside the workdir that existed before the agent ran fails the run; the tmp entries that appear while the agent runs are on its allowlist. ${quotes.join(' ')}`,
  ];
}

const TMP_PATH = /\/tmp\/[^\s"'`<>|;&)\\]+/g;

/**
 * @param {TrialEvidence} evidence
 * @param {(path: string) => string} readText
 * @returns {TmpPaths}
 */
function tmpPathsOf(evidence, readText) {
  const stream = evidence.stream.path;
  const named = stream
    ? toolCalls(readText(stream)).flatMap((input) => input.match(TMP_PATH) ?? [])
    : [];
  return {
    id: evidence.trial.id,
    paths: [...new Set(named)].map((path) => ({
      path,
      before: evidence.result.outsideReads.includes(path),
    })),
  };
}

/** Throws when a cause names a path that no run found before its agent ran. */
function checkCauses(causes, evidences) {
  for (const path of Object.keys(causes)) {
    if (!evidences.some((e) => e.result.outsideReads.includes(path))) {
      throw new Error(
        `compare: the cause for ${path} is stale; no run found it before its agent ran.`,
      );
    }
  }
}

/** Who wrote under `/tmp` and what, for a clause: `every run` and `logs` when it fits. */
function tmpWriters(tmp) {
  const writers = tmp.filter((run) => run.paths.length > 0);
  const paths = writers.flatMap((run) => run.paths);
  return {
    writers,
    who: writers.length === tmp.length ? 'every run' : andList(writers.map((run) => code(run.id))),
    what: paths.every(({ path }) => path.endsWith('.log')) ? 'logs' : 'files',
  };
}

/**
 * Which `/tmp` paths each run named, which were new during its run and which
 * existed before it, with the author's cause for those.
 *
 * @param {readonly TmpPaths[]} tmp
 * @param {Readonly<Record<string, string>>} causes
 */
function explainTmpPaths(tmp, causes) {
  const { writers, who, what } = tmpWriters(tmp);
  if (writers.length === 0) {
    return '';
  }
  const listed = (paths) => andList(paths.map(({ path }) => code(path)));
  const allNew = writers.filter((run) => run.paths.every(({ before }) => !before));
  const mixed = writers.filter((run) => !allNew.includes(run));
  return [
    `${who[0].toUpperCase()}${who.slice(1)} wrote ${what} under \`/tmp\`: ${writers.map((run) => `${code(run.id)} to ${listed(run.paths)}`).join('; ')}.`,
    ...(allNew.length === 0
      ? []
      : [
          `The paths of ${andList(allNew.map((run) => code(run.id)))} were new during ${allNew.length === 1 ? 'its run' : 'their runs'}, so the ADR 0034 allowlist covers them.`,
        ]),
    ...mixed.flatMap((run) => {
      const fresh = run.paths.filter(({ before }) => !before);
      return fresh.length === 0
        ? []
        : [
            `Of the paths of ${code(run.id)}, ${listed(fresh)} ${fresh.length === 1 ? 'was' : 'were'} new during its run, so the ADR 0034 allowlist covers ${fresh.length === 1 ? 'it' : 'them'}.`,
          ];
    }),
    ...writers.flatMap((run) =>
      run.paths
        .filter(({ before }) => before)
        .map(
          ({ path }) =>
            `${code(path)} already existed when ${code(run.id)} started${causes[path] ? `, ${causes[path]}` : ''}.`,
        ),
    ),
  ].join(' ');
}

/**
 * @param {readonly Run[]} runs
 * @param {(path: string) => string} readText
 * @param {string} tmpNote  see `explainTmpPaths`; empty when no run names `/tmp`
 */
function renderRuns(runs, readText, tmpNote) {
  const rows = runs.map(({ evidence: e, source }) => [
    code(e.trial.id),
    e.result.status === 'passed' ? code('passed') : `**${code('failed')}**`,
    code(source),
    e.result.commit ? code(e.result.commit.slice(0, 7)) : code('(none)'),
    duration(e.run.agentDurationMs),
    andList(e.checks.map((check) => `${code(check.name)} ${code(String(check.exitCode))}`)),
    e.failures.map(code).join('<br>'),
  ]);
  const notes = runs
    .filter(({ evidence: e }) => e.result.status === 'failed')
    .map(({ evidence: e, source }) => {
      const codes = [...new Set(e.checks.map((check) => check.exitCode))];
      const exits =
        codes.length === 1
          ? `each exited ${code(String(codes[0]))}`
          : `exited ${andList(e.checks.map((c) => code(String(c.exitCode))))}`;
      return [
        `${code(e.trial.id)} is ${code('failed')}: its checks ${andList(e.checks.map((c) => code(c.name)))} ${exits}, and its evidence names the failure ${andList(e.failures.map(code))}. Its code comes from ${code(source)}, and the report compares it like the others.`,
        ...explainOutsideReads(e, readText),
      ].join(' ');
    });
  const [first, ...rest] = notes;
  const withTmp = first === undefined ? [tmpNote] : [[first, tmpNote].join(' ').trim(), ...rest];
  return [
    '## Runs',
    ...(runs.some(({ evidence }) => evidence.schema === 2)
      ? [
          table(
            ['Run', 'Agent', 'Model', 'Status', 'Agent time', 'Run time', 'Checks (exit code)'],
            runs.map(({ evidence: e }) => [
              code(e.trial.id),
              code(e.agent.name ?? 'claude'),
              code(e.agent.resolvedModel ?? '(none)'),
              code(e.result.status),
              duration(e.run.agentDurationMs),
              duration(e.run.durationMs),
              andList(
                e.checks.map((check) => `${code(check.name)} ${code(String(check.exitCode))}`),
              ),
            ]),
          ),
          'Agent is the variable under test. Agent CLI, version, argv, model and user config must match within each agent; session ids stay distinct. Every non-agent baseline field must match across agents.',
        ]
      : []),
    table(
      ['Run', 'Status', 'Read from', 'Commit', 'Agent time', 'Checks (exit code)', 'Failure'],
      rows,
    ),
    ...withTmp.filter(Boolean),
  ];
}

/**
 * The recorded enforcement rev and the author's account of the trunk since it.
 *
 * @param {readonly TrialEvidence[]} evidences
 * @param {Drift} drift
 */
function driftLine(evidences, drift) {
  if (!evidences.every((e) => e.scaffold.enforcementRev === drift.since)) {
    throw new Error(
      `compare: the trunk drift starts at enforcement rev ${drift.since}; the runs recorded another.`,
    );
  }
  return `The runs recorded enforcement rev ${code(drift.since.slice(0, 7))}. ${drift.text}`;
}

/**
 * @param {readonly BaselineCheck[]} checks
 * @param {readonly string[]} ids
 * @param {string} drift  see `driftLine`
 */
function renderBaseline(checks, ids, drift, brief) {
  return [
    '## Baseline',
    'Every row comes from the committed evidence and files (ADR 0034, "New baseline").',
    table(
      ['Field', 'Proof', ...ids.map(code), 'Holds'],
      checks.map((check) => [
        check.label,
        check.proof,
        ...check.values.map(code),
        check.holds ? 'yes' : 'no',
      ]),
    ),
    drift,
    `A record with \`agent.fake: true\` stops the report before this table renders, so every run here ran the real agent. The template rows read \`tooling/trial/${brief}-prompt.md\` as committed, so a later prompt change shows \`no\` there, which is the new-baseline rule of ADR 0034.`,
  ];
}

/** @param {Comparison} comparison */
function renderMethod(comparison) {
  return [
    '## Method',
    'Each dimension compares a normalized form. Names reach only written forms, which this report shows and the method skips, except that a router key breaks a tie between two `{ id }` mutations whose outputs match, and a type name the result does not declare stays as written. An invariant holds or breaks in each run on its own. A form is identical when every run has the same value; otherwise it sits inside the spec freedom a rule names, or outside the spec. An author note on an outside-spec aspect gives its cause and keeps it outside the spec; a note that names a freedom is a ruling and moves the aspect into that freedom.',
    `The scaffold roles, ${andList(SCAFFOLD_ROLES.map(code))}, hold the code the reference scaffold fills in, so they are fixed: their files, components, hooks and export names count, and a difference there is outside the spec. Each file outside every role is compared by its text, with the own id as \`{id}\`. The component rule reads "outside \`web-routes\` and \`ui\`" as a rule on feature components, the components outside the scaffold roles; \`ui controls\` holds the components of every role.`,
    table(
      ['Dimension', 'Normalized form', 'Must be identical'],
      comparison.method.map((m) => [m.title, m.normalizedForm, m.mustBeIdentical]),
    ),
    '### Spec freedoms',
    table(
      ['Freedom', 'Text', 'Cited by'],
      comparison.freedoms.map((f) => [
        String(f.number),
        f.text,
        REVOKED_FREEDOMS.includes(f.number) ? 'Revoked by ADR 0069' : f.cited.map(code).join(', '),
      ]),
    ),
  ];
}

const cells = (difference, ids) =>
  ids.map((id) => {
    const { value } = difference.values.get(id);
    return difference.kind === 'invariant' ? value : code(value);
  });

/** @param {readonly Difference[]} differences */
function renderDepartures(differences, ids) {
  const outside = differences.filter((d) => d.classification === 'outside-spec');
  const inside = differences.filter((d) => d.classification === 'spec-freedom');
  const ruled = inside.filter((d) => d.by === 'ruling');
  return [
    ...(ruled.length === 0
      ? []
      : [
          '## Rulings by the author',
          "The script classified each aspect below as `outside-spec`. The author's ruling moves it into the spec freedom it names (PLAN, Risks); the reason is the author's.",
          table(
            ['Aspect', 'Script classification', 'Freedom', 'Why'],
            ruled.map((d) => [code(d.key), code('outside-spec'), String(d.freedom), d.why]),
          ),
        ]),
    ...(outside.length === 0
      ? []
      : [
          '## Outside the spec',
          table(
            ['Aspect', ...ids.map(code), 'Why', 'By'],
            outside.map((d) => [
              code(d.key),
              ...cells(d, ids),
              d.why,
              d.by === 'note' ? "author's note" : 'script rule',
            ]),
          ),
        ]),
    ...(inside.length === 0
      ? []
      : [
          '## Inside a spec freedom',
          table(
            ['Aspect', ...ids.map(code), 'Freedom', 'By', 'Why'],
            inside.map((d) => [
              code(d.key),
              ...cells(d, ids),
              String(d.freedom),
              d.by === 'ruling' ? "author's ruling" : 'script rule',
              d.by === 'ruling' ? 'see Rulings by the author' : d.why,
            ]),
          ),
        ]),
  ];
}

const LABEL = {
  identical: 'identical',
  'spec-freedom': 'spec freedom',
  'outside-spec': 'outside the spec',
};

/** @param {readonly Difference[]} differences */
function renderDimension(title, differences, ids) {
  const rows = differences.map((d) => [
    code(d.aspect),
    ...cells(d, ids),
    d.classification === 'spec-freedom'
      ? `${LABEL[d.classification]} ${d.freedom}`
      : LABEL[d.classification],
  ]);
  const written = differences
    .filter(
      (d) =>
        new Set(ids.map((id) => d.values.get(id).written)).size > 1 &&
        ids.some((id) => d.values.get(id).written !== d.values.get(id).value),
    )
    .map(
      (d) =>
        `- ${code(d.aspect)}: ${ids.map((id) => `${code(id)} ${code(d.values.get(id).written)}`).join('; ')}`,
    );
  return [
    `## ${title}`,
    table(['Aspect', ...ids.map(code), 'Classification'], rows),
    ...(written.length === 0 ? [] : ['Written forms where the runs differ:', written.join('\n')]),
  ];
}

/** Each run's `architecture.mmd` without its header, as the Structure rows compare it. */
function renderDiagrams(runs) {
  return [
    '## Diagrams',
    'Each run generated its diagram with `pnpm arch:diagram`. The Structure rows compare their roles and edges.',
    ...runs.flatMap(({ evidence, source, facts }) => [
      `### ${code(evidence.trial.id)} (${code(evidence.result.status)}, from ${code(source)})`,
      ['```mermaid', facts.diagram.text, '```'].join('\n'),
    ]),
  ];
}

/** A bullet per failed run whose only failure is paths that existed before it ran. */
function outsideOnlyBullets(runs, tmp) {
  const { writers, who, what } = tmpWriters(tmp);
  const also = writers.length === 0 ? '' : `; ${who} wrote ${what} under \`/tmp\` (see Runs)`;
  return runs
    .map(({ evidence: e }) => e)
    .filter(
      (e) =>
        e.result.status === 'failed' &&
        e.result.outsideReads.length > 0 &&
        e.failures.length === 1 &&
        e.checks.every((check) => check.exitCode === 0),
    )
    .map(
      (e) =>
        `- ${code(e.trial.id)} failed only on ${andList(e.result.outsideReads.map(code))}, which existed before its run${also}.`,
    );
}

function renderVerdict(runs, comparison, checks, tmp) {
  const passed = runs.filter(({ evidence }) => evidence.result.status === 'passed').length;
  const outside = comparison.differences.filter((d) => d.classification === 'outside-spec');
  const noted = outside.filter((d) => d.by === 'note').length;
  const inside = comparison.differences.filter((d) => d.classification === 'spec-freedom');
  const ruled = inside.filter((d) => d.by === 'ruling').length;
  const split = checks.filter((check) => !check.holds).map((check) => check.label);
  return [
    '## Verdict',
    [
      `- Full pass count ${passed}/${runs.length}`,
      ...outsideOnlyBullets(runs, tmp),
      `- Consistency: ${code(comparison.consistent ? 'consistent' : 'inconsistent')}. ${count(outside.length, 'aspect sits', 'aspects sit')} outside the spec, ${noted} with an author's note; ${inside.length} sit inside a spec freedom, ${inside.length - ruled} by the script's rules and ${ruled} by an author's ruling.`,
      split.length === 0
        ? `- Baseline: shared. All ${checks.length} baseline checks hold.`
        : `- Baseline: differs at ${split.join(', ')}.`,
    ].join('\n'),
  ];
}

/**
 * The report for `runs`, reading the prompt template and the streams through
 * `readText`.
 *
 * @param {readonly Run[]} runs
 * @param {(path: string) => string} readText
 * @param {{ brief?: string, causes?: Readonly<Record<string, string>>, drift?: Drift, notes?: readonly import('./dimensions.mjs').AuthorNote[] }} [options]
 *   `causes`: where each path a run found before its agent ran came from, by path;
 *   `drift`: the author's account of the trunk since the recorded enforcement rev;
 *   `notes`: the author's notes and rulings
 * @returns {string}
 * @throws when a cause names a path that no run found before its agent ran, or the
 *   drift starts at another enforcement rev than the runs recorded
 */
export function renderComparison(runs, readText, options = {}) {
  const brief = options.brief ?? 'todo';
  const matchingRuns = runs.filter(({ evidence }) => matchesBrief(evidence, brief));
  const modern = matchingRuns.some(({ evidence }) => evidence.schema === 2);
  const {
    causes = modern ? {} : OUTSIDE_PATH_CAUSES,
    drift = modern ? null : TRUNK_DRIFT,
    notes = AUTHOR_NOTES,
  } = options;
  const evidences = matchingRuns.map((run) => run.evidence);
  checkCauses(causes, evidences);
  const ids = evidences.map((evidence) => evidence.trial.id);
  const comparison = compareResults(
    matchingRuns.map((run) => run.facts),
    notes,
  );
  const checks = proveBaseline(evidences, readText);
  const tmp = evidences.map((evidence) => tmpPathsOf(evidence, readText));
  const sections = [
    `<!-- Generated by tooling/trial/compare.mjs (node tooling/trial/compare.mjs${brief === 'todo' ? '' : ` --brief ${brief}`}). Edit the generator, then regenerate. -->`,
    `# ${brief === 'todo' ? 'Todo' : 'Notes'} trial comparison`,
    `This report compares the ${brief === 'todo' ? 'Todo' : 'Notes'} trial results under ADR 0035 and ADR 0037: the full pass count, the shared baseline, and every aspect of five dimensions, each identical, inside a named spec freedom, or outside the spec.`,
    ...renderVerdict(matchingRuns, comparison, checks, tmp),
    ...comparison.method.flatMap(({ id, title }) =>
      renderDimension(
        title,
        comparison.differences.filter((d) => d.dimension === id),
        ids,
      ),
    ),
    ...renderRuns(matchingRuns, readText, explainTmpPaths(tmp, causes)),
    ...renderBaseline(
      checks,
      ids,
      drift
        ? driftLine(evidences, drift)
        : 'New baseline; compare the recorded enforcement revisions above.',
      brief,
    ),
    ...renderMethod(comparison),
    ...renderDepartures(comparison.differences, ids),
    ...renderDiagrams(matchingRuns),
  ];
  return `${sections.join('\n\n')}\n`;
}

/**
 * The `<id>.json` evidence record names in `docs/trials`, or none when the
 * folder is absent. A rerun scaffold removes the old records (ADR 0047), so the
 * folder may be gone or empty before the rerun lands its first record.
 *
 * @param {string} root
 * @returns {readonly string[]}
 */
function trialRecordFiles(root) {
  const dir = join(root, TRIALS);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
}

/**
 * Whether the repository holds any trial evidence. With none there is no report
 * to keep current, and a showcase result without a record is a trial clone
 * mid-run, so `comparisonReport` is not run and `docs/trials/comparison.md`
 * stays absent (ADR 0047).
 *
 * @param {string} root
 * @returns {boolean}
 */
export function hasTrialEvidence(root, brief = 'todo') {
  return trialRecordFiles(root).some((name) => {
    const e = JSON.parse(readFileSync(join(root, TRIALS, name), 'utf8'));
    return matchesBrief(e, brief);
  });
}

/**
 * Every `docs/trials/<id>.json`, validated and sorted by trial number, with its
 * result tree (a passed run's tracked files under `showcase/<id>`, a failed
 * run's patch) and its stream text, null when it has none. Throws when the
 * landed results differ from the passed runs.
 */
function readRuns(root, readText, brief) {
  const records = trialRecordFiles(root)
    .map((name) => {
      const evidence = validateEvidence(JSON.parse(readText(`${TRIALS}/${name}`)));
      if (name !== `${evidence.trial.id}.json`) {
        throw new Error(`compare: ${TRIALS}/${name} records ${evidence.trial.id}.`);
      }
      if (matchesBrief(evidence, brief) && evidence.agent.fake) {
        throw new Error(
          `compare: ${evidence.trial.id} ran a fake agent; a trial runs the real one.`,
        );
      }
      return evidence;
    })
    .sort((a, b) => a.trial.number - b.trial.number);
  const evidences = records.filter((evidence) => matchesBrief(evidence, brief));
  checkLandedRuns(
    listResults(root)
      .filter((result) => result.root.startsWith('showcase/'))
      .filter((result) => !records.some((e) => e.trial.id === result.id && !matchesBrief(e, brief)))
      .map((result) => result.id),
    evidences
      .filter((e) => e.result.status === 'passed' && e.task?.land !== 'patch')
      .map((e) => e.trial.id),
  );
  return evidences.map((evidence) => {
    const run = readRunTree(root, evidence, readText);
    const streamText = evidence.stream.path === null ? null : readText(evidence.stream.path);
    checkRunEvidence(
      evidence,
      [...run.tree.keys()].map((path) => `${run.resultRoot}/${path}`),
      streamText,
    );
    return { ...run, streamText };
  });
}

/** A passed run's tracked files under `showcase/<id>`, or a failed run's patch. */
function readRunTree(root, evidence, readText) {
  const id = evidence.trial.id;
  const resultRoot = `showcase/${id}`;
  if (evidence.result.status === 'passed' && evidence.task?.land !== 'patch') {
    const files = execFileSync('git', ['ls-files', '-z', resultRoot], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    const tree = new Map(files.map((file) => [file.slice(resultRoot.length + 1), readText(file)]));
    return { evidence, source: resultRoot, resultRoot, tree };
  }
  if (!evidence.result.patch) {
    throw new Error(`compare: ${id} failed and records no patch.`);
  }
  const tree = treeFromPatch(readText(evidence.result.patch), resultRoot);
  return { evidence, source: evidence.result.patch, resultRoot, tree };
}

/**
 * Throws unless the result folders under `showcase/` are the passed runs,
 * compared as sets.
 *
 * @param {readonly string[]} landed
 * @param {readonly string[]} passed
 */
export function checkLandedRuns(landed, passed) {
  const sorted = (ids) => [...ids].sort(sortText).join(', ');
  if (sorted(landed) !== sorted(passed)) {
    throw new Error(
      `compare: showcase/ holds ${sorted(landed) || 'no result'}; the passed runs are ${sorted(passed) || 'none'}.`,
    );
  }
}

/**
 * Throws unless the code read for a run is the code its evidence records: the
 * repo-relative `files` equal `result.changedPaths` under `showcase/<id>/`, and
 * the stream at `stream.path` hashes to `stream.sha256`.
 *
 * @param {TrialEvidence} evidence
 * @param {readonly string[]} files
 * @param {string | null} streamText
 */
export function checkRunEvidence(evidence, files, streamText) {
  const id = evidence.trial.id;
  const recorded = new Set(
    evidence.result.changedPaths.filter((path) => path.startsWith(`showcase/${id}/`)),
  );
  const read = new Set(files);
  const extra = [...read].filter((path) => !recorded.has(path)).sort(sortText);
  const missing = [...recorded].filter((path) => !read.has(path)).sort(sortText);
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `compare: ${id}'s code differs from result.changedPaths: read and unrecorded ${extra.join(', ') || '(none)'}; recorded and unread ${missing.join(', ') || '(none)'}.`,
    );
  }
  if (evidence.stream.path !== null && sha256(streamText ?? '') !== evidence.stream.sha256) {
    throw new Error(`compare: ${evidence.stream.path} differs from ${id}'s stream.sha256.`);
  }
}

/** Read the comparison inputs from committed files only. */
function readComparison(root, brief) {
  const readText = (path) => readFileSync(join(root, path), 'utf8');
  const contract = readContract(readText('.fallowrc.jsonc'));
  const runs = readRuns(root, readText, brief).map(
    ({ evidence, source, resultRoot, tree, streamText }) => ({
      evidence,
      source,
      facts: readResultFacts({
        id: evidence.trial.id,
        brief,
        root: resultRoot,
        passed: evidence.result.status === 'passed',
        verified: evidence.checks.some((check) => check.name === 'verify' && check.exitCode === 0),
        tree,
        contract,
        streamText,
      }),
    }),
  );
  return { runs, readText };
}

/** The report for the repository at `root`, from committed files only. */
export function comparisonReport(root, brief = 'todo') {
  const { runs, readText } = readComparison(root, brief);
  return renderComparison(runs, readText, { brief });
}

/**
 * Reasons the trial proof fails, independently of report formatting.
 * @param {readonly Run[]} runs
 * @param {(path: string) => string} readText
 * @returns {string[]}
 */
export function comparisonFailures(runs, readText, brief = 'todo') {
  const compared = runs.filter(({ evidence }) => matchesBrief(evidence, brief));
  const comparison = compareResults(
    compared.map((run) => run.facts),
    AUTHOR_NOTES,
  );
  return [
    ...comparison.differences
      .filter((difference) => difference.classification === 'outside-spec')
      .map((difference) => `Outside spec: ${difference.key}`),
    ...proveBaseline(
      compared.map((run) => run.evidence),
      readText,
    )
      .filter((check) => !check.holds)
      .map((check) => `Baseline differs: ${check.label}`),
    ...compared
      .filter(({ evidence }) => evidence.result.status !== 'passed')
      .map(({ evidence }) => `Failed run: ${evidence.trial.id}`),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { brief: { type: 'string', default: 'todo' } } });
  const brief = values.brief;
  if (!['todo', 'notes'].includes(brief))
    throw new Error('compare: --brief must be todo or notes.');
  const reportPath = brief === 'todo' ? REPORT_PATH : `${TRIALS}/notes-comparison.md`;
  const root = resolve(import.meta.dirname, '../..');
  if (hasTrialEvidence(root, brief)) {
    const { runs, readText } = readComparison(root, brief);
    writeFileSync(join(root, reportPath), renderComparison(runs, readText, { brief }));
    console.log(`Wrote ${reportPath}`);
    const failures = comparisonFailures(runs, readText, brief);
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    }
  } else {
    console.log(`No trial records in ${TRIALS}; nothing to compare.`);
  }
}
