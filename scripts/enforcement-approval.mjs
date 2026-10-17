#!/usr/bin/env node
/**
 * Ask for a sign-off only when a PR loosens or rewrites what the gates enforce.
 *
 * `.github/workflows/enforcement-approval.yml` runs this module from the
 * default branch's checkout through `actions/github-script`, so the copy on main
 * judges every PR. It reads the guarded files at the merge base and at the PR
 * head through the API, never runs PR code, and ranks each change with the
 * guard that owns the path. When something loosens, it keeps one comment that
 * lists the changes and carries a checkbox bound to the head commit, and sets
 * the `enforcement-approval` commit status. The status turns green only when
 * that comment, unchanged apart from the tick, was last edited by APPROVER as a
 * GitHub user. A new head rewrites the comment, which clears the tick. See
 * `.agents/decisions/0023-sign-off-only-loosening-enforcement-changes.md`.
 *
 * `GUARDS`, `enforcementProblems`, `judgeSignoff` and `planApproval` are the
 * pure core. `run` is the thin GitHub shell. Invoked directly,
 * `node scripts/enforcement-approval.mjs --git <base> [<head>]` prints
 * `{ head, problems }` for a local branch.
 */
import { execFileSync } from 'node:child_process';

/** The commit status context a branch-protection rule can require. */
export const STATUS_CONTEXT = 'enforcement-approval';

/** Marks the comment this gate owns. */
export const COMMENT_MARKER = '<!-- enforcement-approval -->';

/** The author of the comments this workflow writes. */
export const GATE_AUTHOR = 'github-actions[bot]';

/** The one GitHub user whose tick signs off enforcement changes. */
export const APPROVER = 'BenSheridanEdwards';

/**
 * @typedef {{ path: string, before: string | null, after: string | null }} FileChange  null = absent at that commit
 * @typedef {{ path: string, area: string, reason: string }} Problem
 * @typedef {(change: FileChange) => string[]} Judge  returns reasons; [] = no loosening
 * @typedef {{ area: string, paths: RegExp[], judge: Judge }} Guard
 * @typedef {{ login: string, type: string } | null} Editor
 * @typedef {{ body: string, editor: Editor }} SignoffComment
 * @typedef {{ state: 'missing' } | { state: 'stale' } | { state: 'awaiting' } | { state: 'refused', by: string } | { state: 'approved' }} Verdict
 * @typedef {{ state: 'success' | 'failure', description: string }} CommitStatus
 * @typedef {{ filename: string, previous_filename?: string }} PullRequestFile
 */

/**
 * Put a PR-sourced string in one code span where it cannot add a line, a
 * checkbox, a table cell, a mention or invisible text.
 *
 * @param {unknown} text
 */
const inert = (text) =>
  `\`${String(text)
    .replaceAll('`', "'")
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')}\``;

/** @param {number} count */
const lines = (count) => `${count} line${count === 1 ? '' : 's'}`;

/** @param {string} message @returns {Judge} */
const rewrite =
  (message = 'edits enforcement code') =>
  ({ before, after }) => {
    if (before === null) return ['adds enforcement code'];
    return [after === null ? 'deletes the file' : message];
  };

/** @param {string | null} text */
const lineList = (text) =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Lines present in `left` beyond their count in `right`.
 *
 * @param {string[]} left
 * @param {string[]} right
 */
function linesOnlyIn(left, right) {
  const remaining = new Map();
  for (const line of right) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  return left.filter((line) => {
    const count = remaining.get(line) ?? 0;
    remaining.set(line, count - 1);
    return count <= 0;
  });
}

/**
 * Compare trimmed lines as multisets and let the policy name the removed and
 * added lines that loosen.
 *
 * @param {{ removed: (lines: string[]) => string[], added: (lines: string[]) => string[] }} policy
 * @returns {Judge}
 */
const byLines =
  (policy) =>
  ({ before, after }) => {
    if (after === null) return ['deletes the file'];
    return [
      ...policy.removed(linesOnlyIn(lineList(before), lineList(after))),
      ...policy.added(linesOnlyIn(lineList(after), lineList(before))),
    ];
  };

/** @param {string} line */
const isNegation = (line) => line.startsWith('!');

/**
 * Parse JSONC: comments and trailing commas outside strings go, then JSON.parse.
 *
 * @param {string} text
 */
