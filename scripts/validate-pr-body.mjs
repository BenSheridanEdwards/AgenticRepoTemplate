#!/usr/bin/env node
/**
 * Validate a pull-request body and title against the repo's PR contract.
 *
 * The body and title arrive through environment variables (`PR_BODY`,
 * `PR_TITLE`) rather than as command arguments or interpolated workflow text, so
 * an attacker-controlled PR body can never be evaluated as shell or YAML. The
 * workflow populates them with `${{ toJSON(github.event.pull_request.body) }}`,
 * so each env var holds a JSON-encoded string (quoted, with escaped newlines);
 * the CLI runner JSON-parses it back to the raw text. The PR head SHA arrives
 * in `PR_HEAD_SHA` too, but raw, not through `toJSON`, on purpose: a SHA is
 * plain hex with nothing to escape, and the CLI rejects anything that is not 40
 * hex characters, so do not "fix" it to match the body. Run locally without it,
 * the CLI uses `git rev-parse HEAD`. See `.github/workflows/pr-quality.yml`.
 *
 * This module exports `validatePullRequest` for unit tests and runs the CLI when
 * invoked directly. The CLI exits non-zero (fail-closed) with actionable errors.
 */

import { execFileSync } from 'node:child_process';

/**
 * The four template sections, in the order the contract requires them.
 * `.github/pull_request_template.md` and
 * `.agents/project/DEFINITION_OF_DONE.md` are the source of truth for this list.
 */
export const REQUIRED_SECTIONS = [
  'Why does this feature exist?',
  'What changed?',
  'Behavioural Proof (with video and screenshots)',
  'Verification Summary',
];

/** The proof section must contain one of these, or the PR fails. */
const INLINE_IMAGE_MARKER = '![';
const NOT_APPLICABLE_MARKER = 'Not applicable';

/**
 * Conventional Commits: `type(scope): summary` or `type: summary`. The scope is
 * optional; an optional `!` marks a breaking change. The type set matches
 * `commitlint.config.ts`.
 */
const CONVENTIONAL_COMMIT_PATTERN =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^()\n]+\))?!?: .+/;

/**
 * The `- Head commit:` value: one commit SHA, full or abbreviated, optionally in
 * a balanced pair of backticks (`` `sha` `` or `sha`, never a lone backtick).
 */
const HEAD_COMMIT_VALUE_PATTERN = /^(`?)([0-9a-f]{7,40})\1$/i;

/**
 * Strip HTML comments (`<!-- ... -->`) from a block of text. Template guidance
 * lives in comments; it must not count as user-provided content.
 *
 * A single `replace` pass is incomplete: removing one match can splice the
 * surrounding text into a *new* `<!--`, so a crafted body could leave a comment
 * marker behind. Loop to a fixpoint so no `<!--` can survive, and drop any
 * unterminated trailing `<!--` (an opened-but-never-closed comment).
 */
function stripHtmlComments(text) {
  let previous;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<!--[\s\S]*?-->/g, '');
  } while (current !== previous);
  return current.replace(/<!--[\s\S]*$/, '');
}

/**
 * A section is "placeholder-only" when, after removing HTML comments, every
 * remaining non-empty line is just a bare bullet marker (`-`, `*`, or `+`) or an
 * empty checkbox with no text. Real content — prose, a filled checkbox, an
 * image, a link — makes it pass.
 */
function isPlaceholderOnly(sectionBody) {
  const withoutComments = stripHtmlComments(sectionBody);
  const meaningfulLines = withoutComments
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (meaningfulLines.length === 0) {
    return true;
  }

  return meaningfulLines.every((line) => {
    // A bare bullet with nothing after it: "-", "*", "+".
    if (/^[-*+]$/.test(line)) {
      return true;
    }
    // A bullet whose only content is an empty checkbox: "- [ ]".
    if (/^[-*+]\s+\[[ xX]?\]\s*$/.test(line)) {
      return true;
    }
    return false;
  });
}

/**
 * Split a Markdown body into `{ heading, body }` sections keyed by the first
 * heading text. Headings are ATX (`#`, `##`, ...). The body of a section runs
 * until the next heading of any level.
 */
function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*\S)\s*$/);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }
      current = { heading: headingMatch[1].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) {
    sections.push(current);
  }

  return sections.map((section) => ({
    heading: section.heading,
    body: section.bodyLines.join('\n'),
  }));
}

/** The proof section's heading — its rules are stricter than the others'. */
const PROOF_HEADING = 'Behavioural Proof (with video and screenshots)';

