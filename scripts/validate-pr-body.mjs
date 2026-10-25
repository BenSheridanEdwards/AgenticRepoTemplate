#!/usr/bin/env node
/**
 * Validate a pull-request body and title against the repo's PR contract.
 *
 * The body, title, and head branch arrive through environment variables
 * (`PR_BODY`, `PR_TITLE`, `PR_HEAD_REF`) rather than as command arguments or
 * interpolated workflow text, so an attacker-controlled PR body can never be
 * evaluated as shell or YAML. The workflow populates them with `${{ toJSON(github.event.pull_request.body) }}`,
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
import { matchesGlob, posix } from 'node:path';

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

/** The Conventional Commit types, matching `commitlint.config.ts`. */
export const CONVENTIONAL_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

const TYPE_ALTERNATION = CONVENTIONAL_COMMIT_TYPES.join('|');

/**
 * Conventional Commits: `type(scope): summary` or `type: summary`. The scope is
 * optional; an optional `!` marks a breaking change.
 */
const CONVENTIONAL_COMMIT_PATTERN = new RegExp(`^(${TYPE_ALTERNATION})(\\([^()\\n]+\\))?!?: .+`);

/** Branches are `<type>/<short-kebab-summary>`, per `.agents/project/CONVENTIONS.md`. */
const BRANCH_SEGMENT = '[a-z0-9]+([.-][a-z0-9]+)*';
// GitHub's revert button names its branch `revert-<pr>-<original branch>`.
const BRANCH_PATTERN = new RegExp(
  `^(revert-\\d+-)?(${TYPE_ALTERNATION})/${BRANCH_SEGMENT}(/${BRANCH_SEGMENT})*$`,
);