function parseJsonc(text) {
  const keepStrings = (/** @type {string} */ _match, /** @type {string | undefined} */ string) =>
    string ?? '';
  try {
    return JSON.parse(
      text
        .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, keepStrings)
        .replace(/("(?:\\.|[^"\\])*")|,(?=\s*[}\]])/g, keepStrings),
    );
  } catch {
    return undefined;
  }
}

/**
 * @typedef {{ id: string, path: (string | number)[], member: boolean, value: unknown }} Leaf
 * @typedef {Leaf & { before: unknown, after: unknown, change: 'added' | 'removed' | 'changed', listIsNew: boolean }} LeafChange
 */

/**
 * Flatten JSON into leaves. An array of primitives is a set, one member leaf per
 * item; an array holding any object is walked by index.
 *
 * @param {unknown} value
 * @param {(string | number)[]} path
 * @returns {Leaf[]}
 */
function leaves(value, path = []) {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return value.map((item) => ({
        id: JSON.stringify([path, item]),
        path,
        member: true,
        value: item,
      }));
    }
    return value.flatMap((item, index) => leaves(item, [...path, index]));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]));
  }
  return [{ id: JSON.stringify(path), path, member: false, value }];
}

/** @param {unknown} before @param {unknown} after @returns {LeafChange[]} */
function leafChanges(before, after) {
  const beforeLeaves = new Map(leaves(before).map((leaf) => [leaf.id, leaf]));
  const afterLeaves = new Map(leaves(after).map((leaf) => [leaf.id, leaf]));
  const beforeLists = new Set(
    [...beforeLeaves.values()]
      .filter((leaf) => leaf.member)
      .map((leaf) => JSON.stringify(leaf.path)),
  );
  /** @type {LeafChange[]} */
  const removed = [...beforeLeaves.values()]
    .filter((leaf) => !afterLeaves.has(leaf.id))
    .map((leaf) => ({
      ...leaf,
      before: leaf.value,
      after: undefined,
      change: 'removed',
      listIsNew: false,
    }));
  /** @type {LeafChange[]} */
  const added = [...afterLeaves.values()]
    .filter((leaf) => !beforeLeaves.has(leaf.id))
    .map((leaf) => ({
      ...leaf,
      before: undefined,
      after: leaf.value,
      change: 'added',
      listIsNew: leaf.member && !beforeLists.has(JSON.stringify(leaf.path)),
    }));
  /** @type {LeafChange[]} */
  const changed = [...afterLeaves.values()].flatMap((leaf) => {
    const was = beforeLeaves.get(leaf.id);
    return was && !Object.is(was.value, leaf.value)
      ? [{ ...leaf, before: was.value, after: leaf.value, change: 'changed', listIsNew: false }]
      : [];
  });
  return [...removed, ...added, ...changed];
}

/** @param {(string | number)[]} path */
const dotted = (path) =>
  path.reduce(
    (/** @type {string} */ text, segment) =>
      typeof segment === 'number' ? `${text}[${segment}]` : text ? `${text}.${segment}` : segment,
    '',
  );

/** @param {string} path @param {string} prefix */
const isUnder = (path, prefix) =>
  path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);

/** Lists that name what a tool covers; an absent list means it covers everything. */
const COVERAGE = new Set(['include', 'includes', 'files']);
const RESTRICTIVE = new Set([...COVERAGE, 'deny', 'ask']);
const PERMISSIVE = /ignore|exclude|allow/i;
/** @type {Record<string, number>} */
const LEVELS = { off: 0, info: 1, warn: 2, on: 2, error: 3 };
const STRICT_WHEN_TRUE = new Set([
  'strict',
  'alwaysStrict',
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'strictBuiltinIteratorReturn',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'noUnusedLocals',
  'noUnusedParameters',
  'noFallthroughCasesInSwitch',
  'noImplicitReturns',
  'noUncheckedIndexedAccess',
  'noImplicitOverride',
  'noPropertyAccessFromIndexSignature',
  'exactOptionalPropertyTypes',
  'isolatedModules',
  'verbatimModuleSyntax',
  'checkJs',
  'forceConsistentCasingInFileNames',
  'noUncheckedSideEffectImports',
  'enabled',
  'recommended',
]);
const LOOSE_WHEN_TRUE = new Set([
  'skipLibCheck',
  'skipDefaultLibCheck',
  'allowUnreachableCode',
  'allowUnusedLabels',
  'suppressExcessPropertyErrors',
  'suppressImplicitAnyIndexErrors',
  'noStrictGenericChecks',
  'useIgnoreFile',
  'ignoreUnknown',
  'disableAllHooks',
  'noCheck',
]);

