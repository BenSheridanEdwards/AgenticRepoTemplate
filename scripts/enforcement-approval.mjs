#!/usr/bin/env node
/**
 * Gate changes to enforcement paths on a maintainer's sign-off.
 *
 * `.github/workflows/enforcement-approval.yml` runs this module from the
 * default branch's checkout through `actions/github-script`, so the copy on main
 * judges every PR. It reads the PR's changed files through the API only, keeps
 * one sticky comment listing the protected files, and sets the
 * `enforcement-approval` commit status on the PR head. The status turns green
 * once a write-access reviewer ticks the comment's single approval box. See
 * `.agents/decisions/0007-protect-enforcement-paths-by-default.md`.
 *
 * `planApproval` is the pure core for unit tests. `run` is the thin GitHub
 * shell. Invoked directly, the CLI reads `{ files, existingBody? }` JSON from
 * stdin and prints the plan, which makes a dry run against a real PR possible.
 */
import { createHash } from 'node:crypto';

/** The commit status context a branch-protection rule can require. */
export const STATUS_CONTEXT = 'enforcement-approval';

/** Marks the sticky comment this gate owns. */
export const COMMENT_MARKER = '<!-- enforcement-approval -->';

const APPROVAL_LABEL = '**Approve these enforcement changes**';
const APPROVAL_LINE_PATTERN = /^\s*-\s+\[([ xX])\]\s+\*\*Approve these enforcement changes\*\*/m;
const FINGERPRINT_PATTERN = /<!-- enforcement-fingerprint:([0-9a-f]{64}) -->/;
const WRITE_PERMISSIONS = ['admin', 'maintain', 'write'];

/** The author of comments written with the workflow's own `GITHUB_TOKEN`. */
export const GATE_AUTHOR = 'github-actions[bot]';

/**
 * The lint, format and commit-message configs, the local ESLint policy plugin
 * and the suppression check. With the hooks and workflows they are the files
 * that run the gates (ADR 0023).
 */
const LINT_FILES = new Set([
  'eslint.config.js',
  'biome.json',
  'commitlint.config.ts',
  'tooling/eslint-plugin-policy.js',
  'scripts/check-suppressions.mjs',
]);

/** @param {string} prefix */
const under = (prefix) => (/** @type {string} */ path) => path.startsWith(prefix);

/**
 * Ordered table of protected areas; the first matching rule names the area.
 * Only the files that run the gates are protected: the git hooks, the CI
 * workflows and the lint configs. Agent docs, scripts and other config change
 * freely (ADR 0023).
 *
 * @type {ReadonlyArray<{ area: string, matches: (path: string) => boolean }>}
 */
export const PROTECTED_PATH_RULES = [
  { area: 'Git hooks', matches: under('.husky/') },
  { area: 'GitHub workflows', matches: under('.github/workflows/') },
  { area: 'Lint config', matches: (path) => LINT_FILES.has(path) },
];

/**
 * @typedef {{ filename: string, status: string, sha?: string, previous_filename?: string, additions: number, deletions: number }} PullRequestFile
 * @typedef {{ path: string, previousPath: string | undefined, status: string, sha: string | undefined, area: string, additions: number, deletions: number }} ProtectedFile
 * @typedef {{ state: 'success' | 'failure', description: string }} CommitStatus
 */

/** @param {string | undefined} path */
function areaFor(path) {
  if (!path) return undefined;
  return PROTECTED_PATH_RULES.find((rule) => rule.matches(path))?.area;
}

/**
 * Keep the protected files from a "list pull request files" response. A rename
 * counts when either side is protected, so moving a file out of `scripts/` is
 * caught too.
 *
 * @param {PullRequestFile[]} files
 * @returns {ProtectedFile[]}
 */
