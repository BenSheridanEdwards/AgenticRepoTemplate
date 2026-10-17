#!/usr/bin/env node
/**
 * Validate a pull-request body and title against the repo's PR contract.
 *
 * The body, title, and head branch arrive through environment variables
 * (`PR_BODY`, `PR_TITLE`, `PR_HEAD_REF`) rather than as command arguments or
 * interpolated workflow text, so an attacker-controlled PR body can never be
 * evaluated as shell or YAML. The
 * workflow populates them with `${{ toJSON(github.event.pull_request.body) }}`,
 * so each env var holds a JSON-encoded string (quoted, with escaped newlines);
 * the CLI runner JSON-parses it back to the raw text. See
 * `.github/workflows/pr-quality.yml`.
 *
 * This module exports `validatePullRequest` for unit tests and runs the CLI when
 * invoked directly. The CLI exits non-zero (fail-closed) with actionable errors.
 */

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
const BRANCH_PATTERN = new RegExp(`^(${TYPE_ALTERNATION})/[a-z0-9]+(-[a-z0-9]+)*$`);

const INLINE_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
// A link whose text holds no brackets, so `[![alt](img)](href)` is not read as a link to `img`.
const PLAIN_LINK = /(?<!!)\[[^[\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
const IMAGE_FILE_URL = /\.(png|jpe?g|gif|webp)(\?[^#]*)?(#.*)?$/i;
const GITHUB_BLOB_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//i;
const NOT_APPLICABLE_REASON_WORDS = 3;

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
    } else if (GITHUB_BLOB_URL.test(url) && new URL(url).searchParams.get('raw') !== '1') {
      errors.push(
        `Image "${url}" is a GitHub blob URL without \`?raw=1\`, so GitHub shows a broken image. ` +
          'Append `?raw=1` to the URL.',
      );
    }
  }
  return errors;
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
  if (stripped.includes(INLINE_IMAGE_MARKER)) {
    return errors;
  }
  if (!stripped.includes(NOT_APPLICABLE_MARKER)) {
    return [
      ...errors,
      `Section "${PROOF_HEADING}" has no proof. ` +
        'Embed a screenshot inline with `![alt](...png?raw=1)`, ' +
        'or write the exact string `Not applicable` with the technical reason.',
    ];
  }
  if (!stripped.split('\n').some(hasNotApplicableReason)) {
    errors.push(
      `Section "${PROOF_HEADING}" says \`Not applicable\` without a reason. ` +
        'Give the technical reason on the same line, e.g. ' +
        '`Not applicable: docs-only change, no rendered surface.`',
    );
  }
  return errors;
}

function hasNotApplicableReason(line) {
  if (!line.includes(NOT_APPLICABLE_MARKER)) {
    return false;
  }
  const words = line.replace(NOT_APPLICABLE_MARKER, ' ').match(/[a-z0-9][\w'-]*/gi) ?? [];
  return words.length >= NOT_APPLICABLE_REASON_WORDS;
}

/**
 * Validate a PR title, body, and head branch (`branch` is optional). Returns
 * `{ ok, errors }`; `errors` is an array of actionable strings. Pure and side-effect free so it can be unit-tested.
 */
export function validatePullRequest({ title, body, branch }) {
  const sections = splitSections(typeof body === 'string' ? body : '');
  const headings = sections.map((section) => section.heading);
  const located = locateSections(headings);

  const errors = [
    ...collectTitleErrors(title),
    ...collectBranchErrors(branch),
    ...located.errors,
    ...collectContentErrors(sections, located.foundIndexBySection),
    ...collectImageErrors(typeof body === 'string' ? body : ''),
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

function runCli() {
  const result = validatePullRequest({
    title: decodeEnv(process.env.PR_TITLE),
    body: decodeEnv(process.env.PR_BODY),
    branch: decodeEnv(process.env.PR_HEAD_REF),
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