/** The value of each strictness flag that loosens the gate. */
const LOOSENING_FLAG_VALUE = new Map([
  ...[...STRICT_WHEN_TRUE].map((key) => /** @type {const} */ ([key, false])),
  ...[...LOOSE_WHEN_TRUE].map((key) => /** @type {const} */ ([key, true])),
]);

/** @param {LeafChange} leaf */
const isFlag = (leaf) => typeof leaf.before === 'boolean' || typeof leaf.after === 'boolean';

/** @param {LeafChange} leaf @param {boolean} loosening @param {string} at */
function flagReason(leaf, loosening, at) {
  if (leaf.after === loosening) return `sets ${at} to ${inert(loosening)}`;
  // TypeScript reads `null` as unset, so it counts as removing the flag.
  return leaf.before === !loosening && leaf.after == null ? `removes ${at}` : '';
}

/** @param {unknown} value */
const rank = (value) =>
  typeof value === 'string' && Object.hasOwn(LEVELS, value) ? LEVELS[value] : undefined;

/** @param {{ member: boolean, path: (string | number)[], before: unknown, after: unknown }} leaf @param {string} key */
const isSeverity = (leaf, key) =>
  !leaf.member &&
  leaf.path.includes('rules') &&
  !leaf.path.includes('options') &&
  (key === 'level' || rank(leaf.before) !== undefined || rank(leaf.after) !== undefined);

/**
 * An unknown level reads as `error` before and below `off` after, so it asks.
 *
 * @type {Record<'added' | 'removed' | 'changed', (leaf: LeafChange, at: string) => string>}
 */
const SEVERITY_REASONS = {
  removed: (leaf, at) => ((rank(leaf.before) ?? LEVELS.error) === 0 ? '' : `removes rule ${at}`),
  added: (leaf, at) =>
    rank(leaf.after) === LEVELS.error ? '' : `adds rule ${at} at ${inert(leaf.after)}`,
  changed: (leaf, at) =>
    (rank(leaf.after) ?? -1) >= (rank(leaf.before) ?? LEVELS.error)
      ? ''
      : `lowers ${at} from ${inert(leaf.before)} to ${inert(leaf.after)}`,
};

/**
 * Rank one leaf change. Returns the loosening reason, `''` when the change is
 * fine, or `undefined` to defer to the next rule.
 *
 * @typedef {(leaf: LeafChange, key: string, at: string) => string | undefined} LeafRule
 * @type {LeafRule[]}
 */
const LEAF_RULES = [
  (leaf, key, at) =>
    leaf.listIsNew && leaf.change === 'added' && COVERAGE.has(key)
      ? `starts ${at}, which limits the files it covers`
      : undefined,
  (leaf, key, at) => {
    if (!leaf.member) return undefined;
    const restrictive = RESTRICTIVE.has(key);
    if (restrictive && leaf.path.includes('overrides')) {
      return 'changes the files an override covers';
    }
    const permissive = PERMISSIVE.test(key);
    if (!permissive && !restrictive) return undefined;
    const added = leaf.change === 'added';
    const loosensWhenAdded = permissive || String(leaf.value).startsWith('!');
    if (added !== loosensWhenAdded) return '';
    const item = inert(leaf.value);
    return added ? `adds ${item} to ${at}` : `removes ${item} from ${at}`;
  },
  (leaf, key, at) => (isSeverity(leaf, key) ? SEVERITY_REASONS[leaf.change](leaf, at) : undefined),
  (leaf, key, at) => {
    const loosening = leaf.member ? undefined : LOOSENING_FLAG_VALUE.get(key);
    return loosening === undefined || !isFlag(leaf) ? undefined : flagReason(leaf, loosening, at);
  },
];

/**
 * @param {string[]} neutral dotted path prefixes whose changes cannot loosen
 * @returns {Judge}
 */