export function classifyProtectedFiles(files) {
  return files
    .flatMap((file) => {
      const area = areaFor(file.filename) ?? areaFor(file.previous_filename);
      if (!area) return [];
      return [
        {
          path: file.filename,
          previousPath: file.previous_filename,
          status: file.status,
          sha: file.sha,
          area,
          additions: file.additions,
          deletions: file.deletions,
        },
      ];
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 * Hash the identity of every protected change. Any content or status change to
 * a protected file yields a new value, which resets an earlier approval.
 *
 * @param {ProtectedFile[]} protectedFiles
 */
export function fingerprint(protectedFiles) {
  const lines = protectedFiles
    .map((file) => `${file.status} ${file.path} ${file.sha ?? ''} ${file.previousPath ?? ''}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Render a path as a table-safe code span. Filenames come from the PR author,
 * so backslashes, newlines, pipes and backticks are neutralised to keep each row one line.
 *
 * @param {string} path
 */
function codeCell(path) {
  return `\`${path
    .replace(/\\/g, '\\\\')
    .replace(/[\r\n]+/g, ' ')
    .replace(/`/g, "'")
    .replace(/\|/g, '\\|')}\``;
}

/** @param {ProtectedFile} file */
function tableRow(file) {
  const name = file.previousPath
    ? `${codeCell(file.previousPath)} → ${codeCell(file.path)}`
    : codeCell(file.path);
  return `| ${name} | ${file.status} | +${file.additions} / -${file.deletions} | ${file.area} |`;
}

/**
 * @param {ProtectedFile[]} protectedFiles
 * @param {string} hash
 * @param {boolean} approved
 */
function approvalBody(protectedFiles, hash, approved) {
  return [
    COMMENT_MARKER,
    `<!-- enforcement-fingerprint:${hash} -->`,
    '## Enforcement changes need sign-off',
    '',
    'This PR changes files that define the repo’s gates. A reviewer with write access signs them off by ticking the box below; a later change to any of these files resets it.',
    '',
    '| File | Change | +/- | Area |',
    '| --- | --- | --- | --- |',
    ...protectedFiles.map(tableRow),
    '',
    `- [${approved ? 'x' : ' '}] ${APPROVAL_LABEL}`,
    '',
  ].join('\n');
}

const UNPROTECTED_BODY = [
  COMMENT_MARKER,
  '## Enforcement changes',
  '',
  'This PR now changes only unprotected paths, so it carries no enforcement sign-off.',
  '',
].join('\n');

const NO_CHANGES_STATUS = /** @type {CommitStatus} */ ({
  state: 'success',
  description: 'No enforcement paths change in this PR',
});

/**
 * Decide the sticky comment body and the commit status for a PR. Pure.
 *
 * @param {{ files: PullRequestFile[], existingBody?: string | null }} input
 * @returns {{ commentBody: string | null, status: CommitStatus }}
 */
export function planApproval({ files, existingBody }) {
  const protectedFiles = classifyProtectedFiles(files);
  if (protectedFiles.length === 0) {
    return { commentBody: existingBody ? UNPROTECTED_BODY : null, status: NO_CHANGES_STATUS };
  }

  const hash = fingerprint(protectedFiles);
  const previous = existingBody ?? '';
  const approved =
    previous.match(FINGERPRINT_PATTERN)?.[1] === hash &&
    /[xX]/.test(previous.match(APPROVAL_LINE_PATTERN)?.[1] ?? '');

  return {
    commentBody: approvalBody(protectedFiles, hash, approved),
    status: approved
      ? { state: 'success', description: 'Approved in the enforcement comment' }
      : { state: 'failure', description: 'Tick the approval box in the enforcement comment' },
  };
}

/** @param {string | undefined} body */
function stripApproval(body) {
  return body?.replace(FINGERPRINT_PATTERN, '');
}

/**
 * Look up a user's repo permission, falling back to 'none' when the lookup
 * fails, so an unknown user is treated as lacking write access.
 */
async function permissionOf(github, repo, username) {
  try {
    const response = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username });
    return response.data.permission;
  } catch {
    return 'none';
  }
}

/**
 * The `actions/github-script` entry point. Idempotent: a rerun with nothing new
 * creates no comment and makes no edit.
 */
export async function run({ github, context, core }) {
  const repo = context.repo;
  const number = context.payload.pull_request?.number ?? context.payload.issue?.number;

  const actor = context.payload.sender?.login;
  const editorLacksWrite =
    context.eventName === 'issue_comment' &&
    !WRITE_PERMISSIONS.includes(await permissionOf(github, repo, actor));

  const pullRequest = await github.rest.pulls.get({ ...repo, pull_number: number });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) => comment.user?.login === GATE_AUTHOR && comment.body?.includes(COMMENT_MARKER),
  );

  // An edit from someone without write access carries no sign-off, so plan as
  // if the box were unticked; that also clears the box they ticked.
  const plan = planApproval({
    files,
    existingBody: editorLacksWrite ? stripApproval(existing?.body) : existing?.body,
  });

  if (editorLacksWrite) {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: number,
      body: `@${actor}, signing off enforcement changes needs write access to this repo, so the box stays clear until a reviewer with write access ticks it.`,
    });
  }

  if (plan.commentBody !== null && !existing) {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: number,
      body: plan.commentBody,
    });
  } else if (plan.commentBody !== null && existing && existing.body !== plan.commentBody) {
    await github.rest.issues.updateComment({
      ...repo,
      comment_id: existing.id,
      body: plan.commentBody,
    });
  }

  await github.rest.repos.createCommitStatus({
    ...repo,
    sha: pullRequest.data.head.sha,
    context: STATUS_CONTEXT,
    state: plan.status.state,
    description: plan.status.description,
  });
  core.info(`${STATUS_CONTEXT}: ${plan.status.state} — ${plan.status.description}`);
}

async function runCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  console.log(JSON.stringify(planApproval(input), null, 2));
}

// Run the CLI only when invoked directly, not when imported by a test or the workflow.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