/** Collect title errors. Returns an array (empty when the title is valid). */
function collectTitleErrors(title) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle) {
    return ['PR title is empty. Use Conventional Commits: `type(scope): summary`.'];
  }
  if (!CONVENTIONAL_COMMIT_PATTERN.test(safeTitle)) {
    return [
      `PR title is not Conventional Commits: "${safeTitle}". ` +
        'Use `type(scope): summary` or `type: summary` ' +
        '(type ∈ feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert); ' +
        'do not add `[agent]`/`[claude]`-style prefixes.',
    ];
  }
  return [];
}

/**
 * Locate each required section, in order. Returns `{ errors, foundIndexBySection }`.
 * A section present but out of order is reported as out-of-order, not missing.
 */
function locateSections(headings) {
  const errors = [];
  const foundIndexBySection = new Map();
  let searchFrom = 0;

  for (const required of REQUIRED_SECTIONS) {
    const foundAt = headings.indexOf(required, searchFrom);
    if (foundAt !== -1) {
      foundIndexBySection.set(required, foundAt);
      searchFrom = foundAt + 1;
    } else if (headings.includes(required)) {
      errors.push(
        `Section "${required}" is out of order. Required order: ` +
          `${REQUIRED_SECTIONS.map((heading) => `"${heading}"`).join(' → ')}.`,
      );
    } else {
      errors.push(`Missing required section heading: "${required}".`);
    }
  }
  return { errors, foundIndexBySection };
}

/** Every located section must carry real content, and proof needs an image or N/A. */
function collectContentErrors(sections, foundIndexBySection) {
  const errors = [];
  for (const [required, index] of foundIndexBySection) {
    if (required === PROOF_HEADING) {
      errors.push(...collectProofErrors(sections[index].body));
    } else if (isPlaceholderOnly(sections[index].body)) {
      errors.push(
        `Section "${required}" is empty or placeholder-only. ` +
          'Fill it with real content (bare `-` bullets and empty checkboxes do not count).',
      );
    }
  }
  return errors;
}

/** The proof section needs an inline image or the exact "Not applicable" string. */
function collectProofErrors(proofBody) {
  const stripped = stripHtmlComments(proofBody);
  if (stripped.includes(INLINE_IMAGE_MARKER) || stripped.includes(NOT_APPLICABLE_MARKER)) {
    return [];
  }
  return [
    `Section "${PROOF_HEADING}" has no proof. ` +
      'Embed a screenshot inline with `![alt](...png?raw=1)`, ' +
      'or write the exact string `Not applicable` with the technical reason.',
  ];
}

/**
 * The `- Head commit:` label. A note in parentheses (`- Head commit (short):`)
 * is still the field, so it cannot dodge the comparison.
 */
const HEAD_COMMIT_LABEL = /^[-*+]\s+Head commit\s*(\([^)]*\))?:/i;

/** A full commit SHA: what `headSha` and `PR_HEAD_SHA` must be. */
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** Quote a rejected value in an error, cut short so a pasted paragraph stays readable. */
function quoteValue(value) {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}

/**
 * Read the `- Head commit:` value: the rest of its line, or, only when that is
 * empty, the next non-empty line (so a SHA written on the next line counts).
 * Nothing further is collected, so prose after the field is not part of it.
 */
function headCommitValue(lines, index) {
  const rest = lines[index].replace(HEAD_COMMIT_LABEL, '').trim();
  if (rest) {
    return rest;
  }
  return lines.slice(index + 1).find((line) => line.length > 0) ?? '';
}

/**
 * A body goes stale when commits land after it was written. The Verification
 * Summary's `- Head commit:` line names the commit the whole body was checked
 * against, so a push that moves the PR head fails this gate until the author
 * re-checks the body against the new head and updates the field.
 *
 * `verificationBody` is the body of the Verification Summary that
 * `locateSections` found, so a decoy heading elsewhere cannot be graded instead.
 * `headSha` must be a full 40-character SHA, or `null` to grade only the field's
 * shape; anything else is an error, so a caller that forgets it fails closed.
 */