const byJson =
  (neutral) =>
  ({ before, after }) => {
    if (after === null) return ['deletes the file'];
    const was = parseJsonc(before ?? '{}');
    const now = parseJsonc(after);
    if (was === undefined || now === undefined) {
      return ['is not valid JSON, so the gate cannot rank the change'];
    }
    return leafChanges(was, now).flatMap((leaf) => {
      const key = String(leaf.path.findLast((segment) => typeof segment === 'string') ?? '');
      const path = dotted(leaf.path);
      const at = inert(path);
      for (const rule of LEAF_RULES) {
        const reason = rule(leaf, key, at);
        if (reason !== undefined) return reason ? [reason] : [];
      }
      if (neutral.some((prefix) => isUnder(path, prefix))) return [];
      const verb = { added: 'adds', removed: 'removes', changed: 'changes' }[leaf.change];
      return [
        leaf.member
          ? `${verb} ${inert(leaf.value)} ${leaf.change === 'added' ? 'to' : 'from'} ${at}`
          : `${verb} ${at}`,
      ];
    });
  };

/**
 * The guard table, in order; the first guard with a pattern that matches a path
 * judges it. Code can loosen in ways a text diff cannot rank, so code paths read
 * any change as a rewrite.
 *
 * @type {ReadonlyArray<Guard>}
 */
