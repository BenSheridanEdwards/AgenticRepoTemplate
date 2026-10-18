/**
 * The evidence one Todo trial leaves in `docs/trials/<id>.json` (ADR 0034).
 * `SCHEMA` is the one description of its shape: `validateEvidence` reads it to
 * parse a file at the boundary, and the harness writes nothing it does not name.
 *
 * @typedef {{ name: string, command: string, exitCode: number, durationMs: number, outputTail: string }} CheckRecord
 * @typedef {{
 *   schema: 1,
 *   trial: { number: 1 | 2 | 3, id: string, branch: string, workdir: string },
 *   prompt: { path: 'tooling/trial/todo-prompt.md', templateSha256: string, sha256: string, text: string },
 *   scaffold: { rev: string, enforcementRev: string, lockfileSha256: string },
 *   harness: { sha256: string, matchesScaffold: boolean },
 *   agent: { cli: string, version: string, argv: string[], sessionId: string, resolvedModel: string | null, userConfigSha256: string, fake: boolean },
 *   run: { startedAt: string, finishedAt: string, durationMs: number, agentExitCode: number | null, agentDurationMs: number | null, turns: number | null, costUsd: number | null },
 *   result: { status: 'passed' | 'failed', commit: string | null, changedPaths: string[], outsideScope: string[], outsideReads: string[], stoppedServers: number[], patch: string | null },
 *   stream: { path: string | null, sha256: string | null, userTextEvents: number | null },
 *   checks: CheckRecord[],
 *   failures: string[],
 *   retries: { startedAt: string, failures: string[] }[],
 * }} TrialEvidence
 *
 * `run.agentExitCode` is null when the agent never started, and -1 in the
 * provisional record written as it starts. `run.durationMs` is the whole
 * run and `run.agentDurationMs` the agent's session, recorded in place of a
 * time limit (ADR 0038); `retries` holds the earlier
 * attempts that failed before the agent (`--retry`). `stream` names the
 * agent's stream kept beside the record, secrets redacted, or nulls when the
 * agent never ran.
 */

/** @typedef {(value: unknown, path: string) => void} Check */

function reject(path, expected, value) {
  throw new Error(`${path}: expected ${expected}, got ${JSON.stringify(value) ?? 'nothing'}`);
}

/** @returns {Check} */
const text =
  (pattern = /^/, expected = 'a string') =>
  (value, path) => {
    if (typeof value !== 'string' || !pattern.test(value)) {
      reject(path, expected, value);
    }
  };

/** @returns {Check} */
const count = () => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    reject(path, 'a number', value);
  }
};

/** @returns {Check} */
const oneOf =
  (...allowed) =>
  (value, path) => {
    if (!allowed.includes(value)) {
      reject(path, `one of ${allowed.map((item) => JSON.stringify(item)).join(', ')}`, value);
    }
  };

/** @returns {Check} */
const nullable = (check) => (value, path) => {
  if (value !== null) {
    check(value, path);
  }
};

/** @returns {Check} */
const list = (check) => (value, path) => {
  if (!Array.isArray(value)) {
    reject(path, 'a list', value);
  }
  value.forEach((item, index) => {
    check(item, `${path}[${index}]`);
  });
};

/** @returns {Check} */
const shape = (fields) => (value, path) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject(path, 'an object', value);
  }
  for (const key of Object.keys(value)) {
    if (!(key in fields)) {
      throw new Error(`${path}.${key}: not a field of the evidence schema`);
    }
  }
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in value)) {
      throw new Error(`${path}.${key}: missing`);
    }
    check(value[key], `${path}.${key}`);
  }
};

const REV = text(/^[0-9a-f]{40}$/, 'a 40-hex commit');
const SHA256 = text(/^[0-9a-f]{64}$/, 'a 64-hex SHA-256');
const UUID = text(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'a UUID');
const TIME = text(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, 'an ISO time');
const BASENAME = text(/^[^/]+$/, 'a folder name, not a path');