function collectHeadCommitErrors(verificationBody, headSha) {
  if (headSha !== null && !(typeof headSha === 'string' && FULL_SHA_PATTERN.test(headSha))) {
    return [
      `headSha must be the 40-character PR head SHA or null (shape only), got ${quoteValue(String(headSha))}.`,
    ];
  }
  if (verificationBody === undefined) {
    // The missing section is already reported by `locateSections`.
    return [];
  }
  const lines = stripHtmlComments(verificationBody)
    .split('\n')
    .map((line) => line.trim());
  const labelIndexes = lines.flatMap((line, i) => (HEAD_COMMIT_LABEL.test(line) ? [i] : []));
  if (labelIndexes.length === 0) {
    return [
      'Section "Verification Summary" has no `- Head commit:` line. ' +
        'Add one naming the SHA the whole body was checked against.',
    ];
  }
  if (labelIndexes.length > 1) {
    return [
      `Section "Verification Summary" has ${labelIndexes.length} \`- Head commit:\` lines. ` +
        'Keep exactly one, naming the SHA the whole body was checked against.',
    ];
  }
  const value = headCommitValue(lines, labelIndexes[0]);
  const named = HEAD_COMMIT_VALUE_PATTERN.exec(value)?.[2];
  if (named === undefined) {
    return [
      '`- Head commit:` must be one commit SHA and nothing else (7-40 hex ' +
        `characters, optionally in backticks), such as \`1a2b3c4d\`; got ${quoteValue(value)}.`,
    ];
  }
  if (headSha === null || headSha.toLowerCase().startsWith(named.toLowerCase())) {
    return [];
  }
  return [
    `\`- Head commit:\` says ${named}, but the PR head is ${headSha.slice(0, 12)}. ` +
      'Re-check the body against the new head, then update the field.',
  ];
}

/**
 * Validate a PR title and body against the PR head SHA. `headSha` is required:
 * a full 40-character SHA, or `null` to check only the `- Head commit:` shape.
 * Returns `{ ok, errors }`; `errors` is an array of actionable strings. Pure and
 * side-effect free so it can be unit-tested.
 */
export function validatePullRequest({ title, body, headSha }) {
  const sections = splitSections(typeof body === 'string' ? body : '');
  const headings = sections.map((section) => section.heading);
  const located = locateSections(headings);

  const errors = [
    ...collectTitleErrors(title),
    ...located.errors,
    ...collectContentErrors(sections, located.foundIndexBySection),
    ...collectHeadCommitErrors(
      sections[located.foundIndexBySection.get('Verification Summary')]?.body,
      headSha,
    ),
  ];

  return { ok: errors.length === 0, errors };
}

/**
 * Decode an env var populated with `${{ toJSON(...) }}`. `toJSON` emits a
 * JSON-encoded value (a quoted string, or `null` for an empty field), so parse
 * it back to raw text. Fall back to the literal value if it is not valid JSON,
 * so the script also works when a caller sets the raw string directly.
 */
function decodeEnv(rawValue) {
  if (rawValue === undefined) {
    return '';
  }
  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'string' ? parsed : rawValue;
  } catch {
    return rawValue;
  }
}

/**
 * The PR head from `PR_HEAD_SHA`, or the local checkout's `HEAD` (via
 * `readGitHead`) when run by hand. Fails closed: in CI the checkout is a merge
 * commit, never the PR head, so a missing or malformed `PR_HEAD_SHA` there is an
 * error, not a fallback. `env` and `readGitHead` are injected so tests need no
 * real environment or repository.
 */
export function resolveHeadSha(env, readGitHead) {
  const fromEnv = env.PR_HEAD_SHA;
  if (fromEnv !== undefined || env.GITHUB_ACTIONS === 'true') {
    if (!FULL_SHA_PATTERN.test(fromEnv ?? '')) {
      throw new Error(
        `PR_HEAD_SHA must be the 40-character PR head SHA, got ${quoteValue(fromEnv ?? '')}. ` +
          'Set it from `github.event.pull_request.head.sha`.',
      );
    }
    return fromEnv;
  }
  return readGitHead();
}

/** The local checkout's `HEAD`, with a one-line error instead of a stack trace. */
function readGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(
      `Could not read HEAD to check \`- Head commit:\` (${String(error.stderr || error.message).trim()}). ` +
        "Run inside the PR's checkout, or set PR_HEAD_SHA.",
    );
  }
}

function runCli() {
  let headSha;
  try {
    headSha = resolveHeadSha(process.env, readGitHead);
  } catch (error) {
    console.error(`PR quality contract failed:\n\n  ✗ ${error.message}`);
    process.exit(1);
  }
  const result = validatePullRequest({
    title: decodeEnv(process.env.PR_TITLE),
    body: decodeEnv(process.env.PR_BODY),
    headSha,
  });

  if (result.ok) {
    console.log('PR body and title satisfy the quality contract.');
    process.exit(0);
  }

  console.error('PR quality contract failed:\n');
  for (const error of result.errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(
    '\nSee `.github/pull_request_template.md` and ' + '`.agents/project/DEFINITION_OF_DONE.md`.',
  );
  process.exit(1);
}

// Run the CLI only when invoked directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