export const GUARDS = [
  {
    area: 'Enforcement-approval gate',
    paths: [
      /^\.github\/workflows\/enforcement-approval\.yml$/,
      /^scripts\/enforcement-approval\.mjs$/,
      /^scripts\/enforcement-approval\.test\.ts$/,
    ],
    judge: rewrite('edits the enforcement-approval gate'),
  },
  {
    area: 'Required-gates contract',
    paths: [/^docs\/required-gates\.md$/],
    judge: byLines({
      removed: (removed) =>
        removed.length ? [`removes or rewrites ${lines(removed.length)}`] : [],
      added: () => [],
    }),
  },
  { area: 'Gate scripts', paths: [/^scripts\//], judge: rewrite() },
  {
    area: 'ESLint config and local rules',
    paths: [/(^|\/)eslint\.config\.[cm]?[jt]s$/, /^tooling\//],
    judge: rewrite(),
  },
  {
    area: 'Biome config',
    paths: [/(^|\/)biome\.jsonc?$/],
    judge: byJson([
      '$schema',
      'formatter',
      'javascript.formatter',
      'json.formatter',
      'css.formatter',
    ]),
  },
  {
    area: 'Fallow config',
    paths: [/(^|\/)\.fallowrc\.jsonc?$/],
    judge: byJson(['$schema']),
  },
  {
    area: 'TypeScript config',
    paths: [/(^|\/)tsconfig[^/]*\.json$/],
    judge: byJson(['$schema', 'compilerOptions', 'ts-node']),
  },
  { area: 'CI workflows', paths: [/^\.github\/workflows\//], judge: rewrite() },
  { area: 'Git hooks', paths: [/^\.husky\//], judge: rewrite() },
  {
    area: 'Claude Code settings and hooks',
    paths: [/^\.claude\/settings(\.local)?\.json$/],
    judge: byJson(['$schema']),
  },
  { area: 'Claude Code settings and hooks', paths: [/^\.claude\/hooks\//], judge: rewrite() },
  {
    area: 'Test and commit config',
    paths: [/^((jest|playwright|commitlint)\.config\.[^/]+|\.commitlintrc(\.[^/]+)?)$/],
    judge: rewrite(),
  },
  {
    area: 'Ignore files Biome reads',
    paths: [/(^|\/)\.(git)?ignore$/],
    judge: byLines({
      removed: (removed) =>
        removed.filter(isNegation).map((line) => `removes re-include ${inert(line)}`),
      added: (added) =>
        added
          .filter((line) => !line.startsWith('#') && !isNegation(line))
          .map((line) => `adds ignore pattern ${inert(line)}`),
    }),
  },
];

const MAX_REASONS = 10;

/** The most files "list pull request files" returns; past it, guarded files can hide. */
export const LIST_FILES_LIMIT = 3000;

/** @type {Problem} */
const TOO_MANY_FILES = {
  path: 'this PR',
  area: 'Gate input',
  reason: `changes ${LIST_FILES_LIMIT} or more files, past what the API lists, so the gate cannot see every guarded file`,
};

/** @param {string} path */
const guardFor = (path) =>
  GUARDS.find((guard) => guard.paths.some((pattern) => pattern.test(path)));

/**
 * Every guarded path on either side of a "list pull request files" response.
 * A rename is two paths: the old one reads as deleted, the new one as added.
 *
 * @param {PullRequestFile[]} files
 * @returns {string[]}
 */
export function guardedPaths(files) {
  const paths = files.flatMap((file) => [file.filename, file.previous_filename ?? '']);
  return [...new Set(paths.filter((path) => path && guardFor(path)))].sort();
}

/**
 * @param {FileChange[]} changes
 * @returns {Problem[]}
 */
export function enforcementProblems(changes) {
  return changes
    .flatMap((change) => {
      const guard = guardFor(change.path);
      if (!guard) return [];
      const reasons = [...new Set(guard.judge(change))];
      const shown =
        reasons.length > MAX_REASONS
          ? [...reasons.slice(0, MAX_REASONS), `and ${reasons.length - MAX_REASONS} more changes`]
          : reasons;
      return shown.map((reason) => ({ path: change.path, area: guard.area, reason }));
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** Keeps the comment well inside GitHub's comment size limit. */
const MAX_ROWS = 100;

const APPROVAL_LINE = '\n- [ ] Approve these enforcement changes at ';

/**
 * The sign-off comment, unticked, for `problems` at commit `head`.
 *
 * @param {{ head: string, problems: Problem[] }} input
 */
export function signoffComment({ head, problems }) {
  return [
    COMMENT_MARKER,
    '## Enforcement sign-off',
    '',
    'This PR loosens or rewrites what the gates enforce:',
    '',
    '| File | Area | Change |',
    '| --- | --- | --- |',
    ...problems
      .slice(0, MAX_ROWS)
      .map((problem) => `| ${inert(problem.path)} | ${problem.area} | ${problem.reason} |`),
    ...(problems.length > MAX_ROWS
      ? [`| | | and ${problems.length - MAX_ROWS} more changes |`]
      : []),
    '',
    `@${APPROVER} signs off by ticking the box below in GitHub. The tick counts for commit ${inert(head)} only. A new push clears it, and a tick from any other account is cleared.`,
    `${APPROVAL_LINE}${inert(head)}`,
    '',
  ].join('\n');
}

const CLEAR_BODY = `${COMMENT_MARKER}\nNothing in this PR loosens enforcement now, so it needs no sign-off.\n`;

/** @param {string} body */
const normalise = (body) => body.replaceAll('\r\n', '\n').trimEnd();

/**
 * Where the sign-off stands for `head`.
 *
 * @param {{ comment: SignoffComment | undefined, head: string, problems: Problem[] }} input
 * @returns {Verdict}
 */
export function judgeSignoff({ comment, head, problems }) {
  if (!comment) return { state: 'missing' };
  const expected = normalise(signoffComment({ head, problems }));
  const body = normalise(comment.body);
  if (body === expected) return { state: 'awaiting' };
  const ticked = ['x', 'X'].map((box) =>
    expected.replace(APPROVAL_LINE, APPROVAL_LINE.replace(' ]', `${box}]`)),
  );
  if (!ticked.includes(body)) return { state: 'stale' };
  const { editor } = comment;
  if (editor?.type === 'User' && editor.login === APPROVER) return { state: 'approved' };
  return { state: 'refused', by: editor?.login ?? 'unknown' };
}

/** @type {CommitStatus} */
const WAITING = {
  state: 'failure',
  description: `${APPROVER} ticks the box in the enforcement comment for this commit`,
};

/**
 * Decide the comment body, any refusal note, and the commit status. Pure.
 *
 * @param {{ head: string, problems: Problem[], comment: SignoffComment | undefined }} input
 * @returns {{ commentBody: string | null, refusal: string | null, status: CommitStatus }}
 */
export function planApproval({ head, problems, comment }) {
  if (problems.length === 0) {
    return {
      commentBody: comment ? CLEAR_BODY : null,
      refusal: null,
      status: { state: 'success', description: 'Nothing in this PR loosens enforcement' },
    };
  }
  const verdict = judgeSignoff({ comment, head, problems });
  if (verdict.state === 'approved') {
    return {
      commentBody: comment?.body ?? null,
      refusal: null,
      status: { state: 'success', description: `${APPROVER} signed off at ${head.slice(0, 7)}` },
    };
  }
  return {
    commentBody: signoffComment({ head, problems }),
    refusal:
      verdict.state === 'refused'
        ? `Enforcement sign-off refused a tick by ${inert(verdict.by)}. Only ${APPROVER}, signed in to GitHub as a user, signs off enforcement changes. The tick is cleared.`
        : null,
    status: WAITING,
  };
}

const EDITOR_QUERY = `query($id: ID!) { node(id: $id) { ... on IssueComment { editor { __typename login } } } }`;

/**
 * Read one file at `ref` through the API, or null when it is absent there.
 *
 * @param {any} github @param {{ owner: string, repo: string }} repo @param {string} path @param {string} ref
 */
async function readFile(github, repo, path, ref) {
  try {
    const { data } = await github.rest.repos.getContent({
      ...repo,
      path,
      ref,
      mediaType: { format: 'raw' },
    });
    return String(data);
  } catch (error) {
    if (/** @type {{ status?: number }} */ (error)?.status === 404) return null;
    throw error;
  }
}

/**
 * The gate's own comment with its last editor, or undefined when there is none.
 * A comment a person posts never counts, whatever it says.
 *
 * @param {any} github @param {Array<{ id: number, node_id: string, body?: string, user?: { login: string } }>} comments
 */
async function findSignoffComment(github, comments) {
  const existing = comments.find(
    (comment) => comment.user?.login === GATE_AUTHOR && comment.body?.startsWith(COMMENT_MARKER),
  );
  if (!existing) return undefined;
  const { node } = await github.graphql(EDITOR_QUERY, { id: existing.node_id });
  const editor = node?.editor;
  return {
    id: existing.id,
    body: String(existing.body),
    editor: editor ? { login: editor.login, type: editor.__typename } : null,
  };
}

/**
 * Create or update the gate's comment when its body changes, then post any
 * refusal note.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, existing: { id: number, body: string } | undefined, plan: { commentBody: string | null, refusal: string | null } }} input
 */
async function writeComments({ github, repo, number, existing, plan }) {
  const post = (/** @type {string} */ body) =>
    github.rest.issues.createComment({ ...repo, issue_number: number, body });
  if (plan.commentBody !== null && plan.commentBody !== existing?.body) {
    await (existing
      ? github.rest.issues.updateComment({
          ...repo,
          comment_id: existing.id,
          body: plan.commentBody,
        })
      : post(plan.commentBody));
  }
  if (plan.refusal) await post(plan.refusal);
}

/**
 * The `actions/github-script` entry point. Idempotent: a rerun with nothing new
 * makes no comment write.
 */
export async function run({ github, context, core }) {
  const repo = context.repo;
  const number = context.payload.pull_request?.number ?? context.payload.issue?.number;
  const { data: pullRequest } = await github.rest.pulls.get({ ...repo, pull_number: number });
  const head = pullRequest.head.sha;
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${pullRequest.base.sha}...${head}`,
  });
  const mergeBase = comparison.merge_base_commit.sha;

  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const changes = await Promise.all(
    guardedPaths(files).map(async (path) => ({
      path,
      before: await readFile(github, repo, path, mergeBase),
      after: await readFile(github, repo, path, head),
    })),
  );
  const problems = [
    ...(files.length >= LIST_FILES_LIMIT ? [TOO_MANY_FILES] : []),
    ...enforcementProblems(changes),
  ];

  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  const existing = await findSignoffComment(github, comments);

  const plan = planApproval({ head, problems, comment: existing });
  await writeComments({ github, repo, number, existing, plan });

  await github.rest.repos.createCommitStatus({
    ...repo,
    sha: head,
    context: STATUS_CONTEXT,
    state: plan.status.state,
    description: plan.status.description,
  });
  core.info(`${STATUS_CONTEXT}: ${plan.status.state} — ${plan.status.description}`);
}

/** @param {string[]} argv */
function runCli(argv) {
  const index = argv.indexOf('--git');
  if (index === -1 || !argv[index + 1]) {
    console.error('Usage: node scripts/enforcement-approval.mjs --git <base> [<head>]');
    process.exitCode = 2;
    return;
  }
  const git = (/** @type {string[]} */ ...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git('rev-parse', argv[index + 2] ?? 'HEAD').trim();
  const base = git('merge-base', String(argv[index + 1]), head).trim();
  /** @param {string} ref @param {string} path */
  const show = (ref, path) => {
    try {
      return git('show', `${ref}:${path}`);
    } catch {
      return null;
    }
  };
  const names = git('diff', '--name-only', '--no-renames', '-z', `${base}...${head}`).split('\0');
  const paths = guardedPaths(names.filter(Boolean).map((filename) => ({ filename })));
  const problems = enforcementProblems(
    paths.map((path) => ({ path, before: show(base, path), after: show(head, path) })),
  );
  console.log(JSON.stringify({ head, problems }, null, 2));
}

// Run the CLI only when invoked directly, not when imported by a test or the workflow.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
