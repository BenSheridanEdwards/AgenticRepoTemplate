#!/usr/bin/env node
/**
 * Ask for sign-off when a PR loosens or rewrites gates or changes product intent.
 *
 * `.github/workflows/enforcement-approval.yml` runs this module from the
 * default branch's checkout through `actions/github-script`, so the copy on main
 * judges every PR. It reads the guarded files at the merge base and at the PR
 * head through the API, never runs PR code, and ranks each change with the
 * guard that owns the path. When a change needs sign-off, it keeps one comment that
 * lists the changes and carries a checkbox bound to the head commit, and sets
 * the `enforcement-approval` commit status. The status turns green only on the
 * edit event in which the GitHub user from ENFORCEMENT_APPROVER (default
 * BenSheridanEdwards) turns this head's unticked box
 * into a ticked one. The gate then labels the box with who ticked it and when.
 * Any other edit, and a new head, rewrites the comment unticked. See
 * `.agents/decisions/0024-sign-off-only-loosening-enforcement-changes.md`.
 *
 * `GUARDS`, `enforcementProblems`, `signoffComment` and `planApproval` are the
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
export const APPROVER = process.env.ENFORCEMENT_APPROVER || 'BenSheridanEdwards';

/**
 * @typedef {{ path: string, before: string | null, after: string | null }} FileChange  null = absent at that commit
 * @typedef {{ path: string, area: string, reason: string }} Problem
 * @typedef {(change: FileChange) => string[]} Judge  returns reasons; [] = no loosening
 * @typedef {{ area: string, paths: RegExp[], judge: Judge }} Guard
 * @typedef {{ name: string | null, login: string, at: Date }} Approval  who ticked, from their profile, and when
 * @typedef {{ kind: 'comment', commentId?: number, sender: { login: string, type: string, name?: string | null }, from: string | null, to: string, at: string }} CommentEdit  an edit of the gate's comment, as the event reports it
 * @typedef {{ kind: 'pull' } | CommentEdit} GateEvent
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

/** @param {string} message @returns {Judge} */
const rewrite =
  (message = 'edits enforcement code') =>
  ({ before, after }) => {
    if (before === null) return ['adds enforcement code'];

    return [after === null ? 'deletes the file' : message];
  };

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
    [...beforeLeaves.values()].flatMap((leaf) => (leaf.member ? [JSON.stringify(leaf.path)] : [])),
  );

  /** @type {LeafChange[]} */
  const removed = [...beforeLeaves.values()].flatMap((leaf) =>
    !afterLeaves.has(leaf.id)
      ? [{ ...leaf, before: leaf.value, after: undefined, change: 'removed', listIsNew: false }]
      : [],
  );

  /** @type {LeafChange[]} */
  const added = [...afterLeaves.values()].flatMap((leaf) =>
    !beforeLeaves.has(leaf.id)
      ? [
          {
            ...leaf,
            before: undefined,
            after: leaf.value,
            change: 'added',
            listIsNew: leaf.member && !beforeLists.has(JSON.stringify(leaf.path)),
          },
        ]
      : [],
  );

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
const PERMISSIVE = /ignore|exclude/i;

