#!/usr/bin/env node
/**
 * Reviews one finished to-do trial result for slop and writes
 * `docs/trials/<id>.review.json` (ADR 0115). Run it after each `pnpm trial`
 * of the research project, before the workdir is removed:
 *
 *   node tooling/trial/review.mjs --id <id> --workdir <dir>
 *     [--agent claude|codex] [--agent-command <path>]
 *
 * It lints `showcase/<id>/` in the workdir's check clone with the vendored
 * anti-slop rules and the policy rules, then asks one fresh reviewer session,
 * which can only read, the judging question in `review-prompt.md`. The review
 * is evidence for the comparison; it never changes a run's status.
 *
 * `runReview` reaches the system only through the injected `Deps` of
 * `run-trial.mjs`, so the tests drive it with a fake reviewer.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateEvidence, validators } from './evidence.mjs';
import { MAX_TURNS, renderPrompt, systemDeps } from './run-trial.mjs';
import { agentEnv } from './system.mjs';

const { shape, text, list, oneOf, nullable, count } = validators;
const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const PROMPT = join(HARNESS_ROOT, 'tooling/trial/review-prompt.md');
const EXAMPLES_PER_RULE = 3;
const OUTPUT_TAIL_LINES = 40;
const SCHEMA_ARG = '{{REVIEW_SCHEMA}}';
/** What Oxlint prints, before its JSON report, when a path holds no file it lints. */
const NO_FILES = 'No files found to lint.';

/** The configs used by `pnpm lint:anti-slop` and `pnpm lint:policy`. */
const LINTS = [
  { name: 'anti-slop', config: '.oxlintrc.json' },
  { name: 'policy', config: 'oxlint.config.ts' },
];

const NOTE = {
  file: { type: 'string' },
  line: { type: ['integer', 'null'] },
  note: { type: 'string' },
};

/** The reviewer's answer, as a strict JSON Schema both agent CLIs accept. */
const JUDGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['wouldWant', 'why', 'flags', 'praise'],
  properties: {
    wouldWant: { type: 'string', enum: ['yes', 'no'] },
    why: { type: 'string' },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['group', 'file', 'line', 'note'],
        properties: { group: { type: 'string' }, ...NOTE },
      },
    },
    praise: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'note'],
        properties: NOTE,
      },
    },
  },
};

const LINE = nullable(count());
const JUDGMENT = shape({
  wouldWant: oneOf('yes', 'no'),
  why: text(),
  flags: list(shape({ group: text(), file: text(), line: LINE, note: text() })),
  praise: list(shape({ file: text(), line: LINE, note: text() })),
});
const LINT = shape({
  config: text(),
  exitCode: count(),
  files: count(),
  findings: count(),
  rules: list(
    shape({
      rule: text(),
      count: count(),
      examples: list(shape({ file: text(), line: LINE, message: text() })),
    }),
  ),
});
const REVIEW = shape({
  schema: oneOf(1),
  id: text(),
  run: shape({
    agent: oneOf('claude', 'codex'),
    status: oneOf('passed', 'failed'),
    commit: nullable(text()),
    patch: nullable(text()),
  }),
  reviewedAt: text(),
  read: oneOf('check', 'repo'),
  lint: shape({ 'anti-slop': LINT, policy: LINT }),
  reviewer: shape({
    name: oneOf('claude', 'codex'),
    cli: text(),
    version: text(),
    argv: list(text()),
    promptSha256: text(/^[0-9a-f]{64}$/, 'a 64-hex SHA-256'),
    durationMs: count(),
    fake: oneOf(true, false),
  }),
  judgment: JUDGMENT,
});

/**
 * @typedef {ReturnType<typeof summarizeLint>} LintSummary
 * @typedef {{ wouldWant: 'yes' | 'no', why: string, flags: { group: string, file: string, line: number | null, note: string }[], praise: { file: string, line: number | null, note: string }[] }} Judgment
 * @typedef {{ schema: 1, id: string, run: { agent: 'claude' | 'codex', status: 'passed' | 'failed', commit: string | null, patch: string | null }, reviewedAt: string, read: 'check' | 'repo', lint: { 'anti-slop': LintSummary, policy: LintSummary }, reviewer: { name: 'claude' | 'codex', cli: string, version: string, argv: string[], promptSha256: string, durationMs: number, fake: boolean }, judgment: Judgment }} Review
 */

/**
 * Parses one review record and throws, naming the field, on anything the
 * schema does not allow.
 *
 * @param {unknown} value
 * @returns {Review}
 */
export function validateReview(value) {
  REVIEW(value, 'review');
  return /** @type {Review} */ (value);
}

const sortText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const tail = (output) => output.trim().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');