const SCHEMA = shape({
  schema: oneOf(1),
  trial: shape({
    number: oneOf(1, 2, 3),
    id: text(/^todo-0[1-3]$/, 'todo-0N'),
    branch: text(/^trial\/todo-0[1-3]$/, 'trial/todo-0N'),
    workdir: BASENAME,
  }),
  prompt: shape({
    path: oneOf('tooling/trial/todo-prompt.md'),
    templateSha256: SHA256,
    sha256: SHA256,
    text: text(),
  }),
  scaffold: shape({ rev: REV, enforcementRev: REV, lockfileSha256: SHA256 }),
  harness: shape({ sha256: SHA256, matchesScaffold: oneOf(true, false) }),
  agent: shape({
    cli: text(),
    version: text(),
    argv: list(text()),
    sessionId: UUID,
    resolvedModel: nullable(text()),
    userConfigSha256: SHA256,
    fake: oneOf(true, false),
  }),
  run: shape({
    startedAt: TIME,
    finishedAt: TIME,
    durationMs: count(),
    agentExitCode: nullable(count()),
    agentDurationMs: nullable(count()),
    turns: nullable(count()),
    costUsd: nullable(count()),
  }),
  result: shape({
    status: oneOf('passed', 'failed'),
    commit: nullable(REV),
    changedPaths: list(text()),
    outsideScope: list(text()),
    outsideReads: list(text()),
    stoppedServers: list(count()),
    patch: nullable(text()),
  }),
  stream: shape({
    path: nullable(text()),
    sha256: nullable(SHA256),
    userTextEvents: nullable(count()),
  }),
  checks: list(
    shape({
      name: text(),
      command: text(),
      exitCode: count(),
      durationMs: count(),
      outputTail: text(),
    }),
  ),
  failures: list(text()),
  retries: list(shape({ startedAt: TIME, failures: list(text()) })),
});

/** The checks a passed run has run, each at exit 0. */
export const REQUIRED_CHECKS = ['install', 'verify', 'e2e', 'structure'];

/** @param {TrialEvidence} evidence */
const passes = ({ result, stream, checks, failures }) =>
  result.commit !== null &&
  stream.path !== null &&
  result.outsideScope.length === 0 &&
  result.outsideReads.length === 0 &&
  REQUIRED_CHECKS.every((name) => checks.some((check) => check.name === name)) &&
  checks.every((check) => check.exitCode === 0) &&
  failures.length === 0;

/** Rules that tie one field to the others. */
const CONSISTENCY = [
  {
    path: 'evidence.trial.id',
    holds: ({ trial }) => trial.id === `todo-0${trial.number}`,
    rule: 'the id is todo-0 followed by the trial number',
  },
  {
    path: 'evidence.trial.branch',
    holds: ({ trial }) => trial.branch === `trial/${trial.id}`,
    rule: 'the branch is trial/<id>',
  },
  {
    path: 'evidence.run.agentDurationMs',
    holds: ({ run }) =>
      (run.agentDurationMs === null) === (run.agentExitCode === null || run.agentExitCode === -1),
    rule: 'the agent duration is recorded exactly when the agent ran to an exit',
  },
  {
    path: 'evidence.run.durationMs',
    holds: ({ run }) => run.durationMs === Date.parse(run.finishedAt) - Date.parse(run.startedAt),
    rule: 'the run duration is the finish minus the start',
  },
  {
    path: 'evidence.result.status',
    holds: (evidence) => evidence.result.status !== 'passed' || passes(evidence),
    rule: `"passed" needs a commit, a kept stream, empty scope and read lists, the checks ${REQUIRED_CHECKS.join(', ')}, every check at exit 0 and no failure`,
  },
  {
    path: 'evidence.failures',
    holds: ({ result, failures }) => result.status !== 'failed' || failures.length > 0,
    rule: 'a failed run names at least one failure',
  },
];

/**
 * Parses one evidence record and throws, naming the field, on anything the
 * schema does not allow.
 *
 * @param {unknown} value
 * @returns {TrialEvidence}
 */
export function validateEvidence(value) {
  SCHEMA(value, 'evidence');
  const evidence = /** @type {TrialEvidence} */ (value);
  for (const { path, holds, rule } of CONSISTENCY) {
    if (!holds(evidence)) {
      throw new Error(`${path}: ${rule}`);
    }
  }
  return evidence;
}