/** @type {Record<string, number>} */
const LEVELS = { off: 0, info: 1, warn: 2, on: 2, error: 3 };
const STRICT_WHEN_TRUE = new Set(['enabled', 'recommended']);
const LOOSE_WHEN_TRUE = new Set(['useIgnoreFile', 'ignoreUnknown']);

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

  // `null` reads as removing the flag, so it cannot turn a check off unasked.
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
    const restrictive = COVERAGE.has(key);

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
 * judges it. Gate files and this gate itself follow ADRs 0023/0024; product intent
 * follows ADR 0060. Code can loosen in ways a text diff cannot rank, and intent
 * has no tighten/loosen direction, so both read any change as a rewrite.
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
    area: 'Vendored lint rules',
    paths: [/^vendor\/anti-slop\//, /(^|\/)oxlint\.config\.[^/]+$/],
    judge: rewrite(),
  },
  {
    area: 'Oxlint config',
    paths: [/(^|\/)\.oxlintrc\.json$/],
    judge: byJson(['$schema']),
  },
  { area: 'CI workflows', paths: [/^\.github\/workflows\//], judge: rewrite() },
  { area: 'Git hooks', paths: [/^\.husky\//], judge: rewrite() },
  {
    area: 'Lint config',
    paths: [
      /^eslint\.config\.js$/,
      /^commitlint\.config\.ts$/,
      /^tooling\/eslint-plugin-policy\.js$/,
      /^scripts\/check-suppressions\.mjs$/,
    ],
    judge: rewrite(),
  },
  {
    area: 'Biome config',
    paths: [/^biome\.json$/],
    judge: byJson([
      '$schema',
      'formatter',
      'javascript.formatter',
      'json.formatter',
      'css.formatter',
    ]),
  },
  {
    area: 'Product intent',
    paths: [/^docs\/prd\//, /^\.agents\/NORTH_STAR\.md$/],
    judge: rewrite('edits product intent'),
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

const APPROVAL_TEXT = 'Approve these enforcement changes at ';

/** Formats a time in London, where Ben works, in the parts the label needs. */
const LONDON = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h12',
});

/** @param {number} day */
const ordinal = (day) =>
  day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');

/**
 * `Monday, the 12th of October, at 3 pm` for `at` in Europe/London.
 *
 * @param {Date} at
 */
export function londonTime(at) {
  const part = Object.fromEntries(LONDON.formatToParts(at).map(({ type, value }) => [type, value]));
  const day = Number(part.day);
  const minute = part.minute === '00' ? '' : `:${part.minute}`;

  return `${part.weekday}, the ${day}${ordinal(day)} of ${part.month}, at ${Number(part.hour)}${minute} ${String(part.dayPeriod).toLowerCase()}`;
}

/**
 * A profile name as plain text: one line, every character outside letters,
 * digits, spaces, `.`, `'` and `-` written as an HTML entity, so it cannot close
 * the label, add markdown, or mention anyone.
 *
 * @param {string} text
 */
const plainText = (text) =>
  [
    ...text
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, 100)
    .join('')
    .replace(/[^\p{L}\p{N} .'-]/gu, (char) => `&#${char.codePointAt(0)};`);

/**
 * The small italic note the gate puts after a ticked box. It records the tick for
 * people; the gate never reads it back as evidence.
 *
 * @param {Approval} approval
 */
export function approvalLabel({ name, login, at }) {
  const handle = login.replace(/[^A-Za-z0-9-]/g, '');
  const shown = plainText(name ?? '') || handle;

  return `<sub><i>Approved by ${shown} @${handle} on ${londonTime(at)}</i></sub>`;
}

/** @param {string} login */
const refusalNote = (login) =>
  `A tick by ${inert(login)} was cleared. Only ${APPROVER} signs off enforcement changes.`;

/** Matches the refusal note and the blank line after it. */
const REFUSAL_NOTE =
  /\nA tick by `[^`\n]*` was cleared\. Only \S+ signs off enforcement changes\.\n/;

/**
 * The sign-off comment for `problems` at commit `head`: unticked, unticked with
 * a note that names whose tick the gate just cleared, or ticked with the label
 * when the gate has just seen the approver tick it.
 *
 * @param {{ head: string, problems: Problem[], approval?: Approval, refusedBy?: string }} input
 */
export function signoffComment({ head, problems, approval, refusedBy }) {
  const box = approval
    ? `- [x] ${APPROVAL_TEXT}${inert(head)} ${approvalLabel(approval)}`
    : `- [ ] ${APPROVAL_TEXT}${inert(head)}`;

  return [
    COMMENT_MARKER,
    '## Enforcement sign-off',
    '',
    'This PR loosens or rewrites what the gates enforce, or changes product intent:',
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
    ...(refusedBy === undefined ? [] : [refusalNote(refusedBy), '']),
    `@${APPROVER} signs off by ticking the box below in GitHub. The tick counts for commit ${inert(head)} only. A new push clears it, and a tick from any other account is cleared.`,
    box,
    '',
  ].join('\n');
}

const CLEAR_BODY = `${COMMENT_MARKER}\nNothing in this PR loosens enforcement now, so it needs no sign-off.\n`;

/** @param {string} body */
const normalise = (body) => body.replaceAll('\r\n', '\n').trimEnd();

/** @param {string} body */
const hasTick = (body) => /^\s*[-*+]\s+\[[xX]\]/m.test(body);

/** @param {CommentEdit['sender']} sender */
const isApprover = (sender) => sender.type === 'User' && sender.login === APPROVER;

/**
 * Whether `event` is the approver turning this head's unticked box, with or
 * without a refusal note, into a ticked one and changing nothing else.
 *
 * @param {{ event: CommentEdit, unticked: string }} input
 */
function isFreshTick({ event, unticked }) {
  const { sender, from, to } = event;

  if (!isApprover(sender) || from === null) return false;
  const before = normalise(from);
  const ticked = ['x', 'X'].map((box) => before.replace('\n- [ ] ', `\n- [${box}] `));

  return before.replace(REFUSAL_NOTE, '') === unticked && ticked.includes(normalise(to));
}

/**
 * Whether `body` is the gate's labelled comment for this head and these
 * problems. The gate leaves such a body in place only while its own latest
 * status for the head is the sign-off, so the text never shows or makes an
 * approval by itself.
 *
 * @param {string} body @param {string} unticked
 */
function isLabelled(body, unticked) {
  const box = /\n- \[x\] (.*) <sub><i>Approved by [^<\n]*<\/i><\/sub>\n/;
  const text = normalise(body);

  return box.test(`${text}\n`) && normalise(`${text}\n`.replace(box, '\n- [ ] $1\n')) === unticked;
}

/** @param {string} head @returns {CommitStatus} */
const signedOffStatus = (head) => ({
  state: 'success',
  description: `${APPROVER} signed off at ${head.slice(0, 7)}`,
});

/** @type {CommitStatus} */
const WAITING = {
  state: 'failure',
  description: `${APPROVER} ticks the box in the enforcement comment for this commit`,
};

/**
 * @typedef {{ commentBody: string | null, status: CommitStatus | null }} Plan  `status: null` leaves the head's status as it is
 */

/**
 * Plan for an edit of the comment: approve the approver's fresh tick while the
 * comment is unchanged since it, clear any other edit, and name whoever else
 * left a tick. Returns undefined for a fresh tick the comment has moved past.
 *
 * @param {{ head: string, problems: Problem[], comment: { body: string, updatedAt?: string } | undefined, event: CommentEdit }} input
 * @returns {Plan | undefined}
 */
function planEdit({ head, problems, comment, event }) {
  const unticked = signoffComment({ head, problems });

  if (!isFreshTick({ event, unticked: normalise(unticked) })) {
    const refused = hasTick(event.to) && !isApprover(event.sender);

    return {
      commentBody: refused
        ? signoffComment({ head, problems, refusedBy: event.sender.login })
        : unticked,
      status: WAITING,
    };
  }

  const unchanged =
    comment !== undefined &&
    normalise(comment.body) === normalise(event.to) &&
    comment.updatedAt === event.at;

  if (!unchanged) return undefined;
  const { login, name } = event.sender;

  return {
    commentBody: signoffComment({
      head,
      problems,
      approval: { name: name ?? null, login, at: new Date(event.at) },
    }),
    status: signedOffStatus(head),
  };
}

/**
 * Decide the comment body and the commit status. Pure.
 *
 * Only an edit event that is the approver's fresh tick on this head's comment,
 * with the comment unchanged since that edit, signs off. Any other edit clears
 * the box. A PR event, or a tick the comment has since moved past, keeps the
 * gate's label for this head without posting a status while `signedOff` says
 * the gate's latest status for the head is the sign-off, and resets anything
 * else.
 *
 * @param {{ head: string, problems: Problem[], comment: { body: string, updatedAt?: string } | undefined, signedOff: boolean, event: GateEvent }} input
 * @returns {Plan}
 */
export function planApproval({ head, problems, comment, signedOff, event }) {
  if (problems.length === 0) {
    return {
      commentBody: comment ? CLEAR_BODY : null,
      status: { state: 'success', description: 'Nothing in this PR loosens enforcement' },
    };
  }

  const edit = event.kind === 'comment' && planEdit({ head, problems, comment, event });

  if (edit) return edit;
  const unticked = signoffComment({ head, problems });

  if (signedOff && comment && isLabelled(comment.body, normalise(unticked))) {
    return { commentBody: comment.body, status: null };
  }

  return { commentBody: unticked, status: WAITING };
}

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
 * The gate's own comment, or undefined when there is none. A comment a person
 * posts never counts, whatever it says. On an edit, the edited comment comes
 * first, and it counts when its marker was there before the edit. A gate
 * comment that lost its marker but keeps the approval line also counts, so the
 * gate restores it even when the edit's own run never ran.
 *
 * @param {Array<{ id: number, body?: string, updated_at?: string, user?: { login: string } }>} comments
 * @param {GateEvent} event
 */
function findSignoffComment(comments, event) {
  const hadMarker = (/** @type {number} */ id) =>
    event.kind === 'comment' &&
    event.commentId === id &&
    Boolean(event.from?.startsWith(COMMENT_MARKER));

  const signoff = comments.filter(
    (comment) =>
      comment.user?.login === GATE_AUTHOR &&
      (comment.body?.startsWith(COMMENT_MARKER) ||
        comment.body?.includes(APPROVAL_TEXT) ||
        hadMarker(comment.id)),
  );

  const existing =
    signoff.find((comment) => event.kind === 'comment' && comment.id === event.commentId) ??
    signoff[0];

  return (
    existing && { id: existing.id, body: String(existing.body), updatedAt: existing.updated_at }
  );
}

/**
 * What triggered this run. An edit carries its sender and the body before and
 * after it; GitHub sets them, the comment text cannot.
 *
 * @param {any} github @param {any} context
 * @returns {Promise<GateEvent>}
 */
async function gateEvent(github, context) {
  if (context.eventName !== 'issue_comment') return { kind: 'pull' };
  const { comment, changes, sender } = context.payload;

  const name =
    sender.login === APPROVER
      ? (await github.rest.users.getByUsername({ username: sender.login })).data.name
      : null;

  return {
    kind: 'comment',
    commentId: comment.id,
    sender: { login: sender.login, type: sender.type, name },
    from: changes?.body?.from ?? null,
    to: String(comment.body),
    at: comment.updated_at,
  };
}

/**
 * Whether the gate's own latest status on `head` is the sign-off. Anyone with
 * write access can post a status, so only the gate's count.
 *
 * @param {any} github @param {{ owner: string, repo: string }} repo @param {string} head
 */
async function isSignedOff(github, repo, head) {
  const { data: statuses } = await github.rest.repos.listCommitStatusesForRef({
    ...repo,
    ref: head,
    per_page: 100,
  });

  const latest = statuses.find(
    (/** @type {{ context: string, creator?: { login: string } }} */ status) =>
      status.context === STATUS_CONTEXT && status.creator?.login === GATE_AUTHOR,
  );

  const signed = signedOffStatus(head);

  return latest?.state === signed.state && latest?.description === signed.description;
}

/**
 * Create or update the gate's comment when its body changes.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, existing: { id: number, body: string } | undefined, body: string | null }} input
 */
async function writeComment({ github, repo, number, existing, body }) {
  if (body === null || body === existing?.body) return;
  await (existing
    ? github.rest.issues.updateComment({ ...repo, comment_id: existing.id, body })
    : github.rest.issues.createComment({ ...repo, issue_number: number, body }));
}

/**
 * The `actions/github-script` entry point. It reads the head, the files and the
 * comment live, so a rerun or a late run judges the PR as it is now, and posts
 * the status on that head. A rerun with nothing new makes no comment write.
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

  const event = await gateEvent(github, context);
  const existing = findSignoffComment(comments, event);

  const plan = planApproval({
    head,
    problems,
    comment: existing,
    signedOff: await isSignedOff(github, repo, head),
    event,
  });

  await writeComment({ github, repo, number, existing, body: plan.commentBody });

  if (!plan.status) {
    core.info(`${STATUS_CONTEXT}: left as it is for ${head}`);

    return;
  }

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
