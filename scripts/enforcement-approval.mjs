#!/usr/bin/env node
/**
 * Ask for sign-off when a PR loosens or rewrites gates or changes product intent.
 *
 * `.github/workflows/enforcement-approval.yml` runs this module from the
 * default branch's checkout through `actions/github-script`, so the copy on main
 * judges every PR. It reads the guarded files at the merge base and at the PR
 * head through the API, never runs PR code, and ranks each change with the
 * guard that owns the path. When a change needs sign-off, it keeps one comment,
 * always the last gate comment in the PR, that lists the changes and carries a
 * checkbox, and sets the `enforcement-approval` commit status. The status turns
 * green only on the edit event in which the GitHub user from ENFORCEMENT_APPROVER
 * (default BenSheridanEdwards) turns this head's unticked box into a ticked one;
 * the gate then labels the box with who ticked it and when. A new head keeps
 * that approval only when its guarded changes match the approved head's exactly.
 * Any other edit, and any other new head, rewrites the comment unticked. See
 * ADRs 0024 and 0122 in `.agents/decisions/`.
 *
 * `GUARDS`, `enforcementProblems`, `signoffComment` and `planApproval` are the
 * pure core. `run` is the thin GitHub shell. Invoked directly,
 * `node scripts/enforcement-approval.mjs --git <base> [<head>]` prints
 * `{ head, problems }` for a local branch.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
 * @typedef {{ path: string, area: string, reason: string, what?: string, effect?: string }} Problem
 * @typedef {{ what: string, effect: string }} Description
 * @typedef {(change: FileChange) => string[]} Judge  returns reasons; [] = no loosening
 * @typedef {{ area: string, paths: RegExp[], judge: Judge }} Guard
 * @typedef {{ name: string | null, login: string, at: Date }} Approval  who ticked, from their profile, and when
 * @typedef {{ kind: 'comment', commentId?: number, sender: { login: string, type: string, name?: string | null }, from: string | null, to: string, at: string }} CommentEdit  an edit of the gate's comment, as the event reports it
 * @typedef {{ kind: 'pull' } | CommentEdit} GateEvent
 * @typedef {{ state: 'success' | 'failure', description: string }} CommitStatus
 * @typedef {{ filename: string, previous_filename?: string, status?: string, patch?: string }} PullRequestFile
 * @typedef {{ from: string, name: string, handle: string, time: string }} Carry  an earlier head's sign-off whose guarded changes match this head's
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

/** @param {string} text */
const linesOf = (text) =>
  text ? text.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n') : [];

/**
 * The lines each side holds and how many each side has that the other lacks,
 * counting repeated lines as copies.
 *
 * @param {string} before @param {string} after
 */
function lineDiff(before, after) {
  const was = linesOf(before);
  const now = linesOf(after);
  const oldCounts = Map.groupBy(was, (line) => line);
  const newCounts = Map.groupBy(now, (line) => line);
  const common = [...oldCounts].reduce(
    (total, [line, copies]) => total + Math.min(copies.length, newCounts.get(line)?.length ?? 0),
    0,
  );

  return {
    was,
    now,
    oldCounts,
    newCounts,
    added: now.length - common,
    removed: was.length - common,
  };
}

/** @param {number} count */
const lines = (count) => `${count} ${count === 1 ? 'line' : 'lines'}`;

/**
 * A sentence for an edit that adds and removes no line: a move or a newline.
 *
 * @param {string[]} was @param {string[]} now
 */
function moveSummary(was, now) {
  const moved = now.filter((line, index) => line !== was[index]);

  return moved.length
    ? `Moves ${moved.length} lines: first moved line ${inert(short(moved[0].trim()))}`
    : 'Changes the final newline';
}

/**
 * A sentence for one quoted line replaced by another, noting a spacing-only edit.
 *
 * @param {string} old @param {string} fresh
 */
const replacement = (old, fresh) =>
  old === fresh ? `Changes only the spacing of ${old}` : `Replaces ${old} with ${fresh}`;

/**
 * One plain sentence for a text edit that quotes the first changed line.
 *
 * @param {string} before @param {string} after
 */
function lineSummary(before, after) {
  if (before.replaceAll('\r\n', '\n') === after.replaceAll('\r\n', '\n')) {
    return 'Changes line endings';
  }
  const { was, now, oldCounts, newCounts, added, removed } = lineDiff(before, after);

  if (added + removed === 0) return moveSummary(was, now);
  const [firstOld, firstNew] = quotePair(
    firstUnmatched(was, newCounts),
    firstUnmatched(now, oldCounts),
  );

  if (removed === 0) {
    return added === 1
      ? `Adds the line ${firstNew}`
      : `Adds ${lines(added)}, starting with ${firstNew}`;
  }
  if (added === 0) {
    return removed === 1
      ? `Removes the line ${firstOld}`
      : `Removes ${lines(removed)}, starting with ${firstOld}`;
  }
  if (added === 1 && removed === 1) return replacement(firstOld, firstNew);

  return `Edits ${lines(added + removed)} (adds ${added}, removes ${removed}), starting with ${firstOld} → ${firstNew}`;
}

/**
 * How many lines changed, as the last sentence after the named changes.
 *
 * @param {string} before @param {string} after
 */
function lineTotals(before, after) {
  const { added, removed } = lineDiff(before, after);

  return {
    changed: added + removed,
    sentence: `${lines(added + removed)} changed in all: ${added} added, ${removed} removed`,
  };
}

/**
 * The first line of `lines` that `other` does not hold, counting copies.
 *
 * @param {string[]} lines @param {Map<string, string[]>} other
 */
function firstUnmatched(lines, other) {
  const used = new Map();

  return (
    lines.find((line) => {
      const seen = (used.get(line) ?? 0) + 1;
      used.set(line, seen);

      return seen > (other.get(line)?.length ?? 0);
    }) ?? ''
  );
}

/** @param {string} line */
const quote = (line) => inert(short(line.trim()) || '(blank line)');

/**
 * Quote a replaced line and its replacement so both show where they differ:
 * a long pair drops the prefix they share, after an ellipsis.
 *
 * @param {string} was @param {string} now
 */
function quotePair(was, now) {
  const [left, right] = [was.trim(), now.trim()];

  if (left.length <= 80 && right.length <= 80) return [quote(left), quote(right)];
  const shared = [...left].findIndex((char, index) => char !== right[index]);
  const start = Math.max(0, (shared < 0 ? Math.min(left.length, right.length) : shared) - 20);
  const cut = (/** @type {string} */ text) => (start ? `…${text.slice(start)}` : text);

  return [quote(cut(left)), quote(cut(right))];
}

/** @param {string} text */
const short = (text) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

/** @param {string} text @param {string} key */
function yamlSection(text, key) {
  const lines = linesOf(text);
  const pattern = new RegExp(`^ *${key}: *(?:#.*)?$`);
  const start = lines.findIndex((line) => pattern.test(line));

  if (start === -1) return { text: '', start: 0 };
  const indent = lines[start].search(/\S/);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(
    (line) => line.trim() && !line.trimStart().startsWith('#') && line.search(/\S/) <= indent,
  );

  return { text: rest.slice(0, end === -1 ? undefined : end).join('\n'), start: start + 1 };
}

/** Direct mapping entries or sequence items; nested block-scalar text stays in its block.
 * @param {string} text @param {RegExp} pattern
 */
function yamlBlocks(text, pattern) {
  const lines = linesOf(text);
  const candidates = lines.flatMap((line, index) => {
    if (line.trimStart().startsWith('#')) return [];
    const match = line.match(pattern);

    return match ? [{ index, indent: match[1].length, key: match[2] }] : [];
  });
  const indent = candidates.reduce((minimum, item) => Math.min(minimum, item.indent), Infinity);
  const starts = candidates.filter((item) => item.indent === indent);

  return starts.map((item, index) => ({
    key: item.key,
    text: lines.slice(item.index, starts[index + 1]?.index).join('\n'),
    start: item.index,
    end: starts[index + 1]?.index ?? lines.length,
  }));
}