const INLINE_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]*)>?[^)]*\)/g;
// A link whose text holds no brackets, so `[![alt](img)](href)` is not read as a link to `img`.
const PLAIN_LINK = /(?<!!)\[[^[\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
const IMAGE_FILE_URL = /\.(png|jpe?g|gif|webp)(\?[^#]*)?(#.*)?$/i;
const GITHUB_BLOB_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//i;
/**
 * Tokens start at a publishing boundary. URL tokens are skipped whole and local-path tokens are reported whole.
 */
const PUBLISHED_TOKEN =
  /(?<=^|[\s`'"([<=:])(?:(?<url>[Hh][Tt][Tt][Pp][Ss]?:\/\/[^\s`'"()[\]<>]*)|(?<path>(?:\/Users\/[^\s`'"()[\]<>]+\/|\/home\/[^\s`'"()[\]<>]+\/|\/root\/|\/workspace\/|\/tmp\/[^\s`'"()[\]<>]+|\/private\/var\/|\/var\/folders\/|[A-Za-z]:\\Users\\|file:\/\/)[^\s`'"()[\]<>]*))/g;
const NOT_APPLICABLE = /not applicable/i;
const NOT_APPLICABLE_REASON_WORDS = 2;

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
 * Remove fenced code blocks and inline code spans: Markdown there is an example,
 * not content (the template's checklist quotes `![alt](...png?raw=1)`).
 */
function stripCode(text) {
  return text
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, '')
    .replace(/(`+)[^`]*?\1/g, '');
}

function linkTargets(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

/** Every inline image in the body must be an absolute https URL GitHub renders. */
function collectImageErrors(body) {
  const errors = [];
  for (const url of linkTargets(stripCode(stripHtmlComments(body)), INLINE_IMAGE)) {
    if (!/^https:\/\//i.test(url)) {
      errors.push(
        `Image "${url}" is not an absolute https:// URL, so it will not render on GitHub. ` +
          'Commit the file under `docs/proof/<scope>/` and embed its GitHub blob URL with ' +
          '`?raw=1`: `![alt](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)`.',
      );
    } else if (
      GITHUB_BLOB_URL.test(url) &&
      !['1', 'true'].includes(new URL(url).searchParams.get('raw'))
    ) {
      errors.push(
        `Image "${url}" is a GitHub blob URL without \`?raw=1\`, so GitHub shows a broken image. ` +
          'Append `?raw=1` to the URL.',
      );
    }
  }
  return errors;
}

/**
 * Read tokens at publishing boundaries, skipping whole URLs and reporting whole local paths.
 * Keep each distinct path with its first line number.
 */
function findLocalPaths(body) {
  const paths = new Map();
  for (const [index, line] of body.split('\n').entries()) {
    for (const match of line.matchAll(PUBLISHED_TOKEN)) {
      if (match.groups.path === undefined) continue;
      const path = match.groups.path.replace(/[.,;:!?]+$/, '');
      if (!paths.has(path)) {
        paths.set(path, index + 1);
      }
    }
  }
  return paths;
}

/** Collect machine-local path errors with reviewer-accessible alternatives. */
function collectLocalPathErrors(body) {
  return [...findLocalPaths(body)].map(
    ([path, line]) =>
      `PR body names the machine-local path ${quoteValue(path)} (line ${line}). ` +
      'Name a repo-relative path (`docs/proof/<scope>/file.png`), a placeholder such as `<workdir>/repo`, or the command a reviewer can run to reproduce it.',
  );
}

/** Collect branch-name errors. An empty branch is not checked. */
function collectBranchErrors(branch) {
  if (typeof branch !== 'string' || branch === '' || BRANCH_PATTERN.test(branch)) {
    return [];
  }
  return [
    `Branch "${branch}" does not follow \`<type>/<short-kebab-summary>\` ` +
      `(type ∈ ${TYPE_ALTERNATION}; lower-case words joined by single hyphens). ` +
      'Rename it, e.g. `feat/threshold-reset`.',
  ];
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
        `(type ∈ ${TYPE_ALTERNATION}); ` +
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

/**
 * The proof section needs an inline image, or `Not applicable` with a reason on
 * the same line. Linked (not embedded) screenshots are never proof.
 */
function collectProofErrors(proofBody) {
  const stripped = stripHtmlComments(proofBody);
  const errors = linkTargets(stripCode(stripped), PLAIN_LINK)
    .filter((url) => IMAGE_FILE_URL.test(url))
    .map(
      (url) =>
        `Section "${PROOF_HEADING}" links to the image "${url}" instead of showing it; ` +
        'embed it inline with `![alt](url)`.',
    );
  if (linkTargets(stripCode(stripped), INLINE_IMAGE).length > 0) {
    return errors;
  }
  if (!NOT_APPLICABLE.test(stripped)) {
    return [
      ...errors,
      `Section "${PROOF_HEADING}" has no proof. ` +
        'Embed a screenshot inline with `![alt](...png?raw=1)`, ' +
        'or write the exact string `Not applicable` with the technical reason.',
    ];
  }
  if (!hasNotApplicableReason(stripped)) {
    errors.push(
      `Section "${PROOF_HEADING}" says \`Not applicable\` without a reason. ` +
        'Give the technical reason on the same line or the next one, e.g. ' +
        '`Not applicable: docs-only change, no rendered surface.`',
    );
  }
  return errors;
}

const countWords = (text) => (text.match(/[a-z0-9][\w'-]+/gi) ?? []).length;

/** A reason follows `Not applicable` on its line, or fills the next non-empty line. */
function hasNotApplicableReason(proofText) {
  const lines = proofText.split('\n').filter((line) => line.trim() !== '');
  const index = lines.findIndex((line) => NOT_APPLICABLE.test(line));
  const sameLine = countWords(lines[index].replace(NOT_APPLICABLE, ' '));
  return Math.max(sameLine, countWords(lines[index + 1] ?? '')) >= NOT_APPLICABLE_REASON_WORDS;
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
  const shaErrors = headShaErrors(headSha);
  if (shaErrors.length > 0) {
    return shaErrors;
  }
  if (verificationBody === undefined) {
    // The missing section is already reported by `locateSections`.
    return [];
  }
  const field = readHeadCommitField(verificationBody);
  return field.errors ?? compareHeadCommit(field.value, headSha);
}

function headShaErrors(headSha) {
  if (headSha === null || (typeof headSha === 'string' && FULL_SHA_PATTERN.test(headSha))) {
    return [];
  }
  return [
    `headSha must be the 40-character PR head SHA or null (shape only), got ${quoteValue(String(headSha))}.`,
  ];
}

/** Find the single `- Head commit:` line: `{ value }`, or `{ errors }` when there is not exactly one. */
function readHeadCommitField(verificationBody) {
  const lines = stripHtmlComments(verificationBody)
    .split('\n')
    .map((line) => line.trim());
  const labelIndexes = lines.flatMap((line, i) => (HEAD_COMMIT_LABEL.test(line) ? [i] : []));
  if (labelIndexes.length === 0) {
    return {
      errors: [
        'Section "Verification Summary" has no `- Head commit:` line. ' +
          'Add one naming the SHA the whole body was checked against.',
      ],
    };
  }
  if (labelIndexes.length > 1) {
    return {
      errors: [
        `Section "Verification Summary" has ${labelIndexes.length} \`- Head commit:\` lines. ` +
          'Keep exactly one, naming the SHA the whole body was checked against.',
      ],
    };
  }
  return { value: headCommitValue(lines, labelIndexes[0]) };
}

function compareHeadCommit(value, headSha) {
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

/** Intent references use one labelled line in the located Verification Summary. */
function readReferenceField(verificationBody, name) {
  const label = new RegExp(`^[-*+]\\s+${name}\\s*(\\([^)]*\\))?:`, 'i');
  const lines = stripHtmlComments(verificationBody)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => label.test(line));
  if (lines.length !== 1) {
    return {
      errors: [
        `Section "Verification Summary" must have exactly one \`- ${name}:\` line; found ${lines.length}.`,
      ],
    };
  }
  return { value: lines[0].replace(label, '').trim() };
}

function collectPrdErrors(value, headSha, listPrdFiles) {
  const reason = /^None:\s*(.*)$/i.exec(value)?.[1];
  if (reason !== undefined && countWords(reason) >= NOT_APPLICABLE_REASON_WORDS) return [];
  const paths = value.split(',').map((part) => /^(`?)([^`\s,]+)\1$/.exec(part.trim())?.[2]);
  if (
    paths.some(
      (path) =>
        path === undefined || path !== posix.normalize(path) || !matchesGlob(path, 'docs/prd/*.md'),
    )
  ) {
    return [
      '`- PRDs checked:` must name comma-separated `docs/prd/<feature>.md` paths ' +
        `or \`None: <reason>\` with at least two words; got ${quoteValue(value)}.`,
    ];
  }
  if (headSha === null) return [];
  try {
    const tracked = listPrdFiles();
    if (!Array.isArray(tracked) || tracked.some((path) => typeof path !== 'string')) {
      throw new Error('listPrdFiles() must return an array of paths');
    }
    return paths
      .filter((path) => !tracked.includes(path))
      .map(
        (path) =>
          `\`- PRDs checked:\` names ${quoteValue(path)}, which is not a tracked PRD at the PR head.`,
      );
  } catch (error) {
    return [`Could not list PRDs at the PR head: ${error.message}. Fetch the head and retry.`];
  }
}

function collectNorthStarErrors(value, headSha, northStarCommit) {
  const named = HEAD_COMMIT_VALUE_PATTERN.exec(value)?.[2];
  if (named === undefined) {
    return [
      '`- North Star commit:` must be one commit SHA and nothing else (7-40 hex ' +
        `characters, optionally in backticks); got ${quoteValue(value)}.`,
    ];
  }
  if (headSha === null) return [];
  try {
    const expected = northStarCommit(headSha);
    if (typeof expected !== 'string' || !FULL_SHA_PATTERN.test(expected)) {
      throw new Error('northStarCommit(headSha) must return a full 40-character SHA');
    }
    if (expected.toLowerCase().startsWith(named.toLowerCase())) return [];
    return [
      `\`- North Star commit:\` says ${named}, but the last commit changing ` +
        `\`.agents/NORTH_STAR.md\` at the PR head is ${expected}. ` +
        'Re-check the North Star and update the field.',
    ];
  } catch (error) {
    return [
      `Could not read North Star history at the PR head: ${error.message}. Fetch full history and retry.`,
    ];
  }
}

function collectReferenceErrors(verificationBody, headSha, listPrdFiles, northStarCommit) {
  if (verificationBody === undefined || headShaErrors(headSha).length > 0) return [];
  const prds = readReferenceField(verificationBody, 'PRDs checked');
  const northStar = readReferenceField(verificationBody, 'North Star commit');
  return [
    ...(prds.errors ?? collectPrdErrors(prds.value, headSha, listPrdFiles)),
    ...(northStar.errors ?? collectNorthStarErrors(northStar.value, headSha, northStarCommit)),
  ];
}

function hasNoBehaviourChangeReason(value) {
  const reason = /^No behaviour change:\s*(.*)$/i.exec(value)?.[1];
  return reason !== undefined && countWords(reason) >= NOT_APPLICABLE_REASON_WORDS;
}

function collectPrdImpactErrors(verificationBody, headSha) {
  if (verificationBody === undefined || headShaErrors(headSha).length > 0) return [];
  const impact = readReferenceField(verificationBody, 'PRD impact');
  if (impact.errors) return impact.errors;
  if (/^None$/i.test(impact.value) || hasNoBehaviourChangeReason(impact.value)) return [];
  return [
    '`- PRD impact:` must be `None` or `No behaviour change: <reason>` ' +
      `with at least two words; got ${quoteValue(impact.value)}.`,
  ];
}

/**
 * Validate a PR title, body, head SHA, and head branch (`branch` is optional).
 * `headSha` is required: a full 40-character SHA, or `null` to check only the
 * fields' shapes. Repository reads use injected `listPrdFiles()` and
 * `northStarCommit(headSha)` ports; null heads call neither. Returns `{ ok, errors }`.
 */
export function validatePullRequest({
  title,
  body,
  headSha,
  branch,
  listPrdFiles,
  northStarCommit,
}) {
  const sections = splitSections(typeof body === 'string' ? body : '');
  const headings = sections.map((section) => section.heading);
  const located = locateSections(headings);
  const verificationBody = sections[located.foundIndexBySection.get('Verification Summary')]?.body;

  const errors = [
    ...collectTitleErrors(title),
    ...collectBranchErrors(branch),
    ...located.errors,
    ...collectContentErrors(sections, located.foundIndexBySection),
    ...collectHeadCommitErrors(verificationBody, headSha),
    ...collectReferenceErrors(verificationBody, headSha, listPrdFiles, northStarCommit),
    ...collectPrdImpactErrors(verificationBody, headSha),
    ...collectImageErrors(typeof body === 'string' ? body : ''),
    ...collectLocalPathErrors(typeof body === 'string' ? body : ''),
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
    branch: decodeEnv(process.env.PR_HEAD_REF),
    listPrdFiles: () =>
      execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', headSha, '--', 'docs/prd/'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\0')
        .filter((path) => matchesGlob(path, 'docs/prd/*.md')),
    northStarCommit: (head) =>
      execFileSync('git', ['log', '-1', '--format=%H', head, '--', '.agents/NORTH_STAR.md'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
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