function parseJson(output, what) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${what} gave no JSON:\n${tail(output)}`);
  }
}

/**
 * Oxlint's `-f json` report as counts per rule, each with its first examples.
 *
 * @param {{ config: string }} lint
 * @param {number} exitCode
 * @param {string} stdout
 */
function summarizeLint({ config }, exitCode, stdout) {
  if (stdout.trimStart().startsWith(NO_FILES)) {
    return { config, exitCode, files: 0, findings: 0, rules: [] };
  }
  const report = parseJson(stdout, `oxlint --config ${config}`);
  const findings = report.diagnostics.map((diagnostic) => ({
    rule: (diagnostic.code ?? 'parse').replace(/^([\w-]+)\((.+)\)$/, '$1/$2'),
    file: diagnostic.filename,
    line: diagnostic.labels?.[0]?.span.line ?? null,
    message: diagnostic.message,
  }));
  const rules = [...new Set(findings.map(({ rule }) => rule))].sort(sortText).map((rule) => {
    const own = findings.filter((finding) => finding.rule === rule);
    return {
      rule,
      count: own.length,
      examples: own.slice(0, EXAMPLES_PER_RULE).map(({ file, line, message }) => ({
        file,
        line,
        message,
      })),
    };
  });
  return {
    config,
    exitCode,
    files: report.number_of_files,
    findings: findings.length,
    rules,
  };
}

/**
 * The reviewer's command. Claude gets only the read tools; Codex runs in its
 * read-only sandbox. Both answer in `JUDGMENT_SCHEMA`.
 *
 * @param {'claude' | 'codex'} agent
 * @param {string | undefined} command
 * @param {{ cwd: string, sessionId: string, schemaFile: string, answerFile: string }} paths
 */
function reviewArgv(agent, command, { cwd, sessionId, schemaFile, answerFile }) {
  return agent === 'claude'
    ? [
        command ?? 'claude',
        '-p',
        '--model',
        'opus',
        '--tools',
        'Read,Grep,Glob',
        '--max-turns',
        String(MAX_TURNS),
        '--output-format',
        'json',
        '--json-schema',
        JSON.stringify(JUDGMENT_SCHEMA),
        '--session-id',
        sessionId,
      ]
    : [
        command ?? 'codex',
        'exec',
        '--sandbox',
        'read-only',
        '-m',
        'gpt-6.1-sol',
        '-c',
        'allow_login_shell=false',
        '-c',
        `projects.${JSON.stringify(cwd)}.trust_level="trusted"`,
        '--output-schema',
        schemaFile,
        '-o',
        answerFile,
        '-C',
        cwd,
        '-',
      ];
}

/** The JSON object in a Claude result: its structured output, or the object in its text. */
function claudeAnswer(stdout) {
  const result = parseJson(stdout, 'the reviewer');
  if (result.is_error) throw new Error(`the reviewer failed: ${result.result ?? result.subtype}`);
  if (result.structured_output) return result.structured_output;
  const answer = String(result.result ?? '');
  return parseJson(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1), 'the reviewer');
}

/**
 * The reviewer's judgment, validated.
 *
 * @param {'claude' | 'codex'} agent
 * @param {string} stdout
 * @param {string} answerText  Codex's last message file
 * @returns {Judgment}
 */
function readJudgment(agent, stdout, answerText) {
  const answer = agent === 'claude' ? claudeAnswer(stdout) : parseJson(answerText, 'the reviewer');
  JUDGMENT(answer, 'judgment');
  return answer;
}

/**
 * @param {{ id: string, workdir: string, root?: string, agent?: 'claude' | 'codex', agentCommand?: string, sessionId?: string }} options
 */
export function planReview(options) {
  const root = options.root ?? HARNESS_ROOT;
  const agent = options.agent ?? 'claude';
  if (!['claude', 'codex'].includes(agent)) throw new Error('--agent must be claude or codex');
  const folder = join(options.workdir, 'review');
  return {
    id: options.id,
    root,
    workdir: options.workdir,
    agent,
    agentCommand: options.agentCommand,
    sessionId: options.sessionId ?? randomUUID(),
    evidencePath: join(root, 'docs/trials', `${options.id}.json`),
    reviewPath: join(root, 'docs/trials', `${options.id}.review.json`),
    schemaFile: join(folder, 'schema.json'),
    answerFile: join(folder, 'answer.json'),
  };
}

/** The clone that holds the result: the checks' clean clone, or the agent's clone when no check ran. */
function resultClone(plan) {
  const read = ['check', 'repo'].find((name) =>
    existsSync(join(plan.workdir, name, 'showcase', plan.id)),
  );
  if (!read) {
    throw new Error(
      `${plan.workdir} holds no showcase/${plan.id}/. Review each run before you remove its workdir.`,
    );
  }
  return { read, cwd: join(plan.workdir, read) };
}

/** @param {import('./run-trial.mjs').Deps} deps */
async function lintResult(plan, cwd, deps) {
  const oxlint = join(cwd, 'node_modules/.bin/oxlint');
  const runs = await Promise.all(
    LINTS.map((lint) =>
      deps.exec(
        [
          'env',
          '-u',
          'NAPI_RS_NATIVE_LIBRARY_PATH',
          '-u',
          'VP_VERSION',
          '-u',
          'OXLINT_TSGOLINT_PATH',
          oxlint,
          '--no-ignore',
          '--config',
          lint.config,
          '-f',
          'json',
          `showcase/${plan.id}`,
        ],
        { cwd },
      ),
    ),
  );
  return Object.fromEntries(
    LINTS.map((lint, index) => [
      lint.name,
      summarizeLint(lint, runs[index].code, runs[index].stdout),
    ]),
  );
}

/** @param {import('./run-trial.mjs').Deps} deps */
async function judge(plan, cwd, prompt, deps) {
  mkdirSync(join(plan.workdir, 'review'), { recursive: true });
  writeFileSync(plan.schemaFile, JSON.stringify(JUDGMENT_SCHEMA));
  const argv = reviewArgv(plan.agent, plan.agentCommand, { cwd, ...plan });
  const env = agentEnv({});
  const version = await deps.exec([argv[0], '--version'], { cwd, env });
  const session = await deps.exec(argv, { cwd, input: prompt, env });
  if (session.code !== 0) {
    throw new Error(`the reviewer exited ${session.code}:\n${tail(session.output)}`);
  }
  const answer = existsSync(plan.answerFile) ? readFileSync(plan.answerFile, 'utf8') : '';
  return {
    judgment: readJudgment(plan.agent, session.stdout, answer),
    reviewer: {
      name: plan.agent,
      cli: argv[0],
      version: version.stdout.trim(),
      argv: argv.map((arg) =>
        arg === JSON.stringify(JUDGMENT_SCHEMA)
          ? SCHEMA_ARG
          : arg.replaceAll(plan.workdir, '{workdir}'),
      ),
      durationMs: session.ms,
      fake: plan.agentCommand !== undefined,
    },
  };
}

/**
 * Lints and judges one result, then writes its review, formatted by Biome.
 * Throws, writing nothing, when the review exists, the record is not a to-do
 * run, the workdir is gone or the reviewer gives no valid answer.
 *
 * @param {ReturnType<typeof planReview>} plan
 * @param {import('./run-trial.mjs').Deps} deps
 * @returns {Promise<Review>}
 */
export async function runReview(plan, deps) {
  const reviewName = relative(plan.root, plan.reviewPath);
  if (existsSync(plan.reviewPath)) {
    throw new Error(`${reviewName} exists. Every review counts; keep the first one.`);
  }
  const evidence = validateEvidence(JSON.parse(readFileSync(plan.evidencePath, 'utf8')));
  if (evidence.trial.id !== plan.id || (evidence.schema === 2 && evidence.task.name !== 'todo')) {
    throw new Error(`${relative(plan.root, plan.evidencePath)} is not the to-do run ${plan.id}.`);
  }
  const { read, cwd } = resultClone(plan);
  const lint = await lintResult(plan, cwd, deps);
  const template = readFileSync(PROMPT, 'utf8');
  const prompt = renderPrompt(template, { id: plan.id, trial: evidence.trial.number });
  const { judgment, reviewer } = await judge(plan, cwd, prompt, deps);
  const review = validateReview({
    schema: 1,
    id: plan.id,
    run: {
      agent: evidence.agent.name ?? 'claude',
      status: evidence.result.status,
      commit: evidence.result.commit,
      patch: evidence.result.patch,
    },
    reviewedAt: deps.now().toISOString(),
    read,
    lint,
    reviewer: { ...reviewer, promptSha256: createHash('sha256').update(prompt).digest('hex') },
    judgment,
  });
  const formatted = await deps.exec(
    [join(HARNESS_ROOT, 'node_modules/.bin/biome'), 'format', `--stdin-file-path=${reviewName}`],
    { cwd: HARNESS_ROOT, input: JSON.stringify(review) },
  );
  const temporary = `${plan.reviewPath}.partial`;
  writeFileSync(
    temporary,
    formatted.code === 0 ? formatted.stdout : `${JSON.stringify(review, null, 2)}\n`,
  );
  renameSync(temporary, plan.reviewPath);
  return review;
}

async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      workdir: { type: 'string' },
      agent: { type: 'string', default: 'claude' },
      'agent-command': { type: 'string' },
    },
  });
  if (!values.id || !values.workdir) throw new Error('Pass --id <trial id> and --workdir <dir>.');
  const plan = planReview({
    id: values.id,
    workdir: resolve(values.workdir),
    agent: values.agent,
    agentCommand: values['agent-command'] && resolve(values['agent-command']),
  });
  const review = await runReview(plan, systemDeps());
  const findings = review.lint['anti-slop'].findings + review.lint.policy.findings;
  console.log(
    `${review.id}: would want ${review.judgment.wouldWant}; ${review.judgment.flags.length} flags, ${review.judgment.praise.length} praise, ${findings} lint findings`,
  );
  console.log(`review: ${relative(plan.root, plan.reviewPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