/** @param {string} text @param {string} key @param {RegExp} pattern */
function sectionBlocks(text, key, pattern) {
  const section = yamlSection(text, key);

  return yamlBlocks(section.text, pattern).map((block) => ({
    ...block,
    start: block.start + section.start,
    end: block.end + section.start,
  }));
}

/** @param {string} text @param {{ start: number, end: number }[]} blocks */
function withoutBlocks(text, blocks) {
  const covered = new Set(
    blocks.flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, index) => start + index),
    ),
  );

  return linesOf(text)
    .filter((_line, index) => !covered.has(index))
    .join('\n')
    .replace(/(?<!\n)\n+$/, '');
}

/** @param {string} value */
const yamlScalar = (value) => value.trim().replace(/^("|')(.*)\1$/, '$2');

/** @param {string} text @param {string} key */
function stepField(text, key) {
  const lines = linesOf(text);

  if (lines.length === 0) return '';
  const flow = lines[0].match(/^ *- +\{(.*)\}\s*$/);

  if (flow) {
    const fields = flow[1].matchAll(/(?:^|,)\s*([\w-]+):\s*("[^"]*"|'[^']*'|[^,{}]+)/g);
    const field = [...fields].find((field) => field[1] === key);

    return yamlScalar(field?.[2] ?? '');
  }
  const indent = lines[0].search(/\S/) + 2;
  const pattern = new RegExp(`^ {${indent}}${key}:`);
  const index = lines
    .map((line, index) => (index === 0 ? line.replace('- ', '  ') : line))
    .findIndex((line) => pattern.test(line));

  if (index === -1) return '';
  const field = lines[index];
  const value = yamlScalar(field.slice(field.indexOf(':') + 1));

  if (!/^[|>][-+]?(?:\s+#.*)?$/.test(value)) return value;
  const next = lines[index + 1] ?? '';

  return next.search(/\S/) > indent ? next.trim() : '';
}

/** @param {string} uses */
function actionPin(uses) {
  const commentIndex = uses.indexOf(' #');
  const reference = yamlScalar(commentIndex === -1 ? uses : uses.slice(0, commentIndex));
  const comment = commentIndex === -1 ? '' : uses.slice(commentIndex + 2).trim();
  const at = reference.lastIndexOf('@');

  return {
    reference,
    comment,
    action: at === -1 ? reference : reference.slice(0, at),
    ref: at === -1 ? '' : reference.slice(at + 1),
  };
}

/** @param {string} text */
function workflowSteps(text) {
  const blocks = sectionBlocks(text, 'steps', /^( *)- +(.+)/);
  const entries = blocks.length
    ? blocks
    : stepField(text, 'uses')
      ? [{ text, start: 0, end: linesOf(text).length }]
      : [];
  const steps = entries.map((block) => {
    const uses = stepField(block.text, 'uses');
    const pin = actionPin(uses);
    const run = stepField(block.text, 'run');
    const name = stepField(block.text, 'name') || run;
    const key = stepField(block.text, 'id') || stepField(block.text, 'name') || pin.action || name;

    return { ...block, ...pin, key, name, run };
  });

  return [...Map.groupBy(steps, (step) => step.key).values()]
    .flatMap((group) =>
      group.map((step, index) => ({ ...step, key: JSON.stringify([step.key, index]) })),
    )
    .toSorted((left, right) => left.start - right.start);
}

/** @param {ReturnType<typeof workflowSteps>[number]} step */
function stepName(step) {
  if (step.name) return `the step ${inert(short(step.name))}`;
  if (step.action) {
    return `the step ${inert(short(step.action))}${step.ref ? ` at ${pin(step)}` : ''}`;
  }

  return 'an unnamed step';
}

/** @param {string} text */
function withoutUses(text) {
  const lines = linesOf(text);
  const indent = (lines[0] ?? '').search(/\S/) + 2;
  const pattern = new RegExp(`^ {${indent}}uses:`);

  return lines
    .filter((line, index) => !pattern.test(index === 0 ? line.replace('- ', '  ') : line))
    .join('\n');
}

/** @param {{ ref: string, comment: string }} step */
const pin = (step) => {
  const ref = /^[a-f0-9]{7,40}$/i.test(step.ref) ? step.ref.slice(0, 7) : short(step.ref);

  return `${inert(ref)}${step.comment ? ` (${inert(short(step.comment))})` : ''}`;
};

/** @param {ReturnType<typeof workflowSteps>[number]} old @param {ReturnType<typeof workflowSteps>[number]} step */
function pinChanges(old, step) {
  if (!step.action || step.action !== old.action) return [];
  const action = inert(short(step.action));

  if (step.reference === old.reference) {
    return step.comment !== old.comment
      ? [
          `Changes the version comment for ${action} from ${inert(short(old.comment))} to ${inert(short(step.comment))}`,
        ]
      : [];
  }
  if (step.comment && step.comment === old.comment) {
    const commit = /^[a-f0-9]{7,40}$/i.test(step.ref) ? 'commit ' : '';

    return [`Changes the pin of ${action} to ${commit}${pin({ ...step, comment: '' })}`];
  }

  return [`Bumps ${action} from ${pin(old)} to ${pin(step)}`];
}

/** @param {string} before @param {string} after */
const remainderChanges = (before, after) => (before === after ? [] : [lineSummary(before, after)]);

/** @param {string} before @param {string} after */
function stepChanges(before, after) {
  const was = workflowSteps(before);
  const now = workflowSteps(after);
  const oldSteps = new Map(was.map((step) => [step.key, step]));
  const newSteps = new Map(now.map((step) => [step.key, step]));
  const reordered =
    was.length === now.length &&
    was.every((step) => newSteps.has(step.key)) &&
    was.some((step, index) => step.key !== now[index].key);

  const reasons = [
    ...was.filter((step) => !newSteps.has(step.key)).map((step) => `Removes ${stepName(step)}`),
    ...now.flatMap((step) => {
      const old = oldSteps.get(step.key);

      if (!old) return [`Adds ${stepName(step)}`];

      const pins = pinChanges(old, step);

      return [
        ...pins,
        ...(withoutUses(old.text) !== withoutUses(step.text) ||
        (old.text !== step.text && pins.length === 0)
          ? [
              `Changes ${stepName(step)}${old.run !== step.run ? `: run ${inert(short(old.run))} → ${inert(short(step.run))}` : ''}`,
            ]
          : []),
      ];
    }),
    ...(reordered ? ['Reorders steps'] : []),
  ];

  return { reasons, before: withoutBlocks(before, was), after: withoutBlocks(after, now) };
}

/** @param {string} before @param {string} after */
function workflowChanges(before, after) {
  const jobs = (/** @type {string} */ text) => sectionBlocks(text, 'jobs', /^( *)([^ :][^:]*):/);
  const was = jobs(before);
  const now = jobs(after);

  if (was.length + now.length === 0) {
    const steps = stepChanges(before, after);

    return [...steps.reasons, ...remainderChanges(steps.before, steps.after)];
  }
  const oldJobs = new Map(was.map((job) => [job.key, job]));
  const newJobs = new Map(now.map((job) => [job.key, job]));
  const matched = now.flatMap((job) => {
    const old = oldJobs.get(job.key);

    return old ? [{ ...stepChanges(old.text, job.text), key: job.key }] : [];
  });

  return [
    ...was
      .filter((job) => !newJobs.has(job.key))
      .map((job) => `Removes the job ${inert(short(yamlScalar(job.key)))}`),
    ...now
      .filter((job) => !oldJobs.has(job.key))
      .map((job) => `Adds the job ${inert(short(yamlScalar(job.key)))}`),
    ...matched.flatMap((steps) => steps.reasons),
    ...matched.flatMap((steps) =>
      remainderChanges(steps.before, steps.after).map(
        (reason) => `${reason} in the job ${inert(short(yamlScalar(steps.key)))}`,
      ),
    ),
    ...remainderChanges(withoutBlocks(before, was), withoutBlocks(after, now)),
  ];
}

/** @type {Judge} */
const rewrite = ({ before, after }) => {
  if (before === null) return ['Adds this file'];
  if (after === null) return ['Deletes this file'];

  return [lineSummary(before, after)];
};

/**
 * Up to four inert names, then how many more.
 *
 * @param {string[]} names
 */
const listed = (names) =>
  names.length > 4
    ? `${names.slice(0, 4).map(inert).join(', ')} and ${names.length - 4} more`
    : names.map(inert).join(', ');

/**
 * Entries `pattern` captures as [name, value], keyed by name.
 *
 * @param {string} text @param {RegExp} pattern
 * @returns {Map<string, string>}
 */
const captured = (text, pattern) => {
  const matches = [...text.matchAll(pattern)];

  // A repeated name gets its occurrence number, so one copy cannot hide another's change.
  return new Map(
    matches.map((match, index) => {
      const copies = matches.slice(0, index).filter((other) => other[1] === match[1]).length;

      return [copies ? `${match[1]} (${copies + 1})` : match[1], match[2] ?? ''];
    }),
  );
};

/** Lint rule severities in a config: `'plugin/rule': 'error'`. */
const SEVERITY = /['"]([\w@./-]+\/[\w./-]+|[a-z][\w-]*)['"]\s*:\s*['"](off|warn|error)['"]/g;

/** Rule definitions in a plugin's `rules` object: `'rule-name': ruleValue,` or `'rule-name': {`. */
const RULE_DEFINITION = /^ {4}['"]([a-z][a-z0-9-]*)['"]\s*:\s*(?:\{|[A-Za-z_$][\w$]*,)\s*$/gm;

/**
 * The text of a plugin's top-level `rules: {` object, or '' when it has none.
 *
 * @param {string} text
 */
const rulesBlock = (text) => {
  const lines = linesOf(text);
  const start = lines.findIndex((line) => /^ {2}rules: \{\s*$/.test(line));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^ {2}\},?\s*$/.test(line));

  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
};

/** Packages a file loads: imports and `import.meta.resolve`. */
const LOADED = /(?:from\s+|import\s+|import\.meta\.resolve\(\s*)['"]([^'"./][^'"]*)['"]/g;

/**
 * Plain-English sentences for the structure a lint config or plugin changes:
 * rules turned on, off or re-ranked, rule definitions added or removed, and
 * packages loaded or dropped. Line counts follow, so nothing reads as smaller.
 *
 * @param {string} before @param {string} after
 */
function codeChanges(before, after) {
  const [wasRules, nowRules] = [before, after].map((text) => captured(text, SEVERITY));
  const turnedOn = [...nowRules].filter(([name]) => !wasRules.has(name));
  const dropped = [...wasRules].filter(([name]) => !nowRules.has(name));
  const reranked = [...nowRules].filter(
    ([name, level]) => wasRules.has(name) && wasRules.get(name) !== level,
  );
  const [wasDefined, nowDefined] = [before, after].map(
    (text) => new Set(captured(rulesBlock(text), RULE_DEFINITION).keys()),
  );
  const [wasLoaded, nowLoaded] = [before, after].map(
    (text) => new Set(captured(text, LOADED).keys()),
  );
  const byLevel = Map.groupBy(turnedOn, ([, level]) => level);

  return [
    ...[...nowLoaded].filter((name) => !wasLoaded.has(name)).map((name) => `Loads ${inert(name)}`),
    ...[...wasLoaded]
      .filter((name) => !nowLoaded.has(name))
      .map((name) => `Stops loading ${inert(name)}`),
    ...[...nowDefined]
      .filter((name) => !wasDefined.has(name))
      .map((name) => `Adds the lint rule ${inert(name)}`),
    ...[...wasDefined]
      .filter((name) => !nowDefined.has(name))
      .map((name) => `Removes the lint rule ${inert(name)}`),
    ...[...byLevel].map(([level, rules]) =>
      level === 'off'
        ? `Lists ${rules.length === 1 ? 'the lint rule' : `${rules.length} lint rules`} ${listed(rules.map(([name]) => name))} as off`
        : `Turns on ${rules.length === 1 ? 'the lint rule' : `${rules.length} lint rules`} at ${level}: ${listed(rules.map(([name]) => name))}`,
    ),
    ...dropped.map(
      ([name, level]) => `Stops configuring the lint rule ${inert(name)} (was ${level})`,
    ),
    ...reranked.map(
      ([name, level]) =>
        `${level === 'off' ? 'Turns off' : 'Changes'} the lint rule ${inert(name)} from ${wasRules.get(name)} to ${level}`,
    ),
  ];
}

/** @param {string} text @returns {Map<string, string>} section heading → section text */
const sections = (text) => {
  const lines = linesOf(text);
  const starts = lines.flatMap((line, index) => (/^#{1,6} /.test(line) ? [index] : []));
  const headings = starts.map((start) => lines[start].replace(/^#+ /, '').trim());
  const intro =
    starts[0] === 0
      ? []
      : [['(introduction)', lines.slice(0, starts[0] ?? lines.length).join('\n')]];
  // A repeated heading gets its occurrence number, so one copy cannot hide another's change.
  const named = starts.map((start, index) => {
    const copies = headings.slice(0, index).filter((heading) => heading === headings[index]).length;

    return [
      copies ? `${headings[index]} (${copies + 1})` : headings[index],
      lines.slice(start + 1, starts[index + 1] ?? lines.length).join('\n'),
    ];
  });

  return new Map(/** @type {[string, string][]} */ ([...intro, ...named]));
};

/**
 * Plain-English sentences for a markdown document: sections added, removed
 * and rewritten, by heading.
 *
 * @param {string} before @param {string} after
 */
function markdownChanges(before, after) {
  if (![before, after].some((text) => /^#{1,6} /m.test(text))) return [];
  const [was, now] = [before, after].map(sections);
  const added = [...now.keys()].filter((heading) => !was.has(heading));
  const removed = [...was.keys()].filter((heading) => !now.has(heading));
  const rewritten = [...now.keys()].filter(
    (heading) => was.has(heading) && was.get(heading) !== now.get(heading),
  );
  const phrase = (/** @type {string} */ verb, /** @type {string[]} */ headings) =>
    `${verb} the ${headings.length === 1 ? 'section' : `${headings.length} sections`} ${listed(headings)}`;

  return [
    ...(added.length ? [phrase('Adds', added)] : []),
    ...(removed.length ? [phrase('Removes', removed)] : []),
    ...(rewritten.length ? [phrase('Rewrites', rewritten)] : []),
  ];
}

/** @param {string} text */
const commands = (text) =>
  linesOf(text)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

/**
 * Plain-English sentences for a Git hook: commands added and removed.
 *
 * @param {string} before @param {string} after
 */
function hookChanges(before, after) {
  const [was, now] = [before, after].map(commands);
  const added = now.filter((line) => !was.includes(line));
  const removed = was.filter((line) => !now.includes(line));
  const explained = added.length + removed.length;

  if (added.length === 1 && removed.length === 1) {
    const [old, fresh] = quotePair(removed[0], added[0]);

    const sentence =
      old === fresh
        ? `Changes only the spacing of the command ${old}`
        : `Replaces the command ${old} with ${fresh}`;

    return { found: [sentence], explained };
  }

  return {
    found: [
      ...added.map((line) => `Adds the command ${quote(line)}`),
      ...removed.map((line) => `Removes the command ${quote(line)}`),
    ],
    explained,
  };
}

/**
 * The sentence for an added or deleted file or a line-ending-only edit, or
 * undefined when the change needs reading.
 *
 * @param {FileChange} change
 * @returns {string[] | undefined}
 */
const edgeCase = ({ path, before, after }) => {
  if (before === null || after === null) return rewrite({ path, before, after });

  return before.replaceAll('\r\n', '\n') === after.replaceAll('\r\n', '\n')
    ? ['Changes line endings']
    : undefined;
};

/**
 * A judge that names the structure `describe` finds, then the line totals, and
 * falls back to the line summary when it finds nothing.
 *
 * @param {(before: string, after: string) => string[] | { found: string[], explained: number }} describe
 * @returns {Judge}
 */
const describedBy = (describe) => (change) => {
  const edge = edgeCase(change);

  if (edge || change.before === null || change.after === null) return edge ?? [];
  const described = describe(change.before, change.after);
  const { found, explained } = Array.isArray(described)
    ? { found: described, explained: -1 }
    : described;
  const totals = lineTotals(change.before, change.after);

  if (!found.length || totals.changed === 0) return [lineSummary(change.before, change.after)];

  // Line totals follow unless the named changes account for every changed line.
  return explained === totals.changed ? found : [...found, totals.sentence];
};

const describeCode = describedBy(codeChanges);
const describeMarkdown = describedBy(markdownChanges);
const describeHook = describedBy(hookChanges);

/** @type {Judge} */
const describeWorkflow = (change) => {
  const edge = edgeCase(change);

  if (edge || change.before === null || change.after === null) return edge ?? [];
  const changes = workflowChanges(change.before, change.after);

  return changes.length ? changes : rewrite(change);
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

      const reason = LEAF_RULES.values()
        .map((rule) => rule(leaf, key, at))
        .find((result) => result !== undefined);

      if (reason !== undefined) return reason ? [reason] : [];

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
    judge: rewrite,
  },
  {
    area: 'Vendored lint rules',
    paths: [/^vendor\/anti-slop\//, /(^|\/)oxlint\.config\.[^/]+$/],
    judge: describeCode,
  },
  {
    area: 'Oxlint config',
    paths: [/(^|\/)\.oxlintrc\.json$/],
    judge: byJson(['$schema']),
  },
  {
    area: 'CI workflows',
    paths: [/^\.github\/workflows\//, /^\.github\/actions\//],
    judge: describeWorkflow,
  },
  { area: 'Git hooks', paths: [/^\.husky\//], judge: describeHook },
  {
    area: 'Lint config',
    paths: [
      /^commitlint\.config\.ts$/,
      /^tooling\/oxlint-plugin-policy\.js$/,
      /^scripts\/check-suppressions\.mjs$/,
    ],
    judge: describeCode,
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
    paths: [/^docs\/prd\//, /^docs\/NORTH_STAR\.md$/],
    judge: describeMarkdown,
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
  what: `Changes at least ${LIST_FILES_LIMIT} files, reaching GitHub's file-list limit`,
  effect:
    'The guarded-file inventory may be incomplete; the gate requires sign-off rather than assuming hidden files are safe',
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

/** @param {unknown} value */
const describedValue = (value) =>
  inert(
    (JSON.stringify(value) ?? 'not set').replace(/\b[0-9a-f]{40}\b/g, (sha) => sha.slice(0, 7)),
  );

/** @param {string[]} parts */
const joined = (parts) => [...new Set(parts.filter(Boolean))].join('; ');

/** @param {string} text */
function sourceUnits(text) {
  const starts = [...text.matchAll(/^(?:export )?(?:async )?(?:function|const|let|class) (\w+)/gm)];

  return new Map(
    starts.map((match, index) => {
      const body = text.slice(match.index, starts[index + 1]?.index).trimEnd();
      const comments = [...body.matchAll(/\n\/\*\*/g)].map((comment) => comment.index);
      const code = comments
        .toReversed()
        .reduce(
          (remaining, start) =>
            remaining.endsWith('*/') ? remaining.slice(0, start).trimEnd() : remaining,
          body,
        );

      return [match[1], code];
    }),
  );
}

/** @param {string} before @param {string} after */
function changedUnits(before, after) {
  const was = sourceUnits(before);
  const now = sourceUnits(after);

  return [...new Set([...was.keys(), ...now.keys()])].flatMap((name) =>
    was.get(name) === now.get(name)
      ? []
      : [{ name, before: was.get(name) ?? '', after: now.get(name) ?? '' }],
  );
}

/** @param {string} text */
const declarationValue = (text) => text.replace(/^(?:export )?(?:const|let) \w+ =\s*/, '').trim();

/** @param {ReturnType<typeof changedUnits>[number]} unit */
const unitDescription = (unit) => {
  const values = `definition ${describedValue(declarationValue(unit.before))} becomes ${describedValue(declarationValue(unit.after))}`;
  return `${unit.before ? (unit.after ? 'Rewrites' : 'Removes') : 'Adds'} the check ${inert(unit.name)}: ${values}`;
};

/** @param {string} text */
function testScenarios(text) {
  const pattern =
    /^[ \t]*(?:it|test|describe)\([ \t]*(['"])([^\n]+?)\1|^[ \t]*\]\)\([ \t]*(['"])([^\n]+?)\3/gm;
  const starts = [...text.matchAll(pattern)];
  return new Map(
    starts.map((match, index) => [
      match[2] ?? match[4],
      text.slice(match.index, starts[index + 1]?.index),
    ]),
  );
}

/** @param {string} before @param {string} after @returns {Description} */
function testDescription(before, after) {
  const was = testScenarios(before);
  const now = testScenarios(after);
  const oldNames = [...was.keys()];
  const newNames = [...now.keys()];
  const added = newNames.filter((name) => !oldNames.includes(name));
  const removed = oldNames.filter((name) => !newNames.includes(name));
  const updated = newNames.filter((name) => was.has(name) && was.get(name) !== now.get(name));

  return {
    what: joined([
      added.length ? `Adds regression coverage: ${added.map(inert).join(', ')}` : '',
      removed.length
        ? `Replaces or removes earlier scenarios: ${removed.map(inert).join(', ')}`
        : '',
      updated.length ? `Updates scenarios or their fixtures: ${updated.map(inert).join(', ')}` : '',
      added.length + removed.length + updated.length === 0 ? 'Changes the gate test fixture' : '',
    ]),
    effect: newNames.length
      ? 'The tooling gate must pass these approval and comment scenarios; a regression fails verification before a push or merge.'
      : 'These regression assertions no longer run in the tooling gate; other tests must cover the removed scenarios.',
  };
}

/** @param {string} text */
const commentFeatures = (text) =>
  joined([
    text.includes('head.slice(0, 7)') ? 'seven-character visible hashes' : 'full visible hashes',
    text.includes('Ran at ') ? 'a London run time' : 'no run time',
    text.includes('<!-- enforcement-head:') ? 'the full head in a hidden marker' : '',
    text.includes('| What changed | How it affects |')
      ? 'a what-changed and effect column for each file'
      : '',
  ]);

/** @param {string} before @param {string} after @returns {Description} */
function gateDescription(before, after) {
  const was = sourceUnits(before);
  const now = sourceUnits(after);
  const changed = changedUnits(before, after);
  const hasChanged = (/** @type {string[]} */ names) =>
    changed.some(({ name }) => names.includes(name));
  const core = ['isApprover', 'isFreshTick', 'guardFingerprint', 'verifiedCarry', 'holdsSignOff'];
  const unchanged = core.filter((name) => was.has(name) && was.get(name) === now.get(name));
  const safety = changed.filter(
    ({ name }) => core.includes(name) || name === 'APPROVER' || name === 'GUARDS',
  );
  const presentation = [
    {
      matches: hasChanged(['signoffComment']),
      what: `Changes the sign-off comment from ${commentFeatures(was.get('signoffComment') ?? '')} to ${commentFeatures(now.get('signoffComment') ?? '')}`,
    },
    {
      matches: hasChanged(['approvalLabel', 'carriedLabel', 'LABEL']),
      what: 'Changes the tick audit label and carried-approval label, including who ticked and the formatted London time',
    },
    {
      matches: hasChanged(['approvedIn', 'commentHead', 'isLabelled']),
      what: 'Changes exact-head parsing and labelled-comment validation; the full head is read from the hidden marker rather than checkbox text',
    },
    {
      matches: hasChanged(['planEdit', 'planApproval', 'ranAtIn']),
      what: 'Updates comment-event handling and label recognition to compare the recorded run time without treating the visible short hash as approval evidence',
    },
  ]
    .filter(({ matches }) => matches)
    .map(({ what }) => what);

  return {
    what:
      joined([
        ...presentation,
        ...safety.map(unitDescription),
        presentation.length + safety.length === 0 ? joined(changed.map(unitDescription)) : '',
      ]) || 'Replaces the enforcement gate definition',
    effect: joined([
      'The comment must explain the guarded change before the maintainer ticks; display text does not grant approval',
      unchanged.length
        ? `These checks are unchanged: ${unchanged.map(inert).join(', ')} (configured-user authorization, fresh ticks and identical guarded-content carry-over)`
        : '',
      safety.length
        ? 'Approval eligibility or guarded-content carry-over checks change as described above; no unchanged-security claim is inferred'
        : '',
      unchanged.length === core.length && safety.length === 0
        ? `Unchanged: only the configured GitHub User @${APPROVER} can fresh-tick; identical guarded-content fingerprints keep approval across a new head, and changed guarded content clears it`
        : '',
    ]),
  };
}

/** @param {LeafChange} leaf */
function settingEffect(leaf) {
  const path = dotted(leaf.path);
  const key = String(leaf.path.at(-1));
  if (path === 'linter.enabled' && leaf.after === false)
    return 'Looser: Biome stops linting covered source files';
  if (key === 'recommended' && leaf.after === false)
    return 'Looser: recommended checks stop being enabled automatically';
  if (isSeverity(leaf, key)) return severityEffect(leaf, path);
  if (PERMISSIVE.test(key)) return `Changes which paths bypass checking through ${inert(path)}`;
  if (COVERAGE.has(key)) return `Changes the files checked by ${inert(path)}`;
  return `The checker now uses ${describedValue(leaf.after)} for ${inert(path)} instead of ${describedValue(leaf.before)}`;
}

/** @param {LeafChange} leaf @param {string} path */
function severityEffect(leaf, path) {
  if (leaf.after === undefined)
    return `Stops configuring ${inert(path)}; inherited settings now decide whether its violations block verification`;
  if (rank(leaf.after) === 0)
    return `Looser: violations of ${inert(path)} no longer produce a lint finding`;
  return `Reports ${inert(path)} at ${describedValue(leaf.after)} instead of ${describedValue(leaf.before)}; fail-on-warning still applies`;
}

/** @param {string} before @param {string} after @returns {Description | undefined} */
function configurationDescription(before, after) {
  const was = parseJsonc(before);
  const now = parseJsonc(after);
  if (was === undefined || now === undefined) return undefined;
  const changes = leafChanges(was, now);

  return {
    what:
      joined(
        changes.map(
          (leaf) =>
            `Changes ${inert(dotted(leaf.path))} from ${describedValue(leaf.before)} to ${describedValue(leaf.after)}`,
        ),
      ) ||
      `Changes JSON formatting or container structure: ${describedValue(was)} becomes ${describedValue(now)}`,
    effect:
      joined(changes.map(settingEffect)) ||
      'Scalar setting values are unchanged; the guarded rewrite still requires sign-off for its formatting or container change',
  };
}

/** @param {string} before @param {string} after @returns {Description} */
function hookDescription(before, after) {
  const was = commands(before);
  const now = commands(after);
  const removed = was.filter((command) => !now.includes(command));
  const added = now.filter((command) => !was.includes(command));
  const exit = now.indexOf('exit 0');
  const skipped = exit < 0 ? [] : now.slice(exit + 1);

  return {
    what: joined([
      added.length ? `Adds hook commands ${listed(added)}` : '',
      removed.length ? `Removes hook commands ${listed(removed)}` : '',
      added.length + removed.length === 0 ? `Changes hook command order to ${listed(now)}` : '',
    ]),
    effect: hookEffects(added, removed, skipped),
  };
}

/** @param {string[]} added @param {string[]} removed @param {string[]} skipped */
function hookEffects(added, removed, skipped) {
  const masked = added.filter((command) => withoutSuccessFallback(command) !== command);
  const exposed = removed.filter(
    (command) =>
      command !== withoutSuccessFallback(command) &&
      added.includes(withoutSuccessFallback(command)),
  );
  return joined([
    skipped.length
      ? `Looser: ${listed(skipped)} become unreachable after the unconditional successful exit`
      : '',
    removed.length ? `The hook no longer executes ${listed(removed)} or their checks` : '',
    added.length
      ? `The hook now executes ${listed(added)}; their exit results participate in the hook's checks`
      : '',
    masked.length ? `Looser: ${listed(masked)} masks failures with ${inert('|| true')}` : '',
    exposed.length
      ? `Removing ${inert('|| true')} exposes the original failure status of ${listed(exposed.map(withoutSuccessFallback))}`
      : '',
    skipped.length + added.length + removed.length === 0
      ? 'Changes which check runs first and which later checks a failure can prevent'
      : '',
  ]);
}

/** @param {string} command */
const withoutSuccessFallback = (command) => {
  const operator = command.lastIndexOf('||');
  return operator >= 0 && command.slice(operator + 2).trim() === 'true'
    ? command.slice(0, operator).trimEnd()
    : command;
};

/** @param {string} before @param {string} after @returns {Description} */
function productDescription(before, after) {
  const requirements = (/** @type {string} */ text) =>
    linesOf(text)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  const was = requirements(before);
  const now = requirements(after);
  const removed = was.filter((line) => !now.includes(line));
  const added = now.filter((line) => !was.includes(line));

  return {
    what:
      joined([
        ...markdownChanges(before, after),
        added.length ? `Adds product requirements ${listed(added)}` : '',
        removed.length ? `Removes product requirements ${listed(removed)}` : '',
      ]) || 'Reorders the product requirements',
    effect: `Product intent now includes ${listed(added) || 'the retained requirements'}${removed.length ? ` instead of ${listed(removed)}` : ''}; implementation and behaviour tests must follow the revised intent`,
  };
}

/** @param {string} text */
function yamlEntries(text) {
  return linesOf(text).flatMap((line) => {
    const field = line.match(/^( *)(?:- +)?([\w-]+): *(.*)$/);
    if (field)
      return [
        { indent: field[1].length, key: field[2], value: field[3], container: field[3] === '' },
      ];
    const member = line.match(/^( *)- +([^:\n]+)$/);
    return member
      ? [
          {
            indent: member[1].length,
            key: `contains ${member[2]}`,
            value: member[2],
            container: false,
          },
        ]
      : [];
  });
}

/** @param {string} text */
function yamlSettings(text) {
  const entries = yamlEntries(text);
  const settings = entries.reduce(
    (state, match) => {
      const { indent, key, value, container } = match;
      const parents = state.parents.filter((parent) => parent.indent < indent);
      const path = [...parents.map((parent) => parent.key), key].join('.');
      if (!container) state.entries.set(path, value);

      return {
        parents: container ? [...parents, { indent, key }] : parents,
        entries: state.entries,
      };
    },
    { parents: [], entries: new Map() },
  );

  return new Map([...settings.entries].filter(([path]) => !/\.(?:name|run|uses)$/.test(path)));
}

/** @param {string} text */
const validationCommands = (text) =>
  [...text.matchAll(/(?:^|&&|\|\||;)[ \t]*pnpm ([A-Za-z][\w:-]*)/gm)]
    .map((match) => `pnpm ${match[1]}`)
    .filter((command) =>
      /^pnpm (?:verify|arch:gate|lint(?::[\w-]+)?|check(?::[\w-]+)?|e2e|test(?::[\w-]+)?)$/.test(
        command,
      ),
    );

/** @param {ReturnType<typeof workflowSteps>[number]} step */
function stepProgram(step) {
  const lines = linesOf(step.text);
  const run = lines.findIndex((line) => /^[ \t]*(?:- +)?run: *[|>]/.test(line));
  if (run < 0) return step.run;
  const indent = lines[run].search(/\S/);
  const rest = lines.slice(run + 1);
  const end = rest.findIndex((line) => line.trim() && line.search(/\S/) <= indent);
  return rest
    .slice(0, end < 0 ? undefined : end)
    .map((line) => line.trim())
    .join('\n');
}

/** @param {string} text */
function workflowCommands(text) {
  const jobs = sectionBlocks(text, 'jobs', /^( *)([^ :][^:]*):/);
  const contexts = jobs.length ? jobs.map((job) => job.text) : [text];
  return contexts.flatMap((context) =>
    workflowSteps(context).flatMap((step) => validationCommands(stepProgram(step))),
  );
}

/** @param {string} before @param {string} after @param {string[]} reasons @returns {Description} */
function workflowDescription(before, after, reasons) {
  const was = yamlSettings(before);
  const now = yamlSettings(after);
  const settings = [...new Set([...was.keys(), ...now.keys()])].filter(
    (key) => was.get(key) !== now.get(key),
  );
  const named = reasons.filter(
    (reason) =>
      !/lines? changed|^(?:Edits |Adds? (?:the line|\d+ lines)|Removes? (?:the line|\d+ lines)|Replaces `|Moves \d+ lines)/.test(
        reason,
      ),
  );
  const changedSettings = settings.map(
    (key) =>
      `Changes workflow ${inert(key)} from ${describedValue(was.get(key))} to ${describedValue(now.get(key))}`,
  );
  const currentCommands = new Set(workflowCommands(after));
  const removed = workflowCommands(before).filter((command) => !currentCommands.has(command));

  return {
    what:
      joined([...named, ...changedSettings]) || 'Changes the workflow trigger or job definition',
    effect: joined([
      removed.length ? `Looser: this workflow no longer requires ${listed(removed)} to pass` : '',
      settings.some((key) => /(?:^|\.)if$/.test(key))
        ? 'The revised condition changes when the named job or step runs'
        : '',
      settings.some((key) => /(?:^|\.)continue-on-error$/.test(key))
        ? 'Changes whether a failed step blocks the named job'
        : '',
      settings.some((key) => /(?:^|\.)permissions(?:\.|$)/.test(key))
        ? 'Changes the GitHub permissions available to the workflow'
        : '',
      'The named jobs, steps, action versions and trigger settings above determine which checks execute',
    ]),
  };
}

/** @param {string} before @param {string} after @returns {Description} */
function optionDescription(before, after) {
  const pattern =
    /\b(ignorePatterns|ignores|exclude|includes|files|extends)[ \t]*:[ \t]*(\[(?:'[^'\n]*'|"[^"\n]*"|[^"'[\]])*\]|'[^'\n]*'|"[^"\n]*"|true|false)/g;
  const was = captured(before, pattern);
  const now = captured(after, pattern);
  const keys = [...new Set([...was.keys(), ...now.keys()])].filter(
    (key) => was.get(key) !== now.get(key),
  );

  return {
    what: joined(
      keys.map(
        (key) =>
          `Changes lint option ${inert(key)} from ${describedValue(was.get(key))} to ${describedValue(now.get(key))}`,
      ),
    ),
    effect: keys.length
      ? 'Changes lint coverage or inherited configuration: ignore and exclude patterns bypass checking; files and includes patterns select checked paths; extends loads the named rule configuration'
      : '',
  };
}

/** @param {string} before @param {string} after @param {string} area @returns {Description} */
function codeDescription(before, after, area) {
  const rules = codeChanges(before, after);
  const units = changedUnits(before, after);
  const options = optionDescription(before, after);
  return {
    what:
      joined([
        ...rules,
        options.what,
        ...(!rules.length && !options.what ? units.map(unitDescription) : []),
      ]) ||
      `Changes the ${area} definition from ${describedValue(before)} to ${describedValue(after)}`,
    effect:
      joined([
        options.effect,
        rules.some((rule) => rule.startsWith('Turns off'))
          ? 'Looser: the named lint rules no longer report violations'
          : '',
        rules.some((rule) => rule.startsWith('Turns on'))
          ? 'The named lint rules run at the stated severity; warnings and errors block verification'
          : '',
        rules.some((rule) => rule.startsWith('Adds the lint rule'))
          ? 'Adds rule implementations available to the lint configuration; configured severities decide whether they block'
          : '',
        !rules.length
          ? `The ${area} executes the replacement checks shown above; approval is required for these changed decision rules`
          : '',
      ]) ||
      'Changes the loaded lint rules or their configuration; the named plugins and rule severities determine the checks that run',
  };
}

/** Classification stays separate from explanation so wording cannot change which files need approval.
 * @param {FileChange} change @param {string} area @param {string[]} reasons @returns {Description}
 */
function describeGuardedFile(change, area, reasons) {
  const { path } = change;
  const before = change.before ?? '';
  const after = change.after ?? '';
  if (before.replaceAll('\r\n', '\n') === after.replaceAll('\r\n', '\n')) {
    return {
      what: 'Changes line endings',
      effect: 'Text formatting changes; executable checks and product requirements stay the same',
    };
  }
  const formats = [
    { matches: path.endsWith('.test.ts'), describe: () => testDescription(before, after) },
    {
      matches: path === 'scripts/enforcement-approval.mjs',
      describe: () => gateDescription(before, after),
    },
    {
      matches: path.endsWith('.json'),
      describe: () =>
        configurationDescription(before || '{}', after || '{}') ?? {
          what: `Replaces ${inert(path)} with invalid JSON`,
          effect:
            'The checker cannot read its configuration; approval stays required and the configuration must be repaired',
        },
    },
    { matches: path.startsWith('.husky/'), describe: () => hookDescription(before, after) },
    { matches: path.endsWith('.md'), describe: () => productDescription(before, after) },
    { matches: /\.ya?ml$/.test(path), describe: () => workflowDescription(before, after, reasons) },
  ];
  return formats.find(({ matches }) => matches)?.describe() ?? codeDescription(before, after, area);
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
      if (!reasons.length) return [];
      const description = describeGuardedFile(change, guard.area, reasons);

      const shown =
        reasons.length > MAX_REASONS
          ? [...reasons.slice(0, MAX_REASONS), `and ${reasons.length - MAX_REASONS} more changes`]
          : reasons;

      return shown.map((reason) => ({
        path: change.path,
        area: guard.area,
        reason,
        ...description,
      }));
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
  const shown =
    login === 'BenSheridanEdwards' ? 'Ben Sheridan Edwards' : plainText(name ?? '') || handle;

  return `<sub><i>ticked by ${shown} at ${londonTime(at)} (@${handle})</i></sub>`;
}

/**
 * The parts of a label the gate wrote: a name the gate escaped, the approver's
 * handle and a London time, with an optional earlier carry note. Anything else
 * is not the gate's label and carries nothing.
 */
const LABEL =
  /^<sub><i>ticked by ([\p{L}\p{N} .'&#;-]{1,1100}) at ([A-Z][a-z]+day, the \d{1,2}(?:st|nd|rd|th) of [A-Z][a-z]+, at \d{1,2}(?::\d{2})? (?:am|pm)) \(@([A-Za-z0-9-]{1,39})\)(?:; carried from `[0-9a-f]{7}`)?<\/i><\/sub>$/u;

/**
 * The label for a sign-off carried from an earlier head, rebuilt from the
 * checked parts of the gate's earlier label, naming the commit ticked.
 *
 * @param {Carry} carry
 */
const carriedLabel = ({ from, name, handle, time }) =>
  `<sub><i>ticked by ${name} at ${time} (@${handle}); carried from ${inert(from.slice(0, 7))}</i></sub>`;

/** @param {string} body */
const commentHead = (body) => {
  const markers = [...body.matchAll(/^<!-- enforcement-head:([0-9a-f]{40}) -->$/gm)];

  return markers.length === 1 ? markers[0][1] : undefined;
};

/** @param {string | null | undefined} body */
const ranAtIn = (body) =>
  body
    ? normalise(body).match(
        /^Ran at ([A-Z][a-z]+day, the \d{1,2}(?:st|nd|rd|th) of [A-Z][a-z]+, at \d{1,2}(?::\d{2})? (?:am|pm)) on commit `[0-9a-f]{7}`\.$/m,
      )?.[1]
    : undefined;

/**
 * The approver's checked label parts and the commit a labelled gate comment
 * approved, or undefined when the box is not the gate's ticked, labelled box.
 *
 * @param {string} body
 * @returns {Omit<Carry, 'from'> & { head: string } | undefined}
 */
function approvedIn(body) {
  const box = normalise(body).match(
    /\n- \[x\] Approve these enforcement changes at `([0-9a-f]{7})` (<sub><i>[^\n]*<\/i><\/sub>)\n<!-- enforcement-head:[0-9a-f]{40} -->$/m,
  );
  const label = box?.[2].match(LABEL);
  const head = commentHead(normalise(body));

  if (!box || !label || label[3] !== APPROVER || !head || box[1] !== head.slice(0, 7))
    return undefined;

  return { head, name: label[1], handle: label[3], time: label[2] };
}

/**
 * A fingerprint of the guarded changes: every guarded path with its exact text
 * at the merge base and at the head. An update from main that leaves every
 * guarded file alone keeps it; any other difference changes it.
 *
 * @param {FileChange[]} changes
 */
export function guardFingerprint(changes) {
  const entries = changes
    .map(({ path, before, after }) => [path, before, after])
    .sort(([left], [right]) => (String(left) < String(right) ? -1 : 1));

  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
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
 * @param {{ head: string, problems: Problem[], approval?: Approval, refusedBy?: string, carry?: Carry, ranAt?: string }} input
 */
export function signoffComment({
  head,
  problems,
  approval,
  refusedBy,
  carry,
  ranAt = londonTime(new Date(Date.now())),
}) {
  const label = carry ? carriedLabel(carry) : approval ? approvalLabel(approval) : null;
  const box = label
    ? `- [x] ${APPROVAL_TEXT}${inert(head.slice(0, 7))} ${label}`
    : `- [ ] ${APPROVAL_TEXT}${inert(head.slice(0, 7))}`;

  const rows = [...Map.groupBy(problems, (problem) => problem.path).values()].map((group) => ({
    ...group[0],
    what: joined(
      group.map(
        (problem) =>
          problem.what ?? problem.reason.charAt(0).toUpperCase() + problem.reason.slice(1),
      ),
    ),
    effect: joined(
      group.map(
        (problem) => problem.effect ?? 'The named enforcement check changes and requires sign-off',
      ),
    ),
  }));

  const header = [
    COMMENT_MARKER,
    '## Enforcement sign-off',
    '',
    `Ran at ${ranAt} on commit ${inert(head.slice(0, 7))}.`,
    '',
    'This PR changes gated enforcement or product intent, so it needs sign-off.',
    '',
    '| File | What changed | How it affects |',
    '| --- | --- | --- |',
  ];
  const footer = [
    '',
    ...(refusedBy === undefined ? [] : [refusalNote(refusedBy), '']),
    `@${APPROVER}: tick to approve.`,
    box,
    `<!-- enforcement-head:${head} -->`,
    '',
  ];
  // A fixed row budget leaves space for the footer and keeps labelled and unticked rows identical.
  const budget = 48_000;
  const shown = rows.slice(0, MAX_ROWS).reduce(
    (state, problem) => {
      const line = `| ${inert(problem.path)} | ${problem.what} | ${problem.effect} |`;
      const bytes = Buffer.byteLength(`${line}\n`, 'utf8');

      return state.bytes + bytes <= budget
        ? { lines: [...state.lines, line], bytes: state.bytes + bytes }
        : state;
    },
    { lines: [], bytes: 0 },
  );
  const omitted = rows.length - shown.lines.length;

  return [
    ...header,
    ...shown.lines,
    ...(omitted ? [`| | | And ${omitted} more changes; review the full diff |`] : []),
    ...footer,
  ].join('\n');
}

const CLEAR_BODY = `${COMMENT_MARKER}\nThis PR needs no enforcement or product intent sign-off.\n`;

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
 * @param {string} body @param {string} head @param {Problem[]} problems
 */
function isLabelled(body, head, problems) {
  const box = /\n- \[x\] (.*) <sub><i>ticked by [^<\n]*<\/i><\/sub>\n/;
  const text = normalise(body);
  const unticked = normalise(signoffComment({ head, problems, ranAt: ranAtIn(body) }));

  return (
    Boolean(approvedIn(text)) && normalise(`${text}\n`.replace(box, '\n- [ ] $1\n')) === unticked
  );
}

/**
 * The sign-off status for `head`, naming the guarded-change fingerprint it
 * approved so a later run can check that nothing guarded moved since.
 *
 * @param {string} head @param {string} fingerprint @param {string} [from]  the head the approver ticked, when carried
 * @returns {CommitStatus}
 */
const signedOffStatus = (head, fingerprint, from = head) => ({
  state: 'success',
  description: `${APPROVER} signed off at ${from.slice(0, 7)}${from === head ? '' : `; carried to ${head.slice(0, 7)}`}${fingerprint ? `; guard ${fingerprint.slice(0, 40)}` : ''}`,
});

/**
 * The commit and fingerprint a gate sign-off status names, or undefined for any
 * other description. A status from before fingerprints names no fingerprint.
 *
 * @param {string | undefined} description
 * @returns {{ head: string, fingerprint: string | null } | undefined}
 */
function signedOffIn(description) {
  const match = description?.match(
    /^(\S+) signed off at ([0-9a-f]{7})(?:; carried to ([0-9a-f]{7}))?(?:; guard ([0-9a-f]{40}))?$/,
  );

  if (!match || match[1] !== APPROVER) return undefined;

  return { head: match[3] ?? match[2], fingerprint: match[4] ?? null };
}

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
 * @param {{ head: string, problems: Problem[], comment: { body: string, updatedAt?: string } | undefined, event: CommentEdit, fingerprint: string }} input
 * @returns {Plan | undefined}
 */
function planEdit({ head, problems, comment, event, fingerprint }) {
  const unticked = signoffComment({ head, problems, ranAt: ranAtIn(event.from) });

  if (!isFreshTick({ event, unticked: normalise(unticked) })) {
    const refused = hasTick(event.to) && !isApprover(event.sender);

    return {
      commentBody: refused
        ? signoffComment({ head, problems, refusedBy: event.sender.login })
        : signoffComment({ head, problems }),
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
    status: signedOffStatus(head, fingerprint),
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
 * A PR event with `carry`, an earlier head's verified sign-off whose guarded
 * changes match this head's, carries that sign-off to this head.
 *
 * @param {{ head: string, problems: Problem[], comment: { body: string, updatedAt?: string } | undefined, signedOff: boolean, event: GateEvent, carry?: Carry, fingerprint?: string }} input
 * @returns {Plan}
 */
export function planApproval({
  head,
  problems,
  comment,
  signedOff,
  event,
  carry,
  fingerprint = '',
}) {
  if (problems.length === 0) {
    return {
      commentBody: comment ? CLEAR_BODY : null,
      status: { state: 'success', description: 'Nothing in this PR loosens enforcement' },
    };
  }

  const edit =
    event.kind === 'comment' && planEdit({ head, problems, comment, event, fingerprint });

  if (edit) return edit;
  if (signedOff && comment && isLabelled(comment.body, head, problems)) {
    return { commentBody: comment.body, status: null };
  }

  return (
    carriedPlan({ head, problems, event, carry, fingerprint }) ?? {
      commentBody: signoffComment({ head, problems }),
      status: WAITING,
    }
  );
}

/**
 * The plan that carries a verified earlier sign-off to a new head on a PR event.
 *
 * @param {{ head: string, problems: Problem[], event: GateEvent, carry?: Carry, fingerprint: string }} input
 * @returns {Plan | undefined}
 */
function carriedPlan({ head, problems, event, carry, fingerprint }) {
  if (event.kind !== 'pull' || !carry || carry.from === head) return undefined;

  return {
    commentBody: signoffComment({ head, problems, carry }),
    status: signedOffStatus(head, fingerprint, carry.from),
  };
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
 * Every comment the gate wrote as its sign-off, oldest first.
 *
 * @param {Array<{ id: number, body?: string, user?: { login: string } }>} comments
 */
const gateComments = (comments) =>
  comments.filter(
    (comment) =>
      comment.user?.login === GATE_AUTHOR &&
      (comment.body?.startsWith(COMMENT_MARKER) ||
        (comment.body?.includes(APPROVAL_TEXT) &&
          comment.body.includes('## Enforcement sign-off'))),
  );

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
    signoff.at(-1);

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
async function signOffOn(github, repo, head) {
  const { data: statuses } = await github.rest.repos.listCommitStatusesForRef({
    ...repo,
    ref: head,
    per_page: 100,
  });

  const latest = statuses.find(
    (/** @type {{ context: string, creator?: { login: string } }} */ status) =>
      status.context === STATUS_CONTEXT && status.creator?.login === GATE_AUTHOR,
  );
  const signed = latest?.state === 'success' ? signedOffIn(latest.description) : undefined;

  return signed?.head === head.slice(0, 7) ? signed : undefined;
}

/**
 * The verified sign-off of an earlier head to carry to `head`. This PR's gate
 * comment names it with the gate's own label, the gate's own status on it is
 * the sign-off, it is a commit of this PR, and its guarded files, read again
 * from GitHub, match this head's exactly.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, base: string, head: string, changes: FileChange[], comment: { body: string } | undefined }} input
 * @returns {Promise<Carry | undefined>}
 */
async function verifiedCarry({ github, repo, number, base, head, changes, comment }) {
  const approved = comment && approvedIn(comment.body);

  if (!approved || approved.head === head) return undefined;
  const signed = await signOffOn(github, repo, approved.head);

  if (!signed) return undefined;
  if (!(await isCommitOf({ github, repo, number, sha: approved.head }))) return undefined;
  // A sign-off from before fingerprints is checked by reading the approved head again.
  const earlier =
    signed.fingerprint ??
    (await guardedChangesAt({ github, repo, base, ref: approved.head }).then((found) =>
      found ? guardFingerprint(found).slice(0, 40) : null,
    ));

  if (earlier !== guardFingerprint(changes).slice(0, 40)) return undefined;
  const { name, handle, time } = approved;

  return { from: approved.head, name, handle, time };
}

/**
 * Whether `head` holds the gate's sign-off for exactly these guarded changes.
 * A sign-off from before fingerprints names none and holds as it did.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, head: string, fingerprint: string }} input
 */
async function holdsSignOff({ github, repo, head, fingerprint }) {
  const signed = await signOffOn(github, repo, head);

  return Boolean(
    signed && (signed.fingerprint ?? fingerprint.slice(0, 40)) === fingerprint.slice(0, 40),
  );
}

/**
 * The carry for this run, or undefined when the run cannot carry: only a PR
 * event on an unsigned head with a complete file list looks for one.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, pullRequest: any, changes: FileChange[], comment: { body: string } | undefined, eligible: boolean, listed: number }} input
 */
function carryFor({ github, repo, number, pullRequest, changes, comment, eligible, listed }) {
  if (!eligible || listed >= LIST_FILES_LIMIT) return Promise.resolve(undefined);

  return verifiedCarry({
    github,
    repo,
    number,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha,
    changes,
    comment,
  });
}

/**
 * Whether GitHub lists `sha` as a commit of pull request `number`.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, sha: string }} input
 */
async function isCommitOf({ github, repo, number, sha }) {
  try {
    const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
      ...repo,
      commit_sha: sha,
    });

    return data.some((/** @type {{ number: number }} */ pull) => pull.number === number);
  } catch {
    return false;
  }
}

/**
 * Every guarded file's text at `ref` and at its merge base with `base`, or
 * null when GitHub cannot list the comparison completely or read it at all.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, base: string, ref: string }} input
 * @returns {Promise<FileChange[] | null>}
 */
async function guardedChangesAt({ github, repo, base, ref }) {
  try {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo,
      basehead: `${base}...${ref}`,
    });
    const files = data.files ?? [];

    if (files.length >= 300) return null;

    return await Promise.all(
      guardedPaths(files).map(async (path) => ({
        path,
        before: await readFile(github, repo, path, data.merge_base_commit.sha),
        after: await readFile(github, repo, path, ref),
      })),
    );
  } catch {
    return null;
  }
}

/**
 * Write the gate's comment when its body changes. A PR event posts it fresh at
 * the bottom of the conversation and deletes every older gate comment, so the
 * newest sign-off is always last; an edit event updates it in place.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, existing: { id: number, body: string } | undefined, older: number[], body: string | null, repost: boolean }} input
 */
async function writeComment({ github, repo, number, existing, older, body, repost }) {
  if (body === null) return;
  if (body === existing?.body) {
    await Promise.allSettled(
      older
        .filter((id) => id !== existing.id)
        .map((id) => github.rest.issues.deleteComment({ ...repo, comment_id: id })),
    );

    return;
  }
  if (existing && !repost) {
    await github.rest.issues.updateComment({ ...repo, comment_id: existing.id, body });

    return;
  }
  await github.rest.issues.createComment({ ...repo, issue_number: number, body });
  await Promise.allSettled(
    older.map((id) => github.rest.issues.deleteComment({ ...repo, comment_id: id })),
  );
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
  const fingerprint = guardFingerprint(changes);
  const signedOff = await holdsSignOff({ github, repo, head, fingerprint });
  const carry = await carryFor({
    github,
    repo,
    number,
    pullRequest,
    changes,
    comment: existing,
    eligible: event.kind === 'pull' && problems.length > 0 && !signedOff,
    listed: files.length,
  });

  const plan = planApproval({
    head,
    problems,
    comment: existing,
    signedOff,
    event,
    carry,
    fingerprint,
  });

  await writeComment({
    github,
    repo,
    number,
    existing,
    older: gateComments(comments).map((comment) => comment.id),
    body: plan.commentBody,
    repost: event.kind === 'pull',
  });

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
